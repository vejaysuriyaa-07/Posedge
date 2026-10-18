import { useId } from 'react';
import { sparkDomain, sparkPaths, type MomentumPoint } from '../domain/momentum';

const W = 120;
const H = 28;

/** A small momentum line with a soft fill, in the surrounding project color (`--pc`). */
export function Sparkline({
  series,
  label,
  className = '',
}: {
  series: MomentumPoint[];
  label: string;
  className?: string;
}) {
  const id = `spark-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  // Each sparkline shows its own trend; the number beside it carries the absolute score.
  const { line, area } = sparkPaths(series, W, H, 2, sparkDomain(series));
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={`block h-7 w-full overflow-visible ${className}`}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--pc, var(--pe-brand))" stopOpacity={0.3} />
          <stop offset="100%" stopColor="var(--pc, var(--pe-brand))" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path
        d={line}
        fill="none"
        stroke="var(--pc, var(--pe-brand))"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
