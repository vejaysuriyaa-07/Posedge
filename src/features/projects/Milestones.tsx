import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { celebrate } from '../../app/celebrate';
import { useToast } from '../../app/Toasts';
import { Button, IconButton } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Input } from '../../components/Field';
import { db } from '../../db/db';
import {
  createMilestone,
  deleteMilestone,
  toggleMilestone,
  updateMilestone,
} from '../../db/ops/milestones';
import type { Project } from '../../db/types';
import { addWeeksStr, formatWeekRange, mondayOf, weekLabel } from '../../domain/week';
import { useSettings } from '../../hooks/useSettings';
import { useToday } from '../../hooks/useToday';

/** Vertical timeline by weekStart with done toggles, inline add and progress from linked tasks. */
export function Milestones({ project }: { project: Project }) {
  const today = useToday();
  const currentWeek = mondayOf(today);
  const settings = useSettings();
  const { toast, announce } = useToast();
  const [title, setTitle] = useState('');
  const [week, setWeek] = useState(addWeeksStr(currentWeek, 1));
  const data = useLiveQuery(async () => {
    const [milestones, tasks] = await Promise.all([
      db.milestones.where('projectId').equals(project.id).toArray(),
      db.tasks.where('projectId').equals(project.id).toArray(),
    ]);
    return {
      milestones: milestones.sort(
        (a, b) => a.weekStart.localeCompare(b.weekStart) || a.order - b.order,
      ),
      tasks,
    };
  }, [project.id]);

  const add = async () => {
    if (!title.trim()) return;
    await createMilestone({ projectId: project.id, title, weekStart: week });
    setTitle('');
  };

  const toggle = async (id: string) => {
    const r = await toggleMilestone(id);
    if (!r) return;
    if (r.done) {
      celebrate(settings.confetti);
      const msg = r.next ? `Next up: ${r.next.title}` : 'Every milestone here is done.';
      toast({ message: settings.gamification ? `+100 XP. ${msg}` : msg, tone: 'xp' });
      announce(`Milestone complete. ${msg}`);
      if (settings.gamification && r.levelsGained > 0) {
        toast({ message: `Level ${r.levelAfter.level}: ${r.levelAfter.title}`, tone: 'xp' });
      }
    }
  };

  const milestones = data?.milestones ?? [];
  return (
    <div className="grid max-w-3xl gap-6">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <label className="grid min-w-56 flex-1 gap-1 text-[13px] text-muted">
          New milestone
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Golden model complete"
          />
        </label>
        <label className="grid gap-1 text-[13px] text-muted">
          Due week
          <Input
            type="date"
            value={week}
            onChange={(e) => setWeek(e.target.value || week)}
            className="w-44"
          />
        </label>
        <Button type="submit" variant="primary" disabled={!title.trim()}>
          <Plus size={15} /> Add
        </Button>
      </form>

      {milestones.length ? (
        <ol className="relative grid gap-0 border-l-2 border-border pl-0">
          {milestones.map((m) => {
            const linked = (data?.tasks ?? []).filter((t) => t.milestoneId === m.id);
            const linkedDone = linked.filter((t) => t.status === 'done').length;
            const past = !m.done && m.weekStart < currentWeek;
            return (
              <li key={m.id} className="relative grid gap-1 py-3 pl-7">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={m.done}
                  aria-label={`${m.done ? 'Mark not done' : 'Complete milestone'}: ${m.title}`}
                  onClick={() => void toggle(m.id)}
                  className={`absolute top-3.5 -left-[13px] grid size-6 place-items-center rounded-full border-2 bg-surface ${
                    m.done
                      ? 'border-(--pc) bg-(--pc) text-bg'
                      : 'border-muted/60 hover:border-(--pc)'
                  }`}
                >
                  {m.done ? <Check size={13} strokeWidth={3} /> : null}
                </button>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <input
                      defaultValue={m.title}
                      aria-label="Milestone title"
                      onBlur={(e) =>
                        e.target.value.trim() &&
                        e.target.value !== m.title &&
                        void updateMilestone(m.id, { title: e.target.value })
                      }
                      className={`w-full bg-transparent text-sm font-medium outline-none focus:underline ${m.done ? 'text-muted line-through' : ''}`}
                    />
                    <p className={`text-[12px] ${past ? 'text-warn' : 'text-muted'}`}>
                      {weekLabel(m.weekStart, currentWeek)} · {formatWeekRange(m.weekStart)}
                      {past ? ' · still open, no stress' : ''}
                    </p>
                  </div>
                  <input
                    type="date"
                    aria-label={`Due week for ${m.title}`}
                    value={m.weekStart}
                    onChange={(e) =>
                      e.target.value && void updateMilestone(m.id, { weekStart: e.target.value })
                    }
                    className="hidden rounded-md border border-border bg-bg px-2 py-1 text-[12px] text-muted sm:block"
                  />
                  <IconButton
                    label={`Delete ${m.title}`}
                    size="sm"
                    onClick={() => void deleteMilestone(m.id)}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
                {linked.length ? (
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-40 overflow-hidden rounded-full bg-border">
                      <div
                        className="h-full rounded-full bg-(--pc)"
                        style={{ width: `${(linkedDone / linked.length) * 100}%` }}
                      />
                    </div>
                    <span className="tabular text-[12px] text-muted">
                      {linkedDone}/{linked.length} linked tasks
                    </span>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState message="No milestones yet. Add the next checkpoint above." />
      )}
    </div>
  );
}
