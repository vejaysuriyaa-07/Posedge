import { DndContext, DragOverlay } from '@dnd-kit/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, Moon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { QuickAddInput } from '../../app/QuickAdd';
import { useToast } from '../../app/Toasts';
import { DroppableList, SortableItem, useBoardDnd } from '../../components/dnd';
import { ProjectDot } from '../../components/ProjectBadge';
import { TaskCard } from '../../components/TaskCard';
import { db } from '../../db/db';
import { moveTask, reorderTasks } from '../../db/ops/tasks';
import type { Project, Task } from '../../db/types';
import {
  capacityForDate,
  formatHours,
  loadInfo,
  overLabel,
  plannedMinutes,
} from '../../domain/capacity';
import { formatDate, weekDays, weekdayIndex, WEEKDAY_LONG, WEEKDAY_SHORT } from '../../domain/week';
import { useProjects } from '../../hooks/useData';
import { useSettings } from '../../hooks/useSettings';
import { useToday } from '../../hooks/useToday';

const byOrder = (a: Task, b: Task) => a.order - b.order || a.createdAt.localeCompare(b.createdAt);

/**
 * The week planning board: backlog (this week, no day), an optional Unplanned list, and 7 day
 * columns with capacity bars. Tasks drag between all of them (pointer, touch and keyboard).
 */
