import { describe, expect, it } from 'vitest';
import {
  parseJsonPlan,
  parseMarkdownPlan,
  parsePlan,
  PLAN_EXAMPLE,
  PLAN_PROMPT,
  type PlanContext,
} from './planParser';

const empty: PlanContext = { today: '2026-10-17', projects: [] };

const existing: PlanContext = {
  today: '2026-10-17',
  projects: [
    { id: 'p-isp', name: 'Camera ISP + Tiny Tapeout', color: 'teal', kind: 'passion' },
    { id: 'p-dv', name: 'DV Interview Prep', color: 'violet', kind: 'prep' },
    { id: 'p-arch', name: 'Camera ISP archive', color: 'sky', kind: 'passion', archived: true },
  ],
};

describe('PLAN_PROMPT', () => {
  it('describes the format', () => {
    expect(PLAN_PROMPT).toContain("'# Project: <name> | color: <violet|sky|emerald");
    expect(PLAN_PROMPT.endsWith('Output only the Markdown in one code block, no commentary.')).toBe(
      true,
    );
  });
});

describe('parseMarkdownPlan: section 10 example', () => {
  it('produces the exact expected structure', () => {
    const plan = parsePlan(PLAN_EXAMPLE, empty);
    expect(plan).toEqual({
      format: 'markdown',
      warnings: [],
      projects: [
        {
          line: 1,
          name: 'Camera ISP',
          color: 'teal',
          kind: 'passion',
          match: undefined,
          milestones: [{ line: 2, title: 'Golden model complete', weekStart: '2026-10-26' }],
          tasks: [
            {
              line: 4,
              title: 'Implement bilinear demosaic in Python',
              done: false,
              estimateMin: 120,
              priority: 1,
              kind: 'learn',
              isBig3: false,
              weekStart: '2026-10-19',
              day: '2026-10-19',
            },
            {
              line: 5,
              title: 'Write AWB gray-world model',
              done: false,
              estimateMin: 90,
              priority: 2,
              kind: 'task',
              isBig3: false,
              weekStart: '2026-10-19',
              day: '2026-10-21',
            },
            {
              line: 6,
              title: 'Read Tiny Tapeout submission guide',
              notes: 'Focus on pin limits and clock constraints.',
              done: false,
              estimateMin: 45,
              priority: 2,
              kind: 'learn',
              isBig3: false,
              weekStart: '2026-10-19',
            },
            {
              line: 9,
              title: 'Compare golden model vs reference images',
              done: false,
              estimateMin: 120,
              priority: 2,
              kind: 'task',
              isBig3: true,
              weekStart: '2026-10-26',
            },
          ],
        },
        {
          line: 11,
          name: 'DV Interview Prep',
          color: 'violet',
          kind: 'prep',
          match: undefined,
          milestones: [],
          tasks: [
            {
              line: 13,
              title: 'SVA: implication operators and sequences',
              done: false,
              estimateMin: 60,
              priority: 2,
              kind: 'learn',
              isBig3: false,
              weekStart: '2026-10-19',
              day: '2026-10-20',
            },
            {
              line: 14,
              title: 'UVM phases deep dive',
              done: false,
              estimateMin: 90,
              priority: 2,
              kind: 'learn',
              isBig3: true,
              weekStart: '2026-10-19',
              day: '2026-10-22',
            },
          ],
        },
      ],
    });
  });

  it('fuzzy-matches existing projects, ignoring archived ones', () => {
    const plan = parsePlan(PLAN_EXAMPLE, existing);
    const [isp, dv] = plan.projects;
    expect(isp?.match?.id).toBe('p-isp');
    expect(isp?.match?.score).toBeGreaterThanOrEqual(0.85);
    expect(dv?.match).toEqual({ id: 'p-dv', name: 'DV Interview Prep', score: 1 });
  });

  it('accepts the example wrapped in a code fence with the same line numbers', () => {
    const fenced = 'Here you go:\n```markdown\n' + PLAN_EXAMPLE + '\n```\nHope that helps!';
    const plan = parsePlan(fenced, empty);
    expect(plan.warnings).toEqual([]);
    expect(plan.projects[0]?.line).toBe(3);
    expect(plan.projects[0]?.tasks[0]?.line).toBe(6);
    expect(plan.projects[1]?.tasks[1]?.line).toBe(16);
  });
});

