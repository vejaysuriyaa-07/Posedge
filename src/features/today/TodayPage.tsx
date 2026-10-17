import { DndContext } from '@dnd-kit/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { Brain, ChevronDown, Flame, PartyPopper, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { QuickAddInput } from '../../app/QuickAdd';
import { useToast } from '../../app/Toasts';
import { useTaskActions } from '../../app/useTaskActions';
import { Button } from '../../components/Button';
import { DroppableList, SortableItem, useBoardDnd } from '../../components/dnd';
import { EmptyState } from '../../components/EmptyState';
import { ProgressRing } from '../../components/ProgressRing';
import { ProjectBadge } from '../../components/ProjectBadge';
import { TaskCard } from '../../components/TaskCard';
import { db } from '../../db/db';
import { deleteTask, isOverdue, moveTask, reorderTasks, restoreTasks } from '../../db/ops/tasks';
import type { Project, Task } from '../../db/types';
import { streakMessage } from '../../domain/streak';
import { atHour, formatDate, mondayOf } from '../../domain/week';
import { levelInfo } from '../../domain/xp';
import { useProjects } from '../../hooks/useData';
import { useReviewQueue } from '../../hooks/useReviewQueue';
import { useSettings } from '../../hooks/useSettings';
import { useStreak } from '../../hooks/useStreak';
import { useToday } from '../../hooks/useToday';
import { TodayBanners } from './TodayBanners';

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const byOrder = (a: Task, b: Task) => a.order - b.order || a.createdAt.localeCompare(b.createdAt);

