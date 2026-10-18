import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLiveQuery } from 'dexie-react-hooks';
import { Clock, GripVertical, Play, Star, Waves, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ambient } from '../../app/ambient';
import { focusTimerRunning } from '../../app/focusState';
import { useToast } from '../../app/Toasts';
import { Button, IconButton } from '../../components/Button';
import { db } from '../../db/db';
import { updateTask } from '../../db/ops/tasks';
import type { Project, Task } from '../../db/types';
import { defaultFlowOrder, estimateOf } from '../../domain/flow';
import { formatMinutes } from '../../domain/quickAddParser';
import { useProjects } from '../../hooks/useData';
import { useNow } from '../../hooks/useNow';
import { useToday } from '../../hooks/useToday';
import { SoundControls } from './FlowParts';
import { beginFlow, type FlowPrefs } from './flowStore';

const ESTIMATES = [10, 15, 20, 25, 30, 45, 60, 75, 90, 120, 150, 180];

const clockFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** Before a flow: today's open tasks to reorder or leave out, estimates, sound, start. */
export function FlowPlanner({
  prefs,
  setPrefs,
  onClose,
}: {
  prefs: FlowPrefs;
  setPrefs: (p: FlowPrefs) => void;
  onClose: () => void;
}) {
  const today = useToday();
  const { byId } = useProjects();
  const { announce } = useToast();
  const open = useLiveQuery(
    () =>
      db.tasks
        .where('day')
        .equals(today)
        .filter((t) => t.status !== 'done')
        .toArray(),
    [today],
  );
  const [order, setOrder] = useState<string[] | null>(null);
  const [left, setLeft] = useState<Set<string>>(() => new Set());

  const tasks = useMemo(() => {
    if (!open) return [];
    const map = new Map(open.map((t) => [t.id, t]));
    const base = defaultFlowOrder(
      [...open].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)),
    );
    if (!order) return base;
    // Keep the chosen order; tasks added meanwhile go to the end.
    const known = order.filter((id) => map.has(id)).map((id) => map.get(id)!);
    const added = base.filter((t) => !order.includes(t.id));
    return [...known, ...added];
  }, [open, order]);

  const included = tasks.filter((t) => !left.has(t.id));
  const totalMin = included.reduce((s, t) => s + estimateOf(t), 0);
  const now = useNow();
  const finish = new Date(now + totalMin * 60_000);
  const [timerBusy] = useState(focusTimerRunning);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = tasks.map((t) => t.id);
    setOrder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };

  const start = () => {
    if (!included.length || timerBusy) return;
    ambient.prime();
    if (prefs.sound !== 'off') ambient.play(prefs.sound, prefs.volume);
    beginFlow(
      included.map((t) => t.id),
      today,
    );
    announce(`Flow started with ${included[0]!.title}.`);
  };

  return (
    <>
      <header className="flex items-center justify-between px-4 pt-4 sm:px-8">
        <span className="flex items-center gap-2 text-[13px] font-semibold tracking-wide text-muted uppercase">
          <Waves size={15} className="text-brand" aria-hidden /> Flow
        </span>
        <IconButton label="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </header>

      <div className="mx-auto grid w-full max-w-2xl flex-1 grid-cols-1 content-start gap-6 px-4 pt-6 pb-10 sm:px-8 sm:pt-10">
        <div className="pe-rise">
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Run today&apos;s list
          </h1>
          <p className="mt-2 text-[15px] text-muted">
            One task at a time, each with its own countdown. Drag to reorder and untick anything
            you&apos;re not doing now.
          </p>
        </div>

        {!open ? null : !tasks.length ? (
          <div className="pe-rise rounded-xl border border-dashed border-border bg-surface/60 p-6 text-center text-[14px] text-muted">
            Nothing open for today.{' '}
            <Link to="/week" onClick={onClose} className="font-medium text-brand hover:underline">
              Plan from the week
            </Link>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <ol aria-label="Flow order" className="pe-rise grid grid-cols-1 gap-2">
                {tasks.map((t, i) => (
                  <PlanRow
                    key={t.id}
                    task={t}
                    index={i}
                    project={byId.get(t.projectId)}
                    included={!left.has(t.id)}
                    onToggle={() =>
                      setLeft((s) => {
                        const n = new Set(s);
                        if (n.has(t.id)) n.delete(t.id);
                        else n.add(t.id);
                        return n;
                      })
                    }
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}

        <section aria-labelledby="flow-sound" className="pe-rise grid gap-3">
          <h2 id="flow-sound" className="text-[13px] font-semibold text-muted">
            Sound
          </h2>
          <SoundControls prefs={prefs} onChange={setPrefs} live />
        </section>
      </div>

      <footer className="sticky bottom-0 mt-auto border-t border-border bg-bg/80 py-3 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-x-4 gap-y-2 px-4 sm:px-8">
          <p className="min-w-0 flex-1 text-[13px] text-muted" aria-live="polite">
            {included.length ? (
              <>
                <span className="tabular font-medium text-fg">
                  {included.length} task{included.length === 1 ? '' : 's'} ·{' '}
                  {formatMinutes(totalMin)}
                </span>
                <span className="ml-2 inline-flex items-center gap-1 whitespace-nowrap">
                  <Clock size={13} aria-hidden /> done around {clockFmt.format(finish)}
                </span>
              </>
            ) : (
              'Pick at least one task.'
            )}
            {timerBusy ? (
              <span className="block text-warn">
                Your focus timer is running. Stop it first so time isn&apos;t counted twice.
              </span>
            ) : null}
          </p>
          <Button
            variant="primary"
            data-autofocus
            disabled={!included.length || timerBusy}
            onClick={start}
            className="min-h-11 px-5"
          >
            <Play size={16} /> Start flow
          </Button>
        </div>
      </footer>
    </>
  );
}

function PlanRow({
  task,
  index,
  project,
  included,
  onToggle,
}: {
  task: Task;
  index: number;
  project?: Project;
  included: boolean;
  onToggle: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });
  const est = estimateOf(task);
  const options = ESTIMATES.includes(est) ? ESTIMATES : [...ESTIMATES, est].sort((a, b) => a - b);
  return (
    <li
      ref={setNodeRef}
      data-pc={project?.color}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative flex items-center gap-2 rounded-xl border bg-surface/90 py-2 pr-2 pl-1.5 backdrop-blur-sm transition-[opacity,box-shadow] ${isDragging ? 'z-10 border-(--pc) shadow-xl' : 'border-border'} ${included ? '' : 'opacity-50'}`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Move ${task.title}`}
        className="grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted hover:text-fg active:cursor-grabbing pointer-coarse:size-10"
      >
        <GripVertical size={16} />
      </button>
      <input
        type="checkbox"
        checked={included}
        onChange={onToggle}
        aria-label={`Include ${task.title}`}
        className="size-4 shrink-0 accent-violet-500"
      />
      <span className="tabular w-5 shrink-0 text-right text-[12px] text-muted" aria-hidden>
        {index + 1}
      </span>
      <span
        aria-hidden
        className="grid size-7 shrink-0 place-items-center rounded-lg bg-(--pc-tint) text-[14px]"
      >
        {project?.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[14px] ${included ? '' : 'line-through'}`}>
          {task.title}
        </span>
        <span className="block truncate text-[11.5px] text-muted">{project?.name}</span>
      </span>
      {task.isBig3 ? (
        <Star size={14} className="shrink-0 fill-amber-400 text-amber-400" aria-label="Big 3" />
      ) : null}
      <label className="shrink-0">
        <span className="sr-only">Estimate for {task.title}</span>
        <select
          value={est}
          onChange={(e) => void updateTask(task.id, { estimateMin: Number(e.target.value) })}
          className={`tabular h-8 rounded-md border border-border bg-elevated px-1.5 text-[12.5px] pointer-coarse:h-10 ${task.estimateMin ? 'text-fg' : 'text-muted italic'}`}
        >
          {options.map((m) => (
            <option key={m} value={m}>
              ~{formatMinutes(m)}
            </option>
          ))}
        </select>
      </label>
    </li>
  );
}
