import { focusXp, levelInfo, levelUps, type LevelInfo } from '../../domain/xp';
import { todayStr } from '../../domain/week';
import { db, newId, nowIso } from '../db';
import { addXp, bumpDay } from './activity';
import { bumpLongestStreak } from './streak';

export interface FocusResult {
  minutes: number;
  xp: number;
  levelAfter: LevelInfo;
  levelsGained: number;
}

/** Logs a focus session: FocusSession row, the day's focus minutes and 1 XP per 5 minutes. */
export async function logFocusSession(
  input: { projectId: string; taskId?: string; startedAt: string; minutes: number },
  now: Date = new Date(),
): Promise<FocusResult> {
  const minutes = Math.max(0, Math.round(input.minutes));
  return db.transaction('rw', [db.focusSessions, db.activityDays, db.settings], async () => {
    await db.focusSessions.add({
      id: newId(),
      projectId: input.projectId,
      ...(input.taskId ? { taskId: input.taskId } : {}),
      startedAt: input.startedAt || nowIso(now),
      minutes,
    });
    const today = todayStr(now);
    await bumpDay(today, { focusMin: minutes });
    const xp = focusXp(minutes);
    const change = await addXp(xp, today);
    await bumpLongestStreak(now);
    return {
      minutes,
      xp,
      levelAfter: levelInfo(change.after),
      levelsGained: levelUps(change.before, change.after),
    };
  });
}
