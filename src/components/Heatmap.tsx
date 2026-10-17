import { Snowflake } from 'lucide-react';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { bucketFor, bucketThresholds, heatmapGrid, type HeatmapCell } from '../domain/progress';
import { formatDate } from '../domain/week';

export interface HeatmapDay {
  value: number;
  tasks: number;
  reviews: number;
  focusMin: number;
  freezeUsed?: boolean;
  rest?: boolean;
}

const CELL = 12;
const GAP = 3;
const LEVEL_CLASS = [
  'fill-border',
  'fill-violet-500/30',
  'fill-violet-500/55',
  'fill-violet-500/80',
  'fill-violet-400',
];

function describe(date: string, d?: HeatmapDay): string {
  const label = formatDate(date, 'MMM d');
  if (!d) return `${label}: no activity`;
  const parts = [
    `${d.tasks} task${d.tasks === 1 ? '' : 's'}`,
    `${d.reviews} review${d.reviews === 1 ? '' : 's'}`,
  ];
  if (d.focusMin) parts.push(`${d.focusMin} focus min`);
  let s = `${label}: ${parts.join(', ')}`;
  if (d.freezeUsed) s += ', streak freeze used';
  if (d.rest) s += ', rest day';
  return s;
}

/**
 * GitHub-style year heatmap: 53 Monday-first columns, 5 intensity buckets, roving keyboard focus
 * (arrow keys), a tooltip per day, snowflakes on freeze days and hatching on rest days.
 */
export function Heatmap({
  today,
  days,
  label,
}: {
  today: string;
  days: Map<string, HeatmapDay>;
  label: string;
}) {
  const cells = useMemo(() => heatmapGrid(today), [today]);
  const thresholds = useMemo(
    () => bucketThresholds([...days.values()].map((d) => d.value)),
    [days],
  );
  const [active, setActive] = useState(() => cells.findIndex((c) => c.date === today));
  const [hover, setHover] = useState<number | null>(null);
  const refs = useRef<(SVGRectElement | null)[]>([]);
  const shown = hover ?? active;
  const shownCell: HeatmapCell | undefined = cells[shown];

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const delta = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    const next = Math.min(cells.length - 1, Math.max(0, active + delta));
    setActive(next);
    refs.current[next]?.focus();
  };

  const width = 53 * (CELL + GAP) + 28;
  const height = 7 * (CELL + GAP) + 18;
  const months = cells.filter((c) => c.row === 0 && Number(c.date.slice(8)) <= 7);

  return (
    <div className="grid gap-2">
      <div className="scrollbar-thin overflow-x-auto pb-1">
        <svg
          width={width}
          height={height}
          role="grid"
          aria-label={label}
          onKeyDown={onKey}
          onMouseLeave={() => setHover(null)}
          className="block"
        >
          <defs>
            <pattern
              id="hm-hatch"
              width="4"
              height="4"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1="0" y1="0" x2="0" y2="4" className="stroke-muted/50" strokeWidth="1.5" />
            </pattern>
          </defs>
          {months.map((c) => (
            <text
              key={c.date}
              x={28 + c.col * (CELL + GAP)}
              y={10}
              className="fill-muted text-[10px]"
            >
              {formatDate(c.date, 'MMM')}
            </text>
          ))}
          {['Mon', 'Wed', 'Fri'].map((d, i) => (
            <text
              key={d}
              x={0}
              y={18 + (i * 2 + 1) * (CELL + GAP) - 3}
              className="fill-muted text-[9px]"
            >
              {d}
            </text>
          ))}
          {cells.map((c, i) => {
            const d = days.get(c.date);
            const level = c.future ? -1 : bucketFor(d?.value ?? 0, thresholds);
            const x = 28 + c.col * (CELL + GAP);
            const y = 18 + c.row * (CELL + GAP);
            return (
              <g key={c.date} role="row" aria-hidden={c.future ? true : undefined}>
                <rect
                  ref={(el) => {
                    refs.current[i] = el;
                  }}
                  role="gridcell"
                  aria-label={describe(c.date, d)}
                  tabIndex={c.future ? undefined : i === active ? 0 : -1}
                  x={x}
                  y={y}
                  width={CELL}
                  height={CELL}
                  rx={3}
                  className={`${c.future ? 'fill-transparent stroke-border' : LEVEL_CLASS[level]} outline-none focus-visible:stroke-fg focus-visible:stroke-2`}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setActive(i)}
                />
                {d?.rest && !c.future ? (
                  <rect
                    x={x}
                    y={y}
                    width={CELL}
                    height={CELL}
                    rx={3}
                    fill="url(#hm-hatch)"
                    pointerEvents="none"
                  />
                ) : null}
                {d?.freezeUsed ? (
                  <text
                    x={x + CELL / 2}
                    y={y + CELL - 2.5}
                    textAnchor="middle"
                    className="fill-sky-400 text-[9px]"
                    pointerEvents="none"
                  >
                    ❄
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[12px] text-muted">
        <span className="min-h-5 flex-1" aria-live="polite">
          {shownCell ? describe(shownCell.date, days.get(shownCell.date)) : ''}
        </span>
        <span className="flex items-center gap-1">
          <Snowflake size={12} className="text-sky-400" aria-hidden /> freeze
        </span>
        <span className="flex items-center gap-1">
          Less
          {LEVEL_CLASS.map((cls) => (
            <svg key={cls} width={CELL} height={CELL} aria-hidden>
              <rect width={CELL} height={CELL} rx={3} className={cls} />
            </svg>
          ))}
          More
        </span>
      </div>
    </div>
  );
}
