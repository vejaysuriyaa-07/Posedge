import { db, getSettings } from '../db';
import type { ActivityDay } from '../types';

export function emptyDay(date: string): ActivityDay {
  return {
    date,
    tasksDone: 0,
    reviewsDone: 0,
    focusMin: 0,
    xp: 0,
    freezeUsed: false,
    isRestDay: false,
  };
}

type Delta = Partial<Pick<ActivityDay, 'tasksDone' | 'reviewsDone' | 'focusMin' | 'xp'>>;

/** Adds deltas to a day's counters. Call inside a transaction that includes `activityDays`. */
export async function bumpDay(date: string, delta: Delta): Promise<ActivityDay> {
  const cur = (await db.activityDays.get(date)) ?? emptyDay(date);
  const next: ActivityDay = {
    ...cur,
    tasksDone: Math.max(0, cur.tasksDone + (delta.tasksDone ?? 0)),
    reviewsDone: Math.max(0, cur.reviewsDone + (delta.reviewsDone ?? 0)),
    focusMin: Math.max(0, cur.focusMin + (delta.focusMin ?? 0)),
    xp: Math.max(0, cur.xp + (delta.xp ?? 0)),
  };
  await db.activityDays.put(next);
  return next;
}

export interface XpChange {
  before: number;
  after: number;
}

/**
 * Adds (or, when negative, removes) XP on the settings total and the given day.
 * Call inside a transaction that includes `settings` and `activityDays`.
 */
export async function addXp(amount: number, date: string): Promise<XpChange> {
  const s = await getSettings();
  const after = Math.max(0, s.xpTotal + amount);
  if (amount !== 0) {
    await db.settings.put({ ...s, xpTotal: after });
    await bumpDay(date, { xp: amount });
  }
  return { before: s.xpTotal, after };
}
