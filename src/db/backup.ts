import { z } from 'zod';
import { db, getSettings, TABLE_NAMES, updateSettings } from './db';
import {
  ActivityDaySchema,
  DayLogSchema,
  DEFAULT_SETTINGS,
  FocusSessionSchema,
  ImportBatchSchema,
  MilestoneSchema,
  ProjectSchema,
  ReviewCardSchema,
  ReviewLogSchema,
  SCHEMA_VERSION,
  SettingsSchema,
  TaskSchema,
  WeeklyReviewSchema,
} from './types';

/** Loose settings on import: missing fields fall back to defaults, unknown keys are dropped. */
const ImportedSettingsSchema = SettingsSchema.partial().extend({ id: z.literal('settings') });

export const BackupSchema = z.object({
  app: z.literal('posedge'),
  schemaVersion: z.number().int().positive(),
  exportedAt: z.string(),
  data: z.object({
    projects: z.array(ProjectSchema),
    milestones: z.array(MilestoneSchema),
    tasks: z.array(TaskSchema),
    reviewCards: z.array(ReviewCardSchema),
    reviewLogs: z.array(ReviewLogSchema),
    activityDays: z.array(ActivityDaySchema),
    focusSessions: z.array(FocusSessionSchema),
    weeklyReviews: z.array(WeeklyReviewSchema),
    importBatches: z.array(ImportBatchSchema),
    settings: z.array(ImportedSettingsSchema),
    /** Added in schema 2; older backups don't have it. */
    dayLogs: z.array(DayLogSchema).default([]),
  }),
});
export type Backup = z.infer<typeof BackupSchema>;

export async function exportBackup(
  now: Date = new Date(),
  opts: { includeApiKey?: boolean } = {},
): Promise<Backup> {
  return db.transaction(
    'r',
    TABLE_NAMES.map((n) => db.table(n)),
    async () => {
      const data = Object.fromEntries(
        await Promise.all(TABLE_NAMES.map(async (n) => [n, await db.table(n).toArray()] as const)),
      ) as Backup['data'];
      // The Anthropic API key stays out of backups unless explicitly included; the inbox token
      // always does (it's read-only and quick to recreate).
      data.settings = data.settings.map(({ aiApiKey, inboxToken: _token, ...rest }) =>
        opts.includeApiKey && aiApiKey !== undefined ? { ...rest, aiApiKey } : rest,
      );
      return { app: 'posedge', schemaVersion: SCHEMA_VERSION, exportedAt: now.toISOString(), data };
    },
  );
}

export function backupFileName(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `posedge-backup-${y}-${m}-${d}.json`;
}

/** Serializes a backup and records `lastBackupAt`. */
export async function exportBackupJson(now: Date = new Date()): Promise<string> {
  const s = await getSettings();
  const backup = await exportBackup(now, { includeApiKey: s.aiKeyInBackup });
  await updateSettings({ lastBackupAt: now.toISOString() });
  return JSON.stringify(backup, null, 2);
}

export type ParseBackupResult = { ok: true; backup: Backup } | { ok: false; errors: string[] };

export function parseBackup(text: string): ParseBackupResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`Not valid JSON: ${(e as Error).message}`] };
  }
  const r = BackupSchema.safeParse(json);
  if (!r.success) {
    return {
      ok: false,
      errors: r.error.issues
        .slice(0, 8)
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  }
  if (r.data.schemaVersion > SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [
        `This backup is from a newer Posedge (schema ${r.data.schemaVersion}). Update the app first.`,
      ],
    };
  }
  return { ok: true, backup: r.data };
}

type Row = Record<string, unknown>;

/** Primary key per table. */
const KEYS: Record<(typeof TABLE_NAMES)[number], string> = {
  projects: 'id',
  milestones: 'id',
  tasks: 'id',
  reviewCards: 'id',
  reviewLogs: 'id',
  activityDays: 'date',
  focusSessions: 'id',
  weeklyReviews: 'weekStart',
  importBatches: 'id',
  settings: 'id',
  dayLogs: 'date',
};

/** Best-effort "last modified" for merge conflicts (newer wins). */
function stamp(row: Row): string {
  for (const k of [
    'completedAt',
    'doneAt',
    'reviewedAt',
    'lastBackupAt',
    'shutdownAt',
    'createdAt',
    'startedAt',
  ]) {
    const v = row[k];
    if (typeof v === 'string') return v;
  }
  if (row.fsrs && typeof row.fsrs === 'object') {
    const lr = (row.fsrs as Row).last_review;
    if (typeof lr === 'string') return lr;
  }
  return '';
}

/**
 * Restores a backup. `replace` wipes everything first; `merge` upserts by id, keeping
 * whichever record looks newer. Runs in one transaction.
 */
export async function importBackup(backup: Backup, mode: 'merge' | 'replace'): Promise<void> {
  const tables = TABLE_NAMES.map((n) => db.table(n));
  await db.transaction('rw', tables, async () => {
    if (mode === 'replace') {
      await Promise.all(tables.map((t) => t.clear()));
    }
    for (const name of TABLE_NAMES) {
      const rows = backup.data[name] as Row[];
      if (name === 'settings') {
        const incoming = rows[0];
        if (!incoming) continue;
        const current = mode === 'replace' ? DEFAULT_SETTINGS : await getSettings();
        await db.settings.put({ ...DEFAULT_SETTINGS, ...current, ...incoming, id: 'settings' });
        continue;
      }
      const table = db.table(name);
      if (mode === 'replace') {
        await table.bulkPut(rows);
        continue;
      }
      const key = KEYS[name];
      for (const row of rows) {
        const existing = (await table.get(row[key] as string)) as Row | undefined;
        if (!existing || stamp(row) >= stamp(existing)) await table.put(row);
      }
    }
  });
}

export async function resetAllData(): Promise<void> {
  const tables = TABLE_NAMES.map((n) => db.table(n));
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()));
  });
}
