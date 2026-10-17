import { describe, expect, it } from 'vitest';
import { addDaysStr } from './week';
import {
  currentStreak,
  isActiveDay,
  isRestDate,
  reconcile,
  streakMessage,
  type DayRecord,
} from './streak';

// 2026-10-12 is a Monday; 2026-10-16 is a Friday.
const TODAY = '2026-10-16';

function rec(date: string, partial: Partial<DayRecord> = {}): DayRecord {
  return {
    date,
    tasksDone: 0,
    reviewsDone: 0,
    focusMin: 0,
    freezeUsed: false,
    isRestDay: false,
    ...partial,
  };
}

function active(date: string): DayRecord {
  return rec(date, { tasksDone: 1 });
}

function daysOf(...records: DayRecord[]): Record<string, DayRecord> {
  return Object.fromEntries(records.map((r) => [r.date, r]));
}

/** Active records for `count` consecutive days ending at `last`. */
function activeRun(last: string, count: number): DayRecord[] {
  return Array.from({ length: count }, (_, i) => active(addDaysStr(last, -i)));
}

describe('active days', () => {
  it('needs 1 task, 5 reviews or 25 focus minutes', () => {
    expect(isActiveDay(undefined)).toBe(false);
    expect(isActiveDay(rec('x', { tasksDone: 1 }))).toBe(true);
    expect(isActiveDay(rec('x', { reviewsDone: 4 }))).toBe(false);
    expect(isActiveDay(rec('x', { reviewsDone: 5 }))).toBe(true);
    expect(isActiveDay(rec('x', { focusMin: 24 }))).toBe(false);
    expect(isActiveDay(rec('x', { focusMin: 25 }))).toBe(true);
  });
});

describe('currentStreak', () => {
  it('counts today when it is active', () => {
    const days = daysOf(...activeRun(TODAY, 3));
    expect(currentStreak({ days, today: TODAY, restDays: [] })).toEqual({
      count: 3,
      todayDone: true,
      todayPending: false,
    });
  });

  it('keeps today pending instead of breaking mid-day', () => {
    const days = daysOf(...activeRun(addDaysStr(TODAY, -1), 4));
    expect(currentStreak({ days, today: TODAY, restDays: [] })).toEqual({
      count: 4,
      todayDone: false,
      todayPending: true,
    });
  });

  it('stops at the first missed day', () => {
    const days = daysOf(active(TODAY), active('2026-10-15'), active('2026-10-13'));
    expect(currentStreak({ days, today: TODAY, restDays: [] }).count).toBe(2);
  });

  it('treats rest days as neither breaking nor extending', () => {
    // Wednesday (index 2) is a rest day: missed Wed doesn't break, active Wed doesn't count.
    const missedWed = daysOf(active(TODAY), active('2026-10-15'), active('2026-10-13'));
    expect(currentStreak({ days: missedWed, today: TODAY, restDays: [2] }).count).toBe(3);
    const activeWed = daysOf(...activeRun(TODAY, 4));
    expect(currentStreak({ days: activeWed, today: TODAY, restDays: [2] }).count).toBe(3);
  });

  it('skips frozen days and vacation days', () => {
    const frozen = daysOf(
      active(TODAY),
      rec('2026-10-15', { freezeUsed: true }),
      active('2026-10-14'),
    );
    expect(currentStreak({ days: frozen, today: TODAY, restDays: [] }).count).toBe(2);
    const vacation = daysOf(active('2026-10-12'), active('2026-10-13'));
    expect(
      currentStreak({ days: vacation, today: TODAY, restDays: [], vacationFrom: '2026-10-14' }),
    ).toEqual({ count: 2, todayDone: false, todayPending: false });
  });

  it('treats an active rest day today as not extending', () => {
    const days = daysOf(active(TODAY), active('2026-10-15'));
    const info = currentStreak({ days, today: TODAY, restDays: [4] });
    expect(info).toEqual({ count: 1, todayDone: false, todayPending: false });
  });

  it('returns 0 with no history', () => {
    expect(currentStreak({ days: {}, today: TODAY, restDays: [] })).toEqual({
      count: 0,
      todayDone: false,
      todayPending: true,
    });
  });
});

describe('isRestDate', () => {
  it('honours recorded rest days, weekday settings and vacation', () => {
    const days = daysOf(rec('2026-10-14', { isRestDay: true }));
    expect(isRestDate('2026-10-14', { days, restDays: [] })).toBe(true);
    expect(isRestDate('2026-10-18', { days, restDays: [6] })).toBe(true); // Sunday
    expect(isRestDate('2026-10-15', { days, restDays: [] })).toBe(false);
    expect(isRestDate('2026-10-15', { days, restDays: [], vacationFrom: '2026-10-15' })).toBe(true);
  });
});

