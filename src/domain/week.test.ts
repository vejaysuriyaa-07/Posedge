import { describe, expect, it } from 'vitest';
import {
  addDaysStr,
  addWeeksStr,
  atHour,
  dateOfIso,
  diffDays,
  formatWeekRange,
  isDateStr,
  mondayOf,
  parseDate,
  relativeDayLabel,
  toDateStr,
  weekDays,
  weekLabel,
  weekdayIndex,
} from './week';

describe('week helpers', () => {
  it('normalizes any day to its Monday', () => {
    expect(mondayOf('2026-10-19')).toBe('2026-10-19'); // Monday
    expect(mondayOf('2026-10-21')).toBe('2026-10-19'); // Wednesday
    expect(mondayOf('2026-10-25')).toBe('2026-10-19'); // Sunday belongs to the week before
    expect(mondayOf('2026-10-26')).toBe('2026-10-26');
  });

  it('handles month and year boundaries', () => {
    expect(mondayOf('2026-11-01')).toBe('2026-10-26');
    expect(mondayOf('2027-01-01')).toBe('2026-12-28');
    expect(weekDays('2026-12-30')).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
    expect(addDaysStr('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('is DST-safe in America/Los_Angeles', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/Los_Angeles');
    // DST ends Sunday 2026-11-01; the day has 25 hours.
    expect(addDaysStr('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysStr('2026-11-01', 1)).toBe('2026-11-02');
    expect(diffDays('2026-11-02', '2026-10-31')).toBe(2);
    expect(addWeeksStr('2026-10-26', 1)).toBe('2026-11-02');
    // DST starts Sunday 2027-03-14; the day has 23 hours.
    expect(mondayOf('2027-03-14')).toBe('2027-03-08');
    expect(addDaysStr('2027-03-13', 2)).toBe('2027-03-15');
    expect(atHour('2026-11-01', 4).getHours()).toBe(4);
    expect(dateOfIso(new Date(2026, 10, 1, 23, 30).toISOString())).toBe('2026-11-01');
  });

  it('uses Monday as weekday 0', () => {
    expect(weekdayIndex('2026-10-19')).toBe(0);
    expect(weekdayIndex('2026-10-25')).toBe(6);
  });

  it('validates date strings', () => {
    expect(isDateStr('2026-10-19')).toBe(true);
    expect(isDateStr('2026-02-30')).toBe(false);
    expect(isDateStr('2026-1-5')).toBe(false);
    expect(isDateStr(20261019)).toBe(false);
    expect(toDateStr(parseDate('2026-03-08'))).toBe('2026-03-08');
  });

  it('formats labels', () => {
    expect(formatWeekRange('2026-10-19')).toBe('Oct 19 – 25');
    expect(formatWeekRange('2026-09-28')).toBe('Sep 28 – Oct 4');
    expect(weekLabel('2026-10-21', '2026-10-19')).toBe('This week');
    expect(weekLabel('2026-10-26', '2026-10-19')).toBe('Next week');
    expect(weekLabel('2026-10-12', '2026-10-19')).toBe('Last week');
    expect(weekLabel('2026-11-09', '2026-10-19')).toBe('Week of Nov 9');
    expect(relativeDayLabel('2026-10-20', '2026-10-19')).toBe('Tomorrow');
    expect(relativeDayLabel('2026-10-22', '2026-10-19')).toBe('Thu, Oct 22');
  });
});
