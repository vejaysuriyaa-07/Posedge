import {
  newCardFsrs,
  newCardSlotsLeft,
  rateCard as scheduleRating,
  releaseQueued,
  shiftDue,
  spreadCatchUp,
  vacationDays,
  sortByRetrievability,
} from '../../domain/srs';
import { atHour, dateOfIso, endOfDay, todayStr } from '../../domain/week';
import { levelInfo, levelUps, XP, type LevelInfo } from '../../domain/xp';
import { db, getSettings, newId, nowIso } from '../db';
import type { Rating, ReviewCard } from '../types';
import { addXp, bumpDay } from './activity';
import { reconcileStreaks } from './streak';
import { clean } from './tasks';

export interface CardInput {
  projectId: string;
  taskId?: string;
  prompt: string;
  answer: string;
  codeSnippet?: string;
  tags?: string[];
  seeded?: boolean;
}

async function slotsUsedToday(today: string): Promise<number> {
  return (await db.reviewCards.toArray()).filter((c) => c.slotDate === today).length;
}

export interface CreateCardsResult {
  cards: ReviewCard[];
  queued: number;
}

/**
 * Creates cards from "Lock it in" / "Add card". New cards first come due tomorrow at 04:00;
 * once today's new-card slots are used up, extra cards wait in a FIFO queue.
 * Clears the `needsCards` flag on the source task.
 */
export async function createCards(
  inputs: CardInput[],
  now: Date = new Date(),
): Promise<CreateCardsResult> {
  return db.transaction('rw', [db.reviewCards, db.tasks, db.settings], async () => {
    const s = await getSettings();
    const today = todayStr(now);
    let slots = newCardSlotsLeft(await slotsUsedToday(today), s.newCardsPerDay);
    const cards: ReviewCard[] = [];
    let queued = 0;
    inputs.forEach((input, i) => {
      const fsrs = newCardFsrs(now);
      const takeSlot = slots > 0;
      if (takeSlot) slots--;
      else queued++;
      cards.push(
        clean({
          id: newId(),
          taskId: input.taskId,
          projectId: input.projectId,
          prompt: input.prompt.trim(),
          answer: input.answer.trim(),
          codeSnippet: input.codeSnippet?.trim() || undefined,
          tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean),
          fsrs,
          due: fsrs.due,
          queued: !takeSlot,
          suspended: false,
          // Keep FIFO order stable for cards created in the same millisecond.
          createdAt: new Date(now.getTime() + i).toISOString(),
          slotDate: takeSlot ? today : undefined,
          seeded: input.seeded,
        }),
      );
    });
    await db.reviewCards.bulkAdd(cards);
    const taskIds = new Set(inputs.map((c) => c.taskId).filter(Boolean) as string[]);
    for (const id of taskIds) {
      const t = await db.tasks.get(id);
      if (t?.needsCards) {
        const { needsCards: _n, ...rest } = t;
        await db.tasks.put(rest);
      }
    }
    return { cards, queued };
  });
}

/** Releases queued cards (FIFO) into today's free new-card slots. Returns how many were released. */
export async function releaseQueuedCards(now: Date = new Date()): Promise<number> {
  return db.transaction('rw', [db.reviewCards, db.settings], async () => {
    const s = await getSettings();
    if (s.vacationMode) return 0;
    const today = todayStr(now);
    const all = await db.reviewCards.toArray();
    const queued = all.filter((c) => c.queued && !c.suspended);
    if (!queued.length) return 0;
    const used = all.filter((c) => c.slotDate === today).length;
    const releases = releaseQueued(queued, used, s.newCardsPerDay, today);
    for (const r of releases) {
      const card = all.find((c) => c.id === r.id)!;
      await db.reviewCards.put({
        ...card,
        queued: false,
        slotDate: today,
        due: r.due,
        fsrs: { ...card.fsrs, due: r.due },
      });
    }
    return releases.length;
  });
}

export interface RateResult {
  card: ReviewCard;
  xp: number;
  levelBefore: LevelInfo;
  levelAfter: LevelInfo;
  levelsGained: number;
}