describe('reconcile', () => {
  it('earns a freeze every 7 active days, capped at 3', () => {
    const run = activeRun('2026-10-15', 28); // Sep 18 .. Oct 15
    const res = reconcile({
      days: daysOf(...run),
      today: TODAY,
      restDays: [],
      freezes: 0,
      freezeProgress: 0,
    });
    expect(res.freezes).toBe(3);
    expect(res.freezeProgress).toBe(0);
    expect(res.reconciledThrough).toBe('2026-10-15');
    expect(res.upserts).toEqual([]);
    expect(res.brokeOn).toBeUndefined();
  });

  it('carries partial progress toward the next freeze', () => {
    const res = reconcile({
      days: daysOf(...activeRun('2026-10-15', 3)),
      today: TODAY,
      restDays: [],
      reconciledThrough: '2026-10-12',
      freezes: 1,
      freezeProgress: 5,
    });
    expect(res.freezes).toBe(2);
    expect(res.freezeProgress).toBe(1);
  });

  it('spends a freeze on a missed day and keeps the streak alive', () => {
    const days = daysOf(active('2026-10-13'), active('2026-10-15'));
    const res = reconcile({
      days,
      today: TODAY,
      restDays: [],
      reconciledThrough: '2026-10-12',
      freezes: 1,
      freezeProgress: 0,
    });
    expect(res.freezes).toBe(0);
    expect(res.upserts).toEqual([rec('2026-10-14', { freezeUsed: true })]);
    expect(res.brokeOn).toBeUndefined();
    const merged = { ...days, ...daysOf(...res.upserts), [TODAY]: active(TODAY) };
    expect(currentStreak({ days: merged, today: TODAY, restDays: [] }).count).toBe(3);
  });

  it('reports the break when no freeze is left', () => {
    const res = reconcile({
      days: daysOf(active('2026-10-12'), active('2026-10-15')),
      today: TODAY,
      restDays: [],
      reconciledThrough: '2026-10-12',
      freezes: 0,
      freezeProgress: 0,
    });
    expect(res.brokeOn).toBe('2026-10-13');
    expect(res.upserts).toEqual([]);
  });

  it('marks rest and vacation days without spending freezes', () => {
    const res = reconcile({
      days: daysOf(active('2026-10-12'), rec('2026-10-13', { reviewsDone: 2 })),
      today: TODAY,
      restDays: [1], // Tuesday
      vacationFrom: '2026-10-15',
      reconciledThrough: '2026-10-12',
      freezes: 2,
      freezeProgress: 0,
    });
    // Wednesday Oct 14 was a missed workday: one freeze spent there.
    expect(res.upserts).toEqual([
      rec('2026-10-13', { reviewsDone: 2, isRestDay: true }),
      rec('2026-10-14', { freezeUsed: true }),
      rec('2026-10-15', { isRestDay: true }),
    ]);
    expect(res.freezes).toBe(1);
  });

  it('is idempotent', () => {
    const input = {
      days: daysOf(active('2026-10-12'), active('2026-10-14')),
      today: TODAY,
      restDays: [],
      reconciledThrough: '2026-10-11',
      freezes: 2,
      freezeProgress: 0,
    };
    const first = reconcile(input);
    expect(first.upserts.length).toBeGreaterThan(0);
    const second = reconcile({
      ...input,
      days: { ...input.days, ...daysOf(...first.upserts) },
      reconciledThrough: first.reconciledThrough,
      freezes: first.freezes,
      freezeProgress: first.freezeProgress,
    });
    expect(second.upserts).toEqual([]);
    expect(second.freezes).toBe(first.freezes);
    expect(second.freezeProgress).toBe(first.freezeProgress);
    expect(second.reconciledThrough).toBe(first.reconciledThrough);
  });

  it('starts from yesterday when there is no history', () => {
    const res = reconcile({ days: {}, today: TODAY, restDays: [], freezes: 0, freezeProgress: 0 });
    expect(res.reconciledThrough).toBe('2026-10-15');
    expect(res.upserts).toEqual([]);
  });
});

describe('streakMessage', () => {
  it('uses forgiving copy', () => {
    expect(streakMessage({ count: 1, todayDone: true, todayPending: false }, 4)).toBe(
      '1-day streak',
    );
    expect(streakMessage({ count: 5, todayDone: false, todayPending: true }, 9)).toBe(
      '5-day streak',
    );
    expect(streakMessage({ count: 0, todayDone: false, todayPending: true }, 12)).toBe(
      'Fresh start. Your longest is 12 days.',
    );
    expect(streakMessage({ count: 0, todayDone: false, todayPending: true }, 1)).toBe(
      'Fresh start. Your longest is 1 day.',
    );
    expect(streakMessage({ count: 0, todayDone: false, todayPending: true }, 0)).toBe(
      'Start your streak today.',
    );
  });
});
