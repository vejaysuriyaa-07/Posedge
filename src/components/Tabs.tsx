import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem<K extends string> {
  key: K;
  label: ReactNode;
}

/** Accessible tablist (arrow keys move between tabs). Render panels with `tabPanelProps`. */
export function Tabs<K extends string>({
  items,
  value,
  onChange,
  label,
  className = '',
}: {
  items: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  label: string;
  className?: string;
}) {
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % items.length;
    if (e.key === 'ArrowLeft') next = (i - 1 + items.length) % items.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = items.length - 1;
    if (next >= 0) {
      e.preventDefault();
      onChange(items[next]!.key);
      refs.current[next]?.focus();
    }
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      className={`scrollbar-thin flex gap-1 overflow-x-auto border-b border-border ${className}`}
    >
      {items.map((item, i) => {
        const selected = item.key === value;
        return (
          <button
            key={item.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            id={`${base}-${item.key}`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.key)}
            onKeyDown={(e) => onKey(e, i)}
            className={`-mb-px min-h-10 shrink-0 border-b-2 px-3 text-sm font-medium transition-colors ${
              selected ? 'border-brand text-fg' : 'border-transparent text-muted hover:text-fg'
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
