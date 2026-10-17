import { describe, expect, it } from 'vitest';
import type { Milestone, Project, Task } from '../db/types';
import {
  buildBrainGraph,
  buildStars,
  countdownLabel,
  edgeGreeting,
  MAX_STARS,
  pickSatellites,
  speakable,
  takeSentences,
  upcomingSignals,
} from './brain';

const TODAY = '2026-10-17'; // Saturday; week starts 2026-10-12

function project(id: string, order: number, p: Partial<Project> = {}): Project {
  return {
    id,
    name: `Project ${id}`,
    emoji: '🎯',
    color: 'violet',
    kind: 'prep',
    columns: [{ id: 'todo', name: 'To do' }],
    archived: false,
    order,
    createdAt: '2026-10-01T00:00:00.000Z',
    ...p,
  };
}

let n = 0;
function task(p: Partial<Task>): Task {
  n++;
  return {
    id: `t${n}`,
    projectId: 'a',
    title: `Task ${n}`,
    kind: 'task',
    status: 'todo',
    columnId: 'todo',
    priority: 2,
    isBig3: false,
    order: n,
    createdAt: '2026-10-01T00:00:00.000Z',
    source: 'manual',
    ...p,
  };
}

function milestone(p: Partial<Milestone>): Milestone {
  n++;
  return {
    id: `m${n}`,
    projectId: 'a',
    title: `Milestone ${n}`,
    weekStart: '2026-10-26',
    done: false,
    order: n,
    ...p,
  };
}

describe('brain graph', () => {
  it('places active projects evenly on the ring starting at the top', () => {
    const g = buildBrainGraph({
      today: TODAY,
      projects: [
        project('a', 1),
        project('b', 2),
        project('c', 3, { archived: true }),
        project('d', 3),
      ],
      tasks: [],
      milestones: [],
      cardsByProject: {},
      dueCardsByProject: {},
    });
    expect(g.projects.map((p) => p.id)).toEqual(['a', 'b', 'd']);
    expect(g.projects[0]!.angle).toBeCloseTo(-Math.PI / 2);
    expect(g.projects[1]!.angle - g.projects[0]!.angle).toBeCloseTo((Math.PI * 2) / 3);
    expect(g.activity).toBe(0);
  });

  it("measures energy from the last 7 days' completions and counts this week's plan", () => {
    const recent = new Date(2026, 9, 15, 12).toISOString();
    const old = new Date(2026, 9, 1, 12).toISOString();
    const g = buildBrainGraph({
      today: TODAY,
      projects: [project('a', 1), project('b', 2)],
      tasks: [
        task({ projectId: 'a', status: 'done', completedAt: recent, weekStart: '2026-10-12' }),
        task({ projectId: 'a', status: 'done', completedAt: recent, weekStart: '2026-10-12' }),
        task({ projectId: 'a', weekStart: '2026-10-12' }),
        task({ projectId: 'b', status: 'done', completedAt: recent }),
        task({ projectId: 'b', status: 'done', completedAt: old }),
      ],
      milestones: [],
      cardsByProject: { a: 3 },
      dueCardsByProject: { a: 1 },
    });
    const [a, b] = g.projects;
    expect(a).toMatchObject({
      energy: 1,
      doneLast7: 2,
      weekTotal: 3,
      weekDone: 2,
      openTotal: 1,
      cards: 3,
      dueCards: 1,
    });
    expect(b).toMatchObject({ energy: 0.5, doneLast7: 1, weekTotal: 0 });
    expect(g.activity).toBeCloseTo(3 / 20);
  });

  it('orbits doing, Big 3 and high-priority tasks first, plus the next two milestones', () => {
    const week = '2026-10-12';
    const tasks = [
      task({ weekStart: week, title: 'plain', priority: 3 }),
      task({ weekStart: week, title: 'big3', isBig3: true }),
      task({ title: 'doing elsewhere', status: 'doing' }),
      task({ weekStart: week, title: 'done', status: 'done' }),
      task({ weekStart: '2026-10-19', title: 'next week' }),
      task({ weekStart: week, title: 'urgent', priority: 1 }),
    ];
    expect(pickSatellites(tasks, week).map((t) => t.title)).toEqual([
      'doing elsewhere',
      'big3',
      'urgent',
      'plain',
      'done',
    ]);

    const g = buildBrainGraph({
      today: TODAY,
      projects: [project('a', 1)],
      tasks,
      milestones: [
        milestone({ title: 'third', weekStart: '2026-11-16' }),
        milestone({ title: 'first', weekStart: '2026-10-19' }),
        milestone({ title: 'second', weekStart: '2026-11-02' }),
        milestone({ title: 'finished', weekStart: '2026-10-12', done: true }),
      ],
      cardsByProject: {},
      dueCardsByProject: {},
    });
    const sats = g.projects[0]!.satellites;
    expect(sats.filter((s) => s.kind === 'milestone').map((s) => s.title)).toEqual([
      'first',
      'second',
    ]);
    expect(sats.filter((s) => s.kind === 'milestone').every((s) => s.orbit === 1)).toBe(true);
    expect(g.projects[0]!.nextMilestone).toMatchObject({ title: 'first', daysUntil: 8 });
  });

  it('caps satellites and splits them into two orbits', () => {
    const tasks = Array.from({ length: 20 }, () => task({ weekStart: '2026-10-12' }));
    const g = buildBrainGraph({
      today: TODAY,
      projects: [project('a', 1)],
      tasks,
      milestones: [],
      cardsByProject: {},
      dueCardsByProject: {},
    });
    const sats = g.projects[0]!.satellites;
    expect(sats).toHaveLength(12);
    expect(sats.filter((s) => s.orbit === 0)).toHaveLength(8);
  });

  it('makes one stable star per card, scaled down past the cap, with due cards marked', () => {
    const small = buildStars([{ id: 'a', angle: 0, cards: 10, dueCards: 3 }]);
    expect(small).toHaveLength(10);
    expect(small.filter((s) => s.due)).toHaveLength(3);
    expect(buildStars([{ id: 'a', angle: 0, cards: 10, dueCards: 3 }])).toEqual(small);
    for (const s of small) expect(Math.hypot(s.x, s.y)).toBeLessThanOrEqual(1.0001);

    const big = buildStars([
      { id: 'a', angle: 0, cards: 600, dueCards: 0 },
      { id: 'b', angle: 1, cards: 600, dueCards: 1 },
    ]);
    expect(big.length).toBeLessThanOrEqual(MAX_STARS + 1);
    expect(big.filter((s) => s.due)).toHaveLength(1);
  });
});

