import {
  Check,
  Clock,
  CornerDownRight,
  Minimize2,
  Pause,
  Play,
  Plus,
  SkipForward,
  Square,
  Volume2,
  VolumeX,
  Waves,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, IconButton } from '../../components/Button';
import { isTypingTarget } from '../../hooks/useHotkeys';
import type { Project, Task } from '../../db/types';
import {
  estimateOf,
  finishAt,
  FLOW_EXTEND_MIN,
  formatClock,
  remainingMs,
  spentMs,
  type FlowState,
} from '../../domain/flow';
import { formatMinutes } from '../../domain/quickAddParser';
import { useProjects } from '../../hooks/useData';
import { FlowRing, SoundControls } from './FlowParts';
import type { FlowPrefs } from './flowStore';
import type { FlowEngine } from './useFlowEngine';

const clockFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** The running flow: one task, its countdown, and what comes next. */
export function FlowRun({
  flow,
  engine,
  prefs,
  setPrefs,
}: {
  flow: FlowState;
  engine: FlowEngine;
  prefs: FlowPrefs;
  setPrefs: (p: FlowPrefs) => void;
}) {
  const { byId } = useProjects();
  const { now, tasks, current, currentTask, estimate, remaining, over, paused, actions } = engine;
  const primary = useRef<HTMLButtonElement>(null);
  // After a secondary action, focus returns to pause/resume, so Space keeps meaning "pause".
  const then = (fn: () => unknown) => () => {
    void fn();
    primary.current?.focus();
  };
  const project = currentTask ? byId.get(currentTask.projectId) : undefined;
  const budget = (estimate + (current ? (flow.extra[current.taskId] ?? 0) : 0)) * 60_000;
  const total = flow.done.length + (current ? 1 : 0) + flow.queue.length;
  const position = flow.done.length + 1;
  const queued = flow.queue.map((id) => ({ id, task: tasks.get(id) }));
  const finish = finishAt(
    now,
    remaining,
    queued.map(({ id, task }) => remainingMs(flow, id, estimateOf(task), now)),
  );

  // Single-key shortcuts while the flow is open (Space acts on the focused button natively).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target))
        return;
      const onButton = (e.target as HTMLElement | null)?.closest('button, a, [role="radio"]');
      const k = e.key.toLowerCase();
      if (k === ' ' && !onButton) {
        e.preventDefault();
        actions.togglePause();
      } else if (k === 'd') {
        e.preventDefault();
        void actions.done();
      } else if (k === 'l') {
        e.preventDefault();
        actions.later();
      } else if (k === '+' || k === '=') {
        e.preventDefault();
        actions.extend();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions]);

  return (
    <>
      <header className="grid grid-cols-1 gap-3 px-4 pt-4 sm:px-8">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-2 text-[13px] font-semibold tracking-wide text-muted uppercase">
            <Waves size={15} className="text-(--pc,var(--pe-brand))" aria-hidden /> Flow
          </span>
          <span className="tabular text-[13px] text-muted">
            · {Math.min(position, total)} of {total}
          </span>
          <span className="flex-1" />
          <SoundButton prefs={prefs} setPrefs={setPrefs} />
          <IconButton label="Minimize flow (Esc)" onClick={actions.minimize}>
            <Minimize2 size={17} />
          </IconButton>
        </div>
        <Segments flow={flow} engine={engine} byId={byId} />
      </header>

      <main className="grid flex-1 place-items-center px-4 py-4 sm:px-8 sm:py-6">
        {current && currentTask ? (
          <div className="flex w-full max-w-xl flex-col items-center text-center">
            <div key={current.taskId} className="pe-rise flex w-full flex-col items-center">
              {project ? (
                <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-(--pc-tint) px-3 py-1 text-[12.5px] font-medium text-(--pc-fg)">
                  <span aria-hidden>{project.emoji}</span>
                  <span className="truncate">{project.name}</span>
                </span>
              ) : null}
              <h1 className="mt-3 line-clamp-3 text-2xl font-semibold tracking-tight text-balance break-words sm:text-[2rem] sm:leading-tight">
                {currentTask.title}
              </h1>
              {currentTask.notes ? <Notes text={currentTask.notes} /> : null}
            </div>

            <div className="relative mt-5 sm:mt-7">
              {engine.doneFlash ? (
                <span
                  key={engine.doneFlash}
                  aria-hidden
                  className="pe-ripple pointer-events-none absolute inset-[6%] rounded-full border-2 border-(--pc,var(--pe-brand))"
                />
              ) : null}
              <FlowRing fraction={remaining / budget} over={over} paused={paused}>
                <div role="timer" aria-live="off" className="flex flex-col items-center">
                  <span
                    className={`tabular text-[clamp(2.5rem,min(13vw,7svh),5rem)] leading-none font-light tracking-tight ${over ? 'text-warn' : ''}`}
                  >
                    {formatClock(remaining)}
                  </span>
                  <span className="mt-2 text-[13px] text-muted">
                    {paused
                      ? 'Paused'
                      : over
                        ? `past ~${formatMinutes(Math.round(budget / 60_000))}`
                        : `of ~${formatMinutes(Math.round(budget / 60_000))}`}
                  </span>
                </div>
              </FlowRing>
            </div>

            <p
              className={`mt-4 min-h-5 text-[13.5px] text-muted transition-opacity ${over && !paused ? 'opacity-100' : 'opacity-0'}`}
              aria-hidden={!over}
            >
              Past the estimate, and that&apos;s fine. Take 5 more or call it done.
            </p>

            <div className="mt-4 flex items-center justify-center gap-3 sm:gap-5">
              <Button onClick={then(actions.extend)} className="min-h-12 rounded-full px-4">
                <Plus size={16} /> {FLOW_EXTEND_MIN} min
              </Button>
              <button
                ref={primary}
                type="button"
                data-autofocus
                onClick={actions.togglePause}
                aria-label={paused ? 'Resume (Space)' : 'Pause (Space)'}
                className="grid size-[4.5rem] place-items-center rounded-full bg-(--pc,var(--pe-brand)) text-(--pe-brand-fg) shadow-[0_8px_30px_-6px_color-mix(in_srgb,var(--pc,var(--pe-brand))_70%,transparent)] transition hover:brightness-110 active:scale-95"
              >
                {paused ? (
                  <Play size={28} className="translate-x-0.5" fill="currentColor" />
                ) : (
                  <Pause size={28} fill="currentColor" />
                )}
              </button>
              <Button onClick={then(actions.done)} className="min-h-12 rounded-full px-4">
                <Check size={16} /> Done
              </Button>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-1 text-[13px]">
              <TextButton
                onClick={then(actions.later)}
                disabled={!flow.queue.length}
                icon={<CornerDownRight size={14} />}
              >
                Later
              </TextButton>
              <TextButton onClick={then(actions.skip)} icon={<SkipForward size={14} />}>
                Skip
              </TextButton>
              <TextButton onClick={() => void actions.end()} icon={<Square size={13} />}>
                End flow
              </TextButton>
            </div>
          </div>
        ) : (
          <p className="text-muted">Loading…</p>
        )}
      </main>

      <footer className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 pb-5 sm:px-8">
        <UpNext queued={queued} byId={byId} />
        <div className="grid justify-items-end gap-1 text-right">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/70 px-3 py-1 text-[13px] backdrop-blur-sm">
            <Clock size={13} className="text-muted" aria-hidden />
            Done around <span className="tabular font-medium">{clockFmt.format(finish)}</span>
          </span>
          <span className="hidden text-[11.5px] text-muted pointer-fine:block">
            <Kbd>Space</Kbd> pause · <Kbd>D</Kbd> done · <Kbd>L</Kbd> later · <Kbd>+</Kbd> 5 min ·{' '}
            <Kbd>Esc</Kbd> minimize
          </span>
        </div>
      </footer>
    </>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-surface px-1 font-sans text-[10.5px]">
      {children}
    </kbd>
  );
}

