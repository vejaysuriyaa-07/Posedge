import { describe, expect, it } from 'vitest';
import {
  momentumDecay,
  momentumDelta,
  momentumSeries,
  PROJECT_TARGET,
  sparkDomain,
  sparkPaths,
} from './momentum';
import { addDaysStr } from './week';

const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDaysStr(from, i));

describe('momentum', () => {
  it('uses the Loop habit-strength decay', () => {
    expect(momentumDecay()).toBeCloseTo(0.9481, 4);
    expect(momentumDecay(PROJECT_TARGET)).toBeCloseTo(0.9657, 4);
  });

  it('meets a three-days-a-week target with a Mon/Wed/Fri rhythm', () => {
    // Four weeks of Mon, Wed, Fri starting Monday 2026-09-21.
    const active = new Set(
      [0, 2, 4, 7, 9, 11, 14, 16, 18, 21, 23, 25].map((i) => addDaysStr('2026-09-21', i)),
    );
    const weekly = momentumSeries(active, '2026-09-21', '2026-10-18', 28, {
      target: PROJECT_TARGET,
    });
    const daily = momentumSeries(active, '2026-09-21', '2026-10-18', 28);
    // After the first week every day meets the weekly target, so it keeps climbing.
    const last = weekly.at(-1)!.score;
    expect(last).toBeGreaterThan(0.5);
    expect(last).toBeGreaterThan(daily.at(-1)!.score);
    for (let i = 8; i < 28; i++) expect(weekly[i]!.score).toBeGreaterThan(weekly[i - 1]!.score);
    // Once a week only reaches a third of the target.
    const once = new Set([0, 7, 14, 21].map((i) => addDaysStr('2026-09-21', i)));
    const slow = momentumSeries(once, '2026-09-21', '2026-10-18', 28, { target: PROJECT_TARGET });
    expect(slow.at(-1)!.score).toBeLessThan(last / 2);
  });

  it('climbs with active days and only dips on a missed one', () => {
    // 2026-10-05 is a Monday.
    const active = new Set(days('2026-10-05', 10));
    const s = momentumSeries(active, '2026-10-05', '2026-10-15', 11);
    const m = momentumDecay();
    expect(s).toHaveLength(11);
    expect(s[9]!.score).toBeCloseTo(1 - m ** 10, 6);
    // Day 11 (Thu Oct 15) is idle: a small dip, not a reset.
    expect(s[10]!.score).toBeCloseTo((1 - m ** 10) * m, 6);
    expect(s[10]!.score / s[9]!.score).toBeGreaterThan(0.94);
  });

  it('leaves the score alone on rest days and skipped days', () => {
    const active = new Set(['2026-10-09']); // Friday
    const s = momentumSeries(active, '2026-10-09', '2026-10-12', 4, {
      restDays: [5, 6], // weekend
    });
    expect(s[1]!.score).toBe(s[0]!.score);
    expect(s[2]!.score).toBe(s[0]!.score);
    expect(s[3]!.score).toBeLessThan(s[0]!.score);
    const skipped = momentumSeries(active, '2026-10-09', '2026-10-12', 4, {
      skip: (d) => d === '2026-10-12',
    });
    expect(skipped[3]!.score).toBeLessThan(skipped[0]!.score);
    expect(skipped[3]!.score).toBe(skipped[2]!.score);
  });

  it('reads zero before the first active day', () => {
    const s = momentumSeries(new Set(['2026-10-14']), '2026-10-14', '2026-10-15', 5);
    expect(s.map((p) => p.score > 0)).toEqual([false, false, false, true, true]);
  });

  it('measures the weekly change in points', () => {
    const active = new Set(days('2026-10-01', 14));
    const s = momentumSeries(active, '2026-10-01', '2026-10-14', 14);
    expect(momentumDelta(s, 7)).toBeGreaterThan(10);
    expect(momentumDelta([], 7)).toBe(0);
  });

  it('fits the sparkline range to the series, at least a quarter tall', () => {
    const pts = (...v: number[]) => v.map((score, i) => ({ date: String(i), score }));
    expect(sparkDomain(pts(0.5, 0.52))).toEqual([0.385, 0.635]);
    expect(sparkDomain(pts(0, 0.02))).toEqual([0, 0.25]);
    expect(sparkDomain(pts(0.98, 1))).toEqual([0.75, 1]);
    const [lo, hi] = sparkDomain(pts(0.2, 0.9));
    expect(lo).toBeCloseTo(0.16);
    expect(hi).toBeCloseTo(0.94);
    expect(sparkDomain([])).toEqual([0, 1]);
  });

  it('draws sparkline paths', () => {
    const { line, area } = sparkPaths(
      [
        { date: 'a', score: 0 },
        { date: 'b', score: 1 },
      ],
      100,
      20,
      0,
    );
    expect(line).toBe('M0.0,20.0L100.0,0.0');
    expect(area.endsWith('L100.0,20L0.0,20Z')).toBe(true);
    expect(sparkPaths([], 10, 10)).toEqual({ line: '', area: '' });
  });
});
