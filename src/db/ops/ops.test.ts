import { beforeEach, describe, expect, it } from 'vitest';
import { parsePlan, PLAN_EXAMPLE } from '../../domain/planParser';
import { exportBackup, importBackup, parseBackup, resetAllData } from '../backup';
import { db, getSettings, updateSettings } from '../db';
import { loadTemplate, removeSampleData } from '../seed';
import { commitImport, selectAll, undoImport } from './import';
import { toggleMilestone, createMilestone } from './milestones';
import { createProject } from './projects';
import { createCards, rateReviewCard, releaseQueuedCards } from './review';
import { completeTask, createTask, uncompleteTask, updateTask } from './tasks';

// Saturday 2026-10-17, 10:00 local (America/Los_Angeles).
const NOW = new Date(2026, 9, 17, 10, 0, 0);

async function project(kind: 'course' | 'pipeline' = 'course') {
  return createProject(
    {
      name: kind === 'pipeline' ? 'Jobs' : 'EE 577A',
      emoji: '🔲',
      color: 'indigo',
      kind,
      templateKey: kind === 'pipeline' ? 'pipeline' : 'simple',
    },
    NOW,
  );
}

beforeEach(async () => {
  await resetAllData();
});

describe('completion loop', () => {
  it('awards XP, counts the day and reverses exactly on un-complete', async () => {
    const p = await project();
    const { task } = await createTask(
      { projectId: p.id, title: 'Lab', priority: 1, kind: 'learn', day: '2026-10-17' },
      NOW,
    );
    const r = await completeTask(task.id, NOW);
    expect(r?.xp.total).toBe(20); // 10 x 1.5 = 15, +5 learn
    expect((await getSettings()).xpTotal).toBe(20);
    const day = await db.activityDays.get('2026-10-17');
    expect(day).toMatchObject({ tasksDone: 1, xp: 20 });
    const done = await db.tasks.get(task.id);
    expect(done).toMatchObject({
      status: 'done',
      columnId: 'done',
      needsCards: true,
      xpAwarded: 20,
    });

    await uncompleteTask(task.id, NOW);
    expect((await getSettings()).xpTotal).toBe(0);
    expect(await db.activityDays.get('2026-10-17')).toMatchObject({ tasksDone: 0, xp: 0 });
    const back = await db.tasks.get(task.id);
    expect(back?.status).toBe('todo');
    expect(back?.completedAt).toBeUndefined();
    expect(back?.needsCards).toBeUndefined();
  });

  it('grants the all-Big-3 bonus once and takes it back when a Big 3 task is reopened', async () => {
    const p = await project();
    const ids: string[] = [];
    for (const title of ['A', 'B', 'C']) {
      const { task } = await createTask(
        { projectId: p.id, title, weekStart: '2026-10-12', isBig3: true },
        NOW,
      );
      ids.push(task.id);
    }
    const fourth = await createTask(
      { projectId: p.id, title: 'D', weekStart: '2026-10-12', isBig3: true },
      NOW,
    );
    expect(fourth.big3Full).toBe(true);
    expect(fourth.task.isBig3).toBe(false);

    await completeTask(ids[0]!, NOW);
    await completeTask(ids[1]!, NOW);
    const last = await completeTask(ids[2]!, NOW);
    expect(last?.allBig3).toBe(true);
    expect(last?.xp.total).toBe(10 + 25 + 50);
    expect((await getSettings()).xpTotal).toBe(35 * 3 + 50);

    // Reopening a different Big 3 task removes the bonus from the task that holds it.
    await uncompleteTask(ids[0]!, NOW);
    expect((await getSettings()).xpTotal).toBe(35 * 2);
    expect((await getSettings()).big3BonusWeeks).toEqual([]);
    const again = await completeTask(ids[0]!, NOW);
    expect(again?.allBig3).toBe(true);
    expect((await getSettings()).xpTotal).toBe(35 * 3 + 50);
  });

  it('syncs board columns with status, with the offer bonus only for Offer', async () => {
    const p = await project('pipeline');
    const { task } = await createTask({ projectId: p.id, title: 'NVIDIA DV' }, NOW);
    expect(task.columnId).toBe('wishlist');
    await updateTask(task.id, { columnId: 'interview' }, NOW);
    expect((await db.tasks.get(task.id))?.status).toBe('doing');
    const offer = await updateTask(task.id, { columnId: 'offer' }, NOW);
    expect(offer.completion?.offer).toBe(true);
    expect((await getSettings()).xpTotal).toBe(60);
    await updateTask(task.id, { columnId: 'rejected' }, NOW);
    expect((await db.tasks.get(task.id))?.status).toBe('done');
    expect((await getSettings()).xpTotal).toBe(10);
  });

  it('keeps weekStart on the Monday of day', async () => {
    const p = await project();
    const { task } = await createTask({ projectId: p.id, title: 'x', day: '2026-10-22' }, NOW);
    expect(task.weekStart).toBe('2026-10-19');
    await updateTask(task.id, { day: '2026-10-28' }, NOW);
    expect(await db.tasks.get(task.id)).toMatchObject({
      day: '2026-10-28',
      weekStart: '2026-10-26',
    });
    await updateTask(task.id, { weekStart: null }, NOW);
    const t = await db.tasks.get(task.id);
    expect(t?.weekStart).toBeUndefined();
    expect(t?.day).toBeUndefined();
  });

  it('milestones grant +100 and report the next one', async () => {
    const p = await project();
    const m1 = await createMilestone({ projectId: p.id, title: 'One', weekStart: '2026-10-21' });
    await createMilestone({ projectId: p.id, title: 'Two', weekStart: '2026-11-04' });
    expect(m1.weekStart).toBe('2026-10-19');
    const r = await toggleMilestone(m1.id, NOW);
    expect(r?.next?.title).toBe('Two');
    expect((await getSettings()).xpTotal).toBe(100);
    await toggleMilestone(m1.id, NOW);
    expect((await getSettings()).xpTotal).toBe(0);
  });
});

