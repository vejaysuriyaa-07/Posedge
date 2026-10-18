import { describe, expect, it } from 'vitest';
import { nextWorkDay, shutdownDate } from './shutdown';

describe('shutdown helpers', () => {
  it('finds the next day that is not a rest day', () => {
    // 2026-10-17 is a Saturday; Sunday (6) is a rest day.
    expect(nextWorkDay('2026-10-17', [])).toBe('2026-10-18');
    expect(nextWorkDay('2026-10-17', [6])).toBe('2026-10-19');
    expect(nextWorkDay('2026-10-16', [5, 6])).toBe('2026-10-19');
    expect(nextWorkDay('2026-10-17', [0, 1, 2, 3, 4, 5, 6])).toBe('2026-10-18');
  });

  it('closes the previous day when shutting down after midnight', () => {
    expect(shutdownDate(new Date(2026, 9, 17, 22, 0))).toBe('2026-10-17');
    expect(shutdownDate(new Date(2026, 9, 18, 1, 30))).toBe('2026-10-17');
    expect(shutdownDate(new Date(2026, 9, 18, 4, 0))).toBe('2026-10-18');
  });
});
