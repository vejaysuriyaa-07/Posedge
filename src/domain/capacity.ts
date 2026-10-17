import { weekdayIndex } from './week';

/** Daily capacity vs planned work. Estimates without a value count as 0 minutes. */

export function capacityForDate(date: string, capacityMinByWeekday: number[]): number {
  return capacityMinByWeekday[weekdayIndex(date)] ?? 0;
}

/** Sum of estimates, including done tasks (they were part of the day's plan). */
export function plannedMinutes(tasks: { estimateMin?: number; status?: string }[]): number {
  return tasks.reduce((sum, t) => sum + (t.estimateMin ?? 0), 0);
}

export type LoadState = 'empty' | 'ok' | 'near' | 'over';

export interface LoadInfo {
  plannedMin: number;
  capacityMin: number;
  /** planned / capacity, for bar widths (1.5 when capacity is 0 and something is planned). */
  ratio: number;
  overMin: number;
  state: LoadState;
}

const NEAR_RATIO = 0.85;

export function loadInfo(plannedMin: number, capacityMin: number): LoadInfo {
  if (plannedMin <= 0) {
    return { plannedMin: 0, capacityMin, ratio: 0, overMin: 0, state: 'empty' };
  }
  if (capacityMin <= 0) {
    return { plannedMin, capacityMin: 0, ratio: 1.5, overMin: plannedMin, state: 'over' };
  }
  const ratio = plannedMin / capacityMin;
  const overMin = Math.max(0, plannedMin - capacityMin);
  const state: LoadState = overMin > 0 ? 'over' : ratio >= NEAR_RATIO ? 'near' : 'ok';
  return { plannedMin, capacityMin, ratio, overMin, state };
}

/** Minutes as hours with at most one decimal: 30 -> "0.5h", 90 -> "1.5h", 120 -> "2h". */
export function formatHours(min: number): string {
  return `${Math.round((min / 60) * 10) / 10}h`;
}

/** "+1.5h over" when the day is over capacity. */
export function overLabel(info: LoadInfo): string | null {
  return info.state === 'over' ? `+${formatHours(info.overMin)} over` : null;
}
