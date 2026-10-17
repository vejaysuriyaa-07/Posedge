import { X } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import type { KnowledgeGraph as Graph } from '../../domain/brain';
import { KnowledgeGraph } from './KnowledgeGraph';

interface Props {
  graph: Graph;
  today: string;
  isDark: boolean;
  highlightIds: ReadonlySet<string>;
  selectedId?: string;
  focus?: { id: string; seq: number };
  options: { includeCards: boolean; includeDone: boolean };
  onOptions: (o: { includeCards: boolean; includeDone: boolean }) => void;
  onSelectProject: (id: string | undefined) => void;
  onFocusProject: (id: string) => void;
  onOpenTask: (id: string) => void;
  onAskAbout?: (projectName: string) => void;
  loaded: boolean;
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-7 rounded-full border px-2.5 text-[12px] transition ${
        on ? 'border-brand/40 bg-brand/10 text-fg' : 'border-border text-muted hover:text-fg'
      }`}
    >
      {children}
    </button>
  );
}

/** The graph view in a panel: filters, the canvas, a project card and project chips. */
export function GraphPanel(p: Props) {
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
  const summary = `Graph of ${counts.projects} projects, ${counts.milestones} milestones, ${counts.tasks} tasks${
    p.options.includeCards ? ` and ${counts.cards} review cards` : ''
  }. Projects: ${projects.map((n) => n.label).join(', ')}.`;

  return (
    <section
      className="flex h-[460px] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card xl:h-full"
      aria-labelledby="brain-graph"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-4 py-2.5">
        <h2 id="brain-graph" className="text-[14px] font-semibold">
          Graph
        </h2>
        {p.highlightIds.size ? (
          <span className="text-[12px] text-brand">
            {p.highlightIds.size} source{p.highlightIds.size === 1 ? '' : 's'} from the latest
            answer
          </span>
        ) : (
          <span className="tabular text-[12px] text-muted">
            {counts.projects} projects · {counts.tasks} tasks
            {p.options.includeCards ? ` · ${counts.cards} cards` : ''}
          </span>
        )}
        <span className="flex-1" />
        <div className="flex gap-1.5" role="group" aria-label="Show in graph">
          <Toggle
            on={p.options.includeCards}
            onClick={() => p.onOptions({ ...p.options, includeCards: !p.options.includeCards })}
          >
            Cards
          </Toggle>
          <Toggle
            on={p.options.includeDone}
            onClick={() => p.onOptions({ ...p.options, includeDone: !p.options.includeDone })}
          >
            Completed
          </Toggle>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <KnowledgeGraph
          graph={p.graph}
          today={p.today}
          isDark={p.isDark}
          highlightIds={p.highlightIds}
          selectedId={p.selectedId}
          focus={p.focus}
          label={summary}
          onSelectProject={p.onSelectProject}
          onOpenTask={p.onOpenTask}
        />
        {p.loaded && !projects.length ? (
          <p className="absolute inset-0 grid place-items-center px-6 text-center text-[14px] text-muted">
            No active projects yet. Add one and it appears here.
          </p>
        ) : null}
        {selected && stats ? (
          <div className="absolute bottom-3 left-3 w-[min(17rem,calc(100%-8.5rem))] rounded-xl border border-border bg-elevated p-3 shadow-card">
            <div className="flex items-start gap-2">
              <span className="text-lg leading-6" aria-hidden>
                {selected.emoji}
              </span>
              <h3 className="min-w-0 flex-1 text-[14px] leading-6 font-semibold">
                {selected.label}
              </h3>
              <button
                type="button"
                onClick={() => p.onSelectProject(undefined)}
                className="grid size-6 place-items-center rounded-md text-muted hover:bg-surface hover:text-fg"
                aria-label="Close"
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
      </div>

      {projects.length ? (
        <footer className="border-t border-border px-3 py-2">
          <ul className="flex gap-1.5 overflow-x-auto" aria-label="Focus a project">
            {projects.map((n) => (
              <li key={n.id} className="shrink-0">
                <button
                  type="button"
                  aria-pressed={n.id === p.selectedId}
                  onClick={() => p.onFocusProject(n.id)}
                  className={`flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] transition ${
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
