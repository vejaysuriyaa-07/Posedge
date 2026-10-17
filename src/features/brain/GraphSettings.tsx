import { RotateCcw } from 'lucide-react';
import { useEffect, useRef, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { DEFAULT_GRAPH_SETTINGS, type GraphSettings } from './graphEngine';
import { SETTING_RANGES } from './useGraphPrefs';

const GROUPS: { title: string; items: { key: keyof GraphSettings; label: string }[] }[] = [
  {
    title: 'Forces',
    items: [
      { key: 'centerForce', label: 'Center force' },
      { key: 'repelForce', label: 'Repel force' },
      { key: 'linkForce', label: 'Link force' },
      { key: 'linkDistance', label: 'Link distance' },
    ],
  },
  {
    title: 'Display',
    items: [
      { key: 'nodeSize', label: 'Node size' },
      { key: 'linkThickness', label: 'Link thickness' },
      { key: 'textFade', label: 'Text fade threshold' },
    ],
  },
];

export interface PopoverPosition {
  top: number;
  right: number;
  maxHeight: number;
}

interface Props {
  settings: GraphSettings;
  onChange: (s: GraphSettings) => void;
  onClose: () => void;
  /** The button that opened the popover (clicks on it shouldn't count as "outside"). */
  anchor: RefObject<HTMLElement | null>;
  /** Viewport position under the anchor, measured when it opened. */
  position: PopoverPosition;
}

/**
 * Obsidian-style graph settings: live sliders for the forces and the display. Rendered in a portal
 * so a short panel can't clip it; it closes on outside clicks, Escape, scroll and resize.
 */
export function GraphSettingsPopover({ settings, onChange, onClose, anchor, position }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector('input')?.focus();
  }, []);

  useEffect(() => {
    const inside = (t: EventTarget | null) =>
      t instanceof Node && (ref.current?.contains(t) || anchor.current?.contains(t));
    const onDown = (e: PointerEvent) => {
      if (!inside(e.target)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // An open dialog owns Escape.
      if (document.querySelector('[aria-modal="true"]')) return;
      // Marks the key as handled so full screen doesn't also close.
      e.preventDefault();
      onClose();
      const active = document.activeElement;
      if (!active || active === document.body || ref.current?.contains(active)) {
        anchor.current?.focus();
      }
    };
    const onMove = (e: Event) => {
      if (!inside(e.target)) onClose();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [onClose, anchor]);

  const isDefault = (Object.keys(DEFAULT_GRAPH_SETTINGS) as (keyof GraphSettings)[]).every(
    (k) => settings[k] === DEFAULT_GRAPH_SETTINGS[k],
  );

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Graph settings"
      className="scrollbar-thin fixed z-[46] w-72 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-border bg-elevated p-4 text-fg shadow-xl"
      style={{ top: position.top, right: position.right, maxHeight: position.maxHeight }}
    >
      {GROUPS.map((g, gi) => (
        <fieldset key={g.title} className={gi ? 'mt-4 border-t border-border pt-4' : ''}>
          <legend className="text-[12px] font-semibold tracking-wide text-muted uppercase">
            {g.title}
          </legend>
          <div className="mt-2.5 grid gap-3">
            {g.items.map(({ key, label }) => {
              const r = SETTING_RANGES[key];
              const id = `graph-${key}`;
              return (
                <div key={key}>
                  <div className="flex items-baseline justify-between text-[13px]">
                    <label htmlFor={id}>{label}</label>
                    <span className="tabular text-[12px] text-muted">
                      {key === 'textFade'
                        ? `${settings[key].toFixed(1)}×`
                        : `${Math.round(settings[key] * 100)}%`}
                    </span>
                  </div>
                  <input
                    id={id}
                    type="range"
                    min={r.min}
                    max={r.max}
                    step={r.step}
                    value={settings[key]}
                    onChange={(e) => onChange({ ...settings, [key]: Number(e.target.value) })}
                    className="pe-range mt-1.5 w-full"
                  />
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        disabled={isDefault}
        onClick={() => onChange({ ...DEFAULT_GRAPH_SETTINGS })}
        className="mt-4 flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] text-muted transition hover:bg-surface hover:text-fg disabled:pointer-events-none disabled:opacity-40"
      >
        <RotateCcw size={13} /> Reset to defaults
      </button>
    </div>,
    document.body,
  );
}