export default function TodayPage() {
  const today = useToday();
  const weekStart = mondayOf(today);
  const settings = useSettings();
  const streak = useStreak();
  const { byId, active } = useProjects();
  const { queue } = useReviewQueue();

  const data = useLiveQuery(async () => {
    const [planned, week, pastDays, dueSoon, doneToday] = await Promise.all([
      db.tasks.where('day').equals(today).toArray(),
      db.tasks.where('weekStart').equals(weekStart).toArray(),
      db.tasks.where('day').below(today).toArray(),
      db.tasks.where('dueDate').below(today).toArray(),
      db.tasks.where('completedAt').aboveOrEqual(atHour(today, 0).toISOString()).toArray(),
    ]);
    const overdueMap = new Map<string, Task>();
    for (const t of [...pastDays, ...dueSoon]) if (isOverdue(t, today)) overdueMap.set(t.id, t);
    return {
      planned: planned.sort(byOrder),
      big3: week.filter((t) => t.isBig3).sort(byOrder),
      overdue: [...overdueMap.values()].sort((a, b) =>
        (a.day ?? a.dueDate ?? '').localeCompare(b.day ?? b.dueDate ?? ''),
      ),
      doneToday: doneToday.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
    };
  }, [today, weekStart]);

  const plannedTotal = data?.planned.length ?? 0;
  const plannedDone = data?.planned.filter((t) => t.status === 'done').length ?? 0;
  const open = useMemo(() => (data?.planned ?? []).filter((t) => t.status !== 'done'), [data]);
  const info = levelInfo(settings.xpTotal);
  const now = new Date();

  return (
    <section className="mx-auto grid max-w-5xl gap-6">
      <header className="flex flex-wrap items-center gap-5">
        <ProgressRing
          value={plannedTotal ? plannedDone / plannedTotal : 0}
          size={72}
          stroke={7}
          label={`Today: ${plannedDone} of ${plannedTotal} planned tasks done`}
        >
          <span className="tabular text-sm font-semibold">
            {plannedDone}/{plannedTotal}
          </span>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl">{greeting(now)}, VJ</h1>
          <p className="text-muted">{formatDate(today, 'EEEE, MMMM d')}</p>
        </div>
        <div className="flex items-center gap-4 text-[13px]">
          <span className="flex items-center gap-1.5">
            <Flame
              size={16}
              className={streak.count ? 'text-orange-500 dark:text-orange-300' : 'text-muted'}
              aria-hidden
            />
            {streakMessage(streak, streak.longest)}
          </span>
          {settings.gamification ? (
            <span className="text-muted">
              Lv {info.level} · {info.title}
            </span>
          ) : null}
        </div>
      </header>

      <TodayBanners today={today} />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="grid content-start gap-6">
          <div className="grid gap-3">
            <QuickAddInput
              defaults={{ day: today }}
              placeholder="Add to today… ~45m !1 #learn +project"
            />
            {!active.length ? (
              <EmptyState message="No projects yet. Load the starter template from Settings or create one." />
            ) : open.length ? (
              <TodayGroups tasks={open} byId={byId} today={today} />
            ) : (
              <EmptyState
                message={
                  plannedTotal
                    ? 'Everything planned for today is done. Nice.'
                    : 'Nothing planned for today yet.'
                }
                action={
                  <Link to="/week" className="text-sm font-medium text-brand hover:underline">
                    Plan from the week view
                  </Link>
                }
              />
            )}
          </div>

          {data?.overdue.length ? <Overdue tasks={data.overdue} byId={byId} today={today} /> : null}

          <div>
            <h2 className="mb-2 flex items-center gap-2 text-sm text-muted">
              <PartyPopper size={15} aria-hidden /> Done today
            </h2>
            {data?.doneToday.length ? (
              <ul className="grid gap-1.5">
                {data.doneToday.map((t) => {
                  const p = byId.get(t.projectId);
                  return (
                    <li key={t.id} className="flex items-center gap-2 text-sm">
                      <span className="text-ok" aria-hidden>
                        ✓
                      </span>
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      {p ? <ProjectBadge project={p} short /> : null}
                      {settings.gamification && t.xpAwarded ? (
                        <span className="tabular text-[12px] text-brand">+{t.xpAwarded}</span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-[13px] text-muted">Your wins for today will show up here.</p>
            )}
          </div>
        </div>

        <aside className="grid content-start gap-4">
          <ReviewsDueCard count={queue.length} />
          <Big3Card tasks={data?.big3 ?? []} byId={byId} />
        </aside>
      </div>
    </section>
  );
}

function TodayGroups({
  tasks,
  byId,
  today,
}: {
  tasks: Task[];
  byId: Map<string, Project>;
  today: string;
}) {
  const groups = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) m.set(t.projectId, [...(m.get(t.projectId) ?? []), t]);
    return [...m.entries()].sort(
      ([a], [b]) => (byId.get(a)?.order ?? 0) - (byId.get(b)?.order ?? 0),
    );
  }, [tasks, byId]);
  const containers = useMemo(
    () => Object.fromEntries(groups.map(([pid, list]) => [pid, list.map((t) => t.id)])),
    [groups],
  );
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const dnd = useBoardDnd({
    containers,
    onCommit: async (id, to, ordered, from) => {
      // Reordering happens within a project group; cross-project drops are ignored.
      if (to !== from) return;
      await reorderTasks(ordered);
      void id;
    },
    itemLabel: (id) => taskById.get(id)?.title ?? 'task',
    containerLabel: (pid) => byId.get(pid)?.name ?? 'project',
  });

  return (
    <DndContext {...dnd.contextProps}>
      <div className="grid gap-4">
        {groups.map(([pid]) => {
          const p = byId.get(pid);
          const ids = dnd.items[pid] ?? [];
          return (
            <div key={pid} data-pc={p?.color} className="grid gap-1.5">
              <h3 className="flex items-center gap-2 text-[13px] font-semibold text-(--pc-fg)">
                <span aria-hidden>{p?.emoji}</span>
                {p?.name ?? 'Project'}
              </h3>
              <DroppableList
                id={pid}
                items={ids}
                className="grid gap-1.5 rounded-xl"
                overClassName=""
              >
                {ids.map((id) => {
                  const t = taskById.get(id);
                  if (!t) return null;
                  return (
                    <SortableItem key={id} id={id} label={t.title}>
                      {({ handle, rootProps, isDragging }) => (
                        <TaskCard
                          task={t}
                          project={p}
                          showProject={false}
                          today={today}
                          handle={handle}
                          dragging={isDragging}
                          rootProps={rootProps}
                        />
                      )}
                    </SortableItem>
                  );
                })}
              </DroppableList>
            </div>
          );
        })}
      </div>
    </DndContext>
  );
}

function Overdue({
  tasks,
  byId,
  today,
}: {
  tasks: Task[];
  byId: Map<string, Project>;
  today: string;
}) {
  const [open, setOpen] = useState(true);
  const { toast } = useToast();
  const weekStart = mondayOf(today);
  const drop = async (t: Task) => {
    const snapshot = await deleteTask(t.id);
    if (snapshot)
      toast({
        message: `Dropped "${t.title}"`,
        action: { label: 'Undo', onClick: () => void restoreTasks([snapshot]) },
      });
  };
  return (
    <div className="rounded-xl border border-border bg-surface/60">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center gap-2 px-4 text-left text-sm"
      >
        <ChevronDown
          size={16}
          className={`transition-transform ${open ? '' : '-rotate-90'}`}
          aria-hidden
        />
        <span className="font-medium">Carried over</span>
        <span className="tabular text-muted">{tasks.length}</span>
        <span className="ml-auto text-[12px] text-muted">No rush. Pick what still matters.</span>
      </button>
      {open ? (
        <ul className="grid gap-2 px-3 pb-3">
          {tasks.map((t) => (
            <li key={t.id} className="grid gap-1.5">
              <TaskCard task={t} project={byId.get(t.projectId)} today={today} />
              <div className="flex flex-wrap gap-1.5 pl-8">
                <Button size="sm" onClick={() => void moveTask(t.id, { day: today })}>
                  Move to today
                </Button>
                <Button size="sm" onClick={() => void moveTask(t.id, { weekStart, day: null })}>
                  Back to week backlog
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void drop(t)}>
                  Drop
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ReviewsDueCard({ count }: { count: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <h2 className="mb-2 flex items-center gap-2 text-sm">
        <Brain size={16} className="text-sky-500 dark:text-sky-300" aria-hidden /> Reviews due
      </h2>
      {count ? (
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="tabular text-3xl font-semibold">{count}</p>
            <p className="text-[13px] text-muted">
              about {Math.max(1, Math.ceil(count * 0.4))} min
            </p>
          </div>
          <Link
            to="/review"
            className="inline-flex min-h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-fg hover:brightness-110"
          >
            Start
          </Link>
        </div>
      ) : (
        <p className="text-[13px] text-muted">All caught up.</p>
      )}
    </div>
  );
}

function Big3Card({ tasks, byId }: { tasks: Task[]; byId: Map<string, Project> }) {
  const { toggle } = useTaskActions();
  const done = tasks.filter((t) => t.status === 'done').length;
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <h2 className="mb-3 flex items-center gap-2 text-sm">
        <Star size={16} className="fill-amber-400 text-amber-500" aria-hidden /> Big 3 this week
        <span className="tabular ml-auto text-[12px] text-muted">
          {done}/{tasks.length || 3}
        </span>
      </h2>
      {tasks.length ? (
        <ul className="grid gap-2">
          {tasks.map((t) => {
            const p = byId.get(t.projectId);
            const isDone = t.status === 'done';
            return (
              <li key={t.id} className="flex items-center gap-2">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isDone}
                  aria-label={`${isDone ? 'Mark not done' : 'Complete'}: ${t.title}`}
                  onClick={() => void toggle(t.id)}
                  className={`grid size-5 shrink-0 place-items-center rounded-full border-2 text-[11px] ${isDone ? 'border-amber-400 bg-amber-400 text-bg' : 'border-muted/60'}`}
                >
                  {isDone ? '✓' : ''}
                </button>
                <span
                  className={`min-w-0 flex-1 truncate text-[13px] ${isDone ? 'text-muted line-through' : ''}`}
                >
                  {t.title}
                </span>
                {p ? <span aria-label={p.name}>{p.emoji}</span> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">
          Pick up to 3 tasks that would make this week a win. Star them in the task editor or add{' '}
          <code>#big3</code>.
        </p>
      )}
    </div>
  );
}
