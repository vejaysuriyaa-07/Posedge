import type { ReactNode } from 'react';

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-5 items-center justify-center rounded border border-border bg-elevated px-1.5 font-sans text-[11px] font-medium text-muted">
      {children}
    </kbd>
  );
}
