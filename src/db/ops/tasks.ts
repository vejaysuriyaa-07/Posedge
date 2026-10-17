import { columnForStatus, columnStatus, doneColumnId, isOfferColumn } from '../../domain/columns';
import { mondayOf, dateOfIso, todayStr } from '../../domain/week';
import {
  levelInfo,
  levelUps,
  taskCompletionXp,
  type LevelInfo,
  type TaskXpBreakdown,
} from '../../domain/xp';
import { db, getSettings, newId, nowIso } from '../db';
import type { Priority, Slot, Task, TaskKind, TaskSource, TaskStatus } from '../types';
import { addXp, bumpDay } from './activity';
import { bumpLongestStreak } from './streak';

export const BIG3_MAX = 3;

/** Drops keys whose value is undefined so records stay clean (and backups round-trip exactly). */
export function clean<T extends object>(obj: T): T {
  const out = { ...obj } as Record<string, unknown>;
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out as T;
}

const taskTables = () => [db.tasks, db.projects, db.settings, db.activityDays, db.reviewCards];

/** Keeps the invariant "weekStart is the Monday of day" and normalizes weekStart to Monday. */
export function normalizePlan(
  weekStart?: string | null,
  day?: string | null,
): { weekStart?: string; day?: string } {
  if (day) return { day, weekStart: mondayOf(day) };
  if (weekStart) return { weekStart: mondayOf(weekStart) };
  return {};
}

async function big3InWeek(weekStart: string, excludeId?: string): Promise<Task[]> {
  const inWeek = await db.tasks.where('weekStart').equals(weekStart).toArray();
  return inWeek.filter((t) => t.isBig3 && t.id !== excludeId);
}

export interface TaskInput {
  projectId: string;
  title: string;
  notes?: string;
  kind?: TaskKind;
  priority?: Priority;
  estimateMin?: number;
  weekStart?: string | null;
  day?: string | null;
  slot?: Slot;
  dueDate?: string;
  isBig3?: boolean;
  milestoneId?: string;
  status?: TaskStatus;
  columnId?: string;
  source?: TaskSource;
  importBatchId?: string;
  seeded?: boolean;
  order?: number;
}

export interface CreateTaskResult {
  task: Task;
  /** True when #big3 was requested but the week already had 3. */
  big3Full: boolean;
}

export async function createTask(
  input: TaskInput,
  now: Date = new Date(),
): Promise<CreateTaskResult> {
  return db.transaction('rw', taskTables(), async () => {
    const project = await db.projects.get(input.projectId);
    if (!project) throw new Error('Project not found');
    const plan = normalizePlan(input.weekStart, input.day);
    const status: TaskStatus =
      input.status ?? (input.columnId ? columnStatus(project, input.columnId) : 'todo');
    const columnId = input.columnId ?? columnForStatus(project, status);
    let isBig3 = !!input.isBig3 && !!plan.weekStart;
    let big3Full = false;
    if (isBig3 && (await big3InWeek(plan.weekStart!)).length >= BIG3_MAX) {
      isBig3 = false;
      big3Full = true;
    }
    const task: Task = clean({
      id: newId(),
      projectId: project.id,
      title: input.title.trim(),
      notes: input.notes?.trim() || undefined,
      kind: input.kind ?? 'task',
      status,
      columnId,
      priority: input.priority ?? 2,
      estimateMin: input.estimateMin,
      ...plan,
      slot: input.slot,
      dueDate: input.dueDate,
      isBig3,
      milestoneId: input.milestoneId,
      order: input.order ?? Date.now(),
      createdAt: nowIso(now),
      completedAt: status === 'done' ? nowIso(now) : undefined,
      source: input.source ?? 'manual',
      importBatchId: input.importBatchId,
      seeded: input.seeded,
    });
    await db.tasks.add(task);
    if (task.source === 'manual') {
      const s = await getSettings();
      if (s.lastProjectId !== project.id)
        await db.settings.put({ ...s, lastProjectId: project.id });
    }
    return { task, big3Full };
  });
}

