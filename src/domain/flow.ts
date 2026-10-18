/**
 * Flow mode: run today's list one task at a time, each counting down from its estimate.
 * Pure time maths and state transitions; the store and UI live in features/flow.
 */

/** Estimate used for tasks that don't have one. */
export const FLOW_DEFAULT_MIN = 25;
/** "+5 min" step when a task needs longer. */
export const FLOW_EXTEND_MIN = 5;
/** Logged time per task is capped, so a timer left running overnight can't log a day of focus. */
export const FLOW_MAX_LOG_MIN = 240;

export interface FlowCurrent {
  taskId: string;
  /** Epoch ms when this stint started. */
  startedAt: number;
  /** Epoch ms when paused, if paused. */
  pausedAt?: number;
  /** Paused time in this stint before the current pause. */
  pausedMs: number;
}

export interface FlowDone {
  taskId: string;
  /** Total time spent across stints, in ms. */
  ms: number;
  estimateMin: number;
  /** "done" when completed; "left" when the flow moved on or ended without completing it. */
  outcome: 'done' | 'left';
}

export interface FlowState {
  version: 1;
  /** Local day the flow belongs to; flows from earlier days are dropped. */
  date: string;
  startedAt: number;
  current: FlowCurrent | null;
  /** Tasks still to run after the current one. */
  queue: string[];
  done: FlowDone[];
  /** Time from earlier stints of tasks sent to the back with "Later". */
  spent: Record<string, number>;
  /** Minutes added with "+5 min", per task. */
  extra: Record<string, number>;
  /** Overlay collapsed to the corner pill. */
  minimized: boolean;
}

export interface FlowTask {
  id: string;
  estimateMin?: number;
  priority: 1 | 2 | 3;
  isBig3: boolean;
}

export function estimateOf(t: Pick<FlowTask, 'estimateMin'> | undefined): number {
  return t?.estimateMin && t.estimateMin > 0 ? t.estimateMin : FLOW_DEFAULT_MIN;
}

/** Default run order: Big 3 first, then by priority, keeping the given order otherwise. */
export function defaultFlowOrder<T extends FlowTask>(tasks: T[]): T[] {
  return tasks
    .map((t, i) => ({ t, i }))
    .sort(
      (a, b) => Number(b.t.isBig3) - Number(a.t.isBig3) || a.t.priority - b.t.priority || a.i - b.i,
    )
    .map(({ t }) => t);
}

export function stintMs(cur: FlowCurrent, now: number): number {
  return Math.max(0, (cur.pausedAt ?? now) - cur.startedAt - cur.pausedMs);
}

/** Time spent on a task in this flow so far, including earlier stints. */
export function spentMs(s: FlowState, taskId: string, now: number): number {
  const live = s.current?.taskId === taskId ? stintMs(s.current, now) : 0;
  return (s.spent[taskId] ?? 0) + live;
}

/** Time left on a task; negative once it runs over its estimate plus any extensions. */
export function remainingMs(
  s: FlowState,
  taskId: string,
  estimateMin: number,
  now: number,
): number {
  return (estimateMin + (s.extra[taskId] ?? 0)) * 60_000 - spentMs(s, taskId, now);
}

/** When the list would be done: the current task's time left plus every later task's. */
export function finishAt(
  now: number,
  currentRemainingMs: number,
  laterRemainingMs: number[],
): Date {
  const later = laterRemainingMs.reduce((sum, ms) => sum + Math.max(0, ms), 0);
  return new Date(now + Math.max(0, currentRemainingMs) + later);
}

/** "12:05", "1:02:05"; negative values read as time over: "+3:12". */
export function formatClock(ms: number): string {
  const over = ms < 0;
  const total = over ? Math.floor(-ms / 1000) : Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const body = h
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
  return over ? `+${body}` : body;
}

/** Minutes to log for a stretch of work: rounded, capped, and 0 for under half a minute. */
export function minutesToLog(ms: number): number {
  return Math.min(FLOW_MAX_LOG_MIN, Math.max(0, Math.round(ms / 60_000)));
}

/* ------------------------------------------------------------------ */
/* Transitions                                                          */
/* ------------------------------------------------------------------ */

function startStint(taskId: string | undefined, now: number): FlowCurrent | null {
  return taskId ? { taskId, startedAt: now, pausedMs: 0 } : null;
}

export function startFlow(taskIds: string[], today: string, now: number): FlowState {
  return {
    version: 1,
    date: today,
    startedAt: now,
    current: startStint(taskIds[0], now),
    queue: taskIds.slice(1),
    done: [],
    spent: {},
    extra: {},
    minimized: false,
  };
}

