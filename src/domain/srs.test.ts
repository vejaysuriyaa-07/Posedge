import { describe, expect, it } from 'vitest';
import type { SerializedFsrsCard } from '../db/types';
import {
  buildQueue,
  deserializeCard,
  firstDueDate,
  formatInterval,
  newCardFsrs,
  newCardSlotsLeft,
  previewIntervals,
  rateCard,
  releaseQueued,
  retrievability,
  serializeCard,
  shiftDue,
  shouldOfferCatchUp,
  sortByRetrievability,
  spreadCatchUp,
  stateName,
  vacationDays,
  type QueueCard,
} from './srs';

const cfg = { requestRetention: 0.9 };

/** Local time helper: new Date(y, m-1, d, h, min). */
function local(y: number, m: number, d: number, h = 0, min = 0): Date {
  return new Date(y, m - 1, d, h, min);
}

function daysBetween(a: string | Date, b: string | Date): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
}

/** Rates a fresh card Good `times` times, each review on its due date. */
function reviewChain(times: number, rating: 1 | 2 | 3 | 4 = 3) {
  let now = local(2026, 3, 2, 9);
  let card = newCardFsrs(now);
  const intervals: number[] = [];
  for (let i = 0; i < times; i++) {
    now = new Date(card.due);
    const next = rateCard(card, rating, now, cfg);
    intervals.push(daysBetween(now, next.card.due));
    card = next.card;
  }
  return { card, intervals, now };
}

describe('new cards', () => {
  it('first come due tomorrow at 04:00 local', () => {
    const now = local(2026, 10, 16, 21, 30);
    const card = newCardFsrs(now);
    const due = new Date(card.due);
    expect(due.getFullYear()).toBe(2026);
    expect(due.getMonth()).toBe(9);
    expect(due.getDate()).toBe(17);
    expect(due.getHours()).toBe(4);
    expect(due.getMinutes()).toBe(0);
    expect(card.state).toBe(0);
    expect(stateName(card)).toBe('new');
  });

  it('stays at 04:00 local across the DST change', () => {
    // US DST ends 2026-11-01 at 02:00 local.
    const now = local(2026, 11, 1, 1, 30);
    const due = firstDueDate(now);
    expect(due.getDate()).toBe(2);
    expect(due.getHours()).toBe(4);
    const before = firstDueDate(local(2026, 10, 31, 23, 0));
    expect(before.getDate()).toBe(1);
    expect(before.getHours()).toBe(4);
  });
});

describe('scheduling', () => {
  it('Good grows the interval over successive reviews', () => {
    const { intervals, card } = reviewChain(4);
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]!).toBeGreaterThan(intervals[i - 1]!);
    }
    expect(stateName(card)).toBe('review');
  });

  it('Again lowers stability compared with Good once in review', () => {
    const { card } = reviewChain(3);
    const now = new Date(card.due);
    const good = rateCard(card, 3, now, cfg);
    const again = rateCard(card, 1, now, cfg);
    expect(again.card.stability).toBeLessThan(card.stability);
    expect(again.card.stability).toBeLessThan(good.card.stability);
    expect(again.card.lapses).toBe(card.lapses + 1);
    // Short-term (re)learning steps are disabled, so a lapse is rescheduled in days.
    expect(again.card.scheduled_days).toBeLessThan(good.card.scheduled_days);
  });

  it('logs the state before the review and the new interval', () => {
    const now = local(2026, 3, 2, 9);
    const card = newCardFsrs(now);
    const res = rateCard(card, 3, new Date(card.due), cfg);
    expect(res.log.state).toBe(0);
    expect(res.log.scheduledDays).toBe(res.card.scheduled_days);
    expect(res.log.scheduledDays).toBeGreaterThan(0);
  });

  it('previews an interval for every rating, ordered Again <= Hard <= Good <= Easy', () => {
    const { card } = reviewChain(3);
    const now = new Date(card.due);
    const p = previewIntervals(card, now, cfg);
    const t = (r: 1 | 2 | 3 | 4) => new Date(p[r].due).getTime();
    expect(t(1)).toBeLessThanOrEqual(t(2));
    expect(t(2)).toBeLessThanOrEqual(t(3));
    expect(t(3)).toBeLessThanOrEqual(t(4));
    for (const r of [1, 2, 3, 4] as const) expect(p[r].label).toMatch(/^\d+(\.\d)?(m|h|d|mo|y)$/);
  });
});

