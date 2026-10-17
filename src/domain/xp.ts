import type { Priority, TaskKind } from '../db/types';

/** XP rules from SPEC section 7. Pure functions; persistence lives in db/ops. */
export const XP = {
  task: 10,
  priority1Multiplier: 1.5,
  learnBonus: 5,
  review: 2,
  big3Item: 25,
  allBig3: 50,
  milestone: 100,
  weeklyReview: 30,
  focusMinutesPerXp: 5,
  offerBonus: 50,
} as const;

/** 10 per task (x1.5 rounded for priority 1), plus 5 for learn tasks. */
export function taskBaseXp(task: { priority: Priority; kind: TaskKind }): number {
  const base = task.priority === 1 ? Math.round(XP.task * XP.priority1Multiplier) : XP.task;
  return base + (task.kind === 'learn' ? XP.learnBonus : 0);
}

export interface TaskXpBreakdown {
  base: number;
  big3: number;
  allBig3: number;
  offer: number;
  total: number;
}

export function taskCompletionXp(
  task: { priority: Priority; kind: TaskKind; isBig3: boolean },
  opts: { completesAllBig3?: boolean; offer?: boolean } = {},
): TaskXpBreakdown {
  const base = taskBaseXp(task);
  const big3 = task.isBig3 ? XP.big3Item : 0;
  const allBig3 = opts.completesAllBig3 ? XP.allBig3 : 0;
  const offer = opts.offer ? XP.offerBonus : 0;
  return { base, big3, allBig3, offer, total: base + big3 + allBig3 + offer };
}

/** 1 XP per 5 focused minutes. */
export function focusXp(minutes: number): number {
  return Math.max(0, Math.floor(minutes / XP.focusMinutesPerXp));
}

/** XP needed to go from `level` to `level + 1`. */
export function xpToNextLevel(level: number): number {
  return 100 + 50 * (Math.max(1, level) - 1);
}

/** Cumulative XP needed to reach `level` (level 1 = 0, 2 = 100, 3 = 250, 4 = 450, ...). */
export function totalXpForLevel(level: number): number {
  const n = Math.max(1, Math.floor(level)) - 1; // number of completed level-ups
  // sum_{k=1..n} (100 + 50(k-1)) = 100n + 25n(n-1)
  return 100 * n + 25 * n * (n - 1);
}

const TITLES: { min: number; title: string }[] = [
  { min: 20, title: 'Principal' },
  { min: 15, title: 'Staff DV' },
  { min: 10, title: 'Senior DV' },
  { min: 6, title: 'DV Engineer' },
  { min: 3, title: 'Junior DV' },
  { min: 1, title: 'Intern' },
];

export function titleForLevel(level: number): string {
  return TITLES.find((t) => level >= t.min)?.title ?? 'Intern';
}

export interface LevelInfo {
  level: number;
  title: string;
  xpIntoLevel: number;
  xpForNext: number;
  /** 0..1 progress toward the next level. */
  progress: number;
}

export function levelInfo(totalXp: number): LevelInfo {
  const xp = Math.max(0, totalXp);
  let level = 1;
  while (totalXpForLevel(level + 1) <= xp) level++;
  const xpIntoLevel = xp - totalXpForLevel(level);
  const xpForNext = xpToNextLevel(level);
  return {
    level,
    title: titleForLevel(level),
    xpIntoLevel,
    xpForNext,
    progress: Math.min(1, xpIntoLevel / xpForNext),
  };
}

/** Number of levels gained going from `beforeXp` to `afterXp` (0 if none or if XP went down). */
export function levelUps(beforeXp: number, afterXp: number): number {
  return Math.max(0, levelInfo(afterXp).level - levelInfo(beforeXp).level);
}
