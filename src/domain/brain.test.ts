import { describe, expect, it } from 'vitest';
import type { Milestone, Project, ReviewCard, Task } from '../db/types';
import {
  buildKnowledgeGraph,
  MAX_GRAPH_TASKS,
  MAX_TOPICS,
  neighborIds,
  speakable,
  takeSentences,
  topicTerms,
} from './brain';

const TODAY = '2026-10-17';

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

type CardIn = Pick<
  ReviewCard,
  'id' | 'projectId' | 'taskId' | 'prompt' | 'suspended' | 'createdAt'
>;
function card(p: Partial<CardIn>): CardIn {
  n++;
  return {
    id: `c${n}`,
    projectId: 'a',
    prompt: `Why ${n}?`,
    suspended: false,
    createdAt: `2026-10-0${(n % 9) + 1}T00:00:00.000Z`,
    ...p,
  };
}

const ALL = { includeCards: true, includeDone: true, includeTopics: false };

describe('knowledge graph', () => {
  it('links tasks to their milestone or project, milestones to projects and cards to their task', () => {
    const m = milestone({ title: 'SVA basics' });
    const t1 = task({ milestoneId: m.id, title: 'Read SVA' });
    const t2 = task({ title: 'Loose task' });
    const c1 = card({ taskId: t1.id });
    const c2 = card({ taskId: 'gone' });
    const g = buildKnowledgeGraph(
      {
        today: TODAY,
        projects: [project('a', 1), project('x', 2, { archived: true })],
        tasks: [t1, t2],
        milestones: [m],
        cards: [c1, c2],
      },
      ALL,
    );
    expect(g.nodes.map((nd) => nd.kind)).toEqual([
      'project',
      'milestone',
      'task',
      'task',
      'card',
      'card',
    ]);
    expect(g.links).toEqual(
      expect.arrayContaining([
        { source: m.id, target: 'a' },
        { source: t1.id, target: m.id },
        { source: t2.id, target: 'a' },
        { source: c1.id, target: t1.id },
        { source: c2.id, target: 'a' },
      ]),
    );
    expect(g.counts).toEqual({ projects: 1, milestones: 1, tasks: 2, cards: 2, topics: 0 });
    expect(g.nodes[0]).toMatchObject({ label: 'Project a', emoji: '🎯', color: 'violet' });
    expect(neighborIds(g.links, t1.id)).toEqual(new Set([m.id, c1.id]));
  });

  it('hides completed work and cards unless asked, and keeps only the last two weeks of completions', () => {
    const recent = new Date(2026, 9, 10, 12).toISOString();
    const old = new Date(2026, 8, 20, 12).toISOString();
    const tasks = [
      task({ title: 'open' }),
      task({ title: 'recent done', status: 'done', completedAt: recent }),
      task({ title: 'old done', status: 'done', completedAt: old }),
    ];
    const input = {
      today: TODAY,
      projects: [project('a', 1)],
      tasks,
      milestones: [milestone({ title: 'finished', done: true })],
      cards: [card({}), card({ suspended: true })],
    };
    const lean = buildKnowledgeGraph(input, {
      includeCards: false,
      includeDone: false,
      includeTopics: false,
    });
    expect(lean.nodes.filter((nd) => nd.kind !== 'project').map((nd) => nd.label)).toEqual([
      'open',
    ]);
    const full = buildKnowledgeGraph(input, ALL);
    expect(full.nodes.filter((nd) => nd.kind === 'task').map((nd) => nd.label)).toEqual([
      'open',
      'recent done',
    ]);
    expect(full.nodes.find((nd) => nd.label === 'recent done')?.done).toBe(true);
    expect(full.counts.milestones).toBe(1);
    expect(full.counts.cards).toBe(1);
  });

  it('caps tasks, keeping open and high-priority ones, and sizes projects by open work', () => {
    const tasks = [
      ...Array.from({ length: MAX_GRAPH_TASKS + 20 }, () => task({ priority: 3 })),
      task({ title: 'urgent', priority: 1 }),
    ];
    const g = buildKnowledgeGraph(
      {
        today: TODAY,
        projects: [project('a', 1), project('b', 2)],
        tasks,
        milestones: [],
        cards: [],
      },
      ALL,
    );
    expect(g.counts.tasks).toBe(MAX_GRAPH_TASKS);
    expect(g.nodes.some((nd) => nd.label === 'urgent')).toBe(true);
    const [a, b] = g.nodes;
    expect(a!.radius).toBeGreaterThan(b!.radius);
  });
});

describe('topics', () => {
  it('picks acronyms and meaningful words, and drops filler and generic task verbs', () => {
    expect([
      ...topicTerms('Write an SVA property: after req rises, gnt must be high').entries(),
    ]).toEqual([
      ['sva', 'SVA'],
      ['property', 'property'],
    ]);
    expect([...topicTerms('C++ / Python and LLMs, reviewing classes').entries()]).toEqual([
      ['c++', 'C++'],
      ['python', 'python'],
      ['llm', 'LLM'],
      ['reviewing', 'reviewing'],
      ['class', 'class'],
    ]);
    expect([...topicTerms('Read the paper and finish the notes').keys()]).toEqual([]);
  });

  it('bridges projects that share a term, and skips terms used inside one project only', () => {
    const projects = [
      project('a', 1, { name: 'Camera ISP' }),
      project('b', 2, { name: 'C++ / Python' }),
    ];
    const tasks = [
      task({
        projectId: 'a',
        title: 'Bilinear demosaic in Python',
        createdAt: '2026-10-03T00:00:00.000Z',
      }),
      task({
        projectId: 'b',
        title: 'Python numpy vectorization',
        createdAt: '2026-10-02T00:00:00.000Z',
      }),
      task({ projectId: 'a', title: 'Demosaic edge cases' }),
    ];
    const g = buildKnowledgeGraph(
      { today: TODAY, projects, tasks, milestones: [], cards: [] },
      { includeCards: false, includeDone: false, includeTopics: true },
    );
    const topics = g.nodes.filter((nd) => nd.kind === 'topic');
    // "python" spans both projects (incl. the project name); "demosaic" stays inside Camera ISP.
    expect(topics.map((nd) => nd.label)).toEqual(['python']);
    expect(topics[0]).toMatchObject({
      id: 'topic:python',
      projectId: '',
      born: '2026-10-01T00:00:00.000Z',
    });
    expect(
      g.links
        .filter((l) => l.target === 'topic:python')
        .map((l) => l.source)
        .sort(),
    ).toEqual(['b', tasks[0]!.id, tasks[1]!.id].sort());
    expect(g.counts.topics).toBe(1);
  });

  it('caps topics at the most-shared terms', () => {
    const projects = [project('a', 1), project('b', 2)];
    const words = Array.from(
      { length: MAX_TOPICS + 10 },
      (_, i) => `term${String.fromCharCode(97 + (i % 26))}${i}`,
    );
    const tasks = words.flatMap((w) => [
      task({ projectId: 'a', title: w }),
      task({ projectId: 'b', title: w }),
    ]);
    const g = buildKnowledgeGraph(
      { today: TODAY, projects, tasks, milestones: [], cards: [] },
      { includeCards: false, includeDone: false, includeTopics: true },
    );
    expect(g.counts.topics).toBe(MAX_TOPICS);
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

  it('strips markdown and citations for speech', () => {
    expect(speakable('## Plan\n- **SVA** [[t3]] `assert` [docs](https://x.y)')).toBe(
      'Plan SVA assert docs',
    );
  });
});
