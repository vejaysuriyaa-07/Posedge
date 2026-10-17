import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Flag,
  PartyPopper,
  Plus,
  Search,
  Star,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { celebrate } from '../../app/celebrate';
import { useToast } from '../../app/Toasts';
import { Button, IconButton } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Input, Select, Textarea } from '../../components/Field';
import { ProjectBadge } from '../../components/ProjectBadge';
import { db } from '../../db/db';
import {
  createTask,
  deleteTask,
  moveTask,
  restoreTasks,
  setBig3,
  BIG3_MAX,
} from '../../db/ops/tasks';
import { saveWeeklyReview } from '../../db/ops/weeklyReview';
import type { Project, Task } from '../../db/types';
import { formatHours, plannedMinutes } from '../../domain/capacity';
import { reviewTargetWeek } from '../../domain/progress';
import {
  addWeeksStr,
  atHour,
  formatWeekRange,
  weekDays,
  weekLabel,
  mondayOf,
} from '../../domain/week';
import { useProjects } from '../../hooks/useData';
import { useSettings } from '../../hooks/useSettings';
import { useToday } from '../../hooks/useToday';
import { WeekBoard } from '../week/WeekBoard';

const STEPS = ['Celebrate', 'Clean up', 'Plan', 'Assign', 'Reflect'] as const;