/** Schedules the next review, logs it, and credits the day (+2 XP) in one transaction. */
export async function rateReviewCard(
  cardId: string,
  rating: Rating,
  durationMs: number,
  now: Date = new Date(),
): Promise<RateResult | null> {
  return db.transaction(
    'rw',
    [db.reviewCards, db.reviewLogs, db.activityDays, db.settings],
    async () => {
      const card = await db.reviewCards.get(cardId);
      if (!card) return null;
      const s = await getSettings();
      const next = scheduleRating(card.fsrs, rating, now, { requestRetention: s.requestRetention });
      const updated: ReviewCard = { ...card, fsrs: next.card, due: next.card.due };
      await db.reviewCards.put(updated);
      await db.reviewLogs.add({
        id: newId(),
        cardId,
        rating,
        reviewedAt: nowIso(now),
        state: next.log.state,
        elapsedDays: next.log.elapsedDays,
        scheduledDays: next.log.scheduledDays,
        durationMs: Math.max(0, Math.round(durationMs)),
      });
      const today = todayStr(now);
      await bumpDay(today, { reviewsDone: 1 });
      const change = await addXp(XP.review, today);
      return {
        card: updated,
        xp: XP.review,
        levelBefore: levelInfo(change.before),
        levelAfter: levelInfo(change.after),
        levelsGained: levelUps(change.before, change.after),
      };
    },
  );
}

export async function updateCard(
  id: string,
  patch: Partial<Pick<ReviewCard, 'prompt' | 'answer' | 'codeSnippet' | 'tags' | 'projectId'>>,
): Promise<void> {
  await db.reviewCards.update(id, patch);
}

export async function setCardSuspended(id: string, suspended: boolean): Promise<void> {
  await db.reviewCards.update(id, { suspended });
}

export async function deleteCard(id: string): Promise<ReviewCard | undefined> {
  return db.transaction('rw', db.reviewCards, async () => {
    const card = await db.reviewCards.get(id);
    if (card) await db.reviewCards.delete(id);
    return card;
  });
}

export async function restoreCards(cards: ReviewCard[]): Promise<void> {
  await db.reviewCards.bulkPut(cards);
}

/** Makes a card due right now (and releases it from the queue). */
export async function reviewCardNow(id: string, now: Date = new Date()): Promise<void> {
  await db.transaction('rw', db.reviewCards, async () => {
    const card = await db.reviewCards.get(id);
    if (!card) return;
    const due = nowIso(now);
    await db.reviewCards.put({
      ...card,
      queued: false,
      suspended: false,
      slotDate: card.slotDate ?? todayStr(now),
      due,
      fsrs: { ...card.fsrs, due },
    });
  });
}

/** Overdue = due before today's start, not suspended/queued. */
export async function overdueCards(now: Date = new Date()): Promise<ReviewCard[]> {
  const startOfToday = atHour(todayStr(now), 0).toISOString();
  return (await db.reviewCards.where('due').below(startOfToday).toArray()).filter(
    (c) => !c.suspended && !c.queued,
  );
}

/** Spreads every card due by tonight evenly across the next 5 days, lowest retrievability first. */
export async function catchUp(now: Date = new Date(), days = 5): Promise<number> {
  return db.transaction('rw', [db.reviewCards, db.settings], async () => {
    const s = await getSettings();
    const cfg = { requestRetention: s.requestRetention };
    const endIso = endOfDay(todayStr(now)).toISOString();
    const due = (await db.reviewCards.where('due').belowOrEqual(endIso).toArray()).filter(
      (c) => !c.suspended && !c.queued,
    );
    const plan = spreadCatchUp(sortByRetrievability(due, now, cfg), now, cfg, days);
    for (const card of due) {
      const newDue = plan.get(card.id);
      if (newDue && newDue !== card.due) {
        await db.reviewCards.put({ ...card, due: newDue, fsrs: { ...card.fsrs, due: newDue } });
      }
    }
    return plan.size;
  });
}

/**
 * Vacation mode: while on, nothing comes due and the streak is frozen. Turning it off shifts
 * every card's due date forward by the vacation length.
 */
export async function setVacationMode(on: boolean, now: Date = new Date()): Promise<number> {
  const s = await getSettings();
  if (on === s.vacationMode) return 0;
  if (on) {
    await db.settings.put({ ...s, vacationMode: true, vacationStartedAt: nowIso(now) });
    return 0;
  }
  // Record the vacation days as rest days before leaving vacation mode.
  await reconcileStreaks(now);
  return db.transaction('rw', [db.reviewCards, db.settings], async () => {
    const fresh = await getSettings();
    const days = fresh.vacationStartedAt ? vacationDays(fresh.vacationStartedAt, now) : 0;
    if (days > 0) {
      const cards = await db.reviewCards.toArray();
      for (const c of cards) {
        const fsrs = shiftDue(c.fsrs, days);
        await db.reviewCards.put({ ...c, fsrs, due: fsrs.due });
      }
    }
    const { vacationStartedAt: _v, ...rest } = fresh;
    await db.settings.put({ ...rest, vacationMode: false });
    return days;
  });
}

/** Local day a card was last reviewed (for review-day streaks). */
export function reviewDay(iso: string): string {
  return dateOfIso(iso);
}
