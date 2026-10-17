import { describe, expect, it } from 'vitest';
import type { Project, Task } from '../db/types';
import {
  buildSnapshot,
  estimateTokens,
  relevantTasks,
  trimSnapshot,
  withShortRefs,
} from './context';

const NOW = new Date(2026, 9, 17, 10, 0, 0); // Sat Oct 17 2026, week of Oct 12

const project: Project = {
  id: 'p1',
  name: 'DV Interview Prep',
  emoji: '🎯',
  color: 'violet',
  kind: 'prep',
  columns: [
    { id: 'todo', name: 'To do' },
    { id: 'done', name: 'Done' },
  ],
  archived: false,
  order: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
};

let n = 0;
function task(p: Partial<Task>): Task {
  n++;
  return {
    id: `t${n}`,
    projectId: 'p1',
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

describe('context snapshot', () => {
  it('keeps unplanned, last week through +4 weeks, and recent completions only', () => {
    const keep = [
      task({ title: 'unplanned open' }),
      task({ weekStart: '2026-10-05', title: 'last week open' }),
      task({ weekStart: '2026-11-09', title: 'four weeks out' }),
      task({
        weekStart: '2026-10-12',
        status: 'done',
        completedAt: new Date(2026, 9, 14).toISOString(),
        title: 'done 3 days ago',
      }),
    ];
    const drop = [
      task({ weekStart: '2026-09-28', title: 'two weeks ago' }),
      task({ weekStart: '2026-11-16', title: 'five weeks out' }),
      task({
        weekStart: '2026-10-05',
        status: 'done',
        completedAt: new Date(2026, 9, 6).toISOString(),
        title: 'done 11 days ago',
      }),
      task({
        status: 'done',
        completedAt: new Date(2026, 8, 1).toISOString(),
        title: 'old unplanned done',
      }),
    ];
    const titles = relevantTasks([...keep, ...drop], '2026-10-17').map((t) => t.title);
    expect(titles).toEqual(keep.map((t) => t.title));
  });

  it('builds compact JSON with today, week, capacity and the 50 latest card prompts', () => {
    const cards = Array.from({ length: 60 }, (_, i) => ({
      prompt: `Card ${i}`,
      createdAt: new Date(2026, 8, 1 + i).toISOString(),
    }));
    const s = buildSnapshot({
      now: NOW,
      timezone: 'America/Los_Angeles',
      settings: { capacityMinByWeekday: [180, 120, 180, 120, 180, 240, 60], restDays: [6] },
      projects: [project, { ...project, id: 'p2', name: 'Old', archived: true }],
      milestones: [
        { id: 'm1', projectId: 'p1', title: 'SVA', weekStart: '2026-10-26', done: false, order: 1 },
      ],
      tasks: [task({ weekStart: '2026-10-12', day: '2026-10-17', isBig3: true, estimateMin: 60 })],
      cards,
    });
    expect(s).toMatchObject({ today: '2026-10-17', weekStart: '2026-10-12', restDays: [6] });
    expect(s.projects).toEqual([
      {
        id: 'p1',
        name: 'DV Interview Prep',
        emoji: '🎯',
        kind: 'prep',
        color: 'violet',
        columns: ['To do', 'Done'],
      },
    ]);
    expect(s.tasks[0]).toMatchObject({ day: '2026-10-17', isBig3: true, estimateMin: 60 });
    expect(s.tasks[0]).not.toHaveProperty('notes');
    expect(s.recentCardPrompts).toHaveLength(50);
    expect(s.recentCardPrompts[0]).toBe('Card 59');
    expect(s.trimmed).toBeUndefined();
  });

  it('trims the oldest completed tasks first to fit the cap', () => {
    const tasks = [
      ...Array.from({ length: 40 }, (_, i) =>
        task({
          weekStart: '2026-10-12',
          status: 'done',
          completedAt: new Date(2026, 9, 11, i).toISOString(),
          title: `done ${String(i).padStart(2, '0')} ${'x'.repeat(80)}`,
        }),
      ),
      ...Array.from({ length: 10 }, () =>
        task({ weekStart: '2026-10-19', title: `open ${'y'.repeat(80)}` }),
      ),
    ];
    const full = buildSnapshot(
      {
        now: NOW,
        timezone: 'UTC',
        settings: { capacityMinByWeekday: [0, 0, 0, 0, 0, 0, 0], restDays: [] },
        projects: [project],
        milestones: [],
        tasks,
        cards: [],
      },
      1e9,
    );
    const fullSize = estimateTokens(JSON.stringify(full));
    const cap = Math.floor(fullSize * 0.6);
    const s = trimSnapshot(full, cap);
    expect(estimateTokens(JSON.stringify(s))).toBeLessThanOrEqual(cap);
    expect(s.trimmed?.doneTasks).toBeGreaterThan(0);
    expect(s.trimmed?.otherTasks).toBe(0);
    // Every open task survives; the newest completions survive, the oldest go first.
    expect(s.tasks.filter((t) => t.status !== 'done')).toHaveLength(10);
    const remainingDone = s.tasks
      .filter((t) => t.status === 'done')
      .map((t) => t.title.slice(0, 7));
    expect(remainingDone).toContain('done 39');
    expect(remainingDone).not.toContain('done 00');
  });

  it('swaps ids for short refs the model can cite, with a map back to the records', () => {
    const s = buildSnapshot({
      now: NOW,
      timezone: 'UTC',
      settings: { capacityMinByWeekday: [0, 0, 0, 0, 0, 0, 0], restDays: [] },
      projects: [{ ...project, id: 'proj-uuid' }],
      milestones: [
        {
          id: 'ms-uuid',
          projectId: 'proj-uuid',
          title: 'SVA',
          weekStart: '2026-10-26',
          done: false,
          order: 1,
        },
      ],
      tasks: [
        task({
          id: 'task-uuid',
          projectId: 'proj-uuid',
          milestoneId: 'ms-uuid',
          weekStart: '2026-10-12',
          title: 'Read SVA',
        }),
        task({
          id: 'task-2',
          projectId: 'proj-uuid',
          milestoneId: 'deleted',
          weekStart: '2026-10-12',
        }),
      ],
      cards: [],
    });
    const { snapshot, refs } = withShortRefs(s);
    expect(snapshot.projects[0]!.id).toBe('p1');
    expect(snapshot.milestones[0]).toMatchObject({ id: 'm1', projectId: 'p1' });
    expect(snapshot.tasks[0]).toMatchObject({ id: 't1', projectId: 'p1', milestoneId: 'm1' });
    expect(snapshot.tasks[1]).not.toHaveProperty('milestoneId');
    expect(JSON.stringify(snapshot)).not.toContain('uuid');
    expect(refs.t1).toEqual({
      kind: 'task',
      id: 'task-uuid',
      title: 'Read SVA',
      projectId: 'proj-uuid',
      projectName: 'DV Interview Prep',
      emoji: '🎯',
    });
  });
});
