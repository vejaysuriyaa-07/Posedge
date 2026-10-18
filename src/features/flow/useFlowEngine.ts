import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ambient } from '../../app/ambient';
import { celebrate } from '../../app/celebrate';
import { useToast } from '../../app/Toasts';
import { useTaskActions } from '../../app/useTaskActions';
import { db } from '../../db/db';
import { logFocusSession } from '../../db/ops/focus';
import type { Task } from '../../db/types';
import {
  deferCurrent,
  dropQueued,
  estimateOf,
  extendFlow,
  finishCurrent,
  FLOW_EXTEND_MIN,
  formatClock,
  isFinished,
  minutesToLog,
  pauseFlow,
  remainingMs,
  resumeFlow,
  spentMs,
  type FlowState,
} from '../../domain/flow';
import { useSettings } from '../../hooks/useSettings';
import { getFlow, setFlow, updateFlow, type FlowPrefs } from './flowStore';

const NO_TASKS = new Map<string, Task>();

export interface FlowActions {
  done: () => Promise<void>;
  skip: () => Promise<void>;
  later: () => void;
  extend: () => void;
  togglePause: () => void;
  end: () => Promise<void>;
  minimize: () => void;
  expand: () => void;
  close: () => void;
}

/**
 * Runs an active flow: the clock, task data, the time's-up chime, the tab title, a screen wake
 * lock while it runs full screen, and keeping in step with edits made elsewhere in the app.
 */
