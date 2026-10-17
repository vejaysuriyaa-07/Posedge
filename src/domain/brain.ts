import type { ColorKey, Milestone, Project, Task } from '../db/types';
import { addDaysStr, dateOfIso, diffDays, mondayOf } from './week';

/**
 * The Brain's "neural core" graph: VJ at the center, active projects on a ring, this week's
 * tasks and upcoming milestones as satellites, review cards as stars. Pure; the canvas
 * renderer only maps these normalized values to pixels.
 */

export const MAX_SATELLITES = 12;
export const MAX_MILESTONES = 2;
export const MAX_STARS = 360;

export interface BrainSatellite {
  id: string;
  kind: 'task' | 'milestone';
  title: string;
  status: 'todo' | 'doing' | 'done';
  isBig3: boolean;
  /** Absolute angle (radians) around the project node. */
  angle: number;
  /** 0 = inner orbit, 1 = outer orbit. */
  orbit: 0 | 1;
  /** Planned day, due date or milestone week, when known. */
  date?: string;
}

export interface BrainProjectNode {
  id: string;
  name: string;
  emoji: string;
  color: ColorKey;
  /** Angle (radians) on the project ring; 0 points right, increasing clockwise on screen. */
  angle: number;
  /** Completions in the last 7 days relative to the busiest project (0..1). */
  energy: number;
  doneLast7: number;
  weekTotal: number;
  weekDone: number;
  openTotal: number;
  cards: number;
  dueCards: number;
  /** `daysUntil` counts to the Sunday that ends the milestone's week. */
  nextMilestone?: { id: string; title: string; weekStart: string; daysUntil: number };
  satellites: BrainSatellite[];
}

export interface BrainStar {
  /** Normalized position in [-1, 1] on both axes, away from the core. */
  x: number;
  y: number;
  size: number;
  /** Twinkle phase offset (radians). */
  phase: number;
  projectId: string;
  due: boolean;
}

export interface BrainGraph {
  projects: BrainProjectNode[];
  stars: BrainStar[];
  /** Overall activity in the last 7 days (0..1), drives the core's pulse rate. */
  activity: number;
}

export interface BrainInput {
  today: string;
  projects: Project[];
  tasks: Task[];
  milestones: Milestone[];
  cardsByProject: Record<string, number>;
  dueCardsByProject: Record<string, number>;
}

/** Deterministic PRNG so stars stay put between renders. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const STATUS_RANK: Record<Task['status'], number> = { doing: 0, todo: 1, done: 2 };

/** Which of a project's tasks orbit it: this week's plan, Big 3 and in-progress work first. */
export function pickSatellites(tasks: Task[], weekStart: string, max = MAX_SATELLITES): Task[] {
  return tasks
    .filter((t) => t.weekStart === weekStart || t.status === 'doing')
    .sort(
      (a, b) =>
        STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
        Number(b.isBig3) - Number(a.isBig3) ||
        a.priority - b.priority ||
        (a.day ?? '9999').localeCompare(b.day ?? '9999') ||
        a.order - b.order,
    )
    .slice(0, max);
}

export function buildBrainGraph(input: BrainInput): BrainGraph {
  const { today } = input;
  const weekStart = mondayOf(today);
  const since = addDaysStr(today, -6);
  const active = input.projects.filter((p) => !p.archived).sort((a, b) => a.order - b.order);
  const n = active.length;

  const tasksByProject = new Map<string, Task[]>();
  for (const t of input.tasks) {
    const list = tasksByProject.get(t.projectId);
    if (list) list.push(t);
    else tasksByProject.set(t.projectId, [t]);
  }

  const doneLast7 = new Map<string, number>();
  for (const t of input.tasks) {
    if (t.status === 'done' && t.completedAt && dateOfIso(t.completedAt) >= since) {
      doneLast7.set(t.projectId, (doneLast7.get(t.projectId) ?? 0) + 1);
    }
  }
  const maxDone = Math.max(0, ...doneLast7.values());
  const totalDone = [...doneLast7.values()].reduce((a, b) => a + b, 0);

  const projects: BrainProjectNode[] = active.map((p, i) => {
    // Start at the top (-90deg) and go clockwise.
    const angle = -Math.PI / 2 + (n ? (i / n) * Math.PI * 2 : 0);
    const tasks = tasksByProject.get(p.id) ?? [];
    const week = tasks.filter((t) => t.weekStart === weekStart);
    const upcoming = input.milestones
      .filter((m) => m.projectId === p.id && !m.done)
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.order - b.order);
    const picked = pickSatellites(tasks, weekStart);
    const milestones = upcoming.slice(0, MAX_MILESTONES);
    const inner = Math.min(picked.length, 8);
    const outerCount = picked.length - inner + milestones.length;

    // Satellites fan out on the side facing away from the core so links don't cross it.
    const fan = (count: number, spread: number, k: number) =>
      count <= 1 ? angle : angle - spread / 2 + (k / (count - 1)) * spread;
    const innerSpread = Math.min(Math.PI * 1.5, (Math.PI / 5) * Math.max(1, inner - 1));
    const outerSpread = Math.min(Math.PI * 1.2, (Math.PI / 6) * Math.max(1, outerCount - 1));

    const satellites: BrainSatellite[] = picked.map((t, k) => ({
      id: t.id,
      kind: 'task',
      title: t.title,
      status: t.status,
      isBig3: t.isBig3,
      angle: k < inner ? fan(inner, innerSpread, k) : fan(outerCount, outerSpread, k - inner),
      orbit: k < inner ? 0 : 1,
      date: t.day ?? t.dueDate,
    }));
    milestones.forEach((m, k) => {
      satellites.push({
        id: m.id,
        kind: 'milestone',
        title: m.title,
        status: 'todo',
        isBig3: false,
        angle: fan(outerCount, outerSpread, picked.length - inner + k),
        orbit: 1,
        date: m.weekStart,
      });
    });

    const next = upcoming[0];
    return {
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      color: p.color,
      angle,
      energy: maxDone ? (doneLast7.get(p.id) ?? 0) / maxDone : 0,
      doneLast7: doneLast7.get(p.id) ?? 0,
      weekTotal: week.length,
      weekDone: week.filter((t) => t.status === 'done').length,
      openTotal: tasks.filter((t) => t.status !== 'done').length,
      cards: input.cardsByProject[p.id] ?? 0,
      dueCards: input.dueCardsByProject[p.id] ?? 0,
      ...(next
        ? {
            nextMilestone: {
              id: next.id,
              title: next.title,
              weekStart: next.weekStart,
              daysUntil: diffDays(addDaysStr(next.weekStart, 6), today),
            },
          }
        : {}),
      satellites,
    };
  });

  return { projects, stars: buildStars(projects), activity: Math.min(1, totalDone / 20) };
}

