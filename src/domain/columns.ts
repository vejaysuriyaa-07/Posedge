import type { Column, Project, ProjectKind, TaskStatus } from '../db/types';

export interface ColumnTemplate {
  key: string;
  label: string;
  columns: Column[];
}

export const COLUMN_TEMPLATES: ColumnTemplate[] = [
  {
    key: 'simple',
    label: 'To do / Doing / Done',
    columns: [
      { id: 'todo', name: 'To do' },
      { id: 'doing', name: 'Doing' },
      { id: 'done', name: 'Done' },
    ],
  },
  {
    key: 'course',
    label: 'To do / In progress / Submitted',
    columns: [
      { id: 'todo', name: 'To do' },
      { id: 'doing', name: 'In progress' },
      { id: 'done', name: 'Submitted' },
    ],
  },
  {
    key: 'learning',
    label: 'Queue / Studying / Learned',
    columns: [
      { id: 'todo', name: 'Queue' },
      { id: 'doing', name: 'Studying' },
      { id: 'done', name: 'Learned' },
    ],
  },
  {
    key: 'pipeline',
    label: 'Wishlist / Applied / OA / Interview / Offer / Rejected',
    columns: [
      { id: 'wishlist', name: 'Wishlist' },
      { id: 'applied', name: 'Applied' },
      { id: 'oa', name: 'OA' },
      { id: 'interview', name: 'Interview' },
      { id: 'offer', name: 'Offer' },
      { id: 'rejected', name: 'Rejected' },
    ],
  },
];

export function templateFor(key: string): ColumnTemplate {
  return COLUMN_TEMPLATES.find((t) => t.key === key) ?? COLUMN_TEMPLATES[0]!;
}

export function defaultTemplateKey(kind: ProjectKind): string {
  if (kind === 'pipeline') return 'pipeline';
  if (kind === 'course') return 'course';
  if (kind === 'learning' || kind === 'prep') return 'learning';
  return 'simple';
}

type ProjectColumns = Pick<Project, 'kind' | 'columns'>;

const PIPELINE_DONE = new Set(['offer', 'rejected']);

function isPipelineDone(project: ProjectColumns, column: Column): boolean {
  return (
    project.kind === 'pipeline' &&
    (PIPELINE_DONE.has(column.id) || PIPELINE_DONE.has(column.name.trim().toLowerCase()))
  );
}

/**
 * Board semantics: the first column means todo, the last means done, anything in between means doing.
 * Pipeline projects treat both Offer and Rejected as done.
 */
export function columnStatus(project: ProjectColumns, columnId: string): TaskStatus {
  const cols = project.columns;
  const idx = cols.findIndex((c) => c.id === columnId);
  if (idx < 0) return 'todo';
  if (isPipelineDone(project, cols[idx]!)) return 'done';
  if (idx === 0) return 'todo';
  if (idx === cols.length - 1) return 'done';
  return 'doing';
}

/** Offer gets bonus XP; Rejected doesn't. */
export function isOfferColumn(project: ProjectColumns, columnId: string): boolean {
  if (project.kind !== 'pipeline') return false;
  const col = project.columns.find((c) => c.id === columnId);
  return !!col && (col.id === 'offer' || col.name.trim().toLowerCase() === 'offer');
}

export function firstColumnId(project: ProjectColumns): string {
  return project.columns[0]!.id;
}

/** Column a task lands in when it is ticked complete: the last column (for pipelines, the last done column). */
export function doneColumnId(project: ProjectColumns): string {
  return project.columns[project.columns.length - 1]!.id;
}

export function doingColumnId(project: ProjectColumns): string {
  const cols = project.columns;
  const doing = cols.find((c) => columnStatus(project, c.id) === 'doing');
  return (doing ?? cols[0]!).id;
}

/** Column matching a status, keeping the current column when it already matches. */
export function columnForStatus(
  project: ProjectColumns,
  status: TaskStatus,
  currentColumnId?: string,
): string {
  if (currentColumnId && columnStatus(project, currentColumnId) === status) return currentColumnId;
  if (status === 'todo') return firstColumnId(project);
  if (status === 'doing') return doingColumnId(project);
  return doneColumnId(project);
}
