import type { Milestone, Project, ReviewCard, Settings, Task } from '../db/types';
import { ABOUT_MAX_CHARS, AGENDA_MAX_CHARS, capText } from '../domain/inbox';
import { addDaysStr, addWeeksStr, dateOfIso, mondayOf } from '../domain/week';

/** Rough token estimate for JSON text (Claude averages ~3.5-4 chars per token; be conservative). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

export const SNAPSHOT_TOKEN_CAP = 15_000;

export interface SnapshotStats {
  streak: number;
  longestStreak: number;
  freezes: number;
  level: number;
  levelTitle: string;
  xpTotal: number;
  reviewsDueToday: number;
  tasksDoneToday: number;
}

export interface SnapshotInput {
  now: Date;
  timezone: string;
  settings: Pick<Settings, 'capacityMinByWeekday' | 'restDays'>;
  projects: Project[];
  milestones: Milestone[];
  tasks: Task[];
  cards: Pick<ReviewCard, 'prompt' | 'createdAt'>[];
  stats?: SnapshotStats;
  /** Notes from the brain repo: me.md and agenda.md. */
  brain?: { about?: string; agenda?: string };
}

export interface SnapshotTask {
  id: string;
  projectId: string;
  title: string;
  kind: Task['kind'];
  status: Task['status'];
  priority: Task['priority'];
  estimateMin?: number;
  weekStart?: string;
  day?: string;
  dueDate?: string;
  isBig3?: true;
  milestoneId?: string;
  completedAt?: string;
}

export interface Snapshot {
  today: string;
  timezone: string;
  weekStart: string;
  capacityMinByWeekday: number[];
  restDays: number[];
  stats?: SnapshotStats;
  projects: {
    id: string;
    name: string;
    emoji: string;
    kind: Project['kind'];
    color: Project['color'];
    columns: string[];
  }[];
  milestones: { id: string; projectId: string; title: string; weekStart: string; done: boolean }[];
  tasks: SnapshotTask[];
  recentCardPrompts: string[];
  /** VJ's notes about himself, from the brain repo. */
  about?: string;
  /** Calendar and email digest for the coming days, refreshed by the daily inbox check. */
  agenda?: string;
  /** Present when the cap forced trimming. */
  trimmed?: { doneTasks: number; cardPrompts: number; otherTasks: number };
}

function toSnapshotTask(t: Task): SnapshotTask {
  const out: SnapshotTask = {
    id: t.id,
    projectId: t.projectId,
    title: t.title,
    kind: t.kind,
    status: t.status,
    priority: t.priority,
  };
  if (t.estimateMin) out.estimateMin = t.estimateMin;
  if (t.weekStart) out.weekStart = t.weekStart;
  if (t.day) out.day = t.day;
  if (t.dueDate) out.dueDate = t.dueDate;
  if (t.isBig3) out.isBig3 = true;
  if (t.milestoneId) out.milestoneId = t.milestoneId;
  if (t.completedAt) out.completedAt = dateOfIso(t.completedAt);
  return out;
}

/**
 * Which tasks the AI sees: unplanned open tasks, plus tasks planned from last week through four
 * weeks ahead that are open or were completed in the last 7 days.
 */
export function relevantTasks(tasks: Task[], today: string): Task[] {
  const thisWeek = mondayOf(today);
  const from = addWeeksStr(thisWeek, -1);
  const to = addWeeksStr(thisWeek, 4);
  const doneSince = addDaysStr(today, -7);
  return tasks.filter((t) => {
    const recentDone =
      t.status === 'done' && !!t.completedAt && dateOfIso(t.completedAt) >= doneSince;
    if (!t.weekStart) return t.status !== 'done' || recentDone;
    if (t.weekStart < from || t.weekStart > to) return false;
    return t.status !== 'done' || recentDone;
  });
}

