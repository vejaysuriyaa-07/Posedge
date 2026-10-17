import { currentStreak, reconcile, type DayRecord } from '../../domain/streak';
import { dateOfIso, todayStr } from '../../domain/week';
import { db, getSettings } from '../db';
import type { ActivityDay, Settings } from '../types';
import { emptyDay } from './activity';

function vacationFrom(s: Settings): string | undefined {
  return s.vacationMode && s.vacationStartedAt ? dateOfIso(s.vacationStartedAt) : undefined;
}

async function dayMap(): Promise<Record<string, ActivityDay>> {
  const all = await db.activityDays.toArray();
  return Object.fromEntries(all.map((d) => [d.date, d]));
}

export interface ReconcileOutcome {
  brokeOn?: string;
  freezesUsed: number;
  freezesEarned: number;
  streak: number;
}

/**
 * Daily bookkeeping: walks the days since the last run, spends freezes on missed days,
 * earns freezes for active days and records rest days. Safe to call often (idempotent per day).
 */
export async function reconcileStreaks(now: Date = new Date()): Promise<ReconcileOutcome> {
  return db.transaction('rw', [db.activityDays, db.settings], async () => {
    const s = await getSettings();
    const today = todayStr(now);
    const days = await dayMap();
    const r = reconcile({
      days,
      today,
      restDays: s.restDays,
      vacationFrom: vacationFrom(s),
      reconciledThrough: s.streakReconciledThrough,
      freezes: s.freezes,
      freezeProgress: s.freezeProgress,
    });
    let freezesUsed = 0;
    for (const u of r.upserts) {
      const merged: ActivityDay = { ...(days[u.date] ?? emptyDay(u.date)), ...u };
      if (u.freezeUsed && !days[u.date]?.freezeUsed) freezesUsed++;
      days[u.date] = merged;
      await db.activityDays.put(merged);
    }
    const info = currentStreak({
      days,
      today,
      restDays: s.restDays,
      vacationFrom: vacationFrom(s),
    });
    await db.settings.put({
      ...s,
      freezes: r.freezes,
      freezeProgress: r.freezeProgress,
      streakReconciledThrough: r.reconciledThrough,
      longestStreak: Math.max(s.longestStreak, info.count),
    });
    return {
      brokeOn: r.brokeOn,
      freezesUsed,
      freezesEarned: Math.max(0, r.freezes - s.freezes + freezesUsed),
      streak: info.count,
    };
  });
}

/** Raises longestStreak if today's activity extended the streak. Call inside a transaction with settings + activityDays. */
export async function bumpLongestStreak(now: Date = new Date()): Promise<number> {
  const s = await getSettings();
  const days: Record<string, DayRecord> = await dayMap();
  const info = currentStreak({
    days,
    today: todayStr(now),
    restDays: s.restDays,
    vacationFrom: vacationFrom(s),
  });
  if (info.count > s.longestStreak) await db.settings.put({ ...s, longestStreak: info.count });
  return info.count;
}
