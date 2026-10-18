import { CloudRain, VolumeX, Waves, Wind, type LucideIcon } from 'lucide-react';
import { type ReactNode } from 'react';
import { ambient, AMBIENT_LABELS, type AmbientKind } from '../../app/ambient';
import type { FlowPrefs } from './flowStore';

/** Slow color fields in the current project's color. */
export function FlowBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="pe-blob -top-[20vmax] -left-[15vmax] size-[60vmax] bg-(--pc,var(--pe-brand))" />
      <div className="pe-blob -right-[18vmax] -bottom-[22vmax] size-[55vmax] bg-(--pe-brand)" />
      <div className="pe-blob top-[20%] right-[10%] size-[34vmax] bg-[color-mix(in_oklab,var(--pc,var(--pe-brand))_55%,#38bdf8)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,var(--pe-bg)_78%)] opacity-70" />
    </div>
  );
}

const R = 90;
const C = 2 * Math.PI * R;
const TICKS = Array.from({ length: 60 }, (_, i) => i);

/** The big countdown ring: the arc shrinks as time runs; amber and full once over. */
export function FlowRing({
  fraction,
  over,
  paused,
  children,
}: {
  /** Share of the time budget left, 0..1. */
  fraction: number;
  over: boolean;
  paused: boolean;
  children: ReactNode;
}) {
  const f = over ? 1 : Math.min(1, Math.max(0, fraction));
  const color = over ? 'var(--pe-warn)' : 'var(--pc, var(--pe-brand))';
  return (
    <div className="relative aspect-square w-[min(74vw,19rem,40svh)] sm:w-[min(21rem,42svh)]">
      <svg viewBox="0 0 200 200" className="absolute inset-0 size-full -rotate-90 overflow-visible">
        <g opacity={0.35}>
          {TICKS.map((i) => {
            const a = (i / 60) * 2 * Math.PI;
            const long = i % 5 === 0;
            const r1 = long ? 96.5 : 97.5;
            return (
              <line
                key={i}
                x1={100 + Math.cos(a) * r1}
                y1={100 + Math.sin(a) * r1}
                x2={100 + Math.cos(a) * 99.5}
                y2={100 + Math.sin(a) * 99.5}
                stroke="var(--pe-muted)"
                strokeWidth={long ? 0.9 : 0.5}
                strokeLinecap="round"
              />
            );
          })}
        </g>
        <circle cx={100} cy={100} r={R} fill="none" stroke="var(--pe-border)" strokeWidth={4} />
        <circle
          cx={100}
          cy={100}
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - f)}
          className={over || paused ? 'pe-breathe' : ''}
          style={{
            transition: 'stroke-dashoffset 500ms linear, stroke 600ms ease',
            filter: `drop-shadow(0 0 6px color-mix(in srgb, ${color} 55%, transparent))`,
          }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

const SOUND_ICONS: Record<AmbientKind, LucideIcon> = {
  off: VolumeX,
  brown: Wind,
  rain: CloudRain,
  waves: Waves,
};

/** Sound choice (plays a preview right away), volume and the time's-up chime. */
export function SoundControls({
  prefs,
  onChange,
  live,
}: {
  prefs: FlowPrefs;
  onChange: (p: FlowPrefs) => void;
  /** Whether choosing a sound should start it now (planner preview, or a running flow). */
  live: boolean;
}) {
  const pick = (sound: AmbientKind) => {
    onChange({ ...prefs, sound });
    if (!live) return;
    ambient.prime();
    ambient.play(sound, prefs.volume);
  };
  return (
    <div className="grid gap-3">
      <div role="radiogroup" aria-label="Background sound" className="grid grid-cols-4 gap-1.5">
        {(Object.keys(AMBIENT_LABELS) as AmbientKind[]).map((k) => {
          const Icon = SOUND_ICONS[k];
          const on = prefs.sound === k;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => pick(k)}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border px-1 text-[11.5px] font-medium transition ${on ? 'border-(--pc,var(--pe-brand)) bg-[color-mix(in_srgb,var(--pc,var(--pe-brand))_14%,transparent)] text-fg' : 'border-border text-muted hover:text-fg'}`}
            >
              <Icon size={16} aria-hidden />
              {k === 'brown' ? 'Brown' : AMBIENT_LABELS[k]}
            </button>
          );
        })}
      </div>
      {prefs.sound !== 'off' ? (
        <label className="flex items-center gap-3 text-[13px] text-muted">
          Volume
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={prefs.volume}
            onChange={(e) => {
              const volume = Number(e.target.value);
              onChange({ ...prefs, volume });
              ambient.setVolume(volume);
            }}
            className="pe-range flex-1"
          />
        </label>
      ) : null}
      <label className="flex min-h-9 items-center gap-2.5 text-[13px]">
        <input
          type="checkbox"
          checked={prefs.chime}
          onChange={(e) => {
            onChange({ ...prefs, chime: e.target.checked });
            if (e.target.checked && live) {
              ambient.prime();
              ambient.chime();
            }
          }}
          className="size-4 accent-violet-500"
        />
        Soft chime when time is up
      </label>
    </div>
  );
}