describe('review cards', () => {
  it('queues cards past the daily new-card limit and releases them FIFO later', async () => {
    const p = await project();
    await updateSettings({ newCardsPerDay: 2 });
    const { task } = await createTask({ projectId: p.id, title: 'SVA', kind: 'learn' }, NOW);
    await completeTask(task.id, NOW);
    const r = await createCards(
      ['a', 'b', 'c'].map((x) => ({ projectId: p.id, taskId: task.id, prompt: x, answer: x })),
      NOW,
    );
    expect(r.queued).toBe(1);
    expect((await db.tasks.get(task.id))?.needsCards).toBeUndefined();
    const cards = (await db.reviewCards.toArray()).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
    expect(cards.map((c) => c.queued)).toEqual([false, false, true]);
    // First due tomorrow at 04:00 local.
    expect(new Date(cards[0]!.due)).toEqual(new Date(2026, 9, 18, 4, 0, 0));

    expect(await releaseQueuedCards(NOW)).toBe(0);
    const tomorrow = new Date(2026, 9, 18, 9, 0, 0);
    expect(await releaseQueuedCards(tomorrow)).toBe(1);
    expect((await db.reviewCards.get(cards[2]!.id))?.queued).toBe(false);
  });

  it('rating logs the review and credits the day', async () => {
    const p = await project();
    const { cards } = await createCards([{ projectId: p.id, prompt: 'q', answer: 'a' }], NOW);
    const later = new Date(2026, 9, 18, 9, 0, 0);
    const r = await rateReviewCard(cards[0]!.id, 3, 4200, later);
    expect(r?.xp).toBe(2);
    expect(await db.reviewLogs.count()).toBe(1);
    expect(await db.activityDays.get('2026-10-18')).toMatchObject({ reviewsDone: 1, xp: 2 });
    expect(new Date(r!.card.due).getTime()).toBeGreaterThan(later.getTime());
  });
});