export function WeekBoard({
  weekStart,
  showUnplanned = true,
  quickAdd = true,
}: {
  weekStart: string;
  showUnplanned?: boolean;
  quickAdd?: boolean;
}) {
  const today = useToday();
  const settings = useSettings();
  const { byId, active } = useProjects();
  const { announce } = useToast();
  const [unplannedFilter, setUnplannedFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const data = useLiveQuery(async () => {
    const [week, all] = await Promise.all([
      db.tasks.where('weekStart').equals(weekStart).toArray(),
      db.tasks.filter((t) => !t.weekStart && t.status !== 'done').toArray(),
    ]);
    return { week: week.sort(byOrder), unplanned: all.sort(byOrder) };
  }, [weekStart]);

  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const taskById = useMemo(
    () => new Map([...(data?.week ?? []), ...(data?.unplanned ?? [])].map((t) => [t.id, t])),
    [data],
  );

  // Backlog grouped by project (sidebar order); collapsed groups are hidden from the drag list.
  const backlogTasks = useMemo(() => (data?.week ?? []).filter((t) => !t.day), [data]);
  const backlogGroups = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of backlogTasks) m.set(t.projectId, [...(m.get(t.projectId) ?? []), t]);
    return [...m.entries()].sort(
      ([a], [b]) => (byId.get(a)?.order ?? 0) - (byId.get(b)?.order ?? 0),
    );
  }, [backlogTasks, byId]);

  const containers = useMemo(() => {
    const c: Record<string, string[]> = {
      backlog: backlogGroups
        .filter(([pid]) => !collapsed.has(pid))
        .flatMap(([, list]) => list.map((t) => t.id)),
    };
    if (showUnplanned) {
      c.unplanned = (data?.unplanned ?? [])
        .filter((t) => !unplannedFilter || t.projectId === unplannedFilter)
        .map((t) => t.id);
    }
    for (const d of days) c[d] = (data?.week ?? []).filter((t) => t.day === d).map((t) => t.id);
    return c;
  }, [data, days, backlogGroups, collapsed, unplannedFilter, showUnplanned]);

  const containerLabel = (cid: string) =>
    cid === 'backlog'
      ? 'the week backlog'
      : cid === 'unplanned'
        ? 'Unplanned'
        : formatDate(cid, 'EEEE, MMMM d');

  const dnd = useBoardDnd({
    containers,
    itemLabel: (id) => taskById.get(id)?.title ?? 'task',
    containerLabel,
    instructions:
      'To move a task, focus its handle and press Space or Enter. Use the arrow keys to move between days and the backlog, then press Space or Enter to drop. Escape cancels.',
    onCommit: async (id, to, ordered, from) => {
      if (to !== from) {
        if (to === 'backlog') await moveTask(id, { weekStart, day: null });
        else if (to === 'unplanned') await moveTask(id, { weekStart: null, day: null });
        else await moveTask(id, { day: to });
        announce(`${taskById.get(id)?.title ?? 'Task'} moved to ${containerLabel(to)}.`);
      }
      if (to !== 'unplanned') await reorderTasks(ordered);
    },
  });

  const activeTask = dnd.activeId ? taskById.get(dnd.activeId) : undefined;

  return (
    <DndContext {...dnd.contextProps}>
      <div className="grid gap-5 min-[1900px]:grid-cols-[280px_1fr]">
        <aside
          className={`grid content-start gap-4 ${showUnplanned ? 'md:grid-cols-2 min-[1900px]:grid-cols-1' : ''}`}
        >
          <div className="rounded-xl border border-border bg-surface p-3">
            <h2 className="mb-2 flex items-center justify-between text-sm">
              Backlog
              <span className="tabular text-[12px] font-normal text-muted">
                {backlogTasks.length}
              </span>
            </h2>
            <DroppableList
              id="backlog"
              items={dnd.items.backlog ?? []}
              label="Week backlog"
              className="scrollbar-thin grid max-h-[40vh] min-h-16 gap-2 overflow-y-auto rounded-lg min-[1900px]:max-h-none"
            >
              {backlogGroups.map(([pid, list]) => {
                const p = byId.get(pid);
                const isCollapsed = collapsed.has(pid);
                const ids = (dnd.items.backlog ?? []).filter(
                  (id) => taskById.get(id)?.projectId === pid,
                );
                return (
                  <div key={pid} className="grid gap-1.5">
                    <button
                      type="button"
                      aria-expanded={!isCollapsed}
                      onClick={() =>
                        setCollapsed((s) => {
                          const n = new Set(s);
                          if (n.has(pid)) n.delete(pid);
                          else n.add(pid);
                          return n;
                        })
                      }
                      className="flex min-h-8 items-center gap-2 text-left text-[12px] font-medium text-muted hover:text-fg"
                    >
                      <ChevronDown
                        size={14}
                        className={`transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                        aria-hidden
                      />
                      {p ? <ProjectDot color={p.color} /> : null}
                      <span aria-hidden>{p?.emoji}</span>
                      <span className="truncate">{p?.name}</span>
                      <span className="tabular ml-auto">{list.length}</span>
                    </button>
                    {!isCollapsed
                      ? ids.map((id) => (
                          <DraggableTask
                            key={id}
                            task={taskById.get(id)}
                            project={p}
                            today={today}
                          />
                        ))
                      : null}
                  </div>
                );
              })}
              {!backlogTasks.length ? (
                <p className="py-3 text-center text-[12px] text-muted">
                  Drag tasks here to plan them this week without a day.
                </p>
              ) : null}
            </DroppableList>
            {quickAdd ? (
              <div className="mt-2">
                <QuickAddInput compact defaults={{ weekStart }} placeholder="Add to this week…" />
              </div>
            ) : null}
          </div>

          {showUnplanned ? (
            <div className="rounded-xl border border-border bg-surface p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm">Unplanned</h2>
                <select
                  aria-label="Filter unplanned by project"
                  value={unplannedFilter}
                  onChange={(e) => setUnplannedFilter(e.target.value)}
                  className="max-w-36 truncate rounded-md border border-border bg-bg px-1.5 py-1 text-[12px] text-muted"
                >
                  <option value="">All projects</option>
                  {active.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.emoji} {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <DroppableList
                id="unplanned"
                items={dnd.items.unplanned ?? []}
                label="Unplanned tasks"
                className="scrollbar-thin grid max-h-[40vh] min-h-16 gap-2 overflow-y-auto rounded-lg min-[1900px]:max-h-[50vh]"
              >
                {(dnd.items.unplanned ?? []).map((id) => {
                  const t = taskById.get(id);
                  return (
                    <DraggableTask
                      key={id}
                      task={t}
                      project={t ? byId.get(t.projectId) : undefined}
                      today={today}
                    />
                  );
                })}
                {!(dnd.items.unplanned ?? []).length ? (
                  <p className="py-3 text-center text-[12px] text-muted">Nothing unplanned.</p>
                ) : null}
              </DroppableList>
            </div>
          ) : null}
        </aside>

        <div className="scrollbar-thin grid gap-3 md:grid-cols-[repeat(7,minmax(150px,1fr))] md:overflow-x-auto md:pb-2">
          {days.map((d) => {
            const dayTasks = (dnd.items[d] ?? [])
              .map((id) => taskById.get(id))
              .filter(Boolean) as Task[];
            const rest = settings.restDays.includes(weekdayIndex(d));
            const load = loadInfo(
              plannedMinutes(dayTasks),
              capacityForDate(d, settings.capacityMinByWeekday),
            );
            const over = overLabel(load);
            const isToday = d === today;
            return (
              <div
                key={d}
                className={`flex min-h-28 flex-col md:min-h-48 rounded-xl border bg-surface/70 p-2.5 ${isToday ? 'border-brand/60' : 'border-border'} ${rest ? 'hatch' : ''}`}
              >
                <div className="mb-2 px-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className={`text-[13px] ${isToday ? 'text-brand' : ''}`}>
                      <span className="md:hidden">{WEEKDAY_LONG[weekdayIndex(d)]}</span>
                      <span className="hidden md:inline">
                        {WEEKDAY_SHORT[weekdayIndex(d)]}
                      </span>{' '}
                      <span className="font-normal text-muted">{formatDate(d, 'MMM d')}</span>
                    </h2>
                    {rest ? (
                      <span className="flex items-center gap-1 text-[11px] text-muted">
                        <Moon size={11} aria-hidden /> Rest
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div
                      className="h-1 flex-1 overflow-hidden rounded-full bg-border"
                      role="img"
                      aria-label={`${formatHours(load.plannedMin)} planned of ${formatHours(load.capacityMin)} capacity${over ? `, ${over}` : ''}`}
                    >
                      <div
                        className={`h-full rounded-full transition-[width] ${load.state === 'over' ? 'bg-amber-500' : load.state === 'near' ? 'bg-amber-400/80' : 'bg-brand'}`}
                        style={{ width: `${Math.min(100, Math.round(load.ratio * 100))}%` }}
                      />
                    </div>
                    <span
                      className={`tabular text-[11px] ${load.state === 'over' ? 'font-medium text-warn' : 'text-muted'}`}
                    >
                      {over ?? `${formatHours(load.plannedMin)} / ${formatHours(load.capacityMin)}`}
                    </span>
                  </div>
                </div>
                <DroppableList
                  id={d}
                  items={dnd.items[d] ?? []}
                  label={formatDate(d, 'EEEE')}
                  className="grid flex-1 content-start gap-2 rounded-lg pb-1"
                >
                  {dayTasks.map((t) => (
                    <DraggableTask
                      key={t.id}
                      task={t}
                      project={byId.get(t.projectId)}
                      today={today}
                      compact
                    />
                  ))}
                </DroppableList>
                {quickAdd ? (
                  <div className="mt-1">
                    <QuickAddInput compact defaults={{ day: d }} placeholder="Add…" />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <DragOverlay>
        {activeTask ? (
          <TaskCard
            task={activeTask}
            project={byId.get(activeTask.projectId)}
            today={today}
            dragging
            compact
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function DraggableTask({
  task,
  project,
  today,
  compact,
}: {
  task?: Task;
  project?: Project;
  today: string;
  compact?: boolean;
}) {
  if (!task) return null;
  return (
    <SortableItem id={task.id} label={task.title}>
      {({ handle, rootProps, isDragging }) => (
        <TaskCard
          task={task}
          project={project}
          today={today}
          handle={handle}
          dragging={isDragging}
          rootProps={rootProps}
          compact={compact}
        />
      )}
    </SortableItem>
  );
}