export interface CompletionResult {
  task: Task;
  xp: TaskXpBreakdown;
  levelBefore: LevelInfo;
  levelAfter: LevelInfo;
  levelsGained: number;
  allBig3: boolean;
  offer: boolean;
}

/**
 * The core loop, in one transaction: mark done, award XP (with Big 3 / offer bonuses),
 * bump the day's activity and the longest streak. Learn tasks without cards are flagged
 * `needsCards` until "Lock it in" saves cards for them.
 */
export async function completeTask(
  id: string,
  now: Date = new Date(),
  opts: { columnId?: string } = {},
): Promise<CompletionResult | null> {
  return db.transaction('rw', taskTables(), async () => {
    const task = await db.tasks.get(id);
    if (!task || task.status === 'done') return null;
    const project = await db.projects.get(task.projectId);
    const columnId = opts.columnId ?? (project ? doneColumnId(project) : task.columnId);
    const offer = project ? isOfferColumn(project, columnId) : false;

    const s = await getSettings();
    let completesAllBig3 = false;
    if (task.isBig3 && task.weekStart && !s.big3BonusWeeks.includes(task.weekStart)) {
      const others = await big3InWeek(task.weekStart, id);
      completesAllBig3 = others.every((t) => t.status === 'done');
    }
    const xp = taskCompletionXp(task, { completesAllBig3, offer });
    const hasCards =
      task.kind === 'learn' && (await db.reviewCards.where('taskId').equals(id).count()) > 0;
    const updated: Task = clean({
      ...task,
      status: 'done' as const,
      columnId,
      completedAt: nowIso(now),
      xpAwarded: xp.total,
      bonusXp: xp.allBig3 || undefined,
      needsCards: task.kind === 'learn' && !hasCards ? true : undefined,
    });
    await db.tasks.put(updated);
    if (completesAllBig3 && task.weekStart) {
      await db.settings.put({ ...s, big3BonusWeeks: [...s.big3BonusWeeks, task.weekStart] });
    }
    const today = todayStr(now);
    const change = await addXp(xp.total, today);
    await bumpDay(today, { tasksDone: 1 });
    await bumpLongestStreak(now);
    return {
      task: updated,
      xp,
      levelBefore: levelInfo(change.before),
      levelAfter: levelInfo(change.after),
      levelsGained: levelUps(change.before, change.after),
      allBig3: completesAllBig3,
      offer,
    };
  });
}

/** Reverses completeTask exactly: XP (including a week's Big 3 bonus), the day's count and status. */
export async function uncompleteTask(
  id: string,
  now: Date = new Date(),
  opts: { status?: TaskStatus; columnId?: string } = {},
): Promise<Task | null> {
  return db.transaction('rw', taskTables(), async () => {
    const task = await db.tasks.get(id);
    if (!task || task.status !== 'done') return null;
    const project = await db.projects.get(task.projectId);
    const status = opts.status && opts.status !== 'done' ? opts.status : 'todo';
    const columnId = opts.columnId ?? (project ? columnForStatus(project, status) : task.columnId);
    const date = task.completedAt ? dateOfIso(task.completedAt) : todayStr(now);

    const s = await getSettings();
    if (task.isBig3 && task.weekStart && s.big3BonusWeeks.includes(task.weekStart)) {
      const week = task.weekStart;
      const holder = (await db.tasks.where('weekStart').equals(week).toArray()).find(
        (t) => (t.bonusXp ?? 0) > 0,
      );
      if (holder && holder.id !== task.id) {
        const bonus = holder.bonusXp ?? 0;
        await addXp(-bonus, holder.completedAt ? dateOfIso(holder.completedAt) : date);
        await db.tasks.put(
          clean({ ...holder, xpAwarded: (holder.xpAwarded ?? 0) - bonus, bonusXp: undefined }),
        );
      }
      const fresh = await getSettings();
      await db.settings.put({
        ...fresh,
        big3BonusWeeks: fresh.big3BonusWeeks.filter((w) => w !== week),
      });
    }
    await addXp(-(task.xpAwarded ?? 0), date);
    await bumpDay(date, { tasksDone: -1 });
    const updated: Task = clean({
      ...task,
      status,
      columnId,
      completedAt: undefined,
      xpAwarded: undefined,
      bonusXp: undefined,
      needsCards: undefined,
    });
    await db.tasks.put(updated);
    return updated;
  });
}

