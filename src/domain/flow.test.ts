import { describe, expect, it } from 'vitest';
import {
  deferCurrent,
  defaultFlowOrder,
  dropQueued,
  estimateOf,
  extendFlow,
  finishAt,
  finishCurrent,
  FLOW_DEFAULT_MIN,
  formatClock,
  isFinished,
  minutesToLog,
  parseFlowState,
  pauseFlow,
  remainingMs,
  resumeFlow,
  spentMs,
  startFlow,
  summarizeFlow,
} from './flow';

const MIN = 60_000;
const DAY = '2026-10-17';

describe('flow helpers', () => {
  it('orders Big 3 first, then priority, keeping ties stable', () => {
    const tasks = [
      { id: 'a', priority: 2 as const, isBig3: false },
      { id: 'b', priority: 1 as const, isBig3: false },
      { id: 'c', priority: 3 as const, isBig3: true },
      { id: 'd', priority: 2 as const, isBig3: false },
    ];
    expect(defaultFlowOrder(tasks).map((t) => t.id)).toEqual(['c', 'b', 'a', 'd']);
  });

  it('falls back to a default estimate', () => {
    expect(estimateOf({ estimateMin: 45 })).toBe(45);
    expect(estimateOf({})).toBe(FLOW_DEFAULT_MIN);
    expect(estimateOf({ estimateMin: 0 })).toBe(FLOW_DEFAULT_MIN);
  });

  it('projects the finish time from what is left', () => {
    const now = new Date(2026, 9, 17, 14, 0).getTime();
    const end = finishAt(now, 10 * MIN, [25 * MIN, 45 * MIN]);
    expect([end.getHours(), end.getMinutes()]).toEqual([15, 20]);
    // Time over doesn't pull the finish time into the past.
    expect(finishAt(now, -5 * MIN, [-2 * MIN]).getTime()).toBe(now);
  });

  it('formats clocks, including time over', () => {
    expect(formatClock(25 * MIN)).toBe('25:00');
    expect(formatClock(61_500)).toBe('1:02');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-192_000)).toBe('+3:12');
    expect(formatClock(3_725_000)).toBe('1:02:05');
  });

  it('logs rounded, capped minutes', () => {
    expect(minutesToLog(20_000)).toBe(0);
    expect(minutesToLog(44.6 * MIN)).toBe(45);
    expect(minutesToLog(20 * 60 * MIN)).toBe(240);
  });
});

describe('flow transitions', () => {
  it('counts down, pauses, resumes, extends and runs over', () => {
    let s = startFlow(['a', 'b'], DAY, 0);
    expect(s.current?.taskId).toBe('a');
    expect(remainingMs(s, 'a', 10, 4 * MIN)).toBe(6 * MIN);
    s = pauseFlow(s, 4 * MIN);
    expect(remainingMs(s, 'a', 10, 9 * MIN)).toBe(6 * MIN);
    s = resumeFlow(s, 9 * MIN);
    expect(remainingMs(s, 'a', 10, 12 * MIN)).toBe(3 * MIN);
    expect(remainingMs(s, 'a', 10, 16 * MIN)).toBe(-1 * MIN);
    s = extendFlow(s, 5);
    expect(remainingMs(s, 'a', 10, 16 * MIN)).toBe(4 * MIN);
  });

  it('finishes tasks in order and ends', () => {
    let s = startFlow(['a', 'b'], DAY, 0);
    s = finishCurrent(s, 'done', 25, 20 * MIN);
    expect(s.current).toEqual({ taskId: 'b', startedAt: 20 * MIN, pausedMs: 0 });
    expect(s.done).toEqual([{ taskId: 'a', ms: 20 * MIN, estimateMin: 25, outcome: 'done' }]);
    s = finishCurrent(s, 'left', 45, 30 * MIN);
    expect(isFinished(s)).toBe(true);
    expect(summarizeFlow(s.done)).toEqual({
      done: 1,
      left: 1,
      minutes: 30,
      estimatedDoneMin: 25,
      spentDoneMin: 20,
    });
  });

  it('defers a task to the back and keeps its time', () => {
    let s = startFlow(['a', 'b'], DAY, 0);
    s = deferCurrent(s, 7 * MIN);
    expect(s.current?.taskId).toBe('b');
    expect(s.queue).toEqual(['a']);
    expect(spentMs(s, 'a', 99 * MIN)).toBe(7 * MIN);
    s = finishCurrent(s, 'done', 10, 10 * MIN);
    expect(s.current?.taskId).toBe('a');
    expect(remainingMs(s, 'a', 10, 11 * MIN)).toBe(2 * MIN);
    s = finishCurrent(s, 'done', 10, 12 * MIN);
    expect(s.done.at(-1)).toEqual({ taskId: 'a', ms: 9 * MIN, estimateMin: 10, outcome: 'done' });
    expect(s.spent).toEqual({});
    // Nothing to defer to: a no-op.
    const last = startFlow(['z'], DAY, 0);
    expect(deferCurrent(last, MIN)).toBe(last);
  });

  it('keeps a paused flow paused when moving on', () => {
    let s = startFlow(['a', 'b'], DAY, 0);
    s = pauseFlow(s, 5 * MIN);
    s = finishCurrent(s, 'done', 25, 8 * MIN);
    expect(s.current?.pausedAt).toBe(8 * MIN);
    expect(spentMs(s, 'b', 20 * MIN)).toBe(0);
    expect(s.done[0]?.ms).toBe(5 * MIN);
  });

  it('drops queued tasks that went away', () => {
    const s = startFlow(['a', 'b', 'c'], DAY, 0);
    expect(dropQueued(s, (id) => id !== 'c').queue).toEqual(['b']);
    expect(dropQueued(s, () => true)).toBe(s);
  });

  it('restores saved state only for today and only when well formed', () => {
    const s = extendFlow(startFlow(['a', 'b'], DAY, 1), 5);
    expect(parseFlowState(JSON.stringify(s), DAY)).toEqual(s);
    expect(parseFlowState(JSON.stringify(s), '2026-10-18')).toBeNull();
    expect(parseFlowState('{"version":1}', DAY)).toBeNull();
    expect(parseFlowState('nope', DAY)).toBeNull();
    expect(parseFlowState(JSON.stringify({ ...s, current: { taskId: 'a' } }), DAY)).toBeNull();
    expect(parseFlowState(JSON.stringify({ ...s, spent: { a: 'x' } }), DAY)).toBeNull();
  });
});
