import { describe, expect, it } from 'vitest';
import {
  formatMinutes,
  parseQuickAdd,
  readTaskToken,
  type QuickAddContext,
} from './quickAddParser';

const ctx: QuickAddContext = {
  today: '2026-10-17', // Saturday
  weekStart: '2026-10-12',
  projects: [
    { id: 'p-dv', name: 'DV Interview Prep' },
    { id: 'p-isp', name: 'Camera ISP + Tiny Tapeout' },
    { id: 'p-577', name: 'EE 577A VLSI System Design' },
    { id: 'p-old', name: 'Old Archived Thing', archived: true },
  ],
  lastProjectId: 'p-dv',
};

describe('formatMinutes', () => {
  it('formats minutes and hours', () => {
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(90)).toBe('1.5h');
    expect(formatMinutes(120)).toBe('2h');
    expect(formatMinutes(75)).toBe('1.25h');
    expect(formatMinutes(100)).toBe('1h 40m');
  });
});

describe('readTaskToken', () => {
  const t = { today: '2026-10-17', weekStart: '2026-10-19' };
  it('reads estimates', () => {
    expect(readTaskToken('~90m', t)).toEqual({ type: 'estimate', minutes: 90 });
    expect(readTaskToken('~2h', t)).toEqual({ type: 'estimate', minutes: 120 });
    expect(readTaskToken('~1.5h', t)).toEqual({ type: 'estimate', minutes: 90 });
    expect(readTaskToken('~1h30m', t)).toEqual({ type: 'estimate', minutes: 90 });
    expect(readTaskToken('~1.5H', t)).toEqual({ type: 'estimate', minutes: 90 });
  });
  it('returns null for ordinary or malformed words', () => {
    expect(readTaskToken('hello', t)).toBeNull();
    expect(readTaskToken('~xyz', t)).toBeNull();
    expect(readTaskToken('!7', t)).toBeNull();
    expect(readTaskToken('@funday', t)).toBeNull();
    expect(readTaskToken('+', t)).toBeNull();
  });
  it('flags bad due dates as invalid', () => {
    expect(readTaskToken('due:2026-02-30', t)).toMatchObject({ type: 'invalid' });
  });
});

describe('parseQuickAdd', () => {
  it('parses a plain title with the last-used project', () => {
    const r = parseQuickAdd('Read the UVM cookbook', ctx);
    expect(r).toMatchObject({
      title: 'Read the UVM cookbook',
      isLearn: false,
      isBig3: false,
      projectId: 'p-dv',
      projectMatched: false,
      tokens: [],
      errors: [],
    });
    expect(r.estimateMin).toBeUndefined();
    expect(r.priority).toBeUndefined();
  });

  it('parses every token type', () => {
    const r = parseQuickAdd(
      'SVA drills ~45m !1 #learn #big3 @tue due:2026-10-30 +dv-interview',
      ctx,
    );
    expect(r.title).toBe('SVA drills');
    expect(r.estimateMin).toBe(45);
    expect(r.priority).toBe(1);
    expect(r.isLearn).toBe(true);
    expect(r.isBig3).toBe(true);
    expect(r.day).toBe('2026-10-13');
    expect(r.dueDate).toBe('2026-10-30');
    expect(r.projectId).toBe('p-dv');
    expect(r.projectMatched).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.tokens.map((x) => [x.type, x.label])).toEqual([
      ['estimate', '~45m'],
      ['priority', 'P1'],
      ['learn', 'Learn'],
      ['big3', 'Big 3'],
      ['day', 'Tue Oct 13'],
      ['due', 'Due Oct 30'],
      ['project', 'DV Interview Prep'],
    ]);
  });

  it('labels hour estimates', () => {
    expect(parseQuickAdd('x ~90m', ctx).tokens[0]?.label).toBe('~1.5h');
    expect(parseQuickAdd('x ~2h', ctx).estimateMin).toBe(120);
    expect(parseQuickAdd('x ~1.5h', ctx).estimateMin).toBe(90);
  });

  it('resolves @mon..@sun inside the viewed week, not today’s week', () => {
    const viewing = { ...ctx, weekStart: '2026-10-26' };
    expect(parseQuickAdd('a @mon', viewing).day).toBe('2026-10-26');
    expect(parseQuickAdd('a @sun', viewing).day).toBe('2026-11-01');
    expect(parseQuickAdd('a @wed', ctx).day).toBe('2026-10-14');
  });

  it('resolves @today and @tomorrow from today', () => {
    const viewing = { ...ctx, weekStart: '2026-10-26' };
    expect(parseQuickAdd('a @today', viewing).day).toBe('2026-10-17');
    expect(parseQuickAdd('a @tomorrow', viewing).day).toBe('2026-10-18');
  });

  it('fuzzy-matches projects and skips archived ones', () => {
    expect(parseQuickAdd('a +ee577', ctx).projectId).toBe('p-577');
    expect(parseQuickAdd('a +camera_isp', ctx).projectId).toBe('p-isp');
    const archived = parseQuickAdd('a +old-archived-thing', ctx);
    expect(archived.projectMatched).toBe(false);
    expect(archived.projectId).toBe('p-dv');
  });

  it('reports an unmatched project and falls back to the last project', () => {
    const r = parseQuickAdd('Buy groceries +zzqx', ctx);
    expect(r.projectMatched).toBe(false);
    expect(r.projectQuery).toBe('zzqx');
    expect(r.projectId).toBe('p-dv');
    expect(r.errors).toEqual(['No project matches "zzqx"']);
    expect(r.title).toBe('Buy groceries');
  });

  it('leaves projectId undefined when there is no last project', () => {
    const r = parseQuickAdd('Something', { ...ctx, lastProjectId: undefined });
    expect(r.projectId).toBeUndefined();
  });

  it('handles odd spacing, tabs and tokens at the start', () => {
    const r = parseQuickAdd('  !2\t~30m   Write   testbench \t #learn  ', ctx);
    expect(r.title).toBe('Write testbench');
    expect(r.priority).toBe(2);
    expect(r.estimateMin).toBe(30);
    expect(r.isLearn).toBe(true);
  });

  it('keeps malformed tokens in the title', () => {
    const r = parseQuickAdd('Fix ~xyz !7 @funday bug', ctx);
    expect(r.title).toBe('Fix ~xyz !7 @funday bug');
    expect(r.errors).toEqual([]);
    expect(r.tokens).toEqual([]);
  });

  it('errors on a bad due date and drops the word from the title', () => {
    const r = parseQuickAdd('Submit lab due:2026-13-01', ctx);
    expect(r.title).toBe('Submit lab');
    expect(r.dueDate).toBeUndefined();
    expect(r.errors[0]).toContain('Invalid due date');
  });

  it('asks for a title when only tokens are given', () => {
    const r = parseQuickAdd('~30m #learn', ctx);
    expect(r.title).toBe('');
    expect(r.errors).toContain('Add a title');
  });

  it('is case-insensitive for tokens', () => {
    const r = parseQuickAdd('A #LEARN #Big3 @TUE DUE:2026-10-30', ctx);
    expect(r.isLearn).toBe(true);
    expect(r.isBig3).toBe(true);
    expect(r.day).toBe('2026-10-13');
    expect(r.dueDate).toBe('2026-10-30');
  });
});
