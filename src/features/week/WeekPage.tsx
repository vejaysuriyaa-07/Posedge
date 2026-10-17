import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, Flag, RotateCw, Star } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useToast } from '../../app/Toasts';
import { useUi } from '../../app/ui';
import { Button, IconButton } from '../../components/Button';
import { ProgressRing } from '../../components/ProgressRing';
import { db } from '../../db/db';
import { rollOverUnfinished } from '../../db/ops/tasks';
import { addWeeksStr, formatWeekRange, isDateStr, mondayOf, weekLabel } from '../../domain/week';
import { useProjects } from '../../hooks/useData';
import { useToday } from '../../hooks/useToday';
import { WeekBoard } from './WeekBoard';

export default function WeekPage() {
  const params = useParams();
  const navigate = useNavigate();
  const today = useToday();
  const currentWeek = mondayOf(today);
  const weekStart =
    params.weekStart && isDateStr(params.weekStart) ? mondayOf(params.weekStart) : currentWeek;
  const ui = useUi();
  const { setViewedWeek } = ui;
  useEffect(() => {
    setViewedWeek(weekStart);
  }, [weekStart, setViewedWeek]);
  const { byId } = useProjects();
  const { toast } = useToast();

  const data = useLiveQuery(async () => {
    const [week, milestones] = await Promise.all([
      db.tasks.where('weekStart').equals(weekStart).toArray(),
      db.milestones.where('weekStart').equals(weekStart).toArray(),
    ]);
    return { week: week.sort((a, b) => a.order - b.order), milestones };
  }, [weekStart]);

  const weekTasks = data?.week ?? [];
  const doneCount = weekTasks.filter((t) => t.status === 'done').length;
  const big3 = weekTasks.filter((t) => t.isBig3);
  const isPast = weekStart < currentWeek;
  const unfinished = weekTasks.filter((t) => t.status !== 'done').length;
  const go = (w: string) => navigate(w === currentWeek ? '/week' : `/week/${w}`);

  return (
    <section className="mx-auto grid max-w-[1500px] grid-cols-1 gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <IconButton label="Previous week" onClick={() => go(addWeeksStr(weekStart, -1))}>
            <ChevronLeft size={18} />
          </IconButton>
          <Button
            size="sm"
            variant={weekStart === currentWeek ? 'primary' : 'secondary'}
            onClick={() => go(currentWeek)}
          >
            This week
          </Button>
          <IconButton label="Next week" onClick={() => go(addWeeksStr(weekStart, 1))}>
            <ChevronRight size={18} />
          </IconButton>
        </div>
        <div className="min-w-0">
          <h1 className="text-xl">{weekLabel(weekStart, currentWeek)}</h1>
          <p className="text-[13px] text-muted">{formatWeekRange(weekStart)}</p>
        </div>
        <ProgressRing
          value={weekTasks.length ? doneCount / weekTasks.length : 0}
          size={44}
          stroke={5}
          label={`${doneCount} of ${weekTasks.length} tasks done this week`}
        >
          <span className="tabular text-[11px] font-semibold">
            {weekTasks.length ? Math.round((doneCount / weekTasks.length) * 100) : 0}%
          </span>
        </ProgressRing>
        <div className="flex min-w-0 basis-full flex-wrap items-center gap-1.5 sm:basis-auto sm:flex-1">
          {big3.map((t) => {
            const p = byId.get(t.projectId);
            return (
              <button
                key={t.id}
                type="button"
                data-pc={p?.color}
                onClick={() => ui.openTask(t.id)}
                className={`flex max-w-56 items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[12px] ${t.status === 'done' ? 'text-muted line-through' : ''}`}
              >
                <Star size={12} className="shrink-0 fill-amber-400 text-amber-500" aria-hidden />
                <span className="truncate">{t.title}</span>
              </button>
            );
          })}
          {data?.milestones.map((m) => {
            const p = byId.get(m.projectId);
            return (
              <Link
                key={m.id}
                to={`/projects/${m.projectId}?tab=milestones`}
                data-pc={p?.color}
                className={`flex max-w-56 items-center gap-1.5 rounded-full bg-(--pc-tint) px-2.5 py-1 text-[12px] text-(--pc-fg) ${m.done ? 'line-through opacity-70' : ''}`}
              >
                <Flag size={12} className="shrink-0" aria-hidden />
                <span className="truncate">{m.title}</span>
              </Link>
            );
          })}
        </div>
        {isPast && unfinished > 0 ? (
          <Button
            size="sm"
            onClick={async () => {
              const n = await rollOverUnfinished(weekStart, currentWeek);
              toast(`Moved ${n} unfinished task${n === 1 ? '' : 's'} to this week's backlog.`);
            }}
          >
            <RotateCw size={14} /> Roll over unfinished
          </Button>
        ) : null}
      </header>

      <WeekBoard weekStart={weekStart} />
    </section>
  );
}