export function useFlowEngine(flow: FlowState | null, prefs: FlowPrefs) {
  const settings = useSettings();
  const { toast, announce } = useToast();
  const actions = useTaskActions();

  const idsKey = flow
    ? [
        ...new Set([
          ...(flow.current ? [flow.current.taskId] : []),
          ...flow.queue,
          ...flow.done.map((d) => d.taskId),
        ]),
      ]
        .sort()
        .join(',')
    : '';
  const result = useLiveQuery(async () => {
    const rows = idsKey ? await db.tasks.bulkGet(idsKey.split(',')) : [];
    return {
      key: idsKey,
      tasks: new Map(rows.filter((t): t is Task => !!t).map((t) => [t.id, t])),
    };
  }, [idsKey]);
  // A result for an older id set would make new tasks look deleted, so syncing waits for the
  // fresh one; the screen keeps showing the previous result meanwhile (no flash between tasks).
  const fresh = result?.key === idsKey ? result : undefined;
  const tasks = result?.tasks ?? NO_TASKS;
  const tasksRef = useRef(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const [now, setNow] = useState(() => Date.now());
  const running = !!flow?.current;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [running]);

  const logTime = useCallback(
    async (task: Task | undefined, ms: number, at: number) => {
      const minutes = minutesToLog(ms);
      if (!task || minutes < 1) return;
      const r = await logFocusSession({
        projectId: task.projectId,
        taskId: task.id,
        startedAt: new Date(at - ms).toISOString(),
        minutes,
      });
      if (settings.gamification && r.levelsGained > 0) {
        toast({ message: `Level ${r.levelAfter.level}: ${r.levelAfter.title}`, tone: 'xp' });
        celebrate(settings.confetti);
      }
    },
    [settings.gamification, settings.confetti, toast],
  );

  // Keep in step with the rest of the app: a task finished or deleted elsewhere moves the flow on.
  useEffect(() => {
    if (!fresh) return;
    const s = getFlow();
    const c = s?.current;
    if (s && c) {
      const t = fresh.tasks.get(c.taskId);
      const at = Date.now();
      if (!t) {
        updateFlow((x) =>
          x.current?.taskId === c.taskId ? { ...finishCurrent(x, 'left', 0, at), done: x.done } : x,
        );
      } else if (t.status === 'done') {
        const ms = spentMs(s, c.taskId, at);
        updateFlow((x) =>
          x.current?.taskId === c.taskId ? finishCurrent(x, 'done', estimateOf(t), at) : x,
        );
        void logTime(t, ms, at);
      }
    }
    updateFlow((x) =>
      dropQueued(x, (id) => {
        const t = fresh.tasks.get(id);
        return !!t && t.status !== 'done';
      }),
    );
  }, [fresh, logTime]);

  const current = flow?.current ?? null;
  const currentTask = current ? tasks.get(current.taskId) : undefined;
  const estimate = estimateOf(currentTask);
  const remaining = flow && current ? remainingMs(flow, current.taskId, estimate, now) : 0;
  const over = !!current && remaining <= 0;
  const paused = !!current?.pausedAt;
  const extra = current ? (flow?.extra[current.taskId] ?? 0) : 0;
  const finished = !!flow && isFinished(flow);

  // Time's up: one soft chime per task (and per extension), never on a paused clock.
  const chimed = useRef<string | null>(null);
  const titleRef = useRef('');
  useEffect(() => {
    titleRef.current = currentTask?.title ?? '';
  }, [currentTask]);
  useEffect(() => {
    if (!current || !over || paused) return;
    const key = `${current.taskId}:${extra}`;
    if (chimed.current === key) return;
    chimed.current = key;
    if (prefs.chime) ambient.chime();
    announce(`Time's up for ${titleRef.current}. Add 5 minutes or mark it done.`);
  }, [current, over, paused, extra, prefs.chime, announce]);

  // The countdown in the tab title.
  useEffect(() => {
    if (!current || !currentTask) return;
    document.title = `${paused ? 'Paused · ' : ''}${formatClock(remaining)} · ${currentTask.title}`;
  }, [current, currentTask, remaining, paused]);
  useEffect(() => {
    if (!flow || finished) document.title = 'Posedge';
  }, [flow, finished]);

  // Background sound follows the clock: quiet while paused, off once the flow ends.
  useEffect(() => {
    ambient.duck(paused);
  }, [paused]);
  // (The planner previews sounds before a flow exists, so only a flow ending stops them here.)
  const hadFlow = useRef(!!flow);
  useEffect(() => {
    if ((hadFlow.current && !flow) || finished) ambient.stop();
    hadFlow.current = !!flow;
  }, [flow, finished]);

  // Keep the screen awake while a flow runs full screen.
  const awake = !!flow && !flow.minimized && !!current && !paused;
  useEffect(() => {
    if (!awake || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          if (cancelled) void l.release();
          else lock = l;
        })
        .catch(() => {});
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release().catch(() => {});
    };
  }, [awake]);

  const [doneFlash, setDoneFlash] = useState(0);

  const api: FlowActions = useMemo(
    () => ({
      done: async () => {
        const s = getFlow();
        const c = s?.current;
        if (!s || !c) return;
        const task = tasksRef.current.get(c.taskId);
        const at = Date.now();
        const ms = spentMs(s, c.taskId, at);
        // Move on first, so the task's own completion isn't mistaken for an edit elsewhere.
        updateFlow((x) => finishCurrent(x, 'done', estimateOf(task), at));
        setDoneFlash((n) => n + 1);
        await logTime(task, ms, at);
        if (task && task.status !== 'done') await actions.complete(task.id, { lockItIn: false });
      },
      skip: async () => {
        const s = getFlow();
        const c = s?.current;
        if (!s || !c) return;
        const task = tasksRef.current.get(c.taskId);
        const at = Date.now();
        const ms = spentMs(s, c.taskId, at);
        updateFlow((x) => finishCurrent(x, 'left', estimateOf(task), at));
        if (task) announce(`Skipped ${task.title}. It stays on today's list.`);
        await logTime(task, ms, at);
      },
      later: () => {
        const c = getFlow()?.current;
        updateFlow((x) => deferCurrent(x, Date.now()));
        const t = c ? tasksRef.current.get(c.taskId) : undefined;
        if (t) announce(`${t.title} moved to the end of the flow.`);
      },
      extend: () => {
        updateFlow((x) => extendFlow(x, FLOW_EXTEND_MIN));
        announce(`Added ${FLOW_EXTEND_MIN} minutes.`);
      },
      togglePause: () => {
        const c = getFlow()?.current;
        if (!c) return;
        if (c.pausedAt) {
          ambient.prime();
          updateFlow((x) => resumeFlow(x, Date.now()));
          announce('Resumed.');
        } else {
          updateFlow((x) => pauseFlow(x, Date.now()));
          announce('Paused.');
        }
      },
      end: async () => {
        const s = getFlow();
        if (!s) return;
        const c = s.current;
        const at = Date.now();
        const task = c ? tasksRef.current.get(c.taskId) : undefined;
        const ms = c ? spentMs(s, c.taskId, at) : 0;
        updateFlow((x) => ({
          ...finishCurrent(x, 'left', estimateOf(task), at),
          current: null,
          queue: [],
          minimized: false,
        }));
        await logTime(task, ms, at);
      },
      minimize: () => updateFlow((x) => ({ ...x, minimized: true })),
      expand: () => {
        ambient.prime();
        updateFlow((x) => ({ ...x, minimized: false }));
      },
      close: () => {
        ambient.stop();
        setFlow(null);
      },
    }),
    [actions, announce, logTime],
  );

  // A flow that finishes while minimized (last task completed elsewhere) opens its summary.
  useEffect(() => {
    if (finished && flow?.minimized) updateFlow((x) => ({ ...x, minimized: false }));
  }, [finished, flow?.minimized]);

  return {
    now,
    tasks,
    loaded: !!fresh,
    current,
    currentTask,
    estimate,
    remaining,
    over,
    paused,
    finished,
    doneFlash,
    actions: api,
  };
}

export type FlowEngine = ReturnType<typeof useFlowEngine>;