/** One star per review card (scaled down past MAX_STARS), clustered loosely by project. */
export function buildStars(
  projects: Pick<BrainProjectNode, 'id' | 'angle' | 'cards' | 'dueCards'>[],
): BrainStar[] {
  const total = projects.reduce((a, p) => a + p.cards, 0);
  const scale = total > MAX_STARS ? MAX_STARS / total : 1;
  const stars: BrainStar[] = [];
  for (const p of projects) {
    const count = Math.round(p.cards * scale);
    const due = Math.min(count, Math.round(p.dueCards * scale) || (p.dueCards ? 1 : 0));
    const rand = mulberry32(hashString(p.id));
    for (let i = 0; i < count; i++) {
      // Mostly in the project's sector, some scattered everywhere.
      const scatter = rand() < 0.35;
      const a = scatter ? rand() * Math.PI * 2 : p.angle + (rand() - 0.5) * 1.4;
      const r = 0.28 + rand() * 0.72;
      stars.push({
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        size: 0.6 + rand() * 1.2,
        phase: rand() * Math.PI * 2,
        projectId: p.id,
        due: i < due,
      });
    }
  }
  return stars;
}

export interface Signal {
  id: string;
  kind: 'task' | 'milestone';
  title: string;
  projectId: string;
  /** The date the countdown runs to (due date, or the Sunday ending a milestone's week). */
  date: string;
  daysUntil: number;
  late: boolean;
}

/** Upcoming deadlines for the HUD: open tasks with due dates and undone milestones. */
export function upcomingSignals(
  tasks: Task[],
  milestones: Milestone[],
  today: string,
  { horizonDays = 28, limit = 8 }: { horizonDays?: number; limit?: number } = {},
): Signal[] {
  const horizon = addDaysStr(today, horizonDays);
  const out: Signal[] = [];
  for (const t of tasks) {
    if (t.status === 'done' || !t.dueDate || t.dueDate > horizon) continue;
    out.push({
      id: t.id,
      kind: 'task',
      title: t.title,
      projectId: t.projectId,
      date: t.dueDate,
      daysUntil: diffDays(t.dueDate, today),
      late: t.dueDate < today,
    });
  }
  for (const m of milestones) {
    if (m.done) continue;
    const end = addDaysStr(m.weekStart, 6);
    if (m.weekStart > horizon) continue;
    out.push({
      id: m.id,
      kind: 'milestone',
      title: m.title,
      projectId: m.projectId,
      date: end,
      daysUntil: diffDays(end, today),
      late: end < today,
    });
  }
  return out
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
    .slice(0, limit);
}

/** HUD countdown text: "Today", "T-3d", "T-2w", or "Carried over" for past dates (never "overdue"). */
export function countdownLabel(daysUntil: number): string {
  if (daysUntil < 0) return 'Carried over';
  if (daysUntil === 0) return 'Today';
  if (daysUntil < 14) return `T-${daysUntil}d`;
  return `T-${Math.round(daysUntil / 7)}w`;
}

/** Local greeting shown before any AI call (no network). */
export function edgeGreeting(opts: {
  hour: number;
  name: string;
  plannedOpen: number;
  reviewsDue: number;
  streak: number;
  nextSignal?: Pick<Signal, 'title' | 'daysUntil'>;
}): string {
  const { hour } = opts;
  const hello =
    hour < 5
      ? 'Burning the midnight oil'
      : hour < 12
        ? 'Good morning'
        : hour < 17
          ? 'Good afternoon'
          : 'Good evening';
  const parts: string[] = [`${hello}, ${opts.name}. All systems nominal.`];
  const today: string[] = [];
  if (opts.plannedOpen)
    today.push(`${opts.plannedOpen} task${opts.plannedOpen === 1 ? '' : 's'} on deck today`);
  if (opts.reviewsDue)
    today.push(`${opts.reviewsDue} review${opts.reviewsDue === 1 ? '' : 's'} due`);
  if (today.length) parts.push(`You have ${today.join(' and ')}.`);
  else parts.push('Your slate is clear for today.');
  if (opts.nextSignal && opts.nextSignal.daysUntil >= 0) {
    const when =
      opts.nextSignal.daysUntil === 0
        ? 'today'
        : opts.nextSignal.daysUntil === 1
          ? 'tomorrow'
          : `in ${opts.nextSignal.daysUntil} days`;
    parts.push(`Next up: ${opts.nextSignal.title}, ${when}.`);
  }
  if (opts.streak > 1) parts.push(`Streak holding at ${opts.streak} days.`);
  return parts.join(' ');
}

/** Strips markdown symbols so text reads cleanly aloud. */
export function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
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