describe('parseMarkdownPlan: grammar details', () => {
  it('resolves relative weeks', () => {
    const md = [
      '# Project: A',
      '## Week +1',
      '- one',
      '## Week +2',
      '- two',
      '## Week -1',
      '- three',
      '# Project: B',
      '## Week -1',
      '- four',
    ].join('\n');
    const plan = parseMarkdownPlan(md, empty);
    expect(plan.warnings).toEqual([]);
    const [a, b] = plan.projects;
    // Current calendar week of 2026-10-17 is 2026-10-12.
    expect(a?.tasks.map((t) => t.weekStart)).toEqual(['2026-10-19', '2026-11-02', '2026-10-26']);
    expect(b?.tasks[0]?.weekStart).toBe('2026-10-05');
  });

  it('normalizes week dates to Monday and parses "Week of"', () => {
    const md = [
      '# Plain project name',
      '## Week 2026-10-22',
      '- a',
      '## Week of Oct 27',
      '- b',
      '## Week of January 4, 2027',
      '- c',
      '## Week of Jan 4',
      '- d',
    ].join('\n');
    const plan = parseMarkdownPlan(md, empty);
    expect(plan.warnings).toEqual([]);
    expect(plan.projects[0]?.name).toBe('Plain project name');
    expect(plan.projects[0]?.tasks.map((t) => t.weekStart)).toEqual([
      '2026-10-19',
      '2026-10-26',
      '2027-01-04',
      '2027-01-04',
    ]);
  });

  it('warns about unparseable weeks and keeps the previous week', () => {
    const md = ['# P', '## Week 2026-10-19', '## Week of Smarch 40', '- a'].join('\n');
    const plan = parseMarkdownPlan(md, empty);
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0]?.line).toBe(3);
    expect(plan.projects[0]?.tasks[0]?.weekStart).toBe('2026-10-19');
  });

  it('handles bullet styles, done tasks and no-week tasks', () => {
    const md = [
      '# P',
      '- [x] Finished thing ~30m',
      '- [X] Also finished',
      '* Star bullet !3',
      '- Dash bullet due:2026-11-01',
      ' - [ ] One-space indented bullet',
    ].join('\n');
    const plan = parseMarkdownPlan(md, empty);
    expect(plan.warnings).toEqual([]);
    const tasks = plan.projects[0]?.tasks ?? [];
    expect(tasks.map((t) => [t.title, t.done])).toEqual([
      ['Finished thing', true],
      ['Also finished', true],
      ['Star bullet', false],
      ['Dash bullet', false],
      ['One-space indented bullet', false],
    ]);
    expect(tasks[0]?.estimateMin).toBe(30);
    expect(tasks[2]?.priority).toBe(3);
    expect(tasks[3]?.dueDate).toBe('2026-11-01');
    expect(tasks.every((t) => t.weekStart === undefined)).toBe(true);
  });

  it('uses the current week for @day tokens without a week header', () => {
    const plan = parseMarkdownPlan('# P\n- a @fri', empty);
    expect(plan.projects[0]?.tasks[0]).toMatchObject({
      day: '2026-10-16',
      weekStart: '2026-10-12',
    });
  });

  it('only reads tokens at the end of the line', () => {
    const plan = parseMarkdownPlan('# P\n- Learn #learn tricks ~1h', empty);
    expect(plan.projects[0]?.tasks[0]).toMatchObject({
      title: 'Learn #learn tricks',
      kind: 'task',
      estimateMin: 60,
    });
  });

  it('collects notes from indented and directly-following plain lines', () => {
    const md = [
      '# P',
      '- [ ] Task one',
      '  first note',
      'second note',
      '',
      '\tindented after blank',
      '- [ ] Task two',
      '    - nested bullet',
    ].join('\n');
    const plan = parseMarkdownPlan(md, empty);
    expect(plan.warnings).toEqual([]);
    expect(plan.projects[0]?.tasks.map((t) => t.notes)).toEqual([
      'first note\nsecond note\nindented after blank',
      '- nested bullet',
    ]);
  });

  it('warns about unknown lines with their line numbers', () => {
    const md = [
      'Some intro text', // 1
      '- orphan task', // 2
      '## Milestone: Orphan | week: 2026-10-19', // 3
      '# Project: P | color: purple | kind: hobby | owner: me', // 4
      '## Notes', // 5
      '- [ ] fine', // 6
      '', // 7
      'stray paragraph', // 8
      '### Deep heading', // 9
      '## Milestone: No week', // 10
      '- [ ] tokens only ~1h', // 11 -> title "tokens only"
      '- [ ] +proj ~1h', // 12 -> no title
      '- [ ] bad due due:2026-02-31', // 13
    ].join('\n');
    const plan = parseMarkdownPlan(md, empty);
    expect(plan.warnings.map((w) => w.line)).toEqual([1, 2, 3, 4, 4, 4, 5, 8, 9, 10, 12, 12, 13]);
    expect(plan.warnings[0]?.message).toMatch(/Expected/);
    expect(plan.projects[0]?.color).toBeUndefined();
    expect(plan.projects[0]?.kind).toBeUndefined();
    expect(plan.projects[0]?.tasks.map((t) => t.title)).toEqual(['fine', 'tokens only', 'bad due']);
  });

  it('reports line numbers from the original text inside a fence', () => {
    const md = ['```', '# P', 'nonsense here', '- [ ] ok', '```'].join('\n');
    const plan = parsePlan(md, empty);
    expect(plan.warnings).toEqual([{ line: 3, message: expect.stringMatching(/Unrecognized/) }]);
    expect(plan.projects[0]?.tasks[0]?.line).toBe(4);
  });

  it('merges repeated project headings', () => {
    const md = ['# Project: Alpha', '- a', '# Project: alpha | color: rose', '- b'].join('\n');
    const plan = parseMarkdownPlan(md, empty);
    expect(plan.projects).toHaveLength(1);
    expect(plan.projects[0]?.color).toBe('rose');
    expect(plan.projects[0]?.tasks.map((t) => t.title)).toEqual(['a', 'b']);
  });

  it('resets the week for each new project', () => {
    const md = ['# A', '## Week 2026-10-19', '- a', '# B', '- b'].join('\n');
    const plan = parseMarkdownPlan(md, empty);
    expect(plan.projects[1]?.tasks[0]?.weekStart).toBeUndefined();
  });
});

