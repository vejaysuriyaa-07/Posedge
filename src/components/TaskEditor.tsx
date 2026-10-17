import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Copy, RotateCcw, Star, Timer, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '../app/Toasts';
import { useTaskActions } from '../app/useTaskActions';
import { useUi } from '../app/ui';
import { db } from '../db/db';
import { updateTask, type TaskPatch } from '../db/ops/tasks';
import { SLOTS, type Priority, type Task, type TaskKind } from '../db/types';
import {
  addWeeksStr,
  formatDate,
  mondayOf,
  weekDays,
  WEEKDAY_SHORT,
  formatWeekRange,
} from '../domain/week';
import { useProjects } from '../hooks/useData';
import { useToday } from '../hooks/useToday';
import { Button } from './Button';
import { Field, Input, Select, Textarea } from './Field';
import { Sheet } from './Sheet';

const SLOT_LABEL: Record<(typeof SLOTS)[number], string> = {
  am: 'Morning',
  pm: 'Afternoon',
  eve: 'Evening',
};
const ESTIMATE_PRESETS = [15, 30, 45, 60, 90, 120, 180];

/** Mounted once in the layout; opens for ui.editTaskId. */
export function TaskEditorHost() {
  const ui = useUi();
  const task = useLiveQuery(
    () => (ui.editTaskId ? db.tasks.get(ui.editTaskId) : undefined),
    [ui.editTaskId],
  );
  if (!ui.editTaskId || !task) return null;
  return <TaskEditor key={task.id} task={task} onClose={ui.closeTask} />;
}

