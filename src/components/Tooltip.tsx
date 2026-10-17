import { useId, useState, type ReactNode } from 'react';

/** Lightweight tooltip shown on hover and focus; content is linked via aria-describedby. */
export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 w-max max-w-64 -translate-x-1/2 rounded-lg border border-border bg-elevated px-2.5 py-1.5 text-[12px] text-fg shadow-lg"
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
