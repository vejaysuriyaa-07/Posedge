import '@fontsource-variable/orbitron';
import './brain.css';
import { useLiveQuery } from 'dexie-react-hooks';
import { BrainCircuit, Check, Diamond, Maximize2, Minimize2, Snowflake, X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { Link } from 'react-router';
import { useUi } from '../../app/ui';
import { db } from '../../db/db';
import type { Project, Task } from '../../db/types';
import {
  buildBrainGraph,
  countdownLabel,
  edgeGreeting,
  upcomingSignals,
  type BrainProjectNode,
  type Signal,
} from '../../domain/brain';
import { formatHours, loadInfo, plannedMinutes } from '../../domain/capacity';
import { PALETTE } from '../../domain/colors';
import { endOfDay, formatDate, mondayOf } from '../../domain/week';
import { levelInfo } from '../../domain/xp';
import { useAi } from '../../hooks/useAi';
import { useProjects } from '../../hooks/useData';
import { useHotkeys } from '../../hooks/useHotkeys';
import { useReviewQueue } from '../../hooks/useReviewQueue';
import { useSettings } from '../../hooks/useSettings';
import { useActivityDays, useStreak } from '../../hooks/useStreak';
import { useToday } from '../../hooks/useToday';
import { EdgeConsole, type EdgeConsoleHandle } from './EdgeConsole';
import type { CoreActivity } from './hud';
import { NeuralCore } from './NeuralCore';

const OWNER = 'VJ';

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <time
      className="hud-font tabular text-[15px] font-semibold text-cyan-100 hud-glow"
      dateTime={now.toISOString()}
    >
      {now.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })}
    </time>
  );
}

function useFullscreen(target: RefObject<HTMLElement | null>) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void target.current?.requestFullscreen?.();
  }, [target]);
  return { on, toggle, supported: typeof document !== 'undefined' && !!document.fullscreenEnabled };
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub: ReactNode }) {
  return (
    <div>
      <dt className="hud-label text-cyan-300/60">{label}</dt>
      <dd className="hud-font tabular mt-1 text-[22px] font-bold text-cyan-50 hud-glow">{value}</dd>
      <dd className="mt-0.5 text-[12px] text-cyan-100/55">{sub}</dd>
    </div>
  );
}

