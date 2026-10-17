import { defaultTemplateKey } from '../../domain/columns';
import type { ParsedPlan } from '../../domain/planParser';
import { COLOR_KEYS, type ColorKey, type ImportBatch, type ProjectKind } from '../types';
import { db, newId, nowIso } from '../db';
import { createMilestone } from './milestones';
import { createProject } from './projects';
import { createTask } from './tasks';

export const KIND_EMOJI: Record<ProjectKind, string> = {
  course: '📘',
  work: '💼',
  prep: '🎯',
  learning: '📚',
  passion: '✨',
  pipeline: '🚀',
};

/** Keys used by the import preview checkboxes. */
export const selKey = {
  project: (pi: number) => `p:${pi}`,
  milestone: (pi: number, mi: number) => `m:${pi}:${mi}`,
  task: (pi: number, ti: number) => `t:${pi}:${ti}`,
};

/** Everything ticked by default. */
export function selectAll(plan: ParsedPlan): Set<string> {
  const keys = new Set<string>();
  plan.projects.forEach((p, pi) => {
    keys.add(selKey.project(pi));
    p.milestones.forEach((_, mi) => keys.add(selKey.milestone(pi, mi)));
    p.tasks.forEach((_, ti) => keys.add(selKey.task(pi, ti)));
  });
  return keys;
}

export interface ImportResult {
  batch: ImportBatch;
  big3Dropped: number;
}

/**
 * Commits the ticked parts of a parsed plan in one transaction and records an ImportBatch
 * so the whole import can be undone. Unticking a project skips its milestones and tasks.
 */
export async function commitImport(
  plan: ParsedPlan,
  selected: Set<string>,
  rawText: string,
  now: Date = new Date(),
): Promise<ImportResult> {
  return db.transaction(
    'rw',
    [
      db.projects,
      db.milestones,
      db.tasks,
      db.importBatches,
      db.settings,
      db.activityDays,
      db.reviewCards,
    ],
    async () => {
      const batchId = newId();
      const created = {
        projects: [] as string[],
        milestones: [] as string[],
        tasks: [] as string[],
      };
      const usedColors = new Set<ColorKey>((await db.projects.toArray()).map((p) => p.color));
      let big3Dropped = 0;
      for (const [pi, p] of plan.projects.entries()) {
        if (!selected.has(selKey.project(pi))) continue;
        let projectId = p.match?.id;
        if (projectId && !(await db.projects.get(projectId))) projectId = undefined;
        if (!projectId) {
          const kind = p.kind ?? 'learning';
          const color = p.color ?? COLOR_KEYS.find((c) => !usedColors.has(c)) ?? 'violet';
          usedColors.add(color);
          const project = await createProject(
            {
              name: p.name,
              emoji: KIND_EMOJI[kind],
              color,
              kind,
              templateKey: defaultTemplateKey(kind),
            },
            now,
          );
          projectId = project.id;
          created.projects.push(projectId);
        }
        for (const [mi, m] of p.milestones.entries()) {
          if (!selected.has(selKey.milestone(pi, mi))) continue;
          const ms = await createMilestone({ projectId, title: m.title, weekStart: m.weekStart });
          created.milestones.push(ms.id);
        }
        for (const [ti, t] of p.tasks.entries()) {
          if (!selected.has(selKey.task(pi, ti))) continue;
          const { task, big3Full } = await createTask(
            {
              projectId,
              title: t.title,
              notes: t.notes,
              kind: t.kind,
              priority: t.priority,
              estimateMin: t.estimateMin,
              weekStart: t.weekStart,
              day: t.day,
              dueDate: t.dueDate,
              isBig3: t.isBig3,
              status: t.done ? 'done' : 'todo',
              source: 'import',
              importBatchId: batchId,
            },
            now,
          );
          if (big3Full) big3Dropped++;
          created.tasks.push(task.id);
        }
      }
      const batch: ImportBatch = {
        id: batchId,
        createdAt: nowIso(now),
        rawText,
        created,
        summary: `${created.tasks.length} tasks, ${created.milestones.length} milestones, ${created.projects.length} new projects`,
      };
      await db.importBatches.add(batch);
      return { batch, big3Dropped };
    },
  );
}

/**
 * Deletes what an import created. Projects it created are removed only if nothing else
 * has been added to them since.
 */
export async function undoImport(batchId: string, now: Date = new Date()): Promise<boolean> {
  return db.transaction(
    'rw',
    [db.projects, db.milestones, db.tasks, db.importBatches],
    async () => {
      const batch = await db.importBatches.get(batchId);
      if (!batch || batch.undoneAt) return false;
      await db.tasks.bulkDelete(batch.created.tasks);
      await db.milestones.bulkDelete(batch.created.milestones);
      for (const pid of batch.created.projects) {
        const tasksLeft = await db.tasks.where('projectId').equals(pid).count();
        const msLeft = await db.milestones.where('projectId').equals(pid).count();
        if (!tasksLeft && !msLeft) await db.projects.delete(pid);
      }
      await db.importBatches.put({ ...batch, undoneAt: nowIso(now) });
      return true;
    },
  );
}