export default function WeeklyReviewPage() {
  const today = useToday();
  // Recomputed per render on purpose: crossing Sunday 17:00 switches the target week.
  const target = reviewTargetWeek(new Date());
  const existing = useLiveQuery(() => db.weeklyReviews.get(target), [target], null);
  const [redo, setRedo] = useState(false);
  // Once the wizard is open, keep it open after saving so its closing screen can show.
  const [started, setStarted] = useState<string | null>(null);
  if (existing === null) return null;
  if (!existing && started !== target) setStarted(target);
  if (existing && !redo && started !== target) {
    return (
      <section className="mx-auto grid max-w-2xl grid-cols-1 gap-4">
        <h1 className="text-2xl">Weekly Review</h1>
        <div className="grid gap-3 rounded-xl border border-border bg-surface p-5 shadow-card">
          <p className="flex items-center gap-2 font-medium">
            <Check size={18} className="text-ok" aria-hidden /> Done for{' '}
            {weekLabel(target, mondayOf(today)).toLowerCase()} ({formatWeekRange(target)})
          </p>
          {existing.worked ? (
            <p className="text-sm">
              <span className="text-muted">What worked: </span>
              {existing.worked}
            </p>
          ) : null}
          {existing.change ? (
            <p className="text-sm">
              <span className="text-muted">What changes: </span>
              {existing.change}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Link
              to="/week"
              className="inline-flex min-h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-fg"
            >
              Open the week
            </Link>
            <Button
              onClick={() => {
                setRedo(true);
                setStarted(target);
              }}
            >
              Review again
            </Button>
          </div>
        </div>
      </section>
    );
  }
  return <Wizard key={target} target={target} previous={existing ?? undefined} />;
}

function Stepper({ step, onJump }: { step: number; onJump: (i: number) => void }) {
  return (
    <div>
      <ol className="grid grid-cols-5 gap-2" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => onJump(i)}
              aria-current={i === step ? 'step' : undefined}
              aria-label={`Step ${i + 1}: ${label}`}
              className="grid min-h-6 w-full gap-1.5 text-left"
            >
              <span className={`h-1 rounded-full ${i <= step ? 'bg-brand' : 'bg-border'}`} />
              {/* Labels fit from small tablets up; phones show the current step below. */}
              <span
                className={`hidden text-[12px] whitespace-nowrap sm:inline ${i === step ? 'font-semibold text-fg' : 'text-muted'}`}
                aria-hidden
              >
                <span className="tabular">{i + 1}.</span> {label}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[12px] text-muted sm:hidden" aria-hidden>
        Step {step + 1} of {STEPS.length} ·{' '}
        <span className="font-semibold text-fg">{STEPS[step]}</span>
      </p>
    </div>
  );
}

function Wizard({
  target,
  previous,
}: {
  target: string;
  previous?: { worked: string; change: string };
}) {
  const [step, setStep] = useState(0);
  const [worked, setWorked] = useState(previous?.worked ?? '');
  const [change, setChange] = useState(previous?.change ?? '');
  const [saved, setSaved] = useState(false);
  const settings = useSettings();
  const { toast, announce } = useToast();
  const lastWeek = addWeeksStr(target, -1);
  const { byId } = useProjects();
  const today = useToday();

  const data = useLiveQuery(async () => {
    const from = atHour(lastWeek, 0).toISOString();
    const to = atHour(target, 0).toISOString();
    const [doneLast, msDone, activity, targetTasks, leftovers] = await Promise.all([
      db.tasks.where('completedAt').between(from, to).toArray(),
      db.milestones.filter((m) => !!m.doneAt && m.doneAt >= from && m.doneAt < to).toArray(),
      db.activityDays.where('date').anyOf(weekDays(lastWeek)).toArray(),
      db.tasks.where('weekStart').equals(target).toArray(),
      db.tasks
        .where('weekStart')
        .below(target)
        .filter((t) => t.status !== 'done')
        .toArray(),
    ]);
    return { doneLast, msDone, activity, targetTasks, leftovers };
  }, [lastWeek, target]);

  const celebrateStats = useMemo(() => {
    if (!data) return null;
    const byProject = new Map<string, number>();
    for (const t of data.doneLast)
      byProject.set(t.projectId, (byProject.get(t.projectId) ?? 0) + 1);
    return {
      tasks: data.doneLast.length,
      xp: data.activity.reduce((s, d) => s + d.xp, 0),
      reviews: data.activity.reduce((s, d) => s + d.reviewsDone, 0),
      milestones: data.msDone.length,
      byProject: [...byProject.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [data]);

  const finish = async () => {
    const big3 = (data?.targetTasks ?? []).filter((t) => t.isBig3).map((t) => t.id);
    const wins = celebrateStats
      ? `${celebrateStats.tasks} tasks, ${celebrateStats.milestones} milestones, ${celebrateStats.reviews} reviews`
      : '';
    const r = await saveWeeklyReview({
      weekStart: target,
      big3TaskIds: big3,
      wins,
      worked: worked.trim(),
      change: change.trim(),
      plannedMin: plannedMinutes(data?.targetTasks ?? []),
    });
    setSaved(true);
    celebrate(settings.confetti);
    toast({
      message:
        r.firstTime && settings.gamification
          ? 'Weekly review done. +30 XP'
          : 'Weekly review saved.',
      tone: 'xp',
    });
    announce('Weekly review saved.');
    if (r.levelsGained > 0 && settings.gamification)
      toast({ message: `Level ${r.levelAfter.level}: ${r.levelAfter.title}`, tone: 'xp' });
  };

  if (saved) {
    return (
      <section className="mx-auto grid max-w-2xl grid-cols-1 gap-4 text-center">
        <PartyPopper size={36} className="mx-auto text-brand" aria-hidden />
        <h1 className="text-2xl">
          You&apos;re set for {weekLabel(target, mondayOf(today)).toLowerCase()}
        </h1>
        <p className="text-muted">Big 3 picked, days assigned, lessons noted. Go make it count.</p>
        <div className="flex justify-center gap-2">
          <Link
            to="/week"
            className="inline-flex min-h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-fg"
          >
            Open the week
          </Link>
          <Link
            to="/"
            className="inline-flex min-h-10 items-center rounded-lg px-4 text-sm font-medium text-muted hover:text-fg"
          >
            Today
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className={`mx-auto grid gap-5 ${step === 3 ? 'max-w-[1500px]' : 'max-w-3xl'}`}>
      <header className="grid gap-4">
        <div>
          <h1 className="text-2xl">Weekly Review</h1>
          <p className="text-[13px] text-muted">
            Planning {formatWeekRange(target)} · about 10 minutes
          </p>
        </div>
        <Stepper step={step} onJump={setStep} />
      </header>

      <div className="min-h-64">
        {step === 0 && celebrateStats ? (
          <div className="grid gap-5">
            <h2 className="text-lg">Last week ({formatWeekRange(lastWeek)})</h2>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <BigNumber label="Tasks done" value={celebrateStats.tasks} />
              {settings.gamification ? (
                <BigNumber label="XP earned" value={celebrateStats.xp} />
              ) : null}
              <BigNumber label="Reviews" value={celebrateStats.reviews} />
              <BigNumber label="Milestones" value={celebrateStats.milestones} />
            </dl>
            {celebrateStats.byProject.length ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {celebrateStats.byProject.map(([pid, n]) => {
                  const p = byId.get(pid);
                  return (
                    <li
                      key={pid}
                      className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2"
                    >
                      {p ? <ProjectBadge project={p} /> : null}
                      <span className="tabular ml-auto font-semibold">{n}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-muted">A quiet week. That&apos;s allowed. Fresh start now.</p>
            )}
          </div>
        ) : null}

        {step === 1 ? <CleanUp tasks={data?.leftovers ?? []} target={target} byId={byId} /> : null}
        {step === 2 ? (
          <Plan target={target} targetTasks={data?.targetTasks ?? []} byId={byId} />
        ) : null}
        {step === 3 ? (
          <div className="grid gap-3">
            <p className="text-[13px] text-muted">
              Drag tasks onto days. Bars turn amber when a day is over your capacity (
              {formatHours(plannedMinutes(data?.targetTasks ?? []))} planned this week).
            </p>
            <WeekBoard weekStart={target} showUnplanned quickAdd={false} />
          </div>
        ) : null}
        {step === 4 ? (
          <div className="grid gap-4">
            <label className="grid gap-1.5 text-sm">
              What worked last week?
              <Textarea
                rows={4}
                value={worked}
                onChange={(e) => setWorked(e.target.value)}
                placeholder="Morning study blocks, batching grading…"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              What will I change?
              <Textarea
                rows={4}
                value={change}
                onChange={(e) => setChange(e.target.value)}
                placeholder="Start the lab on Monday, not Thursday…"
              />
            </label>
          </div>
        ) : null}
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-border pt-4">
        <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          <ArrowLeft size={15} /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button variant="primary" onClick={() => setStep((s) => s + 1)}>
            Next: {STEPS[step + 1]} <ArrowRight size={15} />
          </Button>
        ) : (
          <Button variant="primary" onClick={() => void finish()}>
            <Check size={15} /> Save review
          </Button>
        )}
      </footer>
    </section>
  );
}

function BigNumber({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 text-center shadow-card">
      <dd className="tabular text-4xl font-semibold tracking-tight">{value}</dd>
      <dt className="mt-1 text-[12px] text-muted">{label}</dt>
    </div>
  );
}

function CleanUp({
  tasks,
  target,
  byId,
}: {
  tasks: Task[];
  target: string;
  byId: Map<string, Project>;
}) {
  const { toast } = useToast();
  const sorted = [...tasks].sort(
    (a, b) => (a.weekStart ?? '').localeCompare(b.weekStart ?? '') || a.order - b.order,
  );
  if (!sorted.length) return <EmptyState message="Nothing left over. Clean slate." />;
  return (
    <div className="grid gap-2">
      <p className="text-[13px] text-muted">
        Decide what each unfinished task deserves. No guilt either way.
      </p>
      <ul className="grid gap-2">
        {sorted.map((t) => {
          const p = byId.get(t.projectId);
          return (
            <li
              key={t.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{t.title}</span>
                <span className="flex items-center gap-2 text-[11px] text-muted">
                  {p ? <ProjectBadge project={p} short /> : null}
                  from {t.weekStart ? formatWeekRange(t.weekStart) : ''}
                </span>
              </span>
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  onClick={() => void moveTask(t.id, { weekStart: target, day: null })}
                >
                  Keep
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    void moveTask(t.id, { weekStart: addWeeksStr(target, 1), day: null })
                  }
                >
                  Push
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const snap = await deleteTask(t.id);
                    if (snap)
                      toast({
                        message: `Dropped "${t.title}"`,
                        action: { label: 'Undo', onClick: () => void restoreTasks([snap]) },
                      });
                  }}
                >
                  Drop
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void moveTask(t.id, { weekStart: null, day: null })}
                >
                  Unplan
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Plan({
  target,
  targetTasks,
  byId,
}: {
  target: string;
  targetTasks: Task[];
  byId: Map<string, Project>;
}) {
  const { active } = useProjects();
  const settings = useSettings();
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newProject, setNewProject] = useState('');
  const milestones = useLiveQuery(
    () =>
      db.milestones
        .where('weekStart')
        .anyOf([target, addWeeksStr(target, 1)])
        .toArray(),
    [target],
    [],
  );
  const candidates = useLiveQuery(
    async () => {
      const needle = q.trim().toLowerCase();
      if (!needle) return [];
      return db.tasks
        .filter((t) => t.status !== 'done' && !t.isBig3 && t.title.toLowerCase().includes(needle))
        .limit(8)
        .toArray();
    },
    [q],
    [],
  );
  const big3 = targetTasks.filter((t) => t.isBig3);
  const full = big3.length >= BIG3_MAX;

  const pick = async (t: Task) => {
    if (t.weekStart !== target)
      await moveTask(t.id, {
        weekStart: target,
        day: t.day && mondayOf(t.day) === target ? t.day : null,
      });
    const ok = await setBig3(t.id, true);
    if (!ok) toast({ message: 'Already 3 Big 3 tasks this week.', tone: 'warn' });
    setQ('');
  };

  const create = async () => {
    const pid = newProject || settings.lastProjectId || active[0]?.id;
    if (!newTitle.trim() || !pid) return;
    await createTask({ projectId: pid, title: newTitle, weekStart: target, isBig3: true });
    setNewTitle('');
  };

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="mb-2 text-sm text-muted">Milestones due this week and next</h2>
        {milestones.length ? (
          <ul className="grid gap-1.5">
            {milestones.map((m) => {
              const p = byId.get(m.projectId);
              return (
                <li
                  key={m.id}
                  data-pc={p?.color}
                  className={`flex items-center gap-2 text-sm ${m.done ? 'text-muted line-through' : ''}`}
                >
                  <Flag size={14} className="text-(--pc)" aria-hidden />
                  <span className="flex-1">{m.title}</span>
                  <span className="text-[12px] text-muted">
                    {m.weekStart === target ? 'due this week' : 'due the week after'}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[13px] text-muted">
            No milestones due. A good week to make progress anywhere.
          </p>
        )}
      </div>

      <div className="grid gap-3">
        <h2 className="flex items-center gap-2 text-sm text-muted">
          <Star size={15} className="fill-amber-400 text-amber-500" aria-hidden /> Big 3 for{' '}
          {formatWeekRange(target)}
          <span className="tabular">({big3.length}/3)</span>
        </h2>
        {big3.length ? (
          <ul className="grid gap-2">
            {big3.map((t) => {
              const p = byId.get(t.projectId);
              return (
                <li
                  key={t.id}
                  className="flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                  {p ? <ProjectBadge project={p} short /> : null}
                  <IconButton
                    label={`Remove ${t.title} from Big 3`}
                    size="sm"
                    onClick={() => void setBig3(t.id, false)}
                  >
                    <X size={14} />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        ) : null}
        {!full ? (
          <div className="grid gap-3 rounded-xl border border-border bg-surface p-3">
            <div className="relative">
              <Search size={15} className="absolute top-3 left-3 text-muted" aria-hidden />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search existing tasks"
                aria-label="Search tasks for Big 3"
                className="pl-9"
              />
            </div>
            {candidates.length ? (
              <ul className="grid gap-1">
                {candidates.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => void pick(t)}
                      className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-elevated"
                    >
                      <Plus size={14} className="text-muted" aria-hidden />
                      <span className="flex-1 truncate">{t.title}</span>
                      <span aria-hidden>{byId.get(t.projectId)?.emoji}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
            >
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="…or create a new one"
                aria-label="New Big 3 task"
                className="min-w-48 flex-1"
              />
              <Select
                aria-label="Project"
                className="w-auto"
                value={newProject || settings.lastProjectId || active[0]?.id || ''}
                onChange={(e) => setNewProject(e.target.value)}
              >
                {active.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.emoji} {p.name}
                  </option>
                ))}
              </Select>
              <Button type="submit" disabled={!newTitle.trim()}>
                <Plus size={15} /> Add
              </Button>
            </form>
          </div>
        ) : (
          <p className="text-[13px] text-muted">Three is plenty. Remove one to swap.</p>
        )}
      </div>
    </div>
  );
}
