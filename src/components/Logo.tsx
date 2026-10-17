import { useId } from 'react';

/** The Posedge mark: a square wave whose rising edge is highlighted. */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      className={className}
      role="img"
      aria-label="Posedge"
    >
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#38BDF8" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill={`url(#${id}-g)`} />
      <polyline
        points="84,336 172,336 172,176 340,176 340,336 428,336"
        fill="none"
        stroke="#fff"
        strokeWidth="36"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="172"
        y1="336"
        x2="172"
        y2="176"
        stroke="#FDE68A"
        strokeWidth="40"
        strokeLinecap="round"
      />
    </svg>
  );
}
