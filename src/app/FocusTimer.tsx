import { useLiveQuery } from 'dexie-react-hooks';
import { Pause, Play, Square, Timer } from 'lucide-react';
import { useEffect, useEffectEvent, useState } from 'react';
import { Button, IconButton } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { Field, Select } from '../components/Field';
import { db, updateSettings } from '../db/db';
import { logFocusSession } from '../db/ops/focus';
import { useProjects } from '../hooks/useData';
import { useSettings } from '../hooks/useSettings';
import { celebrate } from './celebrate';
import { useToast } from './Toasts';
import { useUi } from './ui';

const KEY = 'posedge-focus';

interface FocusState {
  startedAt: number;
  durationMin: 25 | 50;
  projectId: string;
  taskId?: string;
  pausedAt?: number;
  pausedMs: number;
}

function load(): FocusState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as FocusState) : null;
  } catch {
    return null;
  }
}

function save(s: FocusState | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    // Timer still works for this session.
  }
}

function elapsedMs(s: FocusState, now: number): number {
  return (s.pausedAt ?? now) - s.startedAt - s.pausedMs;
}

function mmss(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Optional 25/50-minute focus timer. Survives reloads; logs a FocusSession (+1 XP per 5 min). */
export function FocusTimer() {
  const ui = useUi();
  const settings = useSettings();
  const { toast, announce } = useToast();
  const { byId } = useProjects();
  const [state, setState] = useState<FocusState | null>(load);
  const [now, setNow] = useState(() => Date.now());

  const running = !!state && !state.pausedAt;

  const update = (s: FocusState | null) => {
    save(s);
    setState(s);
  };

  const finish = async (s: FocusState, minutes: number, completed: boolean) => {
    update(null);
    if (minutes < 1) {
      toast('Focus session discarded.');
      return;
    }
    const r = await logFocusSession({
      projectId: s.projectId,
      taskId: s.taskId,
      startedAt: new Date(s.startedAt).toISOString(),
      minutes,
    });
    const p = byId.get(s.projectId);
    const msg = `${completed ? 'Focus done' : 'Logged'}: ${minutes} min${p ? ` on ${p.emoji} ${p.name}` : ''}${settings.gamification && r.xp ? `. +${r.xp} XP` : ''}`;
    toast({ message: msg, tone: 'xp' });
    announce(msg);
    if (settings.gamification && r.levelsGained > 0) {
      toast({ message: `Level ${r.levelAfter.level}: ${r.levelAfter.title}`, tone: 'xp' });
      celebrate(settings.confetti);
    }
  };

  const remaining = state ? state.durationMin * 60000 - elapsedMs(state, now) : 0;
  // Each tick updates the clock and ends the session once time is up.
  const onTick = useEffectEvent(() => {
    const t = Date.now();
    setNow(t);
    if (state && !state.pausedAt && state.durationMin * 60000 - elapsedMs(state, t) <= 0) {
      void finish(state, state.durationMin, true);
    }
  });
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => onTick(), 1000);
    return () => clearInterval(id);
  }, [running]);
  // Show the countdown in the tab title while a session runs.
  useEffect(() => {
    document.title = state ? `${mmss(remaining)} · Posedge` : 'Posedge';
  }, [state, remaining]);

  return (
    <>
      {ui.focusOpen && !state ? (
        <FocusSetup
          defaultMin={settings.focusDefaultMin}
          taskId={ui.focusTaskId}
          onClose={() => ui.setFocusOpen(false)}
          onStart={(durationMin, projectId, taskId) => {
            void updateSettings({ focusDefaultMin: durationMin });
            update({ startedAt: Date.now(), durationMin, projectId, taskId, pausedMs: 0 });
            setNow(Date.now());
            ui.setFocusOpen(false);
            announce(`Focus timer started for ${durationMin} minutes.`);
          }}
        />
      ) : null}
      {state ? (
        <div
          role="timer"
          aria-label={`Focus timer: ${mmss(remaining)} left${state.pausedAt ? ', paused' : ''}`}
          className="fixed right-4 bottom-20 z-40 flex items-center gap-2 rounded-full border border-border bg-elevated py-1.5 pr-1.5 pl-3 shadow-xl md:bottom-6"
          data-pc={byId.get(state.projectId)?.color}
        >
          <span aria-hidden>{byId.get(state.projectId)?.emoji ?? <Timer size={15} />}</span>
          <span className="tabular min-w-12 text-sm font-semibold">{mmss(remaining)}</span>
          {state.pausedAt ? (
            <IconButton
              label="Resume focus"
              size="sm"
              onClick={() =>
                update({
                  ...state,
                  pausedMs: state.pausedMs + (Date.now() - state.pausedAt!),
                  pausedAt: undefined,
                })
              }
            >
              <Play size={15} />
            </IconButton>
          ) : (
            <IconButton
              label="Pause focus"
              size="sm"
              onClick={() => update({ ...state, pausedAt: Date.now() })}
            >
              <Pause size={15} />
            </IconButton>
          )}
          <IconButton
            label="Stop and log focus"
            size="sm"
            onClick={() =>
              void finish(state, Math.floor(elapsedMs(state, Date.now()) / 60000), false)
            }
          >
            <Square size={14} />
          </IconButton>
        </div>
      ) : null}
    </>
  );
}

function FocusSetup({
  defaultMin,
  taskId,
  onClose,
  onStart,
}: {
  defaultMin: 25 | 50;
  taskId?: string;
  onClose: () => void;
  onStart: (min: 25 | 50, projectId: string, taskId?: string) => void;
}) {
  const { active } = useProjects();
  const settings = useSettings();
  const preset = useLiveQuery(() => (taskId ? db.tasks.get(taskId) : undefined), [taskId]);
  const [min, setMin] = useState<25 | 50>(defaultMin);
  const [projectId, setProjectId] = useState('');
  const [task, setTask] = useState<string>('');
  const pid = projectId || preset?.projectId || settings.lastProjectId || active[0]?.id || '';
  const chosenTask = task || (preset && preset.projectId === pid ? preset.id : '');
  const tasks = useLiveQuery(
    () =>
      pid
        ? db.tasks
            .where('projectId')
            .equals(pid)
            .filter((t) => t.status !== 'done')
            .toArray()
        : [],
    [pid],
    [],
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title="Focus timer"
      description="One block of deep work. Logged to the heatmap, +1 XP per 5 minutes."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!pid}
            onClick={() => onStart(min, pid, chosenTask || undefined)}
          >
            <Play size={15} /> Start {min} min
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Length">
          {([25, 50] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={min === m}
              onClick={() => setMin(m)}
              className={`min-h-12 rounded-lg border text-sm font-medium ${min === m ? 'border-brand bg-brand/10' : 'border-border text-muted'}`}
            >
              {m} minutes
            </button>
          ))}
        </div>
        <Field label="Project">
          <Select
            value={pid}
            onChange={(e) => {
              setProjectId(e.target.value);
              setTask('');
            }}
          >
            {active.map((p) => (
              <option key={p.id} value={p.id}>
                {p.emoji} {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Task (optional)">
          <Select value={chosenTask} onChange={(e) => setTask(e.target.value)}>
            <option value="">No specific task</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}
