import { beforeEach, describe, expect, it } from 'vitest';
import { exportBackup, importBackup, parseBackup, resetAllData } from '../backup';
import { db } from '../db';
import { createProject } from './projects';
import { carryOver, restorePlans, saveDayLog } from './shutdown';
import { completeTask, createTask } from './tasks';

// Saturday 2026-10-17, 18:00 local.
const NOW = new Date(2026, 9, 17, 18, 0, 0);
const TODAY = '2026-10-17';

async function seed() {
  const p = await createProject(
    { name: 'EE 577A', emoji: '🔲', color: 'indigo', kind: 'course' },
    NOW,
  );
  const mk = (title: string, extra: { isBig3?: boolean } = {}) =>
    createTask({ projectId: p.id, title, day: TODAY, weekStart: '2026-10-12', ...extra }, NOW);
  const a = (await mk('Open A', { isBig3: true })).task;
  const b = (await mk('Open B')).task;
  const c = (await mk('Done C')).task;
  await completeTask(c.id, NOW);
  return { a, b, c };
}

beforeEach(async () => {
  await resetAllData();
});

describe('daily shutdown', () => {
  it('carries unfinished tasks to the next day, dropping Big 3 across weeks, with undo', async () => {
    const { a, b, c } = await seed();
    // Sunday is a rest day, so "tomorrow" is Monday 2026-10-19 in the next week.
    const snap = await carryOver([a.id, b.id, c.id], 'tomorrow', '2026-10-19');
    expect(snap.map((s) => s.id)).toEqual([a.id, b.id]);
    const moved = await db.tasks.get(a.id);
    expect(moved).toMatchObject({ day: '2026-10-19', weekStart: '2026-10-19', isBig3: false });
    expect((await db.tasks.get(c.id))?.day).toBe(TODAY);

    await restorePlans(snap);
    expect(await db.tasks.get(a.id)).toMatchObject({
      day: TODAY,
      weekStart: '2026-10-12',
      isBig3: true,
    });
  });

  it('carries to the backlog of the next work day week', async () => {
    const { b } = await seed();
    await carryOver([b.id], 'backlog', '2026-10-19');
    const t = await db.tasks.get(b.id);
    expect(t?.day).toBeUndefined();
    expect(t?.weekStart).toBe('2026-10-19');
  });

  it('saves the day log and keeps it in backups', async () => {
    await saveDayLog({ date: TODAY, energy: 4, note: '  Good lab day.  ' }, NOW);
    expect(await db.dayLogs.get(TODAY)).toEqual({
      date: TODAY,
      shutdownAt: NOW.toISOString(),
      energy: 4,
      note: 'Good lab day.',
    });
    const backup = await exportBackup(NOW);
    expect(backup.schemaVersion).toBe(2);
    expect(backup.data.dayLogs).toHaveLength(1);
    await resetAllData();
    await importBackup(backup, 'replace');
    expect(await db.dayLogs.count()).toBe(1);
  });

  it('still reads schema 1 backups without day logs', async () => {
    const backup = await exportBackup(NOW);
    const { dayLogs: _d, ...data } = backup.data;
    const r = parseBackup(JSON.stringify({ ...backup, schemaVersion: 1, data }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.backup.data.dayLogs).toEqual([]);
  });
});