function TextButton({
  onClick,
  disabled,
  icon,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-muted transition hover:bg-elevated/70 hover:text-fg disabled:pointer-events-none disabled:opacity-40 pointer-coarse:min-h-11"
    >
      {icon}
      {children}
    </button>
  );
}

/** One segment per task: done, the current one filling up, and the ones still to come. */
function Segments({
  flow,
  engine,
  byId,
}: {
  flow: FlowState;
  engine: FlowEngine;
  byId: Map<string, Project>;
}) {
  const { now, tasks, current, estimate } = engine;
  const color = (id: string) => {
    const t = tasks.get(id);
    return t ? byId.get(t.projectId)?.color : undefined;
  };
  const curFill = current
    ? Math.min(
        1,
        spentMs(flow, current.taskId, now) /
          ((estimate + (flow.extra[current.taskId] ?? 0)) * 60_000),
      )
    : 0;
  return (
    <div className="flex gap-1" aria-hidden>
      {flow.done.map((d) => (
        <span
          key={`d-${d.taskId}`}
          data-pc={color(d.taskId)}
          className={`h-1 flex-1 rounded-full ${d.outcome === 'done' ? 'bg-(--pc,var(--pe-brand))' : 'bg-(--pc,var(--pe-brand)) opacity-35'}`}
        />
      ))}
      {current ? (
        <span
          data-pc={color(current.taskId)}
          className="relative h-1 flex-1 overflow-hidden rounded-full bg-border"
        >
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-(--pc,var(--pe-brand)) transition-[width] duration-500 ease-linear"
            style={{ width: `${curFill * 100}%` }}
          />
        </span>
      ) : null}
      {flow.queue.map((id) => (
        <span key={`q-${id}`} className="h-1 flex-1 rounded-full bg-border" />
      ))}
    </div>
  );
}