describe('parseJsonPlan', () => {
  it('parses the JSON format', () => {
    const json = JSON.stringify({
      version: 1,
      projects: [
        {
          name: 'DV Interview Prep',
          color: 'violet',
          kind: 'prep',
          milestones: [{ title: 'SVA done', week: '2026-10-28' }],
          tasks: [
            {
              title: 'UVM phases',
              week: '2026-10-19',
              day: 'thu',
              estimateMin: 90,
              priority: 1,
              kind: 'learn',
              big3: true,
              notes: 'build_phase first',
            },
            { title: 'Next week thing', week: '+1', day: '', notes: '', estimateMin: 0 },
            { title: 'Dated', day: '2026-11-03', done: true, due: '2026-11-05' },
          ],
        },
      ],
    });
    const plan = parsePlan(json, existing);
    expect(plan.format).toBe('json');
    expect(plan.warnings).toEqual([]);
    const p = plan.projects[0];
    expect(p?.match?.id).toBe('p-dv');
    expect(p?.milestones).toEqual([{ line: 0, title: 'SVA done', weekStart: '2026-10-26' }]);
    expect(p?.tasks).toEqual([
      {
        line: 0,
        title: 'UVM phases',
        notes: 'build_phase first',
        done: false,
        estimateMin: 90,
        priority: 1,
        kind: 'learn',
        isBig3: true,
        weekStart: '2026-10-19',
        day: '2026-10-22',
      },
      {
        line: 0,
        title: 'Next week thing',
        done: false,
        priority: 2,
        kind: 'task',
        isBig3: false,
        weekStart: '2026-10-19',
      },
      {
        line: 0,
        title: 'Dated',
        done: true,
        priority: 2,
        kind: 'task',
        isBig3: false,
        weekStart: '2026-11-02',
        day: '2026-11-03',
        dueDate: '2026-11-05',
      },
    ]);
  });

  it('accepts JSON inside a code fence', () => {
    const plan = parsePlan('```json\n{"version":1,"projects":[{"name":"X"}]}\n```', empty);
    expect(plan.format).toBe('json');
    expect(plan.projects[0]?.name).toBe('X');
  });

  it('reports zod errors with paths', () => {
    const plan = parseJsonPlan(
      JSON.stringify({
        version: 1,
        projects: [{ name: 'X', color: 'purple', tasks: [{ title: '', week: 'soon' }] }],
      }),
      empty,
    );
    expect(plan.projects).toEqual([]);
    const messages = plan.warnings.map((w) => w.message);
    expect(messages.some((m) => m.startsWith('projects.0.color:'))).toBe(true);
    expect(messages.some((m) => m.startsWith('projects.0.tasks.0.title:'))).toBe(true);
    expect(messages.some((m) => m.startsWith('projects.0.tasks.0.week:'))).toBe(true);
  });

  it('reports a wrong version', () => {
    const plan = parseJsonPlan('{"version":2,"projects":[]}', empty);
    expect(plan.warnings[0]?.message).toMatch(/^version:/);
  });

  it('reports invalid JSON', () => {
    const plan = parsePlan('{ "version": 1, ', empty);
    expect(plan.format).toBe('json');
    expect(plan.projects).toEqual([]);
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0]?.line).toBe(1);
    expect(plan.warnings[0]?.message).toMatch(/^Invalid JSON/);
  });
});
