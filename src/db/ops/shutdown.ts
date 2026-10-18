import { mondayOf } from '../../domain/week';
import { db } from '../db';
import type { DayLog, Task } from '../types';
import { moveTask } from './tasks';

/** A task's plan before a carry-over, so it can be undone exactly. */
export type PlanSnapshot = Pick<Task, 'id' | 'weekStart' | 'day' | 'isBig3' | 'order'>;

/**
 * Moves unfinished tasks to `day` ("tomorrow"), or to the backlog of that day's week. Returns
 * what they were, for undo. Completed tasks are left alone.
 */
export async function carryOver(
  ids: string[],
  target: 'tomorrow' | 'backlog',
  day: string,
): Promise<PlanSnapshot[]> {
  return db.transaction('rw', db.tasks, async () => {
    const tasks = (await db.tasks.bulkGet(ids)).filter(
      (t): t is Task => !!t && t.status !== 'done',
    );
    for (const t of tasks) {
      await moveTask(
        t.id,
        target === 'tomorrow' ? { day } : { weekStart: mondayOf(day), day: null },
      );
    }
    return tasks.map(({ id, weekStart, day: d, isBig3, order }) => ({
      id,
      weekStart,
      day: d,
      isBig3,
      order,
    }));
  });
}

/** Puts tasks back where a carry-over found them. */
export async function restorePlans(snapshots: PlanSnapshot[]): Promise<void> {
  await db.transaction('rw', db.tasks, async () => {
    for (const s of snapshots) {
      const t = await db.tasks.get(s.id);
      if (!t) continue;
      const { weekStart: _w, day: _d, ...rest } = t;
      await db.tasks.put({
        ...rest,
        ...(s.weekStart ? { weekStart: s.weekStart } : {}),
        ...(s.day ? { day: s.day } : {}),
        isBig3: s.isBig3,
        order: s.order,
      });
    }
  });
}

/** Records the day as closed, with the optional energy rating and note. */
export async function saveDayLog(
  input: { date: string; energy?: number; note?: string },
  now: Date = new Date(),
): Promise<DayLog> {
  const note = input.note?.trim().slice(0, 500);
  const log: DayLog = {
    date: input.date,
    shutdownAt: now.toISOString(),
    ...(input.energy ? { energy: input.energy } : {}),
    ...(note ? { note } : {}),
  };
  await db.dayLogs.put(log);
  return log;
}
