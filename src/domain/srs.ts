import { addDays } from 'date-fns';
import { createEmptyCard, fsrs, type Card, type FSRS, type Grade, type State } from 'ts-fsrs';
import type { Rating, SerializedFsrsCard } from '../db/types';
import { addDaysStr, atHour, dateOfIso, diffDays, endOfDay, todayStr } from './week';

/**
 * Spaced repetition, wrapping ts-fsrs. This is the only module in the app that imports ts-fsrs;
 * everything else works with SerializedFsrsCard (Dates as ISO strings).
 */

export type CardStateName = 'new' | 'learning' | 'review' | 'relearning';

export interface SrsConfig {
  requestRetention: number;
}

const STATE_NAMES: CardStateName[] = ['new', 'learning', 'review', 'relearning'];
const RATINGS: Rating[] = [1, 2, 3, 4];

const schedulers = new Map<number, FSRS>();

export function makeScheduler(cfg: SrsConfig): FSRS {
  const key = cfg.requestRetention;
  let scheduler = schedulers.get(key);
  if (!scheduler) {
    scheduler = fsrs({
      request_retention: key,
      enable_fuzz: true,
      enable_short_term: false,
      maximum_interval: 365,
    });
    schedulers.set(key, scheduler);
  }
  return scheduler;
}

export function serializeCard(card: Card): SerializedFsrsCard {
  const out: SerializedFsrsCard = {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
  };
  if (card.last_review) out.last_review = card.last_review.toISOString();
  return out;
}

export function deserializeCard(s: SerializedFsrsCard): Card {
  const card: Card = {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsed_days,
    scheduled_days: s.scheduled_days,
    learning_steps: s.learning_steps,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state as State,
  };
  if (s.last_review) card.last_review = new Date(s.last_review);
  return card;
}

/** New cards first come due tomorrow at 04:00 local time. */
export function firstDueDate(now: Date): Date {
  return atHour(addDaysStr(todayStr(now), 1), 4);
}

export function newCardFsrs(now: Date): SerializedFsrsCard {
  const card = createEmptyCard(now);
  card.due = firstDueDate(now);
  return serializeCard(card);
}

/** Next due date and a short label ("10m", "4d", "2.3mo") for each rating. */
export function previewIntervals(
  card: SerializedFsrsCard,
  now: Date,
  cfg: SrsConfig,
): Record<Rating, { due: string; label: string }> {
  const preview = makeScheduler(cfg).repeat(deserializeCard(card), now);
  const out = {} as Record<Rating, { due: string; label: string }>;
  for (const r of RATINGS) {
    const due = preview[r as Grade].card.due;
    out[r] = { due: due.toISOString(), label: formatInterval(now, due) };
  }
  return out;
}

export function rateCard(
  card: SerializedFsrsCard,
  rating: Rating,
  now: Date,
  cfg: SrsConfig,
): {
  card: SerializedFsrsCard;
  log: { state: number; elapsedDays: number; scheduledDays: number };
} {
  const result = makeScheduler(cfg).next(deserializeCard(card), now, rating as Grade);
  return {
    card: serializeCard(result.card),
    log: {
      state: result.log.state,
      elapsedDays: result.log.elapsed_days,
      scheduledDays: result.card.scheduled_days,
    },
  };
}

/** Probability of recall right now (0..1). New cards count as 0. */
export function retrievability(card: SerializedFsrsCard, now: Date, cfg: SrsConfig): number {
  if (card.state === 0) return 0;
  const r = makeScheduler(cfg).get_retrievability(deserializeCard(card), now, false);
  return Number.isFinite(r) ? r : 0;
}

export function stateName(card: SerializedFsrsCard): CardStateName {
  return STATE_NAMES[card.state] ?? 'new';
}

