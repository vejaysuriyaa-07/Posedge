import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, Brain, ChevronDown, Flag, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useUi } from '../../app/ui';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ProgressRing } from '../../components/ProgressRing';
import { db } from '../../db/db';
import { setProjectArchived } from '../../db/ops/projects';
import type { Milestone, Project, ReviewCard, Task } from '../../db/types';
import { endOfDay, mondayOf, weekLabel } from '../../domain/week';
import { useProjects } from '../../hooks/useData';
import { useToday } from '../../hooks/useToday';
import { KIND_LABELS } from './ProjectForm';

interface ProjectStats {
  total: number;
  done: number;
  thisWeek: number;
  nextMilestone?: Milestone;
  dueCards: number;
}

export function useProjectStats(): Map<string, ProjectStats> | undefined {
  const today = useToday();
  const data = useLiveQuery(
    () => Promise.all([db.tasks.toArray(), db.milestones.toArray(), db.reviewCards.toArray()]),
    [],
  );
  return useMemo(() => {
    if (!data) return undefined;
    const [tasks, milestones, cards] = data as [Task[], Milestone[], ReviewCard[]];
    const week = mondayOf(today);
    const end = endOfDay(today).toISOString();
    const m = new Map<string, ProjectStats>();
    const get = (id: string) => {
      let s = m.get(id);
      if (!s) m.set(id, (s = { total: 0, done: 0, thisWeek: 0, dueCards: 0 }));
      return s;
    };
    for (const t of tasks) {
      const s = get(t.projectId);
      s.total++;
      if (t.status === 'done') s.done++;
      if (t.weekStart === week && t.status !== 'done') s.thisWeek++;
    }
    for (const ms of milestones
      .filter((x) => !x.done)
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.order - b.order)) {
      const s = get(ms.projectId);
      if (!s.nextMilestone) s.nextMilestone = ms;
    }
    for (const c of cards)
      if (!c.suspended && !c.queued && c.due <= end) get(c.projectId).dueCards++;
    return m;
  }, [data, today]);
}

export default function ProjectsPage() {
  const { projects, loaded } = useProjects();
  const stats = useProjectStats();
  const ui = useUi();
  const [showArchived, setShowArchived] = useState(false);
  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);

  return (
    <section className="mx-auto grid max-w-6xl grid-cols-1 gap-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl">Projects</h1>
        <Button variant="primary" onClick={() => ui.setNewProjectOpen(true)}>
          <Plus size={16} /> New project
        </Button>
      </header>
      {loaded && !active.length ? (
        <EmptyState
          message="No projects yet."
          action={
            <Button variant="primary" onClick={() => ui.setNewProjectOpen(true)}>
              Create your first project
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {active.map((p) => (
            <ProjectCard key={p.id} project={p} stats={stats?.get(p.id)} />
          ))}
        </div>
      )}
      {archived.length ? (
        <div>
          <button
            type="button"
            aria-expanded={showArchived}
            onClick={() => setShowArchived((v) => !v)}
            className="flex min-h-10 items-center gap-2 text-sm text-muted hover:text-fg"
          >
            <ChevronDown size={16} className={showArchived ? '' : '-rotate-90'} aria-hidden />
            <Archive size={15} aria-hidden /> Archived ({archived.length})
          </button>
          {showArchived ? (
            <ul className="mt-2 grid gap-2">
              {archived.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2"
                >
                  <span aria-hidden>{p.emoji}</span>
                  <Link to={`/projects/${p.id}`} className="flex-1 truncate hover:underline">
                    {p.name}
                  </Link>
                  <Button size="sm" onClick={() => void setProjectArchived(p.id, false)}>
                    Unarchive
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ProjectCard({ project, stats }: { project: Project; stats?: ProjectStats }) {
  const today = useToday();
  const pct = stats && stats.total ? stats.done / stats.total : 0;
  return (
    <Link
      to={`/projects/${project.id}`}
      data-pc={project.color}
      className="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-border bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:border-(--pc)"
    >
      <span className="absolute inset-x-0 top-0 h-1 bg-(--pc)" aria-hidden />
      <div className="flex items-start gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-(--pc-tint) text-xl"
          aria-hidden
        >
          {project.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px]">{project.name}</h2>
          <p className="text-[12px] text-muted">{KIND_LABELS[project.kind]}</p>
        </div>
        <ProgressRing
          value={pct}
          size={44}
          stroke={5}
          color="var(--pc)"
          label={`${Math.round(pct * 100)}% of ${project.name} done`}
        >
          <span className="tabular text-[11px] font-semibold">{Math.round(pct * 100)}%</span>
        </ProgressRing>
      </div>
      <div className="grid gap-1.5 text-[13px]">
        <p className="flex items-center gap-2 text-muted">
          <Flag size={14} aria-hidden />
          {stats?.nextMilestone ? (
            <span className="truncate">
              <span className="text-fg">{stats.nextMilestone.title}</span> ·{' '}
              {weekLabel(stats.nextMilestone.weekStart, mondayOf(today))}
            </span>
          ) : (
            'No upcoming milestone'
          )}
        </p>
        <div className="flex items-center gap-4 text-muted">
          <span>
            <span className="tabular text-fg">{stats?.thisWeek ?? 0}</span> open this week
          </span>
          <span className="flex items-center gap-1">
            <Brain size={14} aria-hidden />
            <span className="tabular text-fg">{stats?.dueCards ?? 0}</span> cards due
          </span>
        </div>
      </div>
    </Link>
  );
}