describe('import', () => {
  it('commits a parsed plan and undo removes what it created', async () => {
    const plan = parsePlan(PLAN_EXAMPLE, { today: '2026-10-17', projects: [] });
    const { batch } = await commitImport(plan, selectAll(plan), PLAN_EXAMPLE, NOW);
    expect(batch.created.projects).toHaveLength(2);
    expect(batch.created.tasks).toHaveLength(6);
    expect(batch.created.milestones).toHaveLength(1);
    const isp = (await db.projects.toArray()).find((p) => p.name === 'Camera ISP');
    expect(isp).toMatchObject({ color: 'teal', kind: 'passion' });
    const demosaic = (await db.tasks.toArray()).find((t) =>
      t.title.startsWith('Implement bilinear'),
    );
    expect(demosaic).toMatchObject({
      day: '2026-10-19',
      weekStart: '2026-10-19',
      estimateMin: 120,
      priority: 1,
      kind: 'learn',
      source: 'import',
    });

    expect(await undoImport(batch.id, NOW)).toBe(true);
    expect(await db.tasks.count()).toBe(0);
    expect(await db.projects.count()).toBe(0);
    expect((await db.importBatches.get(batch.id))?.undoneAt).toBeDefined();
  });

  it('matches existing projects instead of creating duplicates', async () => {
    const existing = await createProject(
      { name: 'Camera ISP + Tiny Tapeout', emoji: '📷', color: 'teal', kind: 'passion' },
      NOW,
    );
    const projects = await db.projects.toArray();
    const plan = parsePlan(PLAN_EXAMPLE, { today: '2026-10-17', projects });
    expect(plan.projects[0]?.match?.id).toBe(existing.id);
    const { batch } = await commitImport(plan, selectAll(plan), PLAN_EXAMPLE, NOW);
    expect(batch.created.projects).toHaveLength(1);
    await undoImport(batch.id, NOW);
    expect(await db.projects.get(existing.id)).toBeDefined();
  });
});

describe('template and backup', () => {
  it('loads the starter template once and removes sample tasks', async () => {
    expect(await loadTemplate(NOW)).toBe(10);
    expect(await loadTemplate(NOW)).toBe(0);
    expect(await db.milestones.count()).toBe(14);
    expect(await db.reviewCards.count()).toBe(3);
    const seededTasks = await db.tasks.filter((t) => !!t.seeded).count();
    expect(seededTasks).toBeGreaterThanOrEqual(20);
    // Saturday: only Sat/Sun are open, so nothing is planned on a past day.
    const days = (await db.tasks.toArray()).map((t) => t.day).filter(Boolean) as string[];
    expect(days.every((d) => d >= '2026-10-17')).toBe(true);
    const removed = await removeSampleData();
    expect(removed.cards).toBe(3);
    expect(await db.tasks.count()).toBe(0);
    expect(await db.projects.count()).toBe(10);
  });

  it('round-trips: export, wipe, import, deep-equal', async () => {
    await loadTemplate(NOW);
    const t = (await db.tasks.toArray())[0]!;
    await completeTask(t.id, NOW);
    const before = await exportBackup(NOW);
    const json = JSON.stringify(before);
    await resetAllData();
    expect(await db.tasks.count()).toBe(0);
    const parsed = parseBackup(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    await importBackup(parsed.backup, 'replace');
    const after = await exportBackup(NOW);
    expect(after).toEqual(before);
  });

  it('rejects malformed backups with readable errors', () => {
    expect(parseBackup('nope').ok).toBe(false);
    const r = parseBackup(
      JSON.stringify({
        app: 'posedge',
        schemaVersion: 1,
        exportedAt: 'x',
        data: { projects: [{}] },
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/data\./);
  });

  it('merge keeps newer records', async () => {
    const p = await project();
    const { task } = await createTask({ projectId: p.id, title: 'Old' }, NOW);
    const backup = await exportBackup(NOW);
    await updateTask(task.id, { title: 'Edited locally' }, NOW);
    await completeTask(task.id, new Date(2026, 9, 18));
    await importBackup(backup, 'merge');
    expect((await db.tasks.get(task.id))?.title).toBe('Edited locally');
  });
});
