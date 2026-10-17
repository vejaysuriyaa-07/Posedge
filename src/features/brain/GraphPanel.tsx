import { Maximize2, Minimize2, Pause, Play, Search, SlidersHorizontal, X } from 'lucide-react';
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
import type { GraphOptions, KnowledgeGraph as Graph } from '../../domain/brain';
import type { GraphSettings, ReplayState } from './graphEngine';
import { GraphSettingsPopover } from './GraphSettings';
import { KnowledgeGraph, type KnowledgeGraphHandle } from './KnowledgeGraph';

interface Props {
  graph: Graph;
  today: string;
  isDark: boolean;
  highlightIds: ReadonlySet<string>;
  /** What the highlight means, shown in the toolbar ("3 matches", "2 sources from the latest answer"). */
  highlightLabel?: string;
  selectedId?: string;
  focus?: { id: string; seq: number };
  options: GraphOptions;
  onOptions: (o: GraphOptions) => void;
  settings: GraphSettings;
  onSettings: (s: GraphSettings) => void;
  search: string;
  onSearch: (q: string) => void;
  onSearchEnter: () => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  expandButtonRef?: RefObject<HTMLButtonElement | null>;
  onSelectProject: (id: string | undefined) => void;
  onFocusProject: (id: string) => void;
  onOpenTask: (id: string) => void;
  onAskAbout?: (projectName: string) => void;
  loaded: boolean;
  /** Floating layers over the canvas (full-screen mode's answers and ask bar). */
  overlay?: ReactNode;
  /** Pixels the right-side overlay covers, so controls stay clear of it. */
  rightInset?: number;
  /** Pixels the bottom overlay (ask bar) covers. */
  bottomInset?: number;
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-8 rounded-full border px-2.5 text-[12px] whitespace-nowrap transition ${
        on ? 'border-brand/40 bg-brand/10 text-fg' : 'border-border text-muted hover:text-fg'
      }`}
    >
      {children}
    </button>
  );
}

const ICON_BTN =
  'grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-elevated hover:text-fg disabled:pointer-events-none disabled:opacity-40 aria-pressed:bg-elevated aria-pressed:text-fg aria-expanded:bg-elevated aria-expanded:text-fg';

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function formatBorn(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** The graph view in a panel: toolbar, the canvas, a project card and project chips. */
export function GraphPanel({ expandButtonRef, ...p }: Props) {
  const graphRef = useRef<KnowledgeGraphHandle>(null);
  const settingsBtn = useRef<HTMLButtonElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [replay, setReplay] = useState<ReplayState>({ active: false });
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const firstRender = useRef(true);

  // Entering or leaving full screen: fit the graph to its new size.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    graphRef.current?.refit();
  }, [p.expanded]);

  const projects = useMemo(() => p.graph.nodes.filter((n) => n.kind === 'project'), [p.graph]);
  const selected = projects.find((n) => n.id === p.selectedId);
  const stats = useMemo(() => {
    if (!selected) return null;
    let open = 0;
    let cards = 0;
    let milestones = 0;
    for (const n of p.graph.nodes) {
      if (n.projectId !== selected.id) continue;
      if (n.kind === 'task' && !n.done) open++;
      if (n.kind === 'card') cards++;
      if (n.kind === 'milestone' && !n.done) milestones++;
    }
    return { open, cards, milestones };
  }, [p.graph, selected]);
  const { counts } = p.graph;
  const countText = [
    plural(counts.projects, 'project'),
    plural(counts.tasks, 'task'),
    p.options.includeCards ? plural(counts.cards, 'card') : '',
    p.options.includeTopics ? plural(counts.topics, 'topic') : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const summary = `Graph of ${countText}. Projects: ${projects.map((n) => n.label).join(', ')}.`;
  const toggle = (key: keyof GraphOptions) => p.onOptions({ ...p.options, [key]: !p.options[key] });

  return (
    <section
      className={`flex flex-col overflow-hidden bg-surface ${
        p.expanded ? 'h-full' : 'h-[480px] rounded-2xl border border-border shadow-card xl:h-full'
      }`}
      aria-labelledby="brain-graph"
    >
      <header
        className={`relative flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-border px-3 py-2.5 sm:px-4 ${
          p.expanded ? 'md:flex-nowrap md:gap-x-3' : ''
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center">
          <h2 id="brain-graph" className="mr-2 text-[14px] font-semibold">
            Graph
          </h2>
          <span
            className={`tabular min-w-0 truncate text-[12px] ${p.highlightLabel ? 'text-brand' : 'text-muted'}`}
            aria-live="polite"
          >
            {p.highlightLabel ?? countText}
          </span>
        </div>
        <div
          className={`order-last flex w-full flex-wrap items-center gap-2 ${
            p.expanded ? 'md:order-none md:w-auto md:flex-nowrap' : ''
          }`}
        >
          <div
            className={`relative min-w-44 grow basis-48 ${p.expanded ? 'md:w-72 md:grow-0 md:basis-auto' : ''}`}
          >
            <Search
              size={14}
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <label htmlFor="graph-search" className="sr-only">
              Search the graph
            </label>
            <input
              id="graph-search"
              type="search"
              value={p.search}
              onChange={(e) => p.onSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  p.onSearchEnter();
                } else if (e.key === 'Escape' && p.search) {
                  e.preventDefault();
                  e.stopPropagation();
                  p.onSearch('');
                }
              }}
              placeholder="Search the graph"
              autoComplete="off"
              className={`h-8 w-full rounded-lg border border-border bg-bg pl-8 text-[13px] outline-none placeholder:text-muted/80 focus:border-brand/50 [&::-webkit-search-cancel-button]:hidden ${
                p.search ? 'pr-8' : 'pr-2'
              }`}
            />
            {p.search ? (
              <button
                type="button"
                onClick={() => p.onSearch('')}
                className="absolute top-1/2 right-1 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted hover:text-fg"
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            ) : null}
          </div>
          <div className="flex gap-1.5" role="group" aria-label="Show in graph">
            <Toggle on={p.options.includeTopics} onClick={() => toggle('includeTopics')}>
              Topics
            </Toggle>
            <Toggle on={p.options.includeCards} onClick={() => toggle('includeCards')}>
              Cards
            </Toggle>
            <Toggle on={p.options.includeDone} onClick={() => toggle('includeDone')}>
              Completed
            </Toggle>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={ICON_BTN}
            aria-pressed={replay.active}
            aria-label={replay.active ? 'Stop the growth replay' : 'Replay how your brain grew'}
            title={replay.active ? 'Stop replay' : 'Replay growth'}
            onClick={() => graphRef.current?.toggleReplay()}
            disabled={!p.graph.nodes.length}
          >
            {replay.active ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button
            ref={settingsBtn}
            type="button"
            className={ICON_BTN}
            aria-expanded={settingsOpen}
            aria-haspopup="dialog"
            aria-label="Graph settings"
            title="Graph settings"
            onClick={() => setSettingsOpen((o) => !o)}
          >
            <SlidersHorizontal size={15} />
          </button>
          <button
            ref={expandButtonRef}
            type="button"
            className={ICON_BTN}
            aria-label={p.expanded ? 'Exit full screen' : 'Full screen graph'}
            title={p.expanded ? 'Exit full screen (Esc)' : 'Full screen'}
            onClick={p.onToggleExpanded}
          >
            {p.expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
        {settingsOpen ? (
          <GraphSettingsPopover
            settings={p.settings}
            onChange={p.onSettings}
            onClose={closeSettings}
            anchor={settingsBtn}
          />
        ) : null}
      </header>

      <div className="relative min-h-0 flex-1">
        <KnowledgeGraph
          ref={graphRef}
          graph={p.graph}
          today={p.today}
          isDark={p.isDark}
          highlightIds={p.highlightIds}
          selectedId={p.selectedId}
          focus={p.focus}
          settings={p.settings}
          label={summary}
          onSelectProject={p.onSelectProject}
          onOpenTask={p.onOpenTask}
          onReplay={setReplay}
          controlsStyle={p.expanded ? { top: 12, right: 12 + (p.rightInset ?? 0) } : undefined}
          insets={{ right: p.rightInset ?? 0, bottom: p.bottomInset ?? 0 }}
        />
        {replay.active ? (
          <div
            className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border bg-elevated/95 px-3 py-1.5 text-[12.5px] whitespace-nowrap shadow-card"
            style={p.rightInset ? { marginLeft: -p.rightInset / 2 } : undefined}
            role="status"
          >
            Growing your brain
            {replay.date ? (
              <span className="tabular text-muted"> · {formatBorn(replay.date)}</span>
            ) : null}
          </div>
        ) : null}
        {p.loaded && !projects.length ? (
          <p className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center text-[14px] text-muted">
            No active projects yet. Add one and it appears here.
          </p>
        ) : null}
        {selected && stats ? (
          <div
            className={`absolute left-3 z-10 w-[min(17rem,calc(100%-8.5rem))] rounded-xl border border-border bg-elevated p-3 shadow-card ${
              p.expanded ? 'top-3' : 'bottom-3'
            }`}
          >
            <div className="flex items-start gap-2">
              <span className="text-lg leading-6" aria-hidden>
                {selected.emoji}
              </span>
              <h3 className="min-w-0 flex-1 text-[14px] leading-6 font-semibold break-words">
                {selected.label}
              </h3>
              <button
                type="button"
                onClick={() => p.onSelectProject(undefined)}
                className="grid size-6 shrink-0 place-items-center rounded-md text-muted hover:bg-surface hover:text-fg"
                aria-label="Close project details"
              >
                <X size={14} />
              </button>
            </div>
            <p className="mt-1 text-[12.5px] text-muted">
              {stats.open} open task{stats.open === 1 ? '' : 's'} · {stats.milestones} milestone
              {stats.milestones === 1 ? '' : 's'} ahead
              {p.options.includeCards
                ? ` · ${stats.cards} card${stats.cards === 1 ? '' : 's'}`
                : ''}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Link
                to={`/projects/${selected.id}`}
                className="inline-flex min-h-8 items-center rounded-lg border border-border bg-surface px-2.5 text-[13px] font-medium hover:bg-bg"
              >
                Open project
              </Link>
              {p.onAskAbout ? (
                <button
                  type="button"
                  onClick={() => p.onAskAbout!(selected.label)}
                  className="inline-flex min-h-8 items-center rounded-lg px-2.5 text-[13px] font-medium text-brand hover:bg-brand/10"
                >
                  Ask about it
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {p.overlay}
      </div>

      {projects.length && !p.expanded ? (
        <footer className="border-t border-border px-3 py-2">
          <ul className="scrollbar-thin flex gap-1.5 overflow-x-auto" aria-label="Focus a project">
            {projects.map((n) => (
              <li key={n.id} className="shrink-0">
                <button
                  type="button"
                  aria-pressed={n.id === p.selectedId}
                  onClick={() => p.onFocusProject(n.id)}
                  className={`flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] whitespace-nowrap transition ${
                    n.id === p.selectedId
                      ? 'bg-elevated text-fg'
                      : 'text-muted hover:bg-elevated hover:text-fg'
                  }`}
                >
                  <span aria-hidden>{n.emoji}</span>
                  {n.label}
                </button>
              </li>
            ))}
          </ul>
        </footer>
      ) : null}
    </section>
  );
}