function UpNext({
  queued,
  byId,
}: {
  queued: { id: string; task?: Task }[];
  byId: Map<string, Project>;
}) {
  if (!queued.length)
    return <p className="text-[13px] text-muted">Last one. Then you&apos;re done.</p>;
  const shown = queued.slice(0, 2);
  return (
    <div className="grid min-w-0 max-w-sm flex-1 gap-1.5">
      <p className="text-[11.5px] font-semibold tracking-wide text-muted uppercase">Up next</p>
      <ul className="grid grid-cols-1 gap-1.5">
        {shown.map(({ id, task }, i) => {
          const p = task ? byId.get(task.projectId) : undefined;
          return (
            <li
              key={id}
              data-pc={p?.color}
              style={{ opacity: i ? 0.65 : 1 }}
              className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-surface/70 px-2.5 py-1.5 text-[13px] backdrop-blur-sm"
            >
              <span aria-hidden>{p?.emoji}</span>
              <span className="min-w-0 flex-1 truncate">{task?.title ?? '…'}</span>
              <span className="tabular shrink-0 text-[12px] text-muted">
                ~{formatMinutes(estimateOf(task))}
              </span>
            </li>
          );
        })}
      </ul>
      {queued.length > 2 ? (
        <p className="text-[12px] text-muted">and {queued.length - 2} more</p>
      ) : null}
    </div>
  );
}

const URL_RE = /(https?:\/\/[^\s<>"')]+)/g;

/** The task's notes, briefly, with links you can open (inbox tasks link to their email). */
function Notes({ text }: { text: string }) {
  const parts = text.trim().split(URL_RE);
  return (
    <p className="mt-2 line-clamp-3 max-w-lg text-[14px] whitespace-pre-line text-muted">
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        let host = part;
        try {
          host = new URL(part).hostname.replace(/^www\./, '');
        } catch {
          // Keep the raw text.
        }
        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noreferrer"
            className="text-brand underline-offset-2 hover:underline"
          >
            {host} ↗
          </a>
        );
      })}
    </p>
  );
}

/** Background sound, from the run screen. */
function SoundButton({ prefs, setPrefs }: { prefs: FlowPrefs; setPrefs: (p: FlowPrefs) => void }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);
  return (
    <div
      className="relative"
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !open) return;
        // Close the panel rather than minimizing the flow.
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        btn.current?.focus();
      }}
    >
      <IconButton ref={btn} label="Sound" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {prefs.sound === 'off' ? <VolumeX size={17} /> : <Volume2 size={17} />}
      </IconButton>
      {open ? (
        <div
          ref={panel}
          role="group"
          aria-label="Sound"
          className="animate-dialog-in absolute top-full right-0 z-10 mt-2 w-72 rounded-xl border border-border bg-elevated p-4 shadow-xl"
        >
          <SoundControls prefs={prefs} onChange={setPrefs} live />
        </div>
      ) : null}
    </div>
  );
}
