import {
  addDays,
  addWeeks,
  differenceInCalendarDays,
  format,
  isValid,
  startOfWeek,
} from 'date-fns';

/** Local calendar date as "YYYY-MM-DD". All day logic in Posedge uses local time. */
export type DateStr = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const WEEKDAY_LONG = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;
export const WEEKDAY_TOKENS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** Parses "YYYY-MM-DD" as local midnight. Throws on malformed input. */
export function parseDate(s: DateStr): Date {
  const m = DATE_RE.exec(s);
  if (!m) throw new Error(`Invalid date string: ${s}`);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function toDateStr(d: Date): DateStr {
  return format(d, 'yyyy-MM-dd');
}

/** True for a real calendar date in "YYYY-MM-DD" form (rejects 2026-02-30). */
export function isDateStr(s: unknown): s is DateStr {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = parseDate(s);
  return isValid(d) && toDateStr(d) === s;
}

export function todayStr(now: Date = new Date()): DateStr {
  return toDateStr(now);
}

/** Monday of the week containing the given date. */
export function mondayOf(input: DateStr | Date): DateStr {
  const d = typeof input === 'string' ? parseDate(input) : input;
  return toDateStr(startOfWeek(d, { weekStartsOn: 1 }));
}

export function addDaysStr(s: DateStr, n: number): DateStr {
  return toDateStr(addDays(parseDate(s), n));
}

export function addWeeksStr(s: DateStr, n: number): DateStr {
  return toDateStr(addWeeks(parseDate(s), n));
}

/** The 7 dates (Mon..Sun) of the week starting at `weekStart` (normalized to Monday). */
export function weekDays(weekStart: DateStr): DateStr[] {
  const monday = mondayOf(weekStart);
  return Array.from({ length: 7 }, (_, i) => addDaysStr(monday, i));
}

/** 0 = Monday .. 6 = Sunday. */
export function weekdayIndex(s: DateStr | Date): number {
  const d = typeof s === 'string' ? parseDate(s) : s;
  return (d.getDay() + 6) % 7;
}

export function dayInWeek(weekStart: DateStr, index: number): DateStr {
  return addDaysStr(mondayOf(weekStart), index);
}

/** Calendar-day difference a - b (DST-safe). */
export function diffDays(a: DateStr, b: DateStr): number {
  return differenceInCalendarDays(parseDate(a), parseDate(b));
}

export function minDate(a: DateStr, b: DateStr): DateStr {
  return a <= b ? a : b;
}

export function maxDate(a: DateStr, b: DateStr): DateStr {
  return a >= b ? a : b;
}

/** Local Date for the given day at `hour`:00. */
export function atHour(s: DateStr, hour: number): Date {
  const d = parseDate(s);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/** Last millisecond of the local day. */
export function endOfDay(s: DateStr): Date {
  const d = parseDate(s);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Local date of an ISO timestamp. */
export function dateOfIso(iso: string): DateStr {
  return toDateStr(new Date(iso));
}

export function formatDate(s: DateStr, pattern: string): string {
  return format(parseDate(s), pattern);
}

/** "Oct 19 – 25" or "Sep 28 – Oct 4". */
export function formatWeekRange(weekStart: DateStr): string {
  const start = parseDate(mondayOf(weekStart));
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  return `${format(start, 'MMM d')} – ${format(end, sameMonth ? 'd' : 'MMM d')}`;
}

/** "This week", "Next week", "Last week" or "Week of Oct 19". */
export function weekLabel(weekStart: DateStr, currentWeekStart: DateStr): string {
  const delta = Math.round(diffDays(mondayOf(weekStart), mondayOf(currentWeekStart)) / 7);
  if (delta === 0) return 'This week';
  if (delta === 1) return 'Next week';
  if (delta === -1) return 'Last week';
  return `Week of ${formatDate(mondayOf(weekStart), 'MMM d')}`;
}

/** "Today", "Tomorrow", "Yesterday" or "Wed, Oct 21". */
export function relativeDayLabel(day: DateStr, today: DateStr): string {
  const d = diffDays(day, today);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  return formatDate(day, 'EEE, MMM d');
}

/** Months between two dates rounded to whole months (for "starting this month" style schedules). */
export function firstOfMonth(s: DateStr, offsetMonths = 0): DateStr {
  const d = parseDate(s);
  return toDateStr(new Date(d.getFullYear(), d.getMonth() + offsetMonths, 1));
}
