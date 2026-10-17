import type { ReactNode } from 'react';

/** One friendly line plus an optional primary action. No mascots. */
export function EmptyState({
  message,
  action,
  className = '',
}: {
  message: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 py-10 text-center ${className}`}
    >
      <p className="text-muted">{message}</p>
      {action}
    </div>
  );
}