export default function BrainPage() {
  const today = useToday();
  const weekStart = mondayOf(today);
  const settings = useSettings();
  const ai = useAi();
  const streak = useStreak();
  const days = useActivityDays();
  const { active, byId } = useProjects();
  const { queue } = useReviewQueue();
  const ui = useUi();
  const hudRef = useRef<HTMLDivElement>(null);
  const consoleRef = useRef<EdgeConsoleHandle>(null);
  const fullscreen = useFullscreen(hudRef);
  const [activity, setActivity] = useState<CoreActivity>('idle');
  const [selectedId, setSelectedId] = useState<string>();

  const data = useLiveQuery(async () => {
    const [tasks, milestones, cards] = await Promise.all([
      db.tasks.toArray(),
      db.milestones.toArray(),
      db.reviewCards.toArray(),
    ]);
    return { tasks, milestones, cards };
  }, []);

  const derived = useMemo(() => {
    const activeIds = new Set(active.map((p) => p.id));
    const tasks = (data?.tasks ?? []).filter((t) => activeIds.has(t.projectId));
    const milestones = (data?.milestones ?? []).filter((m) => activeIds.has(m.projectId));
    const endIso = endOfDay(today).toISOString();
    const cardsByProject: Record<string, number> = {};
    const dueCardsByProject: Record<string, number> = {};
    for (const c of data?.cards ?? []) {
      if (c.suspended) continue;
      cardsByProject[c.projectId] = (cardsByProject[c.projectId] ?? 0) + 1;
      if (!c.queued && c.due <= endIso && !settings.vacationMode) {
        dueCardsByProject[c.projectId] = (dueCardsByProject[c.projectId] ?? 0) + 1;
      }
    }
    const graph = buildBrainGraph({
      today,
      projects: active,
      tasks,
      milestones,
      cardsByProject,
      dueCardsByProject,
    });
    const week = tasks.filter((t) => t.weekStart === weekStart);
    const planned = tasks.filter((t) => t.day === today);
    return {
      graph,
      signals: upcomingSignals(tasks, milestones, today),
      week,
      big3: week.filter((t) => t.isBig3).sort((a, b) => a.order - b.order),
      plannedTotal: planned.length,
      plannedDone: planned.filter((t) => t.status === 'done').length,
      totalCards: Object.values(cardsByProject).reduce((a, b) => a + b, 0),
    };
  }, [data, active, today, weekStart, settings.vacationMode]);

  const todayRec = days?.find((d) => d.date === today);
  const load = loadInfo(
    plannedMinutes(derived.week),
    settings.capacityMinByWeekday.reduce((a, b) => a + b, 0),
  );
  const level = levelInfo(settings.xpTotal);
  const selected = derived.graph.projects.find((p) => p.id === selectedId);
  const greeting = edgeGreeting({
    hour: new Date().getHours(),
    name: OWNER,
    plannedOpen: derived.plannedTotal - derived.plannedDone,
    reviewsDue: queue.length,
    streak: streak.count,
    nextSignal: derived.signals.find((s) => !s.late),
  });
  const summary = `Neural core. ${derived.graph.projects.length} active projects in orbit: ${derived.graph.projects
    .map((p) => `${p.name}, ${p.weekDone} of ${p.weekTotal} done this week`)
    .join('; ')}. ${derived.totalCards} review cards shown as stars.`;

  useHotkeys({
    '/': (e) => {
      e.preventDefault();
      consoleRef.current?.focus();
    },
  });

  return (
    <div
      ref={hudRef}
      className={`hud -mx-4 -mt-5 px-3 py-3 md:-mx-8 md:-mb-10 md:px-4 ${
        fullscreen.on
          ? 'h-dvh overflow-y-auto'
          : 'min-h-[calc(100dvh-3.5rem)] lg:h-[calc(100dvh-3.5rem)]'
      }`}
    >
      <div className="grid grid-cols-1 gap-3 lg:h-full lg:grid-cols-[16.5rem_minmax(0,1fr)_18.5rem] lg:grid-rows-[auto_minmax(0,1fr)]">
        <header className="hud-panel flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 lg:col-span-3">
          <div className="flex min-w-0 items-center gap-3">
            <BrainCircuit
              size={24}
              className="shrink-0 text-cyan-300 drop-shadow-[0_0_8px_rgb(103_232_249/0.7)]"
              aria-hidden
            />
            <div className="min-w-0">
              <h1 className="hud-font hud-glow text-[15px] font-bold text-cyan-50">
                POSEDGE <span className="text-cyan-300/60">//</span> NEURAL CORE
              </h1>
              <p className="hud-label mt-0.5 text-[9px] text-cyan-300/50">
                Personal intelligence · {derived.graph.projects.length} nodes online
              </p>
            </div>
          </div>
          <div className="flex-1" />
          <span className="hud-label hidden text-cyan-200/70 sm:inline">
            {formatDate(today, 'EEE dd MMM yyyy')}
          </span>
          <Clock />
          <span className="flex items-center gap-2">
            <span
              className={`hud-ping ${ai.available ? 'bg-emerald-400' : 'bg-amber-400'}`}
              aria-hidden
            />
            <span className={`hud-label ${ai.available ? 'text-emerald-300' : 'text-amber-200'}`}>
              EDGE {ai.available ? 'online' : 'offline'}
            </span>
          </span>
          {fullscreen.supported ? (
            <button
              type="button"
              className="hud-icon-btn"
              onClick={fullscreen.toggle}
              aria-label={fullscreen.on ? 'Exit full screen' : 'Full screen'}
              title={fullscreen.on ? 'Exit full screen' : 'Full screen'}
            >
              {fullscreen.on ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          ) : null}
        </header>

        <div className="flex min-h-0 flex-col gap-3 lg:col-start-2 lg:row-start-2">
          <div className="hud-panel relative h-[min(110vw,500px)] min-h-[320px] overflow-hidden lg:h-auto lg:flex-1">
            <NeuralCore
              graph={derived.graph}
              today={today}
              activity={activity}
              centerLabel={OWNER}
              selectedId={selectedId}
              label={summary}
              onSelectProject={setSelectedId}
              onOpenTask={ui.openTask}
              onCoreClick={() => consoleRef.current?.focus()}
            />
            {selected ? (
              <ProjectFocus
                node={selected}
                project={byId.get(selected.id)}
                onClose={() => setSelectedId(undefined)}
                onAsk={() =>
                  consoleRef.current?.ask(
                    `How is ${selected.name} going, and what should I do next for it?`,
                  )
                }
                canAsk={ai.available}
              />
            ) : null}
            {!derived.graph.projects.length && data ? (
              <p className="absolute inset-x-0 bottom-4 text-center text-[13px] text-cyan-100/60">
                No active projects yet. Add one and it will appear in orbit.
              </p>
            ) : null}
          </div>
          <div className="flex h-[22rem] min-h-0 flex-col lg:h-[clamp(15rem,33vh,21rem)]">
            <EdgeConsole
              ref={consoleRef}
              available={ai.available}
              apiKey={ai.apiKey}
              model={ai.model}
              voiceReplies={settings.aiVoiceReplies}
              greeting={greeting}
              onActivity={setActivity}
            />
          </div>
        </div>

        <aside className="grid min-w-0 grid-cols-1 content-start gap-3 sm:grid-cols-2 lg:col-start-1 lg:row-start-2 lg:min-h-0 lg:grid-cols-1 lg:overflow-y-auto">
          <section className="hud-panel p-3" aria-labelledby="hud-telemetry">
            <h2 id="hud-telemetry" className="hud-label mb-3 text-cyan-300/80">
              Telemetry
            </h2>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-4">
              <Stat
                label="Streak"
                value={streak.count}
                sub={
                  <span className="flex items-center gap-1">
                    <span>
                      day{streak.count === 1 ? '' : 's'} · best {streak.longest}
                    </span>
                    {Array.from({ length: streak.freezes }, (_, i) => (
                      <Snowflake key={i} size={11} className="text-sky-300" aria-hidden />
                    ))}
                    <span className="sr-only">
                      , {streak.freezes} freeze{streak.freezes === 1 ? '' : 's'}
                    </span>
                  </span>
                }
              />
              <Stat
                label="Today"
                value={`${derived.plannedDone}/${derived.plannedTotal}`}
                sub="planned tasks"
              />
              <Stat
                label="Reviews"
                value={queue.length}
                sub={`${derived.totalCards} cards in memory`}
              />
              <Stat label="Focus" value={formatHours(todayRec?.focusMin ?? 0)} sub="today" />
            </dl>
            {settings.gamification ? (
              <div className="mt-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="hud-label text-cyan-300/60">Level {level.level}</span>
                  <span className="text-[12px] text-cyan-100/60">{level.title}</span>
                </div>
                <div
                  className="hud-bar mt-1.5"
                  role="img"
                  aria-label={`${level.xpIntoLevel} of ${level.xpForNext} XP to level ${level.level + 1}`}
                >
                  <span style={{ width: `${Math.round(level.progress * 100)}%` }} />
                </div>
                <p className="mt-1 text-[11.5px] text-cyan-100/50">
                  {level.xpForNext - level.xpIntoLevel} XP to level {level.level + 1}
                  {todayRec?.xp ? ` · +${todayRec.xp} today` : ''}
                </p>
              </div>
            ) : null}
            <div className="mt-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="hud-label text-cyan-300/60">Week load</span>
                <span className="tabular text-[12px] text-cyan-100/60">
                  {formatHours(load.plannedMin)} / {formatHours(load.capacityMin)}
                </span>
              </div>
              <div
                className="hud-bar mt-1.5"
                role="img"
                aria-label={`${formatHours(load.plannedMin)} planned of ${formatHours(load.capacityMin)} capacity this week`}
              >
                <span
                  style={{
                    width: `${Math.min(100, Math.round(load.ratio * 100))}%`,
                    ...(load.state === 'over' || load.state === 'near'
                      ? {
                          background: 'linear-gradient(90deg, #f59e0b, #fde68a)',
                          boxShadow: '0 0 8px rgb(251 191 36 / 0.5)',
                        }
                      : {}),
                  }}
                />
              </div>
              {load.state === 'over' ? (
                <p className="mt-1 text-[11.5px] text-amber-200/80">
                  {formatHours(load.overMin)} more than your capacity. Worth moving something.
                </p>
              ) : null}
            </div>
          </section>

          <section className="hud-panel p-3" aria-labelledby="hud-nodes">
            <h2 id="hud-nodes" className="hud-label mb-2 text-cyan-300/80">
              Nodes
            </h2>
            {derived.graph.projects.length ? (
              <ul className="grid grid-cols-1 gap-0.5">
                {derived.graph.projects.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      aria-pressed={p.id === selectedId}
                      onClick={() => setSelectedId(p.id === selectedId ? undefined : p.id)}
                      className={`flex min-h-9 w-full items-center gap-2 rounded px-2 text-left hover:bg-cyan-300/5 ${
                        p.id === selectedId ? 'bg-cyan-300/10' : ''
                      }`}
                    >
                      <span aria-hidden>{p.emoji}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-cyan-50/90">
                        {p.name}
                      </span>
                      <span className="tabular text-[11px] text-cyan-200/55" title="Done this week">
                        {p.weekDone}/{p.weekTotal}
                      </span>
                      <span
                        className="h-1 w-8 overflow-hidden rounded-full bg-cyan-300/10"
                        aria-hidden
                      >
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.round(p.energy * 100)}%`,
                            background: PALETTE[p.color][400],
                          }}
                        />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] text-cyan-100/55">No active projects.</p>
            )}
            <p className="mt-2 text-[11px] text-cyan-100/40">
              Bars show activity in the last 7 days.
            </p>
          </section>
        </aside>

        <aside className="grid min-w-0 grid-cols-1 content-start gap-3 sm:grid-cols-2 lg:col-start-3 lg:row-start-2 lg:min-h-0 lg:grid-cols-1 lg:overflow-y-auto">
          <Signals
            signals={derived.signals}
            byId={byId}
            onOpenTask={ui.openTask}
            onSelectProject={setSelectedId}
          />
          <Big3 tasks={derived.big3} byId={byId} onOpenTask={ui.openTask} />
          <section className="hud-panel p-3" aria-labelledby="hud-systems">
            <h2 id="hud-systems" className="hud-label mb-2 text-cyan-300/80">
              Systems
            </h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12px]">
              <dt className="text-cyan-100/45">EDGE</dt>
              <dd className={ai.available ? 'text-emerald-300' : 'text-amber-200'}>
                {ai.available ? 'Online' : 'Offline'}
              </dd>
              <dt className="text-cyan-100/45">Model</dt>
              <dd className="truncate text-cyan-50/80">{ai.available ? ai.model : '—'}</dd>
              <dt className="text-cyan-100/45">Uplink</dt>
              <dd className="text-cyan-50/80">{ai.available ? 'api.anthropic.com' : 'None'}</dd>
              <dt className="text-cyan-100/45">This month</dt>
              <dd className="tabular text-cyan-50/80">
                {settings.aiUsage
                  ? `${settings.aiUsage.requests} req · ${Math.round((settings.aiUsage.inputTokens + settings.aiUsage.outputTokens) / 1000)}k tokens`
                  : '0 req'}
              </dd>
            </dl>
            {!ai.available ? (
              <Link to="/settings" className="hud-chip mt-3 inline-flex items-center">
                Bring EDGE online
              </Link>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}

function Signals({
  signals,
  byId,
  onOpenTask,
  onSelectProject,
}: {
  signals: Signal[];
  byId: Map<string, Project>;
  onOpenTask: (id: string) => void;
  onSelectProject: (id: string) => void;
}) {
  return (
    <section className="hud-panel p-3" aria-labelledby="hud-signals">
      <h2 id="hud-signals" className="hud-label mb-2 text-cyan-300/80">
        Signals
      </h2>
      {signals.length ? (
        <ul className="grid grid-cols-1 gap-0.5">
          {signals.map((s) => {
            const p = byId.get(s.projectId);
            const soon = s.daysUntil <= 2;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() =>
                    s.kind === 'task' ? onOpenTask(s.id) : onSelectProject(s.projectId)
                  }
                  className="flex min-h-10 w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-cyan-300/5"
                >
                  <span aria-hidden className="w-5 text-center">
                    {s.kind === 'milestone' ? (
                      <Diamond size={13} className="mx-auto text-cyan-300" />
                    ) : (
                      p?.emoji
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-cyan-50/90">{s.title}</span>
                    <span className="block truncate text-[11px] text-cyan-100/45">
                      {p ? `${p.emoji} ${p.name}` : ''} · {s.kind === 'milestone' ? 'by ' : ''}
                      {formatDate(s.date, 'EEE MMM d')}
                    </span>
                  </span>
                  <span
                    className={`hud-font tabular shrink-0 text-[11px] font-semibold ${soon ? 'text-amber-200' : 'text-cyan-200/80'}`}
                  >
                    {countdownLabel(s.daysUntil)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[12.5px] text-cyan-100/55">
          No deadlines in the next four weeks. Clear skies.
        </p>
      )}
    </section>
  );
}

function Big3({
  tasks,
  byId,
  onOpenTask,
}: {
  tasks: Task[];
  byId: Map<string, Project>;
  onOpenTask: (id: string) => void;
}) {
  return (
    <section className="hud-panel p-3" aria-labelledby="hud-big3">
      <h2 id="hud-big3" className="hud-label mb-2 text-cyan-300/80">
        Big 3 · this week
      </h2>
      {tasks.length ? (
        <ul className="grid grid-cols-1 gap-0.5">
          {tasks.map((t) => {
            const done = t.status === 'done';
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onOpenTask(t.id)}
                  className="flex min-h-9 w-full items-center gap-2 rounded px-2 text-left hover:bg-cyan-300/5"
                >
                  <span
                    className={`grid size-4 shrink-0 place-items-center rounded-full border ${
                      done ? 'border-emerald-300 bg-emerald-300/20' : 'border-amber-300/70'
                    }`}
                    aria-hidden
                  >
                    {done ? <Check size={10} className="text-emerald-200" /> : null}
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate text-[13px] ${done ? 'text-cyan-100/45 line-through' : 'text-cyan-50/90'}`}
                  >
                    {t.title}
                  </span>
                  <span aria-hidden>{byId.get(t.projectId)?.emoji}</span>
                  <span className="sr-only">{done ? ', done' : ', open'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[12.5px] text-cyan-100/55">
          No Big 3 picked yet. Star up to three tasks in Week.
        </p>
      )}
    </section>
  );
}

function ProjectFocus({
  node,
  project,
  onClose,
  onAsk,
  canAsk,
}: {
  node: BrainProjectNode;
  project?: Project;
  onClose: () => void;
  onAsk: () => void;
  canAsk: boolean;
}) {
  const accent = PALETTE[node.color][400];
  return (
    <section
      className="hud-panel absolute top-3 left-3 z-10 w-[min(17rem,calc(100%-1.5rem))] p-3"
      aria-label={`${node.name} details`}
      style={{ borderColor: `${accent}55` }}
    >
      <div className="flex items-start gap-2">
        <span className="text-xl" aria-hidden>
          {node.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold text-cyan-50">{node.name}</h2>
          {project?.kind ? (
            <p className="hud-label text-[9px] text-cyan-300/60">{project.kind}</p>
          ) : null}
        </div>
        <button
          type="button"
          className="hud-icon-btn !size-7"
          onClick={onClose}
          aria-label="Close details"
        >
          <X size={14} />
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <dt className="hud-label text-[8.5px] text-cyan-300/60">Week</dt>
          <dd className="hud-font tabular text-[15px] font-bold text-cyan-50">
            {node.weekDone}/{node.weekTotal}
          </dd>
        </div>
        <div>
          <dt className="hud-label text-[8.5px] text-cyan-300/60">Open</dt>
          <dd className="hud-font tabular text-[15px] font-bold text-cyan-50">{node.openTotal}</dd>
        </div>
        <div>
          <dt className="hud-label text-[8.5px] text-cyan-300/60">Cards</dt>
          <dd className="hud-font tabular text-[15px] font-bold text-cyan-50">{node.cards}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[12px] text-cyan-100/60">
        {node.doneLast7
          ? `${node.doneLast7} task${node.doneLast7 === 1 ? '' : 's'} completed in the last 7 days.`
          : 'Quiet this week. One small step restarts the pulse.'}
      </p>
      {node.nextMilestone ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-cyan-100/80">
          <Diamond size={12} className="shrink-0 text-cyan-300" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{node.nextMilestone.title}</span>
          <span className="hud-font tabular text-[11px] text-cyan-200">
            {countdownLabel(node.nextMilestone.daysUntil)}
          </span>
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to={`/projects/${node.id}`} className="hud-chip inline-flex items-center">
          Open project
        </Link>
        {canAsk ? (
          <button type="button" className="hud-chip" onClick={onAsk}>
            Ask EDGE
          </button>
        ) : null}
      </div>
    </section>
  );
}
