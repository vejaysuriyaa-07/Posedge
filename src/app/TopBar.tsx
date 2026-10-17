import { Flame, Plus, Search, Snowflake, Timer } from 'lucide-react';
import { Logo } from '../components/Logo';
import { Kbd } from '../components/Kbd';
import { Tooltip } from '../components/Tooltip';
import { levelInfo } from '../domain/xp';
import { useSettings } from '../hooks/useSettings';
import { useStreak } from '../hooks/useStreak';
import { useUi } from './ui';

function LevelChip() {
  const settings = useSettings();
  if (!settings.gamification) return null;
  const info = levelInfo(settings.xpTotal);
  return (
    <Tooltip
      content={`${settings.xpTotal} XP total · ${info.xpForNext - info.xpIntoLevel} XP to level ${info.level + 1}`}
    >
      <div
        className="flex items-center gap-2.5"
        role="img"
        aria-label={`Level ${info.level}, ${info.title}. ${info.xpIntoLevel} of ${info.xpForNext} XP to the next level.`}
      >
        <span className="tabular text-[13px] font-semibold">Lv {info.level}</span>
        <span className="hidden text-[13px] text-muted sm:inline">{info.title}</span>
        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-border sm:w-24">
          <span
            className="block h-full rounded-full bg-gradient-to-r from-violet-500 to-sky-400 transition-[width] duration-500"
            style={{ width: `${Math.round(info.progress * 100)}%` }}
          />
        </span>
      </div>
    </Tooltip>
  );
}

function StreakChip() {
  const s = useStreak();
  const label =
    s.count > 0
      ? `${s.count}-day streak${s.todayPending ? ', today still open' : ''}. ${s.freezes} freeze${s.freezes === 1 ? '' : 's'} available.`
      : `No streak yet. ${s.freezes} freezes available.`;
  return (
    <Tooltip
      content={
        s.longest
          ? `Longest: ${s.longest} days. Freezes cover a missed day automatically.`
          : 'Do one thing today to start a streak.'
      }
    >
      <div className="flex items-center gap-1.5" role="img" aria-label={label}>
        <Flame
          size={17}
          className={
            s.count > 0 ? 'fill-orange-400/30 text-orange-500 dark:text-orange-300' : 'text-muted'
          }
          aria-hidden
        />
        <span className="tabular text-[13px] font-semibold">{s.count}</span>
        {Array.from({ length: s.freezes }, (_, i) => (
          <Snowflake key={i} size={13} className="text-sky-500 dark:text-sky-300" aria-hidden />
        ))}
      </div>
    </Tooltip>
  );
}

export function TopBar() {
  const ui = useUi();
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-border bg-bg/85 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-2 md:hidden">
        <Logo size={24} />
      </div>
      <LevelChip />
      <div className="flex-1" />
      <StreakChip />
      <button
        type="button"
        onClick={() => ui.openFocus()}
        className="hidden size-10 place-items-center rounded-lg text-muted hover:bg-elevated hover:text-fg sm:grid"
        aria-label="Start a focus timer"
        title="Focus timer"
      >
        <Timer size={18} />
      </button>
      <button
        type="button"
        onClick={() => ui.setPaletteOpen(true)}
        className="hidden min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-[13px] text-muted hover:text-fg md:flex"
        aria-label="Open command palette"
      >
        <Search size={15} /> Search <Kbd>⌘K</Kbd>
      </button>
      <button
        type="button"
        onClick={() => ui.openQuickAdd()}
        className="flex min-h-10 items-center gap-2 rounded-lg bg-brand px-3 text-sm font-medium text-brand-fg shadow-card hover:brightness-110"
        aria-label="Quick add task"
      >
        <Plus size={16} />
        <span className="hidden sm:inline">Add</span>
        <span className="hidden lg:inline">
          <Kbd>N</Kbd>
        </span>
      </button>
    </header>
  );
}
