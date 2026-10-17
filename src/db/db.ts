import Dexie, { type EntityTable } from 'dexie';
import {
  DEFAULT_SETTINGS,
  type ActivityDay,
  type FocusSession,
  type ImportBatch,
  type Milestone,
  type Project,
  type ReviewCard,
  type ReviewLog,
  type Settings,
  type Task,
  type WeeklyReview,
} from './types';

export class PosedgeDB extends Dexie {
  projects!: EntityTable<Project, 'id'>;
  milestones!: EntityTable<Milestone, 'id'>;
  tasks!: EntityTable<Task, 'id'>;
  reviewCards!: EntityTable<ReviewCard, 'id'>;
  reviewLogs!: EntityTable<ReviewLog, 'id'>;
  activityDays!: EntityTable<ActivityDay, 'date'>;
  focusSessions!: EntityTable<FocusSession, 'id'>;
  weeklyReviews!: EntityTable<WeeklyReview, 'weekStart'>;
  importBatches!: EntityTable<ImportBatch, 'id'>;
  settings!: EntityTable<Settings, 'id'>;

  constructor(name = 'posedge') {
    super(name);
    // Note: IndexedDB cannot index boolean values, so `archived`, `isBig3`, `queued` and `suspended`
    // indexes never match a query; the app filters those fields in memory (see DECISIONS.md).
    this.version(1).stores({
      projects: 'id, order, archived',
      milestones: 'id, projectId, weekStart',
      tasks: 'id, projectId, status, weekStart, day, dueDate, completedAt, isBig3, importBatchId',
      reviewCards: 'id, projectId, taskId, due, queued, suspended',
      reviewLogs: 'id, cardId, reviewedAt',
      activityDays: 'date',
      focusSessions: 'id, projectId, startedAt',
      weeklyReviews: 'weekStart',
      importBatches: 'id, createdAt',
      settings: 'id',
    });
  }
}

export const db = new PosedgeDB();

/** Every table, in a stable order (used by backups and "reset all data"). */
export const TABLE_NAMES = [
  'projects',
  'milestones',
  'tasks',
  'reviewCards',
  'reviewLogs',
  'activityDays',
  'focusSessions',
  'weeklyReviews',
  'importBatches',
  'settings',
] as const;
export type TableName = (typeof TABLE_NAMES)[number];

export function allTables() {
  return TABLE_NAMES.map((n) => db.table(n));
}

/** Settings merged over defaults (new fields added in later versions get their default). */
export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('settings');
  return { ...DEFAULT_SETTINGS, ...s, id: 'settings' };
}

export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<Settings> {
  return db.transaction('rw', db.settings, async () => {
    const next = { ...(await getSettings()), ...patch, id: 'settings' as const };
    await db.settings.put(next);
    return next;
  });
}

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(now: Date = new Date()): string {
  return now.toISOString();
}
