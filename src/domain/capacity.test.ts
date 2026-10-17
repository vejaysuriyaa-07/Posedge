import { describe, expect, it } from 'vitest';
import { capacityForDate, formatHours, loadInfo, overLabel, plannedMinutes } from './capacity';

const CAPACITY = [180, 120, 180, 120, 180, 240, 60];

describe('capacity', () => {
  it('looks up capacity by weekday (Mon..Sun)', () => {
    expect(capacityForDate('2026-10-12', CAPACITY)).toBe(180); // Monday
    expect(capacityForDate('2026-10-13', CAPACITY)).toBe(120); // Tuesday
    expect(capacityForDate('2026-10-17', CAPACITY)).toBe(240); // Saturday
    expect(capacityForDate('2026-10-18', CAPACITY)).toBe(60); // Sunday
  });

  it('sums estimates, counting missing ones as 0 and including done tasks', () => {
    expect(plannedMinutes([])).toBe(0);
    expect(
      plannedMinutes([
        { estimateMin: 90 },
        { estimateMin: undefined },
        { estimateMin: 30, status: 'done' },
      ]),
    ).toBe(120);
  });
});

describe('loadInfo', () => {
  it('is empty with nothing planned', () => {
    expect(loadInfo(0, 120)).toEqual({
      plannedMin: 0,
      capacityMin: 120,
      ratio: 0,
      overMin: 0,
      state: 'empty',
    });
  });

  it('is ok below 85%', () => {
    expect(loadInfo(60, 120)).toMatchObject({ ratio: 0.5, overMin: 0, state: 'ok' });
  });

  it('is near from 85% up to capacity', () => {
    expect(loadInfo(102, 120).state).toBe('near');
    expect(loadInfo(120, 120).state).toBe('near');
  });

  it('is over past capacity', () => {
    expect(loadInfo(210, 120)).toMatchObject({ overMin: 90, state: 'over', ratio: 1.75 });
  });

  it('handles zero capacity without dividing by zero', () => {
    expect(loadInfo(30, 0)).toEqual({
      plannedMin: 30,
      capacityMin: 0,
      ratio: 1.5,
      overMin: 30,
      state: 'over',
    });
  });
});

describe('formatting', () => {
  it.each([
    [0, '0h'],
    [30, '0.5h'],
    [90, '1.5h'],
    [120, '2h'],
    [100, '1.7h'],
  ])('%i min -> %s', (min, label) => {
    expect(formatHours(min)).toBe(label);
  });

  it('labels overload', () => {
    expect(overLabel(loadInfo(210, 120))).toBe('+1.5h over');
    expect(overLabel(loadInfo(60, 120))).toBeNull();
    expect(overLabel(loadInfo(0, 0))).toBeNull();
  });
});
