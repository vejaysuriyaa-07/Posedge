import { describe, expect, it } from 'vitest';
import {
  bucketFor,
  bucketThresholds,
  heatmapGrid,
  lastWeeks,
  reviewsPerDay,
  reviewTargetWeek,
  weeklyDoneByProject,
  weeklyReviewWindow,
} from './progress';

describe('weekly review timing', () => {
  it('targets next week from Sunday 17:00, otherwise this week', () => {
    expect(reviewTargetWeek(new Date(2026, 9, 18, 16, 59))).toBe('2026-10-12'); // Sun before 5pm
    expect(reviewTargetWeek(new Date(2026, 9, 18, 17, 0))).toBe('2026-10-19'); // Sun 5pm
    expect(reviewTargetWeek(new Date(2026, 9, 19, 9, 0))).toBe('2026-10-19'); // Monday
    expect(reviewTargetWeek(new Date(2026, 9, 21, 9, 0))).toBe('2026-10-19'); // Wednesday
  });

  it('opens the banner window Sunday 17:00 through Monday', () => {
    expect(weeklyReviewWindow(new Date(2026, 9, 18, 16, 0))).toBe(false);
    expect(weeklyReviewWindow(new Date(2026, 9, 18, 18, 0))).toBe(true);
    expect(weeklyReviewWindow(new Date(2026, 9, 19, 23, 0))).toBe(true);
    expect(weeklyReviewWindow(new Date(2026, 9, 20, 8, 0))).toBe(false);
  });
});

describe('heatmap', () => {
  it('builds 53 Monday-first columns ending this week', () => {
    const cells = heatmapGrid('2026-10-17');
    expect(cells).toHaveLength(53 * 7);
    expect(cells[0]).toMatchObject({ date: '2025-10-13', row: 0, col: 0 });
    const last = cells[cells.length - 1]!;
    expect(last).toMatchObject({ date: '2026-10-18', row: 6, col: 52, future: true });
    expect(cells.find((c) => c.date === '2026-10-17')?.future).toBe(false);
  });

  it('buckets by quartiles of non-zero values', () => {
    const t = bucketThresholds([0, 0, 5, 10, 20, 40, 80]);
    expect(t[0]).toBeLessThan(t[1]);
    expect(t[1]).toBeLessThan(t[2]);
    expect(bucketFor(0, t)).toBe(0);
    expect(bucketFor(5, t)).toBe(1);
    expect(bucketFor(80, t)).toBe(4);
    expect(bucketThresholds([])).toEqual([1, 2, 3]);
    expect(bucketThresholds([3, 3, 3])).toEqual([3, 4, 5]);
  });
});

describe('charts data', () => {
  it('counts completions per week and project', () => {
    const weeks = lastWeeks('2026-10-17', 3);
    expect(weeks).toEqual(['2026-09-28', '2026-10-05', '2026-10-12']);
    const rows = weeklyDoneByProject(
      [
        { projectId: 'a', status: 'done', completedAt: new Date(2026, 9, 13, 10).toISOString() },
        { projectId: 'a', status: 'done', completedAt: new Date(2026, 9, 14, 10).toISOString() },
        { projectId: 'b', status: 'done', completedAt: new Date(2026, 9, 6, 10).toISOString() },
        { projectId: 'b', status: 'todo' },
        { projectId: 'c', status: 'done', completedAt: new Date(2026, 8, 1, 10).toISOString() },
      ],
      weeks,
    );
    expect(rows).toEqual([
      { weekStart: '2026-09-28' },
      { weekStart: '2026-10-05', b: 1 },
      { weekStart: '2026-10-12', a: 2 },
    ]);
  });

  it('computes reviews per day with a retention share', () => {
    const at = (d: number, h = 10) => new Date(2026, 9, d, h).toISOString();
    const r = reviewsPerDay(
      [
        { reviewedAt: at(17), rating: 3 },
        { reviewedAt: at(17), rating: 1 },
        { reviewedAt: at(16), rating: 4 },
      ],
      '2026-10-17',
      3,
    );
    expect(r).toEqual([
      { date: '2026-10-15', reviews: 0, retention: null },
      { date: '2026-10-16', reviews: 1, retention: 100 },
      { date: '2026-10-17', reviews: 2, retention: 50 },
    ]);
  });
});
