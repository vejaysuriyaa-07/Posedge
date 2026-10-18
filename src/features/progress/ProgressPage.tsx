import { useLiveQuery } from 'dexie-react-hooks';
import { Flag, Flame, Snowflake, Star, Trophy } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { EmptyState } from '../../components/EmptyState';
import { Heatmap, type HeatmapDay } from '../../components/Heatmap';
import { ProgressRing } from '../../components/ProgressRing';
import { ProjectBadge } from '../../components/ProjectBadge';
import { Select } from '../../components/Field';
import { db } from '../../db/db';
import type { Project } from '../../db/types';
import { accentHex } from '../../domain/colors';
import { formatHours } from '../../domain/capacity';
import { lastWeeks, reviewsPerDay, weeklyDoneByProject } from '../../domain/progress';
import { addWeeksStr, atHour, dateOfIso, formatDate, mondayOf, parseDate } from '../../domain/week';
import { levelInfo } from '../../domain/xp';
import { useProjects } from '../../hooks/useData';
import { useIsDark } from '../../hooks/useIsDark';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useSettings } from '../../hooks/useSettings';
import { useStreak } from '../../hooks/useStreak';
import { useToday } from '../../hooks/useToday';
import { MomentumCard } from './MomentumCard';

const tooltipStyle = {
  contentStyle: {
    background: 'var(--pe-elevated)',
    border: '1px solid var(--pe-border)',
    borderRadius: 10,
    color: 'var(--pe-fg)',
    fontSize: 12,
  },
  labelStyle: { color: 'var(--pe-muted)' },
  itemStyle: { color: 'var(--pe-fg)' },
  cursor: { fill: 'color-mix(in srgb, var(--pe-muted) 12%, transparent)' },
};
const axisProps = {
  stroke: 'var(--pe-muted)',
  tick: { fill: 'var(--pe-muted)', fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

function Card({
  title,
  children,
  className = '',
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-border bg-surface p-4 shadow-card ${className}`}>
      <h2 className="mb-3 text-sm">{title}</h2>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2 text-[12px] text-muted">
        {icon}
        {label}
      </div>
      <div className="tabular mt-1 text-2xl font-semibold">{value}</div>
      {sub ? <div className="text-[12px] text-muted">{sub}</div> : null}
    </div>
  );
}

export default function ProgressPage() {
  const today = useToday();
  const settings = useSettings();
  const streak = useStreak();
  const dark = useIsDark();
  const animate = !useReducedMotion();
  const mode = dark ? 'dark' : 'light';
  const { active, byId } = useProjects();
  const [filter, setFilter] = useState('');
  const weekStart = mondayOf(today);

  const data = useLiveQuery(async () => {
    const yearAgo = atHour(addWeeksStr(weekStart, -53), 0).toISOString();
    const [tasks, milestones, activity, logs, cards] = await Promise.all([
      db.tasks.toArray(),
      db.milestones.toArray(),
      db.activityDays.toArray(),
      db.reviewLogs.where('reviewedAt').aboveOrEqual(yearAgo).toArray(),
      db.reviewCards.toArray(),
    ]);
    return { tasks, milestones, activity, logs, cards };
  }, [weekStart]);

  const heat = useMemo(() => {
    const m = new Map<string, HeatmapDay>();
    if (!data) return m;
    const cardProject = new Map(data.cards.map((c) => [c.id, c.projectId]));
    if (!filter) {
      for (const d of data.activity) {
        m.set(d.date, {
          value: d.xp,
          tasks: d.tasksDone,
          reviews: d.reviewsDone,
          focusMin: d.focusMin,
          freezeUsed: d.freezeUsed,
          rest: d.isRestDay,
        });
      }
      return m;
    }
    const get = (date: string) => {
      let d = m.get(date);
      if (!d) m.set(date, (d = { value: 0, tasks: 0, reviews: 0, focusMin: 0 }));
      return d;
    };
    for (const t of data.tasks) {
      if (t.projectId !== filter || t.status !== 'done' || !t.completedAt) continue;
      const d = get(dateOfIso(t.completedAt));
      d.tasks++;
      d.value++;
    }
    for (const l of data.logs) {
      if (cardProject.get(l.cardId) === filter) get(dateOfIso(l.reviewedAt)).reviews++;
    }
    for (const a of data.activity) {
      if (a.freezeUsed || a.isRestDay)
        Object.assign(get(a.date), { freezeUsed: a.freezeUsed, rest: a.isRestDay });
    }
    return m;
  }, [data, filter]);

  const stats = useMemo(() => {
    if (!data) return null;
    const doneIn = (week: string) =>
      data.tasks.filter(
        (t) => t.status === 'done' && t.completedAt && mondayOf(dateOfIso(t.completedAt)) === week,
      ).length;
    const monIso = atHour(weekStart, 0).toISOString();
    return {
      thisWeek: doneIn(weekStart),
      lastWeek: doneIn(addWeeksStr(weekStart, -1)),
      reviewsThisWeek: data.logs.filter((l) => l.reviewedAt >= monIso).length,
    };
  }, [data, weekStart]);

  const weeks = useMemo(() => lastWeeks(today, 12), [today]);
  const weekly = useMemo(() => (data ? weeklyDoneByProject(data.tasks, weeks) : []), [data, weeks]);
  const weeklyProjects = useMemo(
    () => active.filter((p) => weekly.some((r) => typeof r[p.id] === 'number')),
    [active, weekly],
  );

  const donut = useMemo(() => {
    if (!data) return [];
    const from = addWeeksStr(weekStart, -3);
    const sums = new Map<string, number>();
    for (const t of data.tasks) {
      if (!t.weekStart || t.weekStart < from || t.weekStart > weekStart || !t.estimateMin) continue;
      sums.set(t.projectId, (sums.get(t.projectId) ?? 0) + t.estimateMin);
    }
    return [...sums.entries()]
      .map(([pid, min]) => ({ pid, name: byId.get(pid)?.name ?? '?', min }))
      .sort((a, b) => b.min - a.min);
  }, [data, weekStart, byId]);

  const reviews = useMemo(() => (data ? reviewsPerDay(data.logs, today, 30) : []), [data, today]);

  const timeline = useMemo(() => {
    if (!data)
      return {
        points: [] as { x: number; y: number; title: string; done: boolean; pid: string }[],
        projects: [] as Project[],
      };
    const projects = active.filter((p) => data.milestones.some((m) => m.projectId === p.id));
    const rowOf = new Map(projects.map((p, i) => [p.id, i]));
    const points = data.milestones
      .filter((m) => rowOf.has(m.projectId))
      .map((m) => ({
        x: parseDate(m.weekStart).getTime(),
        y: rowOf.get(m.projectId)!,
        title: m.title,
        done: m.done,
        pid: m.projectId,
      }));
    return { points, projects };
  }, [data, active]);

  const wins = useMemo(() => {
    if (!data) return [];
    const ms = data.milestones
      .filter((m) => m.done && m.doneAt)
      .map((m) => ({
        key: m.id,
        at: m.doneAt!,
        title: m.title,
        pid: m.projectId,
        kind: 'milestone' as const,
      }));
    const big3 = data.tasks
      .filter((t) => t.isBig3 && t.status === 'done' && t.completedAt)
      .map((t) => ({
        key: t.id,
        at: t.completedAt!,
        title: t.title,
        pid: t.projectId,
        kind: 'big3' as const,
      }));
    return [...ms, ...big3].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20);
  }, [data]);

  const info = levelInfo(settings.xpTotal);

  return (
    <section className="mx-auto grid max-w-6xl grid-cols-1 gap-5">
      <h1 className="text-2xl">Progress</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {settings.gamification ? (
          <div className="col-span-2 flex items-center gap-4 rounded-xl border border-border bg-surface p-4 shadow-card lg:col-span-1">
            <ProgressRing
              value={info.progress}
              size={56}
              label={`Level ${info.level}: ${Math.round(info.progress * 100)}% to level ${info.level + 1}`}
            >
              <span className="tabular text-sm font-semibold">{info.level}</span>
            </ProgressRing>
            <div>
              <div className="font-semibold">{info.title}</div>
              <div className="tabular text-[12px] text-muted">
                {info.xpForNext - info.xpIntoLevel} XP to level {info.level + 1}
              </div>
            </div>
          </div>
        ) : null}
        <Stat
          label="Streak"
          icon={<Flame size={14} className="text-orange-500 dark:text-orange-300" aria-hidden />}
          value={`${streak.count}d`}
          sub={`Longest ${streak.longest}d`}
        />
        <Stat
          label="Freezes"
          icon={<Snowflake size={14} className="text-sky-500 dark:text-sky-300" aria-hidden />}
          value={`${streak.freezes}/3`}
          sub={`${7 - settings.freezeProgress} active days to the next`}
        />
        <Stat
          label="Tasks this week"
          value={stats?.thisWeek ?? 0}
          sub={
            stats
              ? `${stats.thisWeek >= stats.lastWeek ? '+' : ''}${stats.thisWeek - stats.lastWeek} vs last week (${stats.lastWeek})`
              : undefined
          }
        />
        <Stat label="Reviews this week" value={stats?.reviewsThisWeek ?? 0} />
      </div>

      <MomentumCard projects={active} />

      <Card title="Your year">
        <div className="mb-3 flex justify-end">
          <Select
            aria-label="Heatmap filter"
            className="max-w-72"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">All activity (XP)</option>
            {active.map((p) => (
              <option key={p.id} value={p.id}>
                {p.emoji} {p.name} (tasks)
              </option>
            ))}
          </Select>
        </div>
        <Heatmap
          today={today}
          days={heat}
          label={
            filter
              ? `Tasks completed per day for ${byId.get(filter)?.name}`
              : 'Daily XP over the last year'
          }
        />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Tasks done per week (12 weeks)">
          {weeklyProjects.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekly} margin={{ left: -20, right: 4, top: 4 }}>
                  <CartesianGrid vertical={false} stroke="var(--pe-border)" />
                  <XAxis
                    dataKey="weekStart"
                    {...axisProps}
                    tickFormatter={(w: string) => formatDate(w, 'MMM d')}
                  />
                  <YAxis allowDecimals={false} {...axisProps} />
                  <Tooltip
                    {...tooltipStyle}
                    labelFormatter={(w) => `Week of ${formatDate(String(w), 'MMM d')}`}
                  />
                  {weeklyProjects.map((p, i) => (
                    <Bar
                      key={p.id}
                      dataKey={p.id}
                      name={`${p.emoji} ${p.name}`}
                      stackId="a"
                      isAnimationActive={animate}
                      fill={accentHex(p.color, mode)}
                      radius={i === weeklyProjects.length - 1 ? [4, 4, 0, 0] : 0}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState message="Finish a few tasks and the weekly bars will show up here." />
          )}
        </Card>

        <Card title="Estimated hours per project (last 4 weeks)">
          {donut.length ? (
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="h-56 w-56 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      isAnimationActive={animate}
                      data={donut}
                      dataKey="min"
                      nameKey="name"
                      innerRadius="58%"
                      outerRadius="92%"
                      paddingAngle={2}
                      stroke="none"
                    >
                      {donut.map((d) => (
                        <Cell
                          key={d.pid}
                          fill={accentHex(byId.get(d.pid)?.color ?? 'violet', mode)}
                        />
                      ))}
                    </Pie>
                    <Tooltip {...tooltipStyle} formatter={(v) => formatHours(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="grid w-full gap-1.5 text-[13px]">
                {donut.slice(0, 8).map((d) => {
                  const p = byId.get(d.pid);
                  return (
                    <li key={d.pid} className="flex items-center gap-2">
                      {p ? <ProjectBadge project={p} short /> : null}
                      <span className="tabular ml-auto text-muted">{formatHours(d.min)}</span>
                    </li>
                  );
                })}
                {donut.length > 8 ? (
                  <li className="text-[12px] text-muted">+{donut.length - 8} more</li>
                ) : null}
              </ul>
            </div>
          ) : (
            <EmptyState message="Add estimates to planned tasks to see where your time goes." />
          )}
        </Card>

        <Card title="Reviews per day (30 days)">
          {reviews.some((r) => r.reviews) ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={reviews} margin={{ left: -20, right: -10, top: 4 }}>
                  <CartesianGrid vertical={false} stroke="var(--pe-border)" />
                  <XAxis
                    dataKey="date"
                    {...axisProps}
                    tickFormatter={(d: string) => formatDate(d, 'MMM d')}
                    minTickGap={24}
                  />
                  <YAxis yAxisId="n" allowDecimals={false} {...axisProps} />
                  <YAxis
                    yAxisId="r"
                    orientation="right"
                    domain={[0, 100]}
                    {...axisProps}
                    tickFormatter={(v: number) => `${v}%`}
                  />
                  <Tooltip
                    {...tooltipStyle}
                    labelFormatter={(d) => formatDate(String(d), 'EEE, MMM d')}
                  />
                  <Bar
                    isAnimationActive={animate}
                    yAxisId="n"
                    dataKey="reviews"
                    name="Reviews"
                    fill={dark ? '#38bdf8' : '#0284c7'}
                    radius={[3, 3, 0, 0]}
                  />
                  <Line
                    isAnimationActive={animate}
                    yAxisId="r"
                    dataKey="retention"
                    name="Recalled %"
                    stroke={dark ? '#fde68a' : '#b45309'}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState message="Your review history will chart here." />
          )}
        </Card>

        <Card title="Milestones across projects">
          {timeline.points.length ? (
            <div style={{ height: Math.max(160, timeline.projects.length * 34 + 50) }}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ left: 0, right: 12, top: 8 }}>
                  <CartesianGrid stroke="var(--pe-border)" vertical={false} />
                  <XAxis
                    type="number"
                    dataKey="x"
                    domain={['dataMin - 1209600000', 'dataMax + 1209600000']}
                    {...axisProps}
                    tickFormatter={(t: number) =>
                      formatDate(dateOfIso(new Date(t).toISOString()), 'MMM')
                    }
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    domain={[-0.5, timeline.projects.length - 0.5]}
                    ticks={timeline.projects.map((_, i) => i)}
                    reversed
                    width={40}
                    {...axisProps}
                    tickFormatter={(i: number) => timeline.projects[i]?.emoji ?? ''}
                  />
                  <ZAxis range={[90, 90]} />
                  <Tooltip
                    {...tooltipStyle}
                    content={({ active: on, payload }) => {
                      const p =
                        on &&
                        (payload?.[0]?.payload as
                          { title: string; x: number; done: boolean; pid: string } | undefined);
                      if (!p) return null;
                      return (
                        <div className="rounded-lg border border-border bg-elevated px-2.5 py-1.5 text-[12px] shadow-lg">
                          <div className="font-medium">{p.title}</div>
                          <div className="text-muted">
                            {byId.get(p.pid)?.name} · week of{' '}
                            {formatDate(dateOfIso(new Date(p.x).toISOString()), 'MMM d')} ·{' '}
                            {p.done ? 'done' : 'open'}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Scatter
                    data={timeline.points}
                    isAnimationActive={animate}
                    shape={(props: {
                      cx?: number;
                      cy?: number;
                      payload?: { done: boolean; pid: string };
                    }) => {
                      const c = accentHex(
                        byId.get(props.payload?.pid ?? '')?.color ?? 'violet',
                        mode,
                      );
                      return (
                        <circle
                          cx={props.cx}
                          cy={props.cy}
                          r={6}
                          fill={props.payload?.done ? c : 'var(--pe-surface)'}
                          stroke={c}
                          strokeWidth={2}
                        />
                      );
                    }}
                  />
                </ScatterChart>
              </ResponsiveContainer>
              <p className="sr-only">
                {timeline.points.filter((p) => p.done).length} of {timeline.points.length}{' '}
                milestones done.
              </p>
            </div>
          ) : (
            <EmptyState message="Milestones you add to projects show up on this timeline." />
          )}
        </Card>
      </div>

      <Card title="Wins">
        {wins.length ? (
          <ul className="grid gap-2">
            {wins.map((w) => {
              const p = byId.get(w.pid);
              return (
                <li key={w.key} className="flex items-center gap-3 text-sm">
                  {w.kind === 'milestone' ? (
                    <Flag
                      size={15}
                      className="shrink-0 text-violet-500 dark:text-violet-300"
                      aria-label="Milestone"
                    />
                  ) : (
                    <Star
                      size={15}
                      className="shrink-0 fill-amber-400 text-amber-500"
                      aria-label="Big 3"
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate">{w.title}</span>
                  {p ? <ProjectBadge project={p} short /> : null}
                  <span className="text-[12px] text-muted">
                    {formatDate(dateOfIso(w.at), 'MMM d')}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState message="Completed milestones and Big 3 tasks will collect here." />
        )}
      </Card>
      <p className="flex items-center justify-center gap-2 text-[12px] text-muted">
        <Trophy size={13} aria-hidden /> Every day is a posedge.
      </p>
    </section>
  );
}
