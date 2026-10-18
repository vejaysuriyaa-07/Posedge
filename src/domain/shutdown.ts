import { addDaysStr, todayStr, weekdayIndex } from './week';

/** The next day after `today` that isn't a rest day (or simply tomorrow if every day is one). */
export function nextWorkDay(today: string, restDays: number[]): string {
  const rest = new Set(restDays);
  for (let i = 1; i <= 7; i++) {
    const d = addDaysStr(today, i);
    if (!rest.has(weekdayIndex(d))) return d;
  }
  return addDaysStr(today, 1);
}

/** Shown from this hour on: the Today nudge to wrap up the day. */
export const SHUTDOWN_HOUR = 17;

export const ENERGY_LABELS = ['Drained', 'Low', 'Okay', 'Good', 'Energized'] as const;

/** Before this hour, a shutdown closes the previous day (working late). */
export const LATE_NIGHT_HOUR = 4;

/** The day a shutdown right now would close. */
export function shutdownDate(now: Date): string {
  return todayStr(now.getHours() < LATE_NIGHT_HOUR ? new Date(now.getTime() - 86_400_000) : now);
}
