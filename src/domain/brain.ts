import type { ColorKey, Milestone, Project, ReviewCard, Task, TaskStatus } from '../db/types';
import { addDaysStr, dateOfIso } from './week';

/**
 * The Brain's knowledge graph: projects, their milestones, tasks and review cards as nodes, linked
 * the way they belong together. Pure; the canvas view runs the force layout and drawing.
 */

export const MAX_GRAPH_TASKS = 400;
export const MAX_GRAPH_CARDS = 300;
/** Completed tasks stay in the graph this many days (when completed items are shown). */
export const DONE_WINDOW_DAYS = 14;

export type GraphNodeKind = 'project' | 'milestone' | 'task' | 'card';

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  projectId: string;
  color: ColorKey;
  /** The project's emoji, so color is never the only cue. */
  emoji: string;
  radius: number;
  done: boolean;
  big3: boolean;
  status?: TaskStatus;
  /** Planned day or due date (tasks) or week (milestones). */
  date?: string;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  links: GraphLink[];
  counts: { projects: number; milestones: number; tasks: number; cards: number };
}

export interface KnowledgeGraphInput {
  today: string;
  projects: Project[];
  tasks: Task[];
  milestones: Milestone[];
  cards: Pick<ReviewCard, 'id' | 'projectId' | 'taskId' | 'prompt' | 'suspended' | 'createdAt'>[];
}

export interface GraphOptions {
  includeCards: boolean;
  includeDone: boolean;
}

const byOpenFirst = (a: Task, b: Task) =>
  Number(a.status === 'done') - Number(b.status === 'done') ||
  a.priority - b.priority ||
  (a.day ?? a.dueDate ?? '9999').localeCompare(b.day ?? b.dueDate ?? '9999') ||
  a.order - b.order;

export function buildKnowledgeGraph(
  input: KnowledgeGraphInput,
  opts: GraphOptions,
): KnowledgeGraph {
  const doneSince = addDaysStr(input.today, -(DONE_WINDOW_DAYS - 1));
  const projects = input.projects.filter((p) => !p.archived).sort((a, b) => a.order - b.order);
  const byId = new Map(projects.map((p) => [p.id, p]));
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const present = new Set<string>();

  const tasks = input.tasks
    .filter(
      (t) =>
        byId.has(t.projectId) &&
        (t.status !== 'done' ||
          (opts.includeDone && !!t.completedAt && dateOfIso(t.completedAt) >= doneSince)),
    )
    .sort(byOpenFirst)
    .slice(0, MAX_GRAPH_TASKS);
  const openByProject = new Map<string, number>();
  for (const t of tasks) {
    if (t.status !== 'done')
      openByProject.set(t.projectId, (openByProject.get(t.projectId) ?? 0) + 1);
  }

  for (const p of projects) {
    nodes.push({
      id: p.id,
      kind: 'project',
      label: p.name,
      projectId: p.id,
      color: p.color,
      emoji: p.emoji,
      radius: 6 + Math.min(6, Math.sqrt(openByProject.get(p.id) ?? 0) * 1.5),
      done: false,
      big3: false,
    });
    present.add(p.id);
  }

  const milestones = input.milestones
    .filter((m) => byId.has(m.projectId) && (!m.done || opts.includeDone))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.order - b.order);
  for (const m of milestones) {
    const p = byId.get(m.projectId)!;
    nodes.push({
      id: m.id,
      kind: 'milestone',
      label: m.title,
      projectId: p.id,
      color: p.color,
      emoji: p.emoji,
      radius: 4.5,
      done: m.done,
      big3: false,
      date: m.weekStart,
    });
    links.push({ source: m.id, target: p.id });
    present.add(m.id);
  }

  for (const t of tasks) {
    const p = byId.get(t.projectId)!;
    nodes.push({
      id: t.id,
      kind: 'task',
      label: t.title,
      projectId: p.id,
      color: p.color,
      emoji: p.emoji,
      radius: t.isBig3 ? 3.8 : 3,
      done: t.status === 'done',
      big3: t.isBig3,
      status: t.status,
      ...(t.day || t.dueDate ? { date: t.day ?? t.dueDate } : {}),
    });
    links.push({
      source: t.id,
      target: t.milestoneId && present.has(t.milestoneId) ? t.milestoneId : p.id,
    });
    present.add(t.id);
  }

  let cardCount = 0;
  if (opts.includeCards) {
    const cards = input.cards
      .filter((c) => !c.suspended && byId.has(c.projectId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, MAX_GRAPH_CARDS);
    for (const c of cards) {
      const p = byId.get(c.projectId)!;
      nodes.push({
        id: c.id,
        kind: 'card',
        label: c.prompt,
        projectId: p.id,
        color: p.color,
        emoji: p.emoji,
        radius: 1.9,
        done: false,
        big3: false,
      });
      links.push({ source: c.id, target: c.taskId && present.has(c.taskId) ? c.taskId : p.id });
    }
    cardCount = cards.length;
  }

  return {
    nodes,
    links,
    counts: {
      projects: projects.length,
      milestones: milestones.length,
      tasks: tasks.length,
      cards: cardCount,
    },
  };
}

/** Ids directly linked to `id` (both directions). */
export function neighborIds(links: GraphLink[], id: string): Set<string> {
  const out = new Set<string>();
  for (const l of links) {
    if (l.source === id) out.add(l.target);
    else if (l.target === id) out.add(l.source);
  }
  return out;
}

/** Strips markdown symbols and citation refs so text reads cleanly aloud. */
export function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[\[[^\]]*\]\]/g, '')
    .replace(/[`*_#>|]/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits streamed text into whole sentences ready to speak, keeping the unfinished tail.
 * With `final`, the tail is returned as a sentence too.
 */
export function takeSentences(
  buffer: string,
  final = false,
): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  const re = /[^.!?\n]*(?:[.!?]+["')\]]*(?=\s)|\n)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(buffer))) {
    if (!m[0]) {
      re.lastIndex++;
      continue;
    }
    const s = speakable(m[0]);
    if (s) sentences.push(s);
    last = re.lastIndex;
  }
  let rest = buffer.slice(last);
  if (final) {
    const s = speakable(rest);
    if (s) sentences.push(s);
    rest = '';
  }
  return { sentences, rest };
}
