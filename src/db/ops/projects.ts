import { templateFor } from '../../domain/columns';
import { db, newId, nowIso } from '../db';
import type { ColorKey, Column, Project, ProjectKind } from '../types';
import { clean } from './tasks';

export interface ProjectInput {
  name: string;
  emoji: string;
  color: ColorKey;
  kind: ProjectKind;
  templateKey?: string;
  columns?: Column[];
  description?: string;
  targetDate?: string;
  seeded?: boolean;
}

export async function createProject(input: ProjectInput, now: Date = new Date()): Promise<Project> {
  return db.transaction('rw', db.projects, async () => {
    const last = await db.projects.orderBy('order').last();
    const project: Project = clean({
      id: newId(),
      name: input.name.trim(),
      emoji: input.emoji,
      color: input.color,
      kind: input.kind,
      description: input.description?.trim() || undefined,
      columns: input.columns ?? templateFor(input.templateKey ?? 'simple').columns,
      archived: false,
      order: (last?.order ?? 0) + 1,
      createdAt: nowIso(now),
      targetDate: input.targetDate,
      seeded: input.seeded,
    });
    await db.projects.add(project);
    return project;
  });
}

export async function updateProject(
  id: string,
  patch: Partial<Omit<Project, 'id'>>,
): Promise<void> {
  await db.projects.update(id, patch);
}

export async function setProjectArchived(id: string, archived: boolean): Promise<void> {
  await db.projects.update(id, { archived });
}

export async function reorderProjects(orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.projects, async () => {
    await Promise.all(orderedIds.map((id, i) => db.projects.update(id, { order: i + 1 })));
  });
}

/** Deletes a project with its milestones, tasks and review cards (logs and XP history stay). */
export async function deleteProject(id: string): Promise<void> {
  await db.transaction('rw', [db.projects, db.milestones, db.tasks, db.reviewCards], async () => {
    await db.tasks.where('projectId').equals(id).delete();
    await db.milestones.where('projectId').equals(id).delete();
    await db.reviewCards.where('projectId').equals(id).delete();
    await db.projects.delete(id);
  });
}
