import { DndContext, DragOverlay } from '@dnd-kit/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { QuickAddInput } from '../../app/QuickAdd';
import { useToast } from '../../app/Toasts';
import { useTaskActions } from '../../app/useTaskActions';
import { DroppableList, SortableItem, useBoardDnd } from '../../components/dnd';
import { TaskCard } from '../../components/TaskCard';
import { db } from '../../db/db';
import { reorderTasks, updateTask } from '../../db/ops/tasks';
import type { Project, Task } from '../../db/types';
import { columnStatus } from '../../domain/columns';
import { useToday } from '../../hooks/useToday';

const byOrder = (a: Task, b: Task) => a.order - b.order || a.createdAt.localeCompare(b.createdAt);

/** Kanban on project.columns: first = todo, last = done, middle = doing (pipelines: Offer/Rejected done). */
export function Board({ project }: { project: Project }) {
  const today = useToday();
  const { toast } = useToast();
  const actions = useTaskActions();
  const tasks = useLiveQuery(
    () => db.tasks.where('projectId').equals(project.id).toArray(),
    [project.id],
  );
  const taskById = useMemo(() => new Map((tasks ?? []).map((t) => [t.id, t])), [tasks]);
  const containers = useMemo(() => {
    const valid = new Set(project.columns.map((c) => c.id));
    const c: Record<string, string[]> = Object.fromEntries(
      project.columns.map((col) => [col.id, [] as string[]]),
    );
    for (const t of [...(tasks ?? [])].sort(byOrder)) {
      const col = valid.has(t.columnId) ? t.columnId : project.columns[0]!.id;
      c[col]!.push(t.id);
    }
    return c;
  }, [tasks, project.columns]);

  const colName = (id: string) => project.columns.find((c) => c.id === id)?.name ?? 'column';
  const dnd = useBoardDnd({
    containers,
    itemLabel: (id) => taskById.get(id)?.title ?? 'task',
    containerLabel: colName,
    instructions:
      'To move a card, focus its handle and press Space. Use the arrow keys to move between columns, then Space to drop.',
    onCommit: async (id, to, ordered, from) => {
      if (to !== from) {
        const r = await updateTask(id, { columnId: to });
        if (r.completion) actions.feedback(r.completion);
        else if (columnStatus(project, to) !== 'done' && columnStatus(project, from) === 'done') {
          toast(`Moved back to ${colName(to)}`);
        }
      }
      await reorderTasks(ordered);
    },
  });
  const active = dnd.activeId ? taskById.get(dnd.activeId) : undefined;

  return (
    <DndContext {...dnd.contextProps}>
      <div
        className="scrollbar-thin grid gap-3 overflow-x-auto pb-2"
        style={{ gridTemplateColumns: `repeat(${project.columns.length}, minmax(240px, 1fr))` }}
      >
        {project.columns.map((col, i) => {
          const ids = dnd.items[col.id] ?? [];
          const status = columnStatus(project, col.id);
          return (
            <div
              key={col.id}
              className="flex min-h-64 flex-col rounded-xl border border-border bg-surface/70 p-2.5"
            >
              <h2 className="mb-2 flex items-center gap-2 px-1 text-[13px]">
                <span
                  className={`size-2 rounded-full ${status === 'done' ? 'bg-ok' : status === 'doing' ? 'bg-(--pc)' : 'bg-muted/50'}`}
                  aria-hidden
                />
                {col.name}
                <span className="tabular ml-auto text-[12px] font-normal text-muted">
                  {ids.length}
                </span>
              </h2>
              <DroppableList
                id={col.id}
                items={ids}
                label={col.name}
                className="grid flex-1 content-start gap-2 rounded-lg pb-1"
              >
                {ids.map((id) => {
                  const t = taskById.get(id);
                  if (!t) return null;
                  return (
                    <SortableItem key={id} id={id} label={t.title}>
                      {({ handle, rootProps, isDragging }) => (
                        <TaskCard
                          task={t}
                          project={project}
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
              {i === 0 ? (
                <div className="mt-1">
                  <QuickAddInput
                    compact
                    defaults={{ projectId: project.id }}
                    placeholder={`Add to ${col.name}…`}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <DragOverlay>
        {active ? (
          <TaskCard task={active} project={project} showProject={false} today={today} dragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