function trimDecimal(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** Human interval between two instants: "10m", "5h", "4d", "2.3mo", "1.2y". Never negative. */
export function formatInterval(from: Date, to: Date): string {
  const ms = Math.max(0, to.getTime() - from.getTime());
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 24) return `${hours}h`;
  const days = ms / 86_400_000;
  if (Math.round(days) < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${trimDecimal(days / 30)}mo`;
  return `${trimDecimal(days / 365)}y`;
}

export interface QueueCard {
  id: string;
  fsrs: SerializedFsrsCard;
  suspended: boolean;
  queued: boolean;
}

/** Lowest retrievability first; ties broken by the earlier due date. */
export function sortByRetrievability<T extends QueueCard>(
  cards: T[],
  now: Date,
  cfg: SrsConfig,
): T[] {
  return cards
    .map((card) => ({ card, r: retrievability(card.fsrs, now, cfg) }))
    .sort((a, b) => a.r - b.r || a.card.fsrs.due.localeCompare(b.card.fsrs.due))
    .map((x) => x.card);
}

/** Today's review queue: due by the end of the local day, active, lowest retrievability first, capped. */
export function buildQueue<T extends QueueCard>(
  cards: T[],
  now: Date,
  cfg: SrsConfig,
  cap: number,
): T[] {
  const end = endOfDay(todayStr(now)).getTime();
  const due = cards.filter(
    (c) => !c.suspended && !c.queued && new Date(c.fsrs.due).getTime() <= end,
  );
  return sortByRetrievability(due, now, cfg).slice(0, Math.max(0, cap));
}

export function newCardSlotsLeft(usedToday: number, newCardsPerDay: number): number {
  return Math.max(0, newCardsPerDay - usedToday);
}

/** Releases queued cards first-in first-out into today's remaining new-card slots. */
export function releaseQueued<T extends { id: string; createdAt: string }>(
  queued: T[],
  usedToday: number,
  newCardsPerDay: number,
  today: string,
): { id: string; due: string }[] {
  const slots = newCardSlotsLeft(usedToday, newCardsPerDay);
  if (slots === 0) return [];
  const due = atHour(today, 4).toISOString();
  return [...queued]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, slots)
    .map((c) => ({ id: c.id, due }));
}

/**
 * Spreads an overdue backlog evenly across `days` consecutive days starting today, keeping
 * retrievability order (the most-forgotten cards stay first). Returns id -> new due ISO.
 */
export function spreadCatchUp<T extends QueueCard>(
  overdue: T[],
  now: Date,
  cfg: SrsConfig,
  days = 5,
): Map<string, string> {
  const result = new Map<string, string>();
  const ordered = sortByRetrievability(overdue, now, cfg);
  const n = ordered.length;
  const spanDays = Math.max(1, days);
  const base = Math.floor(n / spanDays);
  const extra = n % spanDays;
  const today = todayStr(now);
  let index = 0;
  for (let day = 0; day < spanDays && index < n; day++) {
    const size = base + (day < extra ? 1 : 0);
    const dayDue = atHour(addDaysStr(today, day), 4);
    for (let k = 0; k < size; k++, index++) {
      const card = ordered[index]!;
      if (day === 0 && new Date(card.fsrs.due).getTime() <= now.getTime()) {
        result.set(card.id, card.fsrs.due);
      } else {
        result.set(card.id, dayDue.toISOString());
      }
    }
  }
  return result;
}

export function shouldOfferCatchUp(overdueCount: number, dailyReviewCap: number): boolean {
  return overdueCount > 2 * dailyReviewCap;
}

/** Moves the due date forward by whole calendar days, keeping the local time of day. */
export function shiftDue(card: SerializedFsrsCard, days: number): SerializedFsrsCard {
  return { ...card, due: addDays(new Date(card.due), days).toISOString() };
}

/** Whole calendar days from the vacation start date to today (never negative). */
export function vacationDays(startedAtIso: string, now: Date): number {
  return Math.max(0, diffDays(todayStr(now), dateOfIso(startedAtIso)));
}