describe('signals', () => {
  it('lists due tasks and milestones in date order, including carried-over ones', () => {
    const signals = upcomingSignals(
      [
        task({ title: 'due Tue', dueDate: '2026-10-20' }),
        task({ title: 'late', dueDate: '2026-10-15' }),
        task({ title: 'done', dueDate: '2026-10-18', status: 'done' }),
        task({ title: 'far', dueDate: '2027-01-10' }),
        task({ title: 'no date' }),
      ],
      [
        milestone({ title: 'SVA basics', weekStart: '2026-10-19' }),
        milestone({ title: 'done m', done: true }),
      ],
      TODAY,
    );
    expect(signals.map((s) => [s.title, s.daysUntil, s.late])).toEqual([
      ['late', -2, true],
      ['due Tue', 3, false],
      ['SVA basics', 8, false],
    ]);
  });

  it('formats countdowns calmly', () => {
    expect(countdownLabel(-1)).toBe('Carried over');
    expect(countdownLabel(0)).toBe('Today');
    expect(countdownLabel(3)).toBe('T-3d');
    expect(countdownLabel(21)).toBe('T-3w');
  });

  it('greets locally from the day so far', () => {
    expect(
      edgeGreeting({
        hour: 19,
        name: 'VJ',
        plannedOpen: 2,
        reviewsDue: 1,
        streak: 5,
        nextSignal: { title: 'HW 3', daysUntil: 1 },
      }),
    ).toBe(
      'Good evening, VJ. All systems nominal. You have 2 tasks on deck today and 1 review due. Next up: HW 3, tomorrow. Streak holding at 5 days.',
    );
    expect(edgeGreeting({ hour: 8, name: 'VJ', plannedOpen: 0, reviewsDue: 0, streak: 0 })).toBe(
      'Good morning, VJ. All systems nominal. Your slate is clear for today.',
    );
  });
});

describe('speech chunking', () => {
  it('speaks whole sentences as they stream in and keeps the tail', () => {
    expect(takeSentences('Good evening, VJ. Three reviews are du')).toEqual({
      sentences: ['Good evening, VJ.'],
      rest: ' Three reviews are du',
    });
    expect(takeSentences('Done! Next: **HW 3** is due Tue.\n- Item one\nTail', true)).toEqual({
      sentences: ['Done!', 'Next: HW 3 is due Tue.', 'Item one', 'Tail'],
      rest: '',
    });
    // A decimal point is not a sentence end.
    expect(takeSentences('Load is 1.5 hours').sentences).toEqual([]);
  });

  it('strips markdown for speech', () => {
    expect(speakable('## Plan\n- **SVA** `assert` [docs](https://x.y)')).toBe(
      'Plan SVA assert docs',
    );
  });
});
