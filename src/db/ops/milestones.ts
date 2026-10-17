import { mondayOf, todayStr } from '../../domain/week';
import { levelInfo, levelUps, XP, type LevelInfo } from '../../domain/xp';
import { db, newId, nowIso } from '../db';
import type { Milestone } from '../types';
import { addXp } from './activity';
import { clean } from './tasks';

export async function createMilestone(input: {
  projectId: string;
  title: string;
  weekStart: string;
  seeded?: boolean;
}): Promise<Milestone> {
  return db.transaction('rw', db.milestones, async () => {
    const siblings = await db.milestones.where('projectId').equals(input.projectId).toArray();
    const m: Milestone = clean({
      id: newId(),
      projectId: input.projectId,
      title: input.title.trim(),
      weekStart: mondayOf(input.weekStart),
      done: false,
      order: siblings.length + 1,
      seeded: input.seeded,
    });
    await db.milestones.add(m);
    return m;
  });
}

export async function updateMilestone(
  id: string,
  patch: Partial<Pick<Milestone, 'title' | 'weekStart'>>,
): Promise<void> {
  await db.milestones.update(id, {
    ...patch,
    ...(patch.weekStart ? { weekStart: mondayOf(patch.weekStart) } : {}),
  });
}

export interface MilestoneToggleResult {
  done: boolean;
  next?: Milestone;
  levelBefore: LevelInfo;
  levelAfter: LevelInfo;
  levelsGained: number;
}

/** Completing a milestone grants +100 XP (reversed when un-ticked) and reports the next one. */
export async function toggleMilestone(
  id: string,
  now: Date = new Date(),
): Promise<MilestoneToggleResult | null> {
  return db.transaction('rw', [db.milestones, db.settings, db.activityDays], async () => {
    const m = await db.milestones.get(id);
    if (!m) return null;
    const done = !m.done;
    const updated = clean({ ...m, done, doneAt: done ? nowIso(now) : undefined });
    await db.milestones.put(updated);
    const date = done ? todayStr(now) : m.doneAt ? todayStr(new Date(m.doneAt)) : todayStr(now);
    const change = await addXp(done ? XP.milestone : -XP.milestone, date);
    const siblings = await db.milestones.where('projectId').equals(m.projectId).toArray();
    const next = siblings
      .filter((s) => !s.done && s.id !== id)
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.order - b.order)[0];
    return {
      done,
      next,
      levelBefore: levelInfo(change.before),
      levelAfter: levelInfo(change.after),
      levelsGained: levelUps(change.before, change.after),
    };
  });
}

export async function deleteMilestone(id: string): Promise<void> {
  await db.transaction('rw', [db.milestones, db.tasks], async () => {
    const linked = await db.tasks.filter((t) => t.milestoneId === id).toArray();
    for (const t of linked) {
      const { milestoneId: _m, ...rest } = t;
      await db.tasks.put(rest);
    }
    await db.milestones.delete(id);
  });
}
