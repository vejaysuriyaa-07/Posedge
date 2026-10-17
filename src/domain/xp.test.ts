import { describe, expect, it } from 'vitest';
import {
  XP,
  focusXp,
  levelInfo,
  levelUps,
  taskBaseXp,
  taskCompletionXp,
  titleForLevel,
  totalXpForLevel,
  xpToNextLevel,
} from './xp';

describe('task XP', () => {
  it('gives 10 per task and 15 for priority 1 (x1.5 rounded)', () => {
    expect(taskBaseXp({ priority: 2, kind: 'task' })).toBe(10);
    expect(taskBaseXp({ priority: 3, kind: 'task' })).toBe(10);
    expect(taskBaseXp({ priority: 1, kind: 'task' })).toBe(15);
  });

  it('adds 5 on top for learn tasks', () => {
    expect(taskBaseXp({ priority: 2, kind: 'learn' })).toBe(15);
    expect(taskBaseXp({ priority: 1, kind: 'learn' })).toBe(20);
  });

  it('adds Big 3, all-Big-3 and offer bonuses', () => {
    const plain = taskCompletionXp({ priority: 2, kind: 'task', isBig3: false });
    expect(plain).toEqual({ base: 10, big3: 0, allBig3: 0, offer: 0, total: 10 });

    const big3 = taskCompletionXp({ priority: 1, kind: 'learn', isBig3: true });
    expect(big3.total).toBe(20 + XP.big3Item);

    const all = taskCompletionXp(
      { priority: 2, kind: 'task', isBig3: true },
      { completesAllBig3: true },
    );
    expect(all).toEqual({ base: 10, big3: 25, allBig3: 50, offer: 0, total: 85 });

    const offer = taskCompletionXp({ priority: 2, kind: 'task', isBig3: false }, { offer: true });
    expect(offer.offer).toBe(XP.offerBonus);
    expect(offer.total).toBe(60);
  });

  it('gives 1 XP per 5 focus minutes', () => {
    expect(focusXp(4)).toBe(0);
    expect(focusXp(25)).toBe(5);
    expect(focusXp(52)).toBe(10);
  });
});

describe('levels', () => {
  it('needs 100 + 50*(n-1) XP to go from n to n+1', () => {
    expect(xpToNextLevel(1)).toBe(100);
    expect(xpToNextLevel(2)).toBe(150);
    expect(xpToNextLevel(10)).toBe(550);
  });

  it('accumulates thresholds', () => {
    expect(totalXpForLevel(1)).toBe(0);
    expect(totalXpForLevel(2)).toBe(100);
    expect(totalXpForLevel(3)).toBe(250);
    expect(totalXpForLevel(4)).toBe(450);
    let sum = 0;
    for (let n = 1; n < 20; n++) sum += xpToNextLevel(n);
    expect(totalXpForLevel(20)).toBe(sum);
  });

  it('computes level info at the boundaries', () => {
    expect(levelInfo(0)).toMatchObject({
      level: 1,
      title: 'Intern',
      xpIntoLevel: 0,
      xpForNext: 100,
    });
    expect(levelInfo(99).level).toBe(1);
    expect(levelInfo(100)).toMatchObject({ level: 2, xpIntoLevel: 0, xpForNext: 150 });
    expect(levelInfo(175).progress).toBeCloseTo(0.5);
    expect(levelInfo(250).level).toBe(3);
    expect(levelInfo(-40).level).toBe(1);
  });

  it('maps levels to DV titles', () => {
    expect(titleForLevel(1)).toBe('Intern');
    expect(titleForLevel(2)).toBe('Intern');
    expect(titleForLevel(3)).toBe('Junior DV');
    expect(titleForLevel(5)).toBe('Junior DV');
    expect(titleForLevel(6)).toBe('DV Engineer');
    expect(titleForLevel(9)).toBe('DV Engineer');
    expect(titleForLevel(10)).toBe('Senior DV');
    expect(titleForLevel(14)).toBe('Senior DV');
    expect(titleForLevel(15)).toBe('Staff DV');
    expect(titleForLevel(19)).toBe('Staff DV');
    expect(titleForLevel(20)).toBe('Principal');
    expect(titleForLevel(42)).toBe('Principal');
    expect(levelInfo(totalXpForLevel(10)).title).toBe('Senior DV');
  });

  it('counts level-ups', () => {
    expect(levelUps(90, 99)).toBe(0);
    expect(levelUps(90, 110)).toBe(1);
    expect(levelUps(0, 460)).toBe(3);
    expect(levelUps(460, 0)).toBe(0);
  });

  it('reverses exactly when a task is un-completed', () => {
    const before = 95;
    const gained = taskCompletionXp(
      { priority: 1, kind: 'learn', isBig3: true },
      { completesAllBig3: true },
    ).total;
    const after = before + gained;
    expect(levelUps(before, after)).toBe(1);
    expect(levelInfo(after - gained)).toEqual(levelInfo(before));
  });
});
