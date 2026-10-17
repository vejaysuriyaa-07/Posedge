import { buildSnapshot, type Snapshot } from '../../ai/context';
import { currentStreak } from '../../domain/streak';
import { dateOfIso, endOfDay, todayStr } from '../../domain/week';
import { levelInfo } from '../../domain/xp';
import { db, getSettings } from '../db';

/** Adds a response's token usage to this month's counter (resets when the month changes). */
export async function recordAiUsage(
  usage: { inputTokens: number; outputTokens: number },
  now: Date = new Date(),
): Promise<void> {
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  await db.transaction('rw', db.settings, async () => {
    const s = await getSettings();
    const cur =
      s.aiUsage?.month === month
        ? s.aiUsage
        : { month, inputTokens: 0, outputTokens: 0, requests: 0 };
    await db.settings.put({
      ...s,
      aiUsage: {
        month,
        inputTokens: cur.inputTokens + usage.inputTokens,
        outputTokens: cur.outputTokens + usage.outputTokens,
        requests: cur.requests + 1,
      },
    });
  });
}

/** Reads everything the AI snapshot needs in one consistent read transaction. */
export async function loadSnapshot(now: Date = new Date()): Promise<Snapshot> {
  const today = todayStr(now);
  return db.transaction(
    'r',
    [db.projects, db.milestones, db.tasks, db.reviewCards, db.activityDays, db.settings],
    async () => {
      const [settings, projects, milestones, tasks, cards, days] = await Promise.all([
        getSettings(),
        db.projects.toArray(),
        db.milestones.toArray(),
        db.tasks.toArray(),
        db.reviewCards.toArray(),
        db.activityDays.toArray(),
      ]);
      const streak = currentStreak({
        days: Object.fromEntries(days.map((d) => [d.date, d])),
        today,
        restDays: settings.restDays,
        vacationFrom:
          settings.vacationMode && settings.vacationStartedAt
            ? dateOfIso(settings.vacationStartedAt)
            : undefined,
      });
      const level = levelInfo(settings.xpTotal);
      const endIso = endOfDay(today).toISOString();
      return buildSnapshot({
        now,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        settings,
        projects,
        milestones,
        tasks,
        cards,
        stats: {
          streak: streak.count,
          longestStreak: Math.max(settings.longestStreak, streak.count),
          freezes: settings.freezes,
          level: level.level,
          levelTitle: level.title,
          xpTotal: settings.xpTotal,
          reviewsDueToday: settings.vacationMode
            ? 0
            : Math.min(
                settings.dailyReviewCap,
                cards.filter((c) => !c.suspended && !c.queued && c.due <= endIso).length,
              ),
          tasksDoneToday: tasks.filter((t) => t.completedAt && dateOfIso(t.completedAt) === today)
            .length,
        },
      });
    },
  );
}
