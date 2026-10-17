import type { ReactNode } from 'react';

/** SVG progress ring with an animated stroke-dashoffset (static under reduced motion via CSS). */
export function ProgressRing({
  value,
  size = 56,
  stroke = 6,
  label,
  children,
  color = 'var(--pe-brand)',
  className = '',
}: {
  value: number;
  size?: number;
  stroke?: number;
  label: string;
  children?: ReactNode;
  color?: string;
  className?: string;
}) {
  const v = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      role="img"
      aria-label={label}
      className={`relative inline-grid shrink-0 place-items-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        className="-rotate-90"
        style={{ filter: 'var(--pe-ring-glow)' }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--pe-border)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: 'stroke-dashoffset 600ms ease-out' }}
        />
      </svg>
      {children ? <div className="absolute inset-0 grid place-items-center">{children}</div> : null}
    </div>
  );
}