function TaskEditor({ task, onClose }: { task: Task; onClose: () => void }) {
  const ui = useUi();
  const { projects, byId } = useProjects();
  const today = useToday();
  const { toast } = useToast();
  const actions = useTaskActions();
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  const project = byId.get(task.projectId);
  const milestones = useLiveQuery(
    () => db.milestones.where('projectId').equals(task.projectId).sortBy('weekStart'),
    [task.projectId],
    [],
  );

  const save = async (patch: TaskPatch) => {
    const r = await updateTask(task.id, patch);
    if (r.big3Full) toast({ message: 'This week already has 3 Big 3 tasks.', tone: 'warn' });
    if (r.completion) actions.feedback(r.completion);
  };

  const flushText = async () => {
    const patch: TaskPatch = {};
    if (title.trim() && title.trim() !== task.title) patch.title = title.trim();
    if ((notes.trim() || undefined) !== task.notes) patch.notes = notes.trim() || undefined;
    if (Object.keys(patch).length) await save(patch);
  };

  const close = () => {
    void flushText();
    onClose();
  };

  const currentWeek = mondayOf(today);
  const done = task.status === 'done';

  return (
    <Sheet
      open
      onClose={close}
      title="Edit task"
      subtitle={project ? `${project.emoji} ${project.name}` : undefined}
      footer={
        <>
          {done ? (
            <Button onClick={() => void actions.uncomplete(task.id)}>
              <RotateCcw size={15} /> Mark not done
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={async () => {
                await flushText();
                onClose();
                await actions.complete(task.id);
              }}
            >
              <Check size={15} /> Complete
            </Button>
          )}
          {!done ? (
            <Button
              onClick={async () => {
                await flushText();
                ui.openFocus(task.id);
              }}
              aria-label="Start a focus timer for this task"
            >
              <Timer size={15} /> Focus
            </Button>
          ) : null}
          <Button onClick={() => void actions.duplicate(task.id)}>
            <Copy size={15} /> Duplicate
          </Button>
          <div className="flex-1" />
          <Button variant="danger" onClick={() => void actions.remove(task.id)}>
            <Trash2 size={15} /> Delete
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Title">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void flushText()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            data-autofocus
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Project">
            <Select
              value={task.projectId}
              onChange={(e) => void save({ projectId: e.target.value, milestoneId: undefined })}
            >
              {projects
                .filter((p) => !p.archived || p.id === task.projectId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.emoji} {p.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Kind">
            <Select
              value={task.kind}
              onChange={(e) => void save({ kind: e.target.value as TaskKind })}
            >
              <option value="task">Task</option>
              <option value="learn">Learn (review later)</option>
              <option value="milestone">Milestone work</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={task.columnId} onChange={(e) => void save({ columnId: e.target.value })}>
              {project?.columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <div
              className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-bg p-1"
              role="radiogroup"
              aria-label="Priority"
            >
              {([1, 2, 3] as Priority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={task.priority === p}
                  onClick={() => void save({ priority: p })}
                  className={`min-h-8 rounded-md text-[13px] font-medium ${task.priority === p ? 'bg-elevated text-fg shadow-card' : 'text-muted hover:text-fg'}`}
                >
                  P{p}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <Field label="Estimate">
          <div className="flex flex-wrap gap-1.5">
            {ESTIMATE_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={task.estimateMin === m}
                onClick={() => void save({ estimateMin: task.estimateMin === m ? undefined : m })}
                className={`tabular min-h-8 rounded-md border px-2.5 text-[13px] ${task.estimateMin === m ? 'border-brand bg-brand/12 text-fg' : 'border-border text-muted hover:text-fg'}`}
              >
                {m < 60 ? `${m}m` : `${m / 60}h`}
              </button>
            ))}
            <Input
              type="number"
              min={0}
              step={5}
              aria-label="Estimate in minutes"
              className="w-24"
              placeholder="min"
              defaultValue={
                task.estimateMin && !ESTIMATE_PRESETS.includes(task.estimateMin)
                  ? task.estimateMin
                  : ''
              }
              onBlur={(e) => {
                const v = Math.round(Number(e.target.value));
                if (e.target.value === '') return;
                void save({ estimateMin: v > 0 ? v : undefined });
              }}
            />
          </div>
        </Field>

        <Field
          label="Week"
          hint={task.weekStart ? `${formatWeekRange(task.weekStart)}` : 'Unplanned'}
        >
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: 'This week', week: currentWeek },
              { label: 'Next week', week: addWeeksStr(currentWeek, 1) },
            ].map((o) => (
              <Button
                key={o.label}
                size="sm"
                variant={task.weekStart === o.week ? 'primary' : 'secondary'}
                onClick={() => void save({ weekStart: o.week, day: null })}
              >
                {o.label}
              </Button>
            ))}
            <Input
              type="date"
              aria-label="Pick a week"
              className="w-40"
              value={task.weekStart ?? ''}
              onChange={(e) =>
                e.target.value && void save({ weekStart: e.target.value, day: null })
              }
            />
            {task.weekStart ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void save({ weekStart: null, day: null })}
              >
                Unplan
              </Button>
            ) : null}
          </div>
        </Field>

        {task.weekStart ? (
          <Field label="Day">
            <div className="grid grid-cols-8 gap-1">
              <button
                type="button"
                aria-pressed={!task.day}
                onClick={() => void save({ day: null, weekStart: task.weekStart })}
                className={`min-h-9 rounded-md border text-[12px] ${!task.day ? 'border-brand bg-brand/12' : 'border-border text-muted'}`}
              >
                Any
              </button>
              {weekDays(task.weekStart).map((d, i) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={task.day === d}
                  aria-label={formatDate(d, 'EEEE, MMM d')}
                  onClick={() => void save({ day: d })}
                  className={`min-h-9 rounded-md border text-[12px] ${task.day === d ? 'border-brand bg-brand/12' : 'border-border text-muted hover:text-fg'} ${d === today ? 'font-semibold' : ''}`}
                >
                  {WEEKDAY_SHORT[i]}
                </button>
              ))}
            </div>
          </Field>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Time of day">
            <Select
              value={task.slot ?? ''}
              onChange={(e) => void save({ slot: (e.target.value || undefined) as Task['slot'] })}
            >
              <option value="">Any time</option>
              {SLOTS.map((s) => (
                <option key={s} value={s}>
                  {SLOT_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Due date">
            <Input
              type="date"
              value={task.dueDate ?? ''}
              onChange={(e) => void save({ dueDate: e.target.value || undefined })}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Milestone">
            <Select
              value={task.milestoneId ?? ''}
              onChange={(e) => void save({ milestoneId: e.target.value || undefined })}
            >
              <option value="">None</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Big 3">
            <button
              type="button"
              aria-pressed={task.isBig3}
              disabled={!task.weekStart}
              onClick={() => void save({ isBig3: !task.isBig3 })}
              className={`flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border text-sm disabled:opacity-50 ${task.isBig3 ? 'border-amber-400/60 bg-amber-400/12' : 'border-border text-muted hover:text-fg'}`}
              title={task.weekStart ? undefined : 'Plan it into a week first'}
            >
              <Star size={15} className={task.isBig3 ? 'fill-amber-400 text-amber-500' : ''} />
              {task.isBig3 ? 'Big 3 this week' : 'Make Big 3'}
            </button>
          </Field>
        </div>

        <Field label="Notes">
          <Textarea
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => void flushText()}
            placeholder="Links, context, what done looks like…"
          />
        </Field>
      </div>
    </Sheet>
  );
}
