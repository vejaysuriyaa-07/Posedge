import { addDaysStr, diffDays, weekdayIndex } from './week';

/**
 * Momentum: Loop Habit Tracker's habit strength, applied to days with work on them.
 *
 * Each day: score = score * m + value * (1 - m), with m = 0.5 ^ (sqrt(freq) / 13) and freq the
 * target rate (times / per days). For a daily target, value is 1 on an active day and 0 otherwise;
 * for "3 days a week" it is the share of the target met in the trailing 7 days (capped at 1), as
 * Loop does for weekly habits. A steady rhythm climbs toward 100%, and one missed day is a small
 * dip, not a reset. Rest days and skipped days (vacation, freezes) leave the score unchanged.
 */

export interface MomentumTarget {
  times: number;
  per: number;
}

/** Overall activity aims for every (non-rest) day. */
export const DAILY: MomentumTarget = { times: 1, per: 1 };
/** A project is on track with work on three days a week. */
export const PROJECT_TARGET: MomentumTarget = { times: 3, per: 7 };

export function momentumDecay(target: MomentumTarget = DAILY): number {
  return 0.5 ** (Math.sqrt(target.times / target.per) / 13);
}

export interface MomentumPoint {
  date: string;
  /** 0..1 */
  score: number;
}

export interface MomentumOptions {
  /** Weekday indexes (0 = Monday) that don't count either way. */
  restDays?: number[];
  /** Other days that don't count (vacation, freezes). */
  skip?: (date: string) => boolean;
  target?: MomentumTarget;
}

/**
 * Daily scores from `start` through `to`, returning only the last `window` days. Starting at the
 * first day of activity keeps a new project from looking idle before it existed.
 */
export function momentumSeries(
  active: ReadonlySet<string>,
  start: string,
  to: string,
  window: number,
  opts: MomentumOptions = {},
): MomentumPoint[] {
  const target = opts.target ?? DAILY;
  const m = momentumDecay(target);
  const rest = new Set(opts.restDays ?? []);
  // Share of the target met in the trailing window ending on `d`.
  const value = (d: string) => {
    let n = 0;
    for (let k = 0; k < target.per; k++) if (active.has(addDaysStr(d, -k))) n++;
    return Math.min(1, n / target.times);
  };
  const from = addDaysStr(to, -(window - 1));
  const out: MomentumPoint[] = [];
  let score = 0;
  // Days before `start` contribute nothing; days in the window before it read as 0.
  const first = start < from ? start : from;
  const days = diffDays(to, first);
  for (let i = 0; i <= days; i++) {
    const d = addDaysStr(first, i);
    if (d >= start) {
      const excused = rest.has(weekdayIndex(d)) || !!opts.skip?.(d);
      if (active.has(d) || !excused) score = score * m + value(d) * (1 - m);
    }
    if (d >= from) out.push({ date: d, score });
  }
  return out;
}

/** Change over the last `days` days, in percentage points. */
export function momentumDelta(series: MomentumPoint[], days = 7): number {
  const last = series.at(-1)?.score ?? 0;
  const before = series.at(-1 - days)?.score ?? series[0]?.score ?? 0;
  return Math.round((last - before) * 100);
}

/**
 * The score range a sparkline shows: the series' own range with a little room, at least
 * `minSpan` tall (so day-to-day noise isn't blown up) and within 0..1.
 */
export function sparkDomain(series: MomentumPoint[], minSpan = 0.25): [number, number] {
  if (!series.length) return [0, 1];
  let lo = Math.min(...series.map((p) => p.score)) - 0.04;
  let hi = Math.max(...series.map((p) => p.score)) + 0.04;
  if (hi - lo < minSpan) {
    const mid = (lo + hi) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  if (lo < 0) [lo, hi] = [0, Math.min(1, hi - lo)];
  if (hi > 1) [lo, hi] = [Math.max(0, lo - (hi - 1)), 1];
  return [lo, hi];
}

/** SVG path for a sparkline of the series in a `w` x `h` box: the line, and the filled area. */
export function sparkPaths(
  series: MomentumPoint[],
  w: number,
  h: number,
  pad = 2,
  domain: [number, number] = [0, 1],
): { line: string; area: string } {
  if (!series.length) return { line: '', area: '' };
  const n = series.length;
  const [lo, hi] = domain;
  const x = (i: number) => (n === 1 ? w / 2 : (i / (n - 1)) * w);
  const y = (s: number) =>
    pad + (1 - Math.min(1, Math.max(0, (s - lo) / (hi - lo || 1)))) * (h - pad * 2);
  const pts = series.map((p, i) => `${x(i).toFixed(1)},${y(p.score).toFixed(1)}`);
  const line = `M${pts.join('L')}`;
  return { line, area: `${line}L${x(n - 1).toFixed(1)},${h}L${x(0).toFixed(1)},${h}Z` };
}

/** "+8", "−3" or "±0" points. */
export function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : '±0';
}