export async function toggleTask(id: string, now: Date = new Date()) {
  const task = await db.tasks.get(id);
  if (!task) return { completed: null, uncompleted: null };
  if (task.status === 'done')
    return { completed: null, uncompleted: await uncompleteTask(id, now) };
  return { completed: await completeTask(id, now), uncompleted: null };
}

export type TaskPatch = Partial<Omit<Task, 'id' | 'createdAt' | 'weekStart' | 'day'>> & {
  weekStart?: string | null;
  day?: string | null;
};

export interface UpdateResult {
  completion: CompletionResult | null;
  big3Full: boolean;
}

/**
 * Edits a task. Status and board column stay in sync; crossing into or out of "done"
 * runs the completion logic so XP is always consistent.
 */
export async function updateTask(
  id: string,
  patch: TaskPatch,
  now: Date = new Date(),
): Promise<UpdateResult> {
  return db.transaction('rw', taskTables(), async () => {
    const task = await db.tasks.get(id);
    if (!task) throw new Error('Task not found');
    const projectId = patch.projectId ?? task.projectId;
    const project = await db.projects.get(projectId);
    if (!project) throw new Error('Project not found');

    let targetStatus: TaskStatus = task.status;
    let columnId = task.columnId;
    if (patch.columnId && patch.columnId !== task.columnId) {
      columnId = patch.columnId;
      targetStatus = columnStatus(project, columnId);
    } else if (patch.status && patch.status !== task.status) {
      targetStatus = patch.status;
      columnId = columnForStatus(project, targetStatus, task.columnId);
    } else if (projectId !== task.projectId) {
      columnId = columnForStatus(project, task.status);
    }

    const planTouched = 'weekStart' in patch || 'day' in patch;
    const plan = planTouched
      ? normalizePlan(
          'weekStart' in patch ? patch.weekStart : task.weekStart,
          'day' in patch ? patch.day : task.day,
        )
      : { weekStart: task.weekStart, day: task.day };
    // Clearing the week also clears the day.
    if (
      planTouched &&
      'weekStart' in patch &&
      patch.weekStart === null &&
      !('day' in patch && patch.day)
    ) {
      delete plan.day;
      delete plan.weekStart;
    }

    let isBig3 = patch.isBig3 ?? task.isBig3;
    let big3Full = false;
    if (!plan.weekStart) isBig3 = false;
    if (isBig3 && (!task.isBig3 || plan.weekStart !== task.weekStart)) {
      if ((await big3InWeek(plan.weekStart!, id)).length >= BIG3_MAX) {
        isBig3 = false;
        big3Full = true;
      }
    }

    const { weekStart: _w, day: _d, status: _s, columnId: _c, ...rest } = patch;
    const wasDone = task.status === 'done';
    const willDone = targetStatus === 'done';
    const base: Task = clean({
      ...task,
      ...rest,
      title: (rest.title ?? task.title).trim() || task.title,
      projectId,
      weekStart: plan.weekStart,
      day: plan.day,
      isBig3,
    });
    // Write field edits first, keeping the old status; completion helpers handle the transition.
    await db.tasks.put(clean({ ...base, weekStart: plan.weekStart, day: plan.day }));
    let completion: CompletionResult | null = null;
    if (!wasDone && willDone) {
      completion = await completeTask(id, now, { columnId });
    } else if (wasDone && !willDone) {
      await uncompleteTask(id, now, { status: targetStatus, columnId });
    } else if (wasDone && willDone && columnId !== task.columnId) {
      // e.g. Offer <-> Rejected: re-run so the offer bonus follows the column.
      await uncompleteTask(id, now);
      completion = await completeTask(id, now, { columnId });
    } else {
      await db.tasks.update(id, { status: targetStatus, columnId });
    }
    return { completion, big3Full };
  });
}

