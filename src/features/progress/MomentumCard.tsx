import { TrendingDown, TrendingUp } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Project } from '../../db/types';
import { formatDelta } from '../../domain/momentum';
import { formatDate } from '../../domain/week';
import { useIsDark } from '../../hooks/useIsDark';
import { useMomentum } from '../../hooks/useMomentum';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const axisProps = {
  stroke: 'var(--pe-muted)',
  tick: { fill: 'var(--pe-muted)', fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

/**
 * Momentum on Progress: the overall score over 90 days (a single series, so no legend), and
 * each project's score as a short ranked list.
 */
export function MomentumCard({ projects }: { projects: Project[] }) {
  const data = useMomentum(90);
  const dark = useIsDark();
  const animate = !useReducedMotion();
  if (!data) return <section className="h-80 rounded-xl border border-border bg-surface" />;
  const { overall } = data;
  const stroke = dark ? '#a78bfa' : '#7c3aed';
  const points = overall.series.map((p) => ({ date: p.date, score: Math.round(p.score * 100) }));
  const ranked = projects
    .map((p) => ({ p, m: data.byProject.get(p.id) }))
    .sort((a, b) => (b.m?.score ?? -1) - (a.m?.score ?? -1));
  const Trend = overall.delta < 0 ? TrendingDown : TrendingUp;

  return (
    <section
      aria-labelledby="momentum-title"
      className="grid grid-cols-1 gap-5 rounded-xl border border-border bg-surface p-4 shadow-card lg:grid-cols-[minmax(0,1fr)_17rem]"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <div>
            <h2 id="momentum-title" className="text-sm">
              Momentum
            </h2>
            <p className="mt-0.5 text-[12px] text-muted">
              Every active day lifts it and a quiet day only dips it. Projects aim for three days a
              week; rest days and freezes don&apos;t count.
            </p>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="tabular text-3xl font-semibold">{overall.score}%</span>
            <span className="inline-flex items-center gap-1 text-[12px] text-muted">
              <Trend size={13} aria-hidden />
              {formatDelta(overall.delta)} this week
            </span>
          </div>
        </div>
        <div className="mt-3 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ left: -18, right: 6, top: 6 }}>
              <defs>
                <linearGradient id="momentum-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--pe-border)" />
              <XAxis
                dataKey="date"
                {...axisProps}
                minTickGap={36}
                tickFormatter={(d: string) => formatDate(d, 'MMM d')}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                {...axisProps}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--pe-elevated)',
                  border: '1px solid var(--pe-border)',
                  borderRadius: 10,
                  color: 'var(--pe-fg)',
                  fontSize: 12,
                }}
                labelStyle={{ color: 'var(--pe-muted)' }}
                itemStyle={{ color: 'var(--pe-fg)' }}
                cursor={{ stroke: 'var(--pe-muted)', strokeDasharray: '3 3' }}
                labelFormatter={(d) => formatDate(String(d), 'EEE, MMM d')}
                separator=": "
                formatter={(v) => [`${v}%`, 'Momentum']}
              />
              <Area
                type="monotone"
                dataKey="score"
                stroke={stroke}
                strokeWidth={2}
                fill="url(#momentum-fill)"
                isAnimationActive={animate}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--pe-surface)' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="min-w-0">
        <h3 className="mb-2 text-[12px] font-semibold text-muted">By project</h3>
        <ul className="grid grid-cols-1 gap-2.5">
          {ranked.map(({ p, m }) => (
            <li key={p.id} data-pc={p.color} className="grid gap-1">
              <div className="flex min-w-0 items-center gap-2 text-[13px]">
                <span aria-hidden>{p.emoji}</span>
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="tabular font-medium">{m?.score ?? 0}%</span>
                <span className="tabular w-8 text-right text-[11.5px] text-muted">
                  {m ? formatDelta(m.delta) : ''}
                </span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-border"
                role="meter"
                aria-label={`${p.name} momentum`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={m?.score ?? 0}
              >
                <div
                  className="h-full rounded-full bg-(--pc) transition-[width] duration-700 ease-out"
                  style={{ width: `${m?.score ?? 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
