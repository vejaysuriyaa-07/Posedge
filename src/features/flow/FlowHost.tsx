import { Maximize2, Pause, Play } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ambient } from '../../app/ambient';
import { IconButton } from '../../components/Button';
import { formatClock } from '../../domain/flow';
import { useProjects } from '../../hooks/useData';
import { FlowBackdrop } from './FlowParts';
import { FlowPlanner } from './FlowPlanner';
import { FlowRun } from './FlowRun';
import { FlowSummary } from './FlowSummary';
import {
  closePlanner,
  loadFlowPrefs,
  saveFlowPrefs,
  useFlowStore,
  type FlowPrefs,
} from './flowStore';
import { useFlowEngine, type FlowEngine } from './useFlowEngine';

/** Flow mode: the planner, the full-screen run, the corner pill and the summary. */
export function FlowHost() {
  const { flow, planning } = useFlowStore();
  const [prefs, setPrefsState] = useState(loadFlowPrefs);
  const setPrefs = useCallback((p: FlowPrefs) => {
    saveFlowPrefs(p);
    setPrefsState(p);
  }, []);
  const engine = useFlowEngine(flow, prefs);
  const { byId } = useProjects();

  const closePlan = useCallback(() => {
    ambient.stop();
    closePlanner();
  }, []);

  if (!flow) {
    return planning ? (
      <FlowOverlay label="Plan a flow" phase="plan" onEscape={closePlan}>
        <FlowPlanner prefs={prefs} setPrefs={setPrefs} onClose={closePlan} />
      </FlowOverlay>
    ) : null;
  }

  const project = engine.currentTask ? byId.get(engine.currentTask.projectId) : undefined;
  if (flow.minimized && !engine.finished) {
    return <FlowPill engine={engine} emoji={project?.emoji} color={project?.color} />;
  }
  return (
    <FlowOverlay
      label={engine.finished ? 'Flow summary' : 'Flow'}
      phase={engine.finished ? 'summary' : engine.currentTask ? 'run' : 'loading'}
      color={engine.finished ? undefined : project?.color}
      still={engine.paused || engine.finished}
      onEscape={engine.finished ? engine.actions.close : engine.actions.minimize}
    >
      {engine.finished ? (
        <FlowSummary flow={flow} engine={engine} />
      ) : (
        <FlowRun flow={flow} engine={engine} prefs={prefs} setPrefs={setPrefs} />
      )}
    </FlowOverlay>
  );
}

/**
 * Full-screen layer: the app behind it is inert and doesn't scroll, Escape calls `onEscape`
 * (after any popover inside has had its turn), and focus returns where it was on close.
 */
function FlowOverlay({
  label,
  phase,
  color,
  still,
  onEscape,
  children,
}: {
  label: string;
  /** Planner, run or summary: focus moves to the new screen's main control when it changes. */
  phase: string;
  color?: string;
  still?: boolean;
  onEscape: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const first = ref.current?.querySelector<HTMLElement>('[data-autofocus]');
      (first ?? ref.current)?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const touched: Element[] = [];
    const root = document.getElementById('root');
    for (let el: Element | null = ref.current; el && el !== root; el = el.parentElement) {
      for (const sib of el.parentElement?.children ?? []) {
        if (sib === el || sib.hasAttribute('inert') || sib.hasAttribute('data-overlay-safe'))
          continue;
        sib.setAttribute('inert', '');
        touched.push(sib);
      }
    }
    return () => {
      document.body.style.overflow = prevOverflow;
      touched.forEach((s) => s.removeAttribute('inert'));
      if (prevFocus?.isConnected) prevFocus.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      onEscape();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEscape]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      data-pc={color}
      className={`fixed inset-0 z-[55] overflow-y-auto bg-bg text-fg outline-none ${still ? 'pe-still' : ''}`}
    >
      <FlowBackdrop />
      <div className="relative flex min-h-full flex-col">{children}</div>
    </div>
  );
}

/** The flow, minimized: current task, time and pause, above the bottom nav on phones. */
function FlowPill({
  engine,
  emoji,
  color,
}: {
  engine: FlowEngine;
  emoji?: string;
  color?: string;
}) {
  const { currentTask, remaining, over, paused, actions } = engine;
  const clock = formatClock(remaining);
  return (
    <div
      role="timer"
      aria-label={`Flow: ${currentTask?.title ?? 'task'}, ${over ? `${clock} over` : `${clock} left`}${paused ? ', paused' : ''}`}
      data-pc={color}
      className="fixed right-4 bottom-20 z-40 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border border-border bg-elevated py-1.5 pr-1.5 pl-3 shadow-xl md:bottom-6"
    >
      <span
        aria-hidden
        className={`size-2 shrink-0 rounded-full bg-(--pc,var(--pe-brand)) ${paused ? '' : 'pe-breathe'}`}
      />
      <span aria-hidden>{emoji}</span>
      <span className="hidden max-w-48 truncate text-[13px] sm:inline">{currentTask?.title}</span>
      <span className={`tabular min-w-12 text-sm font-semibold ${over ? 'text-warn' : ''}`}>
        {clock}
      </span>
      <IconButton
        label={paused ? 'Resume flow' : 'Pause flow'}
        size="sm"
        onClick={actions.togglePause}
      >
        {paused ? <Play size={15} /> : <Pause size={15} />}
      </IconButton>
      <IconButton label="Open flow full screen" size="sm" onClick={actions.expand}>
        <Maximize2 size={14} />
      </IconButton>
    </div>
  );
}