/** Removes a task and returns the record so an undo toast can restore it. */
export async function deleteTask(id: string): Promise<Task | undefined> {
  return db.transaction('rw', db.tasks, async () => {
    const task = await db.tasks.get(id);
    if (task) await db.tasks.delete(id);
    return task;
  });
}

export async function restoreTasks(tasks: Task[]): Promise<void> {
  await db.tasks.bulkPut(tasks);
}

export async function duplicateTask(id: string, now: Date = new Date()): Promise<Task | null> {
  const task = await db.tasks.get(id);
  if (!task) return null;
  const { task: copy } = await createTask(
    {
      projectId: task.projectId,
      title: task.title,
      notes: task.notes,
      kind: task.kind,
      priority: task.priority,
      estimateMin: task.estimateMin,
      weekStart: task.weekStart,
      day: task.day,
      slot: task.slot,
      dueDate: task.dueDate,
      milestoneId: task.milestoneId,
      order: task.order + 0.5,
    },
    now,
  );
  return copy;
}

/** Plans a task into a week/day (null clears). Returns big3Full=false always for moves. */
export async function moveTask(
  id: string,
  target: { weekStart?: string | null; day?: string | null; order?: number },
): Promise<void> {
  await db.transaction('rw', db.tasks, async () => {
    const task = await db.tasks.get(id);
    if (!task) return;
    const plan =
      target.day !== undefined && target.day !== null
        ? normalizePlan(null, target.day)
        : target.weekStart !== undefined
          ? normalizePlan(target.weekStart, null)
          : normalizePlan(task.weekStart, null);
    const next = clean({
      ...task,
      weekStart: plan.weekStart,
      day: plan.day,
      order: target.order ?? task.order,
      // A task that leaves its week can no longer be one of that week's Big 3.
      isBig3: task.isBig3 && plan.weekStart === task.weekStart,
    });
    await db.tasks.put(next);
  });
}

/** Persists a new visual order for a list of tasks. */
export async function reorderTasks(orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.tasks, async () => {
    await Promise.all(orderedIds.map((id, i) => db.tasks.update(id, { order: (i + 1) * 1000 })));
  });
}

export async function setBig3(id: string, on: boolean): Promise<boolean> {
  return db.transaction('rw', db.tasks, async () => {
    const task = await db.tasks.get(id);
    if (!task) return false;
    if (!on) {
      await db.tasks.update(id, { isBig3: false });
      return true;
    }
    if (!task.weekStart) return false;
    if ((await big3InWeek(task.weekStart, id)).length >= BIG3_MAX) return false;
    await db.tasks.update(id, { isBig3: true });
    return true;
  });
}

/** Moves every unfinished task of a past week into another week's backlog. Returns how many moved. */
export async function rollOverUnfinished(fromWeek: string, toWeek: string): Promise<number> {
  return db.transaction('rw', db.tasks, async () => {
    const unfinished = (await db.tasks.where('weekStart').equals(fromWeek).toArray()).filter(
      (t) => t.status !== 'done',
    );
    for (const t of unfinished) {
      const { day: _day, ...rest } = t;
      await db.tasks.put({ ...rest, weekStart: mondayOf(toWeek), isBig3: false });
    }
    return unfinished.length;
  });
}

export function isOverdue(task: Task, today: string): boolean {
  if (task.status === 'done') return false;
  return (!!task.day && task.day < today) || (!!task.dueDate && task.dueDate < today);
}