export function pauseFlow(s: FlowState, now: number): FlowState {
  if (!s.current || s.current.pausedAt) return s;
  return { ...s, current: { ...s.current, pausedAt: now } };
}

export function resumeFlow(s: FlowState, now: number): FlowState {
  const c = s.current;
  if (!c?.pausedAt) return s;
  return {
    ...s,
    current: { ...c, pausedAt: undefined, pausedMs: c.pausedMs + (now - c.pausedAt) },
  };
}

export function extendFlow(s: FlowState, minutes: number): FlowState {
  const id = s.current?.taskId;
  if (!id) return s;
  return { ...s, extra: { ...s.extra, [id]: (s.extra[id] ?? 0) + minutes } };
}

/** The next stint keeps the pause state, so moving on while paused doesn't start the clock. */
function next(s: FlowState, queue: string[], now: number): Pick<FlowState, 'current' | 'queue'> {
  const cur = startStint(queue[0], now);
  if (cur && s.current?.pausedAt) cur.pausedAt = now;
  return { current: cur, queue: queue.slice(1) };
}

/** Ends the current task (completed, or left unfinished) and starts the next one. */
export function finishCurrent(
  s: FlowState,
  outcome: FlowDone['outcome'],
  estimateMin: number,
  now: number,
): FlowState {
  const c = s.current;
  if (!c) return s;
  const ms = spentMs(s, c.taskId, now);
  const { [c.taskId]: _spent, ...spent } = s.spent;
  return {
    ...s,
    ...next(s, s.queue, now),
    done: [...s.done, { taskId: c.taskId, ms, estimateMin, outcome }],
    spent,
  };
}

/** "Later": sends the current task to the back of the queue, keeping its time. */
export function deferCurrent(s: FlowState, now: number): FlowState {
  const c = s.current;
  if (!c || !s.queue.length) return s;
  return {
    ...s,
    ...next(s, [...s.queue, c.taskId], now),
    spent: { ...s.spent, [c.taskId]: spentMs(s, c.taskId, now) },
  };
}

/** Removes queued tasks that no longer exist or were completed elsewhere. */
export function dropQueued(s: FlowState, keep: (taskId: string) => boolean): FlowState {
  const queue = s.queue.filter(keep);
  return queue.length === s.queue.length ? s : { ...s, queue };
}

/** True once every task has been run. */
export function isFinished(s: FlowState): boolean {
  return !s.current && !s.queue.length;
}

export interface FlowSummary {
  done: number;
  left: number;
  /** Minutes spent across every task. */
  minutes: number;
  /** Estimated minutes of the completed tasks. */
  estimatedDoneMin: number;
  /** Minutes spent on the completed tasks. */
  spentDoneMin: number;
}

export function summarizeFlow(done: FlowDone[]): FlowSummary {
  const completed = done.filter((d) => d.outcome === 'done');
  return {
    done: completed.length,
    left: done.length - completed.length,
    minutes: done.reduce((sum, d) => sum + minutesToLog(d.ms), 0),
    estimatedDoneMin: completed.reduce((sum, d) => sum + d.estimateMin, 0),
    spentDoneMin: completed.reduce((sum, d) => sum + minutesToLog(d.ms), 0),
  };
}

const isNumberMap = (v: unknown): v is Record<string, number> =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.values(v).every((x) => typeof x === 'number');

/** Parses saved state, dropping anything malformed or from another day. */
export function parseFlowState(raw: string | null, today: string): FlowState | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<FlowState>;
    if (s.version !== 1 || s.date !== today || typeof s.startedAt !== 'number') return null;
    if (!Array.isArray(s.queue) || !Array.isArray(s.done)) return null;
    if (!isNumberMap(s.spent) || !isNumberMap(s.extra)) return null;
    const c = s.current;
    if (
      c &&
      (typeof c.taskId !== 'string' ||
        typeof c.startedAt !== 'number' ||
        typeof c.pausedMs !== 'number' ||
        (c.pausedAt !== undefined && typeof c.pausedAt !== 'number'))
    )
      return null;
    return {
      version: 1,
      date: s.date,
      startedAt: s.startedAt,
      current: c ?? null,
      queue: s.queue.filter((x): x is string => typeof x === 'string'),
      done: s.done.filter(
        (d): d is FlowDone =>
          !!d &&
          typeof d.taskId === 'string' &&
          typeof d.ms === 'number' &&
          typeof d.estimateMin === 'number' &&
          (d.outcome === 'done' || d.outcome === 'left'),
      ),
      spent: s.spent,
      extra: s.extra,
      minimized: !!s.minimized,
    };
  } catch {
    return null;
  }
}