/** Builds the compact JSON context sent with AI requests, trimmed to about `cap` tokens. */
export function buildSnapshot(input: SnapshotInput, cap = SNAPSHOT_TOKEN_CAP): Snapshot {
  const today = dateOfIso(input.now.toISOString());
  const active = input.projects.filter((p) => !p.archived);
  const activeIds = new Set(active.map((p) => p.id));
  const tasks = relevantTasks(
    input.tasks.filter((t) => activeIds.has(t.projectId)),
    today,
  )
    .sort(
      (a, b) => (a.weekStart ?? '9999').localeCompare(b.weekStart ?? '9999') || a.order - b.order,
    )
    .map(toSnapshotTask);
  const snapshot: Snapshot = {
    today,
    timezone: input.timezone,
    weekStart: mondayOf(today),
    capacityMinByWeekday: input.settings.capacityMinByWeekday,
    restDays: input.settings.restDays,
    ...(input.stats ? { stats: input.stats } : {}),
    projects: active
      .sort((a, b) => a.order - b.order)
      .map((p) => ({
        id: p.id,
        name: p.name,
        emoji: p.emoji,
        kind: p.kind,
        color: p.color,
        columns: p.columns.map((c) => c.name),
      })),
    milestones: input.milestones
      .filter((m) => activeIds.has(m.projectId))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
      .map((m) => ({
        id: m.id,
        projectId: m.projectId,
        title: m.title,
        weekStart: m.weekStart,
        done: m.done,
      })),
    tasks,
    recentCardPrompts: [...input.cards]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50)
      .map((c) => c.prompt),
  };
  const about = input.brain?.about?.trim();
  const agenda = input.brain?.agenda?.trim();
  if (about) snapshot.about = capText(about, ABOUT_MAX_CHARS);
  if (agenda) snapshot.agenda = capText(agenda, AGENDA_MAX_CHARS);
  return trimSnapshot(snapshot, cap);
}

/**
 * Enforces the token cap: drops the oldest completed tasks first, then the oldest card prompts,
 * then open tasks furthest in the future.
 */
export function trimSnapshot(snapshot: Snapshot, cap = SNAPSHOT_TOKEN_CAP): Snapshot {
  const s: Snapshot = {
    ...snapshot,
    tasks: [...snapshot.tasks],
    recentCardPrompts: [...snapshot.recentCardPrompts],
  };
  const size = () => estimateTokens(JSON.stringify(s));
  if (size() <= cap) return s;
  const trimmed = { doneTasks: 0, cardPrompts: 0, otherTasks: 0 };
  s.trimmed = trimmed;

  const doneOldestFirst = s.tasks
    .filter((t) => t.status === 'done')
    .sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? ''))
    .map((t) => t.id);
  for (const id of doneOldestFirst) {
    if (size() <= cap) return s;
    s.tasks = s.tasks.filter((t) => t.id !== id);
    trimmed.doneTasks++;
  }
  while (size() > cap && s.recentCardPrompts.length) {
    s.recentCardPrompts.pop();
    trimmed.cardPrompts++;
  }
  // Last resort: open tasks, unplanned and furthest-out weeks first.
  const openFurthestFirst = [...s.tasks]
    .sort((a, b) => (b.weekStart ?? '9999').localeCompare(a.weekStart ?? '9999'))
    .map((t) => t.id);
  for (const id of openFurthestFirst) {
    if (size() <= cap) break;
    s.tasks = s.tasks.filter((t) => t.id !== id);
    trimmed.otherTasks++;
  }
  return s;
}

export interface RefInfo {
  kind: 'project' | 'milestone' | 'task';
  /** The real record id. */
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  emoji: string;
}

/**
 * Swaps record ids for short refs (`p1`, `m1`, `t1`) so the model can cite items cheaply, and
 * returns the map back to real records.
 */
export function withShortRefs(snapshot: Snapshot): {
  snapshot: Snapshot;
  refs: Record<string, RefInfo>;
} {
  const refs: Record<string, RefInfo> = {};
  const short = new Map<string, string>();
  const projects = new Map(snapshot.projects.map((p) => [p.id, p]));
  const info = (
    kind: RefInfo['kind'],
    ref: string,
    id: string,
    title: string,
    projectId: string,
  ) => {
    const p = projects.get(projectId);
    short.set(id, ref);
    refs[ref] = { kind, id, title, projectId, projectName: p?.name ?? '', emoji: p?.emoji ?? '' };
  };
  snapshot.projects.forEach((p, i) => info('project', `p${i + 1}`, p.id, p.name, p.id));
  snapshot.milestones.forEach((m, i) => info('milestone', `m${i + 1}`, m.id, m.title, m.projectId));
  snapshot.tasks.forEach((t, i) => info('task', `t${i + 1}`, t.id, t.title, t.projectId));
  const s = (id: string) => short.get(id) ?? id;
  return {
    snapshot: {
      ...snapshot,
      projects: snapshot.projects.map((p) => ({ ...p, id: s(p.id) })),
      milestones: snapshot.milestones.map((m) => ({
        ...m,
        id: s(m.id),
        projectId: s(m.projectId),
      })),
      tasks: snapshot.tasks.map((t) => {
        const { milestoneId, ...rest } = t;
        return {
          ...rest,
          id: s(t.id),
          projectId: s(t.projectId),
          ...(milestoneId && short.has(milestoneId) ? { milestoneId: s(milestoneId) } : {}),
        };
      }),
    },
    refs,
  };
}
