import type { ActivityDay } from '../db/types';
import { addDaysStr, weekdayIndex } from './week';

/** Streak and freeze rules from SPEC section 7. Pure functions over ActivityDay records. */

export type DayRecord = Pick<
  ActivityDay,
  'date' | 'tasksDone' | 'reviewsDone' | 'focusMin' | 'freezeUsed' | 'isRestDay'
>;

const MAX_FREEZES = 3;
const ACTIVE_DAYS_PER_FREEZE = 7;
const MAX_WALK_DAYS = 3660;

/** A day counts as active with 1+ task, 5+ reviews or 25+ focus minutes. */
export function isActiveDay(
  d?: Pick<ActivityDay, 'tasksDone' | 'reviewsDone' | 'focusMin'>,
): boolean {
  if (!d) return false;
  return d.tasksDone >= 1 || d.reviewsDone >= 5 || d.focusMin >= 25;
}

export interface StreakContext {
  days: Record<string, DayRecord | undefined>;
  today: string;
  /** Weekday indexes, 0 = Monday .. 6 = Sunday. */
  restDays: number[];
  /** Local date vacation started, if vacation mode is on. */
  vacationFrom?: string;
}

/** Rest and vacation days neither break nor extend a streak. */
export function isRestDate(
  date: string,
  ctx: Pick<StreakContext, 'days' | 'restDays' | 'vacationFrom'>,
): boolean {
  if (ctx.days[date]?.isRestDay) return true;
  if (ctx.restDays.includes(weekdayIndex(date))) return true;
  return ctx.vacationFrom !== undefined && date >= ctx.vacationFrom;
}

export interface StreakInfo {
  count: number;
  todayDone: boolean;
  /** Today isn't active yet; it never breaks the streak before midnight. */
  todayPending: boolean;
}

function earliestDate(days: Record<string, DayRecord | undefined>): string | undefined {
  let earliest: string | undefined;
  for (const [date, rec] of Object.entries(days)) {
    if (rec && (earliest === undefined || date < earliest)) earliest = date;
  }
  return earliest;
}

export function currentStreak(ctx: StreakContext): StreakInfo {
  const todayRest = isRestDate(ctx.today, ctx);
  const todayDone = !todayRest && isActiveDay(ctx.days[ctx.today]);
  let count = todayDone ? 1 : 0;
  const earliest = earliestDate(ctx.days);
  if (earliest !== undefined) {
    let date = ctx.today;
    for (let i = 0; i < MAX_WALK_DAYS; i++) {
      date = addDaysStr(date, -1);
      // Nothing was ever recorded before the first record, so the streak can't extend further.
      if (date < earliest) break;
      const rec = ctx.days[date];
      if (isRestDate(date, ctx) || rec?.freezeUsed) continue;
      if (isActiveDay(rec)) count++;
      else break;
    }
  }
  return { count, todayDone, todayPending: !todayDone && !todayRest };
}

export interface ReconcileInput {
  days: Record<string, DayRecord | undefined>;
  today: string;
  restDays: number[];
  vacationFrom?: string;
  reconciledThrough?: string;
  freezes: number;
  freezeProgress: number;
}

export interface ReconcileResult {
  freezes: number;
  freezeProgress: number;
  /** Yesterday (or the unchanged input when nothing needed processing). */
  reconciledThrough: string;
  /** Records to write (freezeUsed / isRestDay set); counts are copied from the existing record. */
  upserts: DayRecord[];
  /** First missed non-rest day that had no freeze to cover it. */
  brokeOn?: string;
}

function baseRecord(date: string, rec: DayRecord | undefined): DayRecord {
  return {
    date,
    tasksDone: rec?.tasksDone ?? 0,
    reviewsDone: rec?.reviewsDone ?? 0,
    focusMin: rec?.focusMin ?? 0,
    freezeUsed: rec?.freezeUsed ?? false,
    isRestDay: rec?.isRestDay ?? false,
  };
}

/**
 * Settles every finished day since the last run: marks rest/vacation days, earns a freeze per 7
 * active days (max 3) and spends a freeze on each missed non-rest day when one is available.
 */
export function reconcile(input: ReconcileInput): ReconcileResult {
  const yesterday = addDaysStr(input.today, -1);
  let freezes = input.freezes;
  let freezeProgress = input.freezeProgress;

  if (input.reconciledThrough !== undefined && input.reconciledThrough >= yesterday) {
    return { freezes, freezeProgress, reconciledThrough: input.reconciledThrough, upserts: [] };
  }

  const start =
    input.reconciledThrough !== undefined
      ? addDaysStr(input.reconciledThrough, 1)
      : (earliestDate(input.days) ?? yesterday);

  const upserts: DayRecord[] = [];
  let brokeOn: string | undefined;
  let date = start;
  for (let i = 0; i < MAX_WALK_DAYS && date <= yesterday; i++, date = addDaysStr(date, 1)) {
    const rec = input.days[date];
    if (isRestDate(date, input)) {
      if (!rec?.isRestDay) upserts.push({ ...baseRecord(date, rec), isRestDay: true });
      continue;
    }
    if (isActiveDay(rec)) {
      freezeProgress++;
      if (freezeProgress >= ACTIVE_DAYS_PER_FREEZE) {
        freezeProgress = 0;
        freezes = Math.min(MAX_FREEZES, freezes + 1);
      }
      continue;
    }
    if (rec?.freezeUsed) continue;
    if (freezes > 0) {
      freezes--;
      upserts.push({ ...baseRecord(date, rec), freezeUsed: true });
    } else if (brokeOn === undefined) {
      brokeOn = date;
    }
  }

  const result: ReconcileResult = {
    freezes,
    freezeProgress,
    reconciledThrough: yesterday,
    upserts,
  };
  if (brokeOn !== undefined) result.brokeOn = brokeOn;
  return result;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Forgiving copy: no shaming when a streak breaks. */
export function streakMessage(info: StreakInfo, longest: number): string {
  if (info.count > 0) return `${info.count}-day streak`;
  if (longest > 0) return `Fresh start. Your longest is ${plural(longest, 'day')}.`;
  return 'Start your streak today.';
}
