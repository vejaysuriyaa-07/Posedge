import { describe, expect, it } from 'vitest';
import {
  capText,
  countPackTasks,
  newPackNames,
  packDate,
  parseRepo,
  pruneSeen,
  splitInboxPack,
} from './inbox';

describe('inbox packs', () => {
  it('reads dates from pack names and ignores other files', () => {
    expect(packDate('2026-10-18.md')).toBe('2026-10-18');
    expect(packDate('2026-10-18-evening.md')).toBe('2026-10-18');
    expect(packDate('README.md')).toBeUndefined();
    expect(packDate('2026-10-18.txt')).toBeUndefined();
    expect(packDate('notes-2026-10-18.md')).toBeUndefined();
  });

  it('finds new, recent packs, oldest first', () => {
    const listing = [
      'README.md',
      '2026-10-18.md',
      '2026-10-16.md',
      '2026-10-17.md',
      '2026-09-01.md',
    ];
    expect(newPackNames(listing, ['2026-10-17.md'], '2026-10-18')).toEqual([
      '2026-10-16.md',
      '2026-10-18.md',
    ]);
  });

  it('prunes old and duplicate seen names', () => {
    expect(pruneSeen(['2026-08-01.md', '2026-10-17.md', '2026-10-17.md'], '2026-10-18')).toEqual([
      '2026-10-17.md',
    ]);
  });

  it('splits the summary from the plan', () => {
    const text = [
      '<!-- written by the daily inbox check -->',
      '> Two things from email today.',
      '> EE 658 exam is Friday.',
      '',
      '# Project: EE 658',
      '- [ ] Grade Exam 2 ~2h due:2026-10-27',
      '  Source: email from the course staff',
      '- Register for the talk',
    ].join('\n');
    const { summary, plan } = splitInboxPack(text);
    expect(summary).toBe('Two things from email today.\nEE 658 exam is Friday.');
    expect(plan.startsWith('# Project: EE 658')).toBe(true);
    expect(countPackTasks(text)).toBe(2);
  });

  it('handles packs with no plan or no summary', () => {
    expect(splitInboxPack('Nothing new today.')).toEqual({
      summary: 'Nothing new today.',
      plan: '',
    });
    expect(splitInboxPack('# Project: X\n- a').summary).toBe('');
    expect(countPackTasks('Nothing new today.')).toBe(0);
  });

  it('caps text at a line break', () => {
    expect(capText('short', 10)).toBe('short');
    const long = `${'a'.repeat(30)}\n${'b'.repeat(30)}`;
    expect(capText(long, 40)).toBe(`${'a'.repeat(30)}\n…`);
    expect(capText('x'.repeat(50), 20)).toBe(`${'x'.repeat(20)}\n…`);
  });

  it('normalizes repository names and URLs', () => {
    expect(parseRepo(' vejaysuriyaa-07/posedge-brain ')).toBe('vejaysuriyaa-07/posedge-brain');
    expect(parseRepo('https://github.com/vejaysuriyaa-07/posedge-brain.git')).toBe(
      'vejaysuriyaa-07/posedge-brain',
    );
    expect(parseRepo('posedge-brain')).toBeUndefined();
    expect(parseRepo('a/b/c')).toBeUndefined();
  });
});