describe('serialization', () => {
  it('round-trips through ISO strings', () => {
    const { card } = reviewChain(2);
    const revived = deserializeCard(card);
    expect(revived.due).toBeInstanceOf(Date);
    expect(revived.last_review).toBeInstanceOf(Date);
    expect(serializeCard(revived)).toEqual(card);
    const fresh = newCardFsrs(local(2026, 1, 5, 10));
    expect(fresh.last_review).toBeUndefined();
    expect(serializeCard(deserializeCard(fresh))).toEqual(fresh);
  });
});

describe('formatInterval', () => {
  const from = local(2026, 1, 1, 12);
  const plus = (ms: number) => new Date(from.getTime() + ms);
  it.each([
    [10 * 60_000, '10m'],
    [5 * 3_600_000, '5h'],
    [86_400_000, '1d'],
    [4 * 86_400_000, '4d'],
    [70 * 86_400_000, '2.3mo'],
    [30 * 86_400_000, '1mo'],
    [438 * 86_400_000, '1.2y'],
  ])('%i ms -> %s', (ms, label) => {
    expect(formatInterval(from, plus(ms))).toBe(label);
  });
  it('never goes negative', () => {
    expect(formatInterval(from, plus(-5000))).toBe('0m');
  });
});

function qc(id: string, fsrs: SerializedFsrsCard, extra: Partial<QueueCard> = {}): QueueCard {
  return { id, fsrs, suspended: false, queued: false, ...extra };
}

/** A review-state card last reviewed `daysAgo` days before `now` with the given stability. */
function reviewCard(
  now: Date,
  stability: number,
  daysAgo: number,
  dueOffsetDays = 0,
): SerializedFsrsCard {
  const last = new Date(now.getTime() - daysAgo * 86_400_000);
  return {
    due: new Date(now.getTime() + dueOffsetDays * 86_400_000).toISOString(),
    stability,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: daysAgo,
    learning_steps: 0,
    reps: 3,
    lapses: 0,
    state: 2,
    last_review: last.toISOString(),
  };
}

describe('queue', () => {
  const now = local(2026, 10, 16, 10);

  it('orders by lowest retrievability first', () => {
    const strong = qc('strong', reviewCard(now, 50, 5, -1));
    const weak = qc('weak', reviewCard(now, 2, 10, -1));
    const mid = qc('mid', reviewCard(now, 10, 8, -1));
    expect(retrievability(weak.fsrs, now, cfg)).toBeLessThan(retrievability(mid.fsrs, now, cfg));
    expect(sortByRetrievability([strong, mid, weak], now, cfg).map((c) => c.id)).toEqual([
      'weak',
      'mid',
      'strong',
    ]);
    expect(retrievability(newCardFsrs(now), now, cfg)).toBe(0);
  });

  it('includes cards due by the end of today and skips suspended, queued and future cards', () => {
    const laterToday = qc('laterToday', reviewCard(now, 5, 5, 0.4)); // ~19:36 today
    const tomorrow = qc('tomorrow', reviewCard(now, 5, 5, 1));
    const overdue = qc('overdue', reviewCard(now, 5, 5, -2));
    const suspended = qc('suspended', reviewCard(now, 5, 5, -2), { suspended: true });
    const queued = qc('queued', reviewCard(now, 5, 5, -2), { queued: true });
    const ids = buildQueue([laterToday, tomorrow, overdue, suspended, queued], now, cfg, 30).map(
      (c) => c.id,
    );
    expect(ids.sort()).toEqual(['laterToday', 'overdue']);
  });

  it('respects the daily cap', () => {
    const cards = Array.from({ length: 12 }, (_, i) => qc(`c${i}`, reviewCard(now, 3 + i, 6, -1)));
    const q = buildQueue(cards, now, cfg, 5);
    expect(q).toHaveLength(5);
    expect(q[0]!.id).toBe('c0');
  });
});

