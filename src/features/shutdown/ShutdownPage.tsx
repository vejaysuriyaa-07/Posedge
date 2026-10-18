import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, CalendarArrowUp, Inbox, Moon, Pencil, Sun } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useToast } from '../../app/Toasts';
import { Button } from '../../components/Button';
import { Textarea } from '../../components/Field';
import { ProjectBadge } from '../../components/ProjectBadge';
import { db } from '../../db/db';
import { carryOver, restorePlans, saveDayLog, type PlanSnapshot } from '../../db/ops/shutdown';
import type { DayLog, Project, Task } from '../../db/types';
import { formatMinutes } from '../../domain/quickAddParser';
import { ENERGY_LABELS, nextWorkDay, shutdownDate } from '../../domain/shutdown';
import { atHour, formatDate } from '../../domain/week';
import { useCountUp } from '../../hooks/useCountUp';
import { useProjects } from '../../hooks/useData';
import { useSettings } from '../../hooks/useSettings';
import { useNow } from '../../hooks/useNow';

type Choice = 'tomorrow' | 'backlog' | 'keep';

const byCompleted = (a: Task, b: Task) => (a.completedAt ?? '').localeCompare(b.completedAt ?? '');

/** Daily shutdown: the day's tally, carry-over for what's left, and a line about how it went. */
export default function ShutdownPage() {
  // Before 4am the previous day is still the one closing; the clock keeps this current.
  const now = useNow(60_000);
  const date = shutdownDate(new Date(now));
  const settings = useSettings();
  const next = nextWorkDay(date, settings.restDays);
  const { byId } = useProjects();

  const data = useLiveQuery(async () => {
    const [done, planned, activity, log, tomorrow] = await Promise.all([
      db.tasks
        .where('completedAt')
        .between(atHour(date, 0).toISOString(), atHour(next, 0).toISOString(), true, false)
        .toArray(),
      db.tasks.where('day').equals(date).toArray(),
      db.activityDays.get(date),
      db.dayLogs.get(date),
      db.tasks.where('day').equals(next).toArray(),
    ]);
    return {
      done: done.filter((t) => t.status === 'done').sort(byCompleted),
      open: planned.filter((t) => t.status !== 'done').sort((a, b) => a.order - b.order),
      activity,
      log,
      tomorrow: tomorrow.filter((t) => t.status !== 'done').sort((a, b) => a.order - b.order),
    };
  }, [date, next]);

  const [editing, setEditing] = useState(false);
  if (!data) return <div className="p-6" aria-busy="true" />;
  const closed = !!data.log && !editing;

  return (
    <section className="mx-auto grid max-w-3xl grid-cols-1 gap-5">
      <Hero
        date={date}
        closed={closed}
        tasks={data.done.length}
        focusMin={data.activity?.focusMin ?? 0}
        xp={settings.gamification ? (data.activity?.xp ?? 0) : null}
        reviews={data.activity?.reviewsDone ?? 0}
      />
      {closed ? (
        <Closed
          log={data.log!}
          next={next}
          tomorrow={data.tomorrow}
          byId={byId}
          onEdit={() => setEditing(true)}
        />
      ) : (
        <ShutdownForm
          key={data.log?.shutdownAt ?? 'new'}
          date={date}
          next={next}
          done={data.done}
          open={data.open}
          log={data.log}
          byId={byId}
          onSaved={() => setEditing(false)}
        />
      )}
    </section>
  );
}

function Hero({
  date,
  closed,
  tasks,
  focusMin,
  xp,
  reviews,
}: {
  date: string;
  closed: boolean;
  tasks: number;
  focusMin: number;
  xp: number | null;
  reviews: number;
}) {
  const weekday = formatDate(date, 'EEEE');
  const t = useCountUp(tasks);
  const f = useCountUp(focusMin);
  const x = useCountUp(xp ?? 0);
  const r = useCountUp(reviews);
  return (
    <header className="pe-sunset relative overflow-hidden rounded-2xl border border-border p-5 sm:p-8">
      <SunsetArt />
      <div className="relative">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-muted uppercase">
          <Moon size={13} aria-hidden /> Daily shutdown
        </p>
        <h1 className="mt-1 pr-24 text-3xl font-semibold tracking-tight sm:pr-0 sm:text-4xl">
          {closed ? `${weekday}, wrapped` : `Wrapping up ${weekday}`}
        </h1>
        <p className="mt-1 text-muted">{formatDate(date, 'MMMM d')}</p>
        <dl className="mt-6 grid grid-cols-2 gap-2 sm:mt-8 sm:grid-cols-4">
          <Tile label="Tasks done" value={String(t)} />
          <Tile label="Focus" value={focusMin ? formatMinutes(f) : '–'} />
          {xp !== null ? <Tile label="XP earned" value={`+${x}`} /> : null}
          <Tile label="Cards reviewed" value={String(r)} />
        </dl>
      </div>
    </header>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface/70 px-3 py-2.5 backdrop-blur-md">
      <dt className="text-[11.5px] text-muted">{label}</dt>
      <dd className="tabular mt-0.5 text-2xl font-semibold">{value}</dd>
    </div>
  );
}

