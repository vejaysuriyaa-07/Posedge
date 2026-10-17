import { addDaysStr, addWeeksStr, dateOfIso, mondayOf, weekdayIndex } from './week';

/** Monday of the week VJ should be planning: next week from Sunday 17:00 on, otherwise this week. */
export function reviewTargetWeek(now: Date): string {
  const today = dateOfIso(now.toISOString());
  const monday = mondayOf(today);
  if (weekdayIndex(today) === 6 && now.getHours() >= 17) return addWeeksStr(monday, 1);
  return monday;
}

/** The weekly review banner shows from Sunday 17:00 through Monday when the target week has no review. */
export function weeklyReviewWindow(now: Date): boolean {
  const today = dateOfIso(now.toISOString());
  const wd = weekdayIndex(today);
  return wd === 0 || (wd === 6 && now.getHours() >= 17);
}

export interface HeatmapCell {
  date: string;
  /** 0 = Monday .. 6 = Sunday (row). */
  row: number;
  /** 0 = oldest week (column). */
  col: number;
  future: boolean;
}

/** 53 Monday-first week columns ending with the week that contains `today`. */
export function heatmapGrid(today: string, weeks = 53): HeatmapCell[] {
  const lastMonday = mondayOf(today);
  const firstMonday = addWeeksStr(lastMonday, -(weeks - 1));
  const cells: HeatmapCell[] = [];
  for (let col = 0; col < weeks; col++) {
    const monday = addWeeksStr(firstMonday, col);
    for (let row = 0; row < 7; row++) {
      const date = addDaysStr(monday, row);
      cells.push({ date, row, col, future: date > today });
    }
  }
  return cells;
}

/**
 * Thresholds for 4 non-zero intensity buckets (GitHub style): quartiles of the non-zero values,
 * forced to be strictly increasing so every bucket is reachable.
 */
export function bucketThresholds(values: number[]): [number, number, number] {
  const nz = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (!nz.length) return [1, 2, 3];
  const q = (p: number) => nz[Math.min(nz.length - 1, Math.floor(p * (nz.length - 1)))]!;
  const t1 = q(0.25);
  let t2 = q(0.5);
  let t3 = q(0.75);
  if (t2 <= t1) t2 = t1 + 1;
  if (t3 <= t2) t3 = t2 + 1;
  return [t1, t2, t3];
}

/** 0 for nothing, then 1..4. */
export function bucketFor(
  value: number,
  [t1, t2, t3]: [number, number, number],
): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0) return 0;
  if (value <= t1) return 1;
  if (value <= t2) return 2;
  if (value <= t3) return 3;
  return 4;
}

/** The last `n` week Mondays, oldest first, ending with the week containing `today`. */
export function lastWeeks(today: string, n: number): string[] {
  const end = mondayOf(today);
  return Array.from({ length: n }, (_, i) => addWeeksStr(end, i - (n - 1)));
}

/** Tasks completed per week and project: rows like { weekStart, [projectId]: count }. */
export function weeklyDoneByProject(
  tasks: { projectId: string; completedAt?: string; status: string }[],
  weeks: string[],
): Record<string, number | string>[] {
  const rows = weeks.map((w) => ({ weekStart: w }) as Record<string, number | string>);
  const index = new Map(weeks.map((w, i) => [w, i]));
  for (const t of tasks) {
    if (t.status !== 'done' || !t.completedAt) continue;
    const i = index.get(mondayOf(dateOfIso(t.completedAt)));
    if (i === undefined) continue;
    const row = rows[i]!;
    row[t.projectId] = ((row[t.projectId] as number | undefined) ?? 0) + 1;
  }
  return rows;
}

/** Reviews per day for the last `days` days with the share of Good/Easy ratings (0..100, null if none). */
export function reviewsPerDay(
  logs: { reviewedAt: string; rating: number }[],
  today: string,
  days = 30,
): { date: string; reviews: number; retention: number | null }[] {
  const out = Array.from({ length: days }, (_, i) => ({
    date: addDaysStr(today, i - (days - 1)),
    reviews: 0,
    good: 0,
  }));
  const index = new Map(out.map((d, i) => [d.date, i]));
  for (const l of logs) {
    const i = index.get(dateOfIso(l.reviewedAt));
    if (i === undefined) continue;
    out[i]!.reviews++;
    if (l.rating >= 3) out[i]!.good++;
  }
  return out.map(({ date, reviews, good }) => ({
    date,
    reviews,
    retention: reviews ? Math.round((good / reviews) * 100) : null,
  }));
}
