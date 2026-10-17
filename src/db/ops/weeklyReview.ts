import { todayStr } from '../../domain/week';
import { levelInfo, levelUps, XP, type LevelInfo } from '../../domain/xp';
import { db, nowIso } from '../db';
import type { WeeklyReview } from '../types';
import { addXp } from './activity';

export interface SaveReviewResult {
  firstTime: boolean;
  xp: number;
  levelAfter: LevelInfo;
  levelsGained: number;
}

/** Saves (or updates) the week's review. The +30 XP is granted once per week. */
export async function saveWeeklyReview(
  input: Omit<WeeklyReview, 'completedAt'>,
  now: Date = new Date(),
): Promise<SaveReviewResult> {
  return db.transaction('rw', [db.weeklyReviews, db.settings, db.activityDays], async () => {
    const existing = await db.weeklyReviews.get(input.weekStart);
    await db.weeklyReviews.put({ ...input, completedAt: existing?.completedAt ?? nowIso(now) });
    const xp = existing ? 0 : XP.weeklyReview;
    const change = await addXp(xp, todayStr(now));
    return {
      firstTime: !existing,
      xp,
      levelAfter: levelInfo(change.after),
      levelsGained: levelUps(change.before, change.after),
    };
  });
}