/** A sun easing down to the horizon, with its reflection. */
function SunsetArt() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 220 150"
      className="pointer-events-none absolute -top-1 right-0 h-24 w-36 opacity-80 sm:-top-2 sm:h-48 sm:w-72 sm:opacity-90"
    >
      <defs>
        <linearGradient id="pe-sun-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="55%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#f43f5e" />
        </linearGradient>
        <clipPath id="pe-sky">
          <rect x="0" y="0" width="220" height="100" />
        </clipPath>
        <filter id="pe-sun-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <g clipPath="url(#pe-sky)">
        <g className="pe-sun">
          <circle
            cx="140"
            cy="98"
            r="46"
            fill="url(#pe-sun-g)"
            opacity="0.45"
            filter="url(#pe-sun-glow)"
          />
          <circle cx="140" cy="98" r="38" fill="url(#pe-sun-g)" />
        </g>
      </g>
      <line
        x1="20"
        y1="100"
        x2="220"
        y2="100"
        stroke="#fb923c"
        strokeOpacity="0.5"
        strokeWidth="1"
      />
      {[0, 1, 2, 3].map((i) => (
        <line
          key={i}
          x1={140 - (30 - i * 7)}
          x2={140 + (30 - i * 7)}
          y1={108 + i * 8}
          y2={108 + i * 8}
          stroke="#fb923c"
          strokeOpacity={0.55 - i * 0.12}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

function Card({
  title,
  action,
  children,
  delay = 0,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  delay?: number;
}) {
  return (
    <section
      className="pe-rise grid grid-cols-1 gap-3 rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function ShutdownForm({
  date,
  next,
  done,
  open,
  log,
  byId,
  onSaved,
}: {
  date: string;
  next: string;
  done: Task[];
  open: Task[];
  log?: DayLog;
  byId: Map<string, Project>;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [energy, setEnergy] = useState<number | undefined>(log?.energy);
  const [note, setNote] = useState(log?.note ?? '');
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const nextLabel = formatDate(next, 'EEE');
  const shownDone = showAll ? done : done.slice(0, 6);

  const shutDown = async () => {
    setSaving(true);
    try {
      const pick = (c: Choice) => open.filter((t) => choices[t.id] === c).map((t) => t.id);
      const snaps: PlanSnapshot[] = [
        ...(await carryOver(pick('tomorrow'), 'tomorrow', next)),
        ...(await carryOver(pick('backlog'), 'backlog', next)),
      ];
      await saveDayLog({ date, energy, note });
      onSaved();
      if (snaps.length) {
        toast({
          message: `Moved ${snaps.length} task${snaps.length === 1 ? '' : 's'} forward. Day closed.`,
          action: { label: 'Undo move', onClick: () => void restorePlans(snaps) },
          duration: 8000,
        });
      } else {
        toast('Day closed. Rest well.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card
        title="What got done"
        delay={60}
        action={<span className="tabular text-[13px] text-muted">{done.length}</span>}
      >
        {done.length ? (
          <>
            <ul className="grid grid-cols-1 gap-1">
              {shownDone.map((t) => {
                const p = byId.get(t.projectId);
                return (
                  <li key={t.id} className="flex min-w-0 items-center gap-2.5 py-1 text-[14px]">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-ok/15 text-ok">
                      <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
                        <path
                          d="M2.5 6.2 5 8.5l4.5-5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    {p ? <ProjectBadge project={p} short className="shrink-0" /> : null}
                  </li>
                );
              })}
            </ul>
            {done.length > 6 ? (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="justify-self-start text-[13px] font-medium text-brand hover:underline"
              >
                {showAll ? 'Show fewer' : `Show all ${done.length}`}
              </button>
            ) : null}
          </>
        ) : (
          <p className="text-[14px] text-muted">Nothing checked off today. Rest days count too.</p>
        )}
      </Card>

      {open.length ? (
        <Card
          title="Still open"
          delay={120}
          action={
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setChoices(Object.fromEntries(open.map((t) => [t.id, 'tomorrow'])))}
            >
              <CalendarArrowUp size={14} /> All to {nextLabel}
            </Button>
          }
        >
          <p className="-mt-1 text-[13px] text-muted">
            Choose where each one goes. Nothing moves until you shut down.
          </p>
          <ul className="grid grid-cols-1 gap-2">
            {open.map((t) => {
              const p = byId.get(t.projectId);
              const choice = choices[t.id] ?? 'keep';
              const set = (c: Choice) => setChoices((s) => ({ ...s, [t.id]: c }));
              return (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-bg/40 px-3 py-2"
                >
                  <span className="flex min-w-0 flex-1 basis-48 items-center gap-2">
                    <span aria-hidden>{p?.emoji}</span>
                    <span className="truncate text-[14px]">{t.title}</span>
                    {t.estimateMin ? (
                      <span className="tabular shrink-0 text-[12px] text-muted">
                        ~{formatMinutes(t.estimateMin)}
                      </span>
                    ) : null}
                  </span>
                  <div
                    role="radiogroup"
                    aria-label={`Where ${t.title} goes`}
                    className="flex shrink-0 rounded-lg border border-border p-0.5 text-[12.5px]"
                  >
                    {(
                      [
                        ['tomorrow', nextLabel, ArrowRight],
                        ['backlog', 'Backlog', Inbox],
                        ['keep', 'Keep', null],
                      ] as const
                    ).map(([c, label, Icon]) => (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={choice === c}
                        onClick={() => set(c)}
                        className={`inline-flex min-h-8 items-center gap-1 rounded-md px-2.5 font-medium transition pointer-coarse:min-h-10 ${choice === c ? 'bg-brand text-brand-fg shadow-sm' : 'text-muted hover:text-fg'}`}
                      >
                        {Icon ? <Icon size={13} aria-hidden /> : null}
                        {label}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      <Card title="How did today feel?" delay={180}>
        <div role="radiogroup" aria-label="Energy" className="grid grid-cols-5 gap-1.5 sm:gap-2">
          {ENERGY_LABELS.map((label, i) => {
            const v = i + 1;
            const on = energy === v;
            return (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setEnergy(on ? undefined : v)}
                className={`flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border px-1 text-[11.5px] font-medium transition ${on ? 'border-brand bg-brand/10 text-fg' : 'border-border text-muted hover:text-fg'}`}
              >
                <EnergyBars level={v} on={on} />
                {label}
              </button>
            );
          })}
        </div>
        <label className="grid gap-1.5">
          <span className="text-[13px] text-muted">One line about today (optional)</span>
          <Textarea
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What went well, or what to remember tomorrow"
          />
        </label>
      </Card>

      <div
        className="pe-rise flex flex-wrap items-center justify-end gap-3"
        style={{ animationDelay: '240ms' }}
      >
        <Link to="/" className="text-[14px] text-muted hover:text-fg">
          Not yet
        </Link>
        <Button
          variant="primary"
          onClick={() => void shutDown()}
          disabled={saving}
          className="min-h-11 px-5"
        >
          <Moon size={16} /> {log ? 'Save changes' : 'Shut down'}
        </Button>
      </div>
    </>
  );
}

function EnergyBars({ level, on }: { level: number; on: boolean }) {
  return (
    <span aria-hidden className="flex h-5 items-end gap-0.5">
      {[1, 2, 3, 4, 5].map((b) => (
        <span
          key={b}
          className={`w-1 rounded-full transition-colors ${b <= level ? (on ? 'bg-brand' : 'bg-muted/60') : 'bg-border'}`}
          style={{ height: `${b * 4}px` }}
        />
      ))}
    </span>
  );
}

function Closed({
  log,
  next,
  tomorrow,
  byId,
  onEdit,
}: {
  log: DayLog;
  next: string;
  tomorrow: Task[];
  byId: Map<string, Project>;
  onEdit: () => void;
}) {
  const minutes = tomorrow.reduce((s, t) => s + (t.estimateMin ?? 0), 0);
  return (
    <>
      <Card title={`Good stopping point. See you ${formatDate(next, 'EEEE')}.`} delay={60}>
        {log.energy || log.note ? (
          <div className="grid gap-1 rounded-lg bg-elevated/60 p-3 text-[14px]">
            {log.energy ? (
              <p className="flex items-center gap-2 text-muted">
                <EnergyBars level={log.energy} on /> Felt{' '}
                {ENERGY_LABELS[log.energy - 1]!.toLowerCase()}
              </p>
            ) : null}
            {log.note ? <p className="break-words whitespace-pre-line">{log.note}</p> : null}
          </div>
        ) : null}
        <div>
          <p className="mb-2 text-[13px] font-semibold text-muted">
            {tomorrow.length
              ? `${formatDate(next, 'EEEE')}: ${tomorrow.length} task${tomorrow.length === 1 ? '' : 's'}${minutes ? ` · ~${formatMinutes(minutes)}` : ''}`
              : `Nothing planned for ${formatDate(next, 'EEEE')} yet.`}
          </p>
          {tomorrow.length ? (
            <ul className="grid grid-cols-1 gap-1">
              {tomorrow.slice(0, 4).map((t) => {
                const p = byId.get(t.projectId);
                return (
                  <li key={t.id} className="flex min-w-0 items-center gap-2 text-[14px]">
                    <span aria-hidden>{p?.emoji}</span>
                    <span className="truncate">{t.title}</span>
                  </li>
                );
              })}
              {tomorrow.length > 4 ? (
                <li className="text-[13px] text-muted">and {tomorrow.length - 4} more</li>
              ) : null}
            </ul>
          ) : (
            <Link to="/week" className="text-[14px] font-medium text-brand hover:underline">
              Plan from the week
            </Link>
          )}
        </div>
      </Card>
      <div className="pe-rise flex flex-wrap justify-end gap-3" style={{ animationDelay: '120ms' }}>
        <Button variant="ghost" onClick={onEdit}>
          <Pencil size={15} /> Edit
        </Button>
        <Link
          to="/"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-brand-fg shadow-card hover:brightness-110"
        >
          <Sun size={16} /> Back to Today
        </Link>
      </div>
    </>
  );
}