describe('new-card slots', () => {
  it('counts remaining slots', () => {
    expect(newCardSlotsLeft(3, 8)).toBe(5);
    expect(newCardSlotsLeft(9, 8)).toBe(0);
  });

  it('releases queued cards first-in first-out into the free slots', () => {
    const queued = [
      { id: 'c', createdAt: '2026-10-14T10:00:00.000Z' },
      { id: 'a', createdAt: '2026-10-12T10:00:00.000Z' },
      { id: 'b', createdAt: '2026-10-13T10:00:00.000Z' },
    ];
    const released = releaseQueued(queued, 6, 8, '2026-10-16');
    expect(released.map((r) => r.id)).toEqual(['a', 'b']);
    const due = new Date(released[0]!.due);
    expect(due.getDate()).toBe(16);
    expect(due.getHours()).toBe(4);
    expect(releaseQueued(queued, 8, 8, '2026-10-16')).toEqual([]);
  });
});

describe('catch-up', () => {
  const now = local(2026, 10, 16, 10);

  it('offers catch-up only when overdue exceeds twice the cap', () => {
    expect(shouldOfferCatchUp(60, 30)).toBe(false);
    expect(shouldOfferCatchUp(61, 30)).toBe(true);
  });

  it('spreads 23 overdue cards over 5 days evenly, keeping retrievability order', () => {
    const cards = Array.from({ length: 23 }, (_, i) =>
      qc(`c${String(i).padStart(2, '0')}`, reviewCard(now, 1 + i, 10, -3)),
    );
    const plan = spreadCatchUp(cards, now, cfg, 5);
    expect(plan.size).toBe(23);
    const ordered = sortByRetrievability(cards, now, cfg);
    const dayOf = (id: string) => {
      const d = new Date(plan.get(id)!);
      return Math.round(
        (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
          new Date(2026, 9, 16).getTime()) /
          86_400_000,
      );
    };
    const counts = [0, 0, 0, 0, 0, 0, 0];
    let prev = -10;
    for (const c of ordered) {
      const day = dayOf(c.id);
      counts[Math.max(0, day)]!++;
      expect(day).toBeGreaterThanOrEqual(prev);
      prev = day;
    }
    expect(counts.slice(0, 5)).toEqual([5, 5, 5, 4, 4]);
    // Today's share keeps its original (already past) due date so it stays due now.
    const first = ordered[0]!;
    expect(plan.get(first.id)).toBe(first.fsrs.due);
    // Later shares land at 04:00 local.
    const last = ordered[22]!;
    expect(new Date(plan.get(last.id)!).getHours()).toBe(4);
  });
});

describe('vacation', () => {
  it('counts whole calendar days since the vacation started', () => {
    expect(vacationDays(local(2026, 10, 10, 23).toISOString(), local(2026, 10, 16, 1))).toBe(6);
    expect(vacationDays(local(2026, 10, 16, 8).toISOString(), local(2026, 10, 16, 9))).toBe(0);
  });

  it('shifts due dates forward by calendar days keeping local time across DST', () => {
    const card = newCardFsrs(local(2026, 10, 28, 9)); // due Oct 29 04:00 PDT
    const shifted = shiftDue(card, 7); // Nov 5 04:00 PST
    const due = new Date(shifted.due);
    expect(due.getMonth()).toBe(10);
    expect(due.getDate()).toBe(5);
    expect(due.getHours()).toBe(4);
    expect(shifted.stability).toBe(card.stability);
  });
});
