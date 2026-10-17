import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowRight,
  Brain,
  CalendarDays,
  ChartColumn,
  ClipboardCheck,
  Download,
  FolderKanban,
  FolderPlus,
  Import,
  Keyboard,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { Dialog } from '../components/Dialog';
import { Kbd } from '../components/Kbd';
import { db, updateSettings } from '../db/db';
import { normalizeName } from '../domain/fuzzy';
import { exportAndDownload } from '../features/settings/download';
import { useProjects } from '../hooks/useData';
import { useHotkeys } from '../hooks/useHotkeys';
import { useIsDark } from '../hooks/useIsDark';
import { useToast } from './Toasts';
import { useUi } from './ui';

interface Command {
  id: string;
  group: 'Actions' | 'Go to' | 'Projects' | 'Tasks';
  label: string;
  hint?: string;
  icon?: LucideIcon;
  emoji?: string;
  keywords?: string;
  run: () => void;
}

function matches(cmd: Command, q: string): boolean {
  if (!q) return true;
  const hay = normalizeName(`${cmd.label} ${cmd.keywords ?? ''} ${cmd.group}`);
  return q
    .split(/\s+/)
    .map(normalizeName)
    .filter(Boolean)
    .every((word) => hay.includes(word));
}

/** Ctrl/Cmd+K: jump anywhere, run common actions, search tasks. */
export function CommandPalette() {
  const ui = useUi();
  useHotkeys(
    {
      'mod+k': (e) => {
        e.preventDefault();
        ui.setPaletteOpen(!ui.paletteOpen);
      },
    },
    { allowInDialog: true },
  );
  if (!ui.paletteOpen) return null;
  return <PaletteInner onClose={() => ui.setPaletteOpen(false)} />;
}

function PaletteInner({ onClose }: { onClose: () => void }) {
  const ui = useUi();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { active } = useProjects();
  const dark = useIsDark();
  const [q, setQ] = useState('');
  const [index, setIndex] = useState(0);

  const tasks = useLiveQuery(
    async () => {
      const needle = q.trim().toLowerCase();
      if (needle.length < 2) return [];
      return db.tasks
        .filter((t) => t.status !== 'done' && t.title.toLowerCase().includes(needle))
        .limit(8)
        .toArray();
    },
    [q],
    [],
  );

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => navigate(to);
    const base: Command[] = [
      {
        id: 'add',
        group: 'Actions',
        label: 'New task',
        hint: 'N',
        icon: Plus,
        keywords: 'quick add create',
        run: () => ui.openQuickAdd(),
      },
      {
        id: 'project',
        group: 'Actions',
        label: 'New project',
        icon: FolderPlus,
        keywords: 'create',
        run: () => ui.setNewProjectOpen(true),
      },
      {
        id: 'review',
        group: 'Actions',
        label: 'Start review session',
        icon: Brain,
        keywords: 'cards spaced repetition',
        run: go('/review'),
      },
      {
        id: 'focus',
        group: 'Actions',
        label: 'Start a focus timer',
        icon: Timer,
        keywords: 'pomodoro 25 50',
        run: () => ui.setFocusOpen(true),
      },
      {
        id: 'weekly',
        group: 'Actions',
        label: 'Do the weekly review',
        icon: ClipboardCheck,
        keywords: 'big 3 plan',
        run: go('/weekly-review'),
      },
      {
        id: 'theme',
        group: 'Actions',
        label: dark ? 'Switch to light theme' : 'Switch to dark theme',
        icon: dark ? Sun : Moon,
        keywords: 'appearance',
        run: () => void updateSettings({ theme: dark ? 'light' : 'dark' }),
      },
      {
        id: 'export',
        group: 'Actions',
        label: 'Export backup',
        icon: Download,
        keywords: 'save json data',
        run: () => void exportAndDownload().then(() => toast('Backup downloaded.')),
      },
      {
        id: 'help',
        group: 'Actions',
        label: 'Keyboard shortcuts',
        hint: '?',
        icon: Keyboard,
        run: () => ui.setHelpOpen(true),
      },
      { id: 'g-today', group: 'Go to', label: 'Today', hint: 'G T', icon: Sun, run: go('/') },
      {
        id: 'g-week',
        group: 'Go to',
        label: 'Week',
        hint: 'G W',
        icon: CalendarDays,
        run: go('/week'),
      },
      {
        id: 'g-projects',
        group: 'Go to',
        label: 'Projects',
        hint: 'G P',
        icon: FolderKanban,
        run: go('/projects'),
      },
      {
        id: 'g-review',
        group: 'Go to',
        label: 'Review',
        hint: 'G R',
        icon: Brain,
        run: go('/review'),
      },
      {
        id: 'g-progress',
        group: 'Go to',
        label: 'Progress',
        icon: ChartColumn,
        run: go('/progress'),
      },
      {
        id: 'g-import',
        group: 'Go to',
        label: 'Import',
        icon: Import,
        keywords: 'claude plan markdown',
        run: go('/import'),
      },
      {
        id: 'g-settings',
        group: 'Go to',
        label: 'Settings',
        hint: 'G S',
        icon: Settings,
        run: go('/settings'),
      },
    ];
    const projects: Command[] = active.map((p) => ({
      id: `p-${p.id}`,
      group: 'Projects',
      label: p.name,
      emoji: p.emoji,
      run: go(`/projects/${p.id}`),
    }));
    const taskCmds: Command[] = tasks.map((t) => ({
      id: `t-${t.id}`,
      group: 'Tasks',
      label: t.title,
      icon: ArrowRight,
      keywords: t.title,
      run: () => ui.openTask(t.id),
    }));
    const needle = q.trim();
    return [
      ...base.filter((c) => matches(c, needle)),
      ...projects.filter((c) => matches(c, needle)),
      ...taskCmds,
    ];
  }, [active, tasks, q, dark, navigate, toast, ui]);

  const clamped = Math.min(index, Math.max(0, commands.length - 1));
  const run = (cmd?: Command) => {
    if (!cmd) return;
    onClose();
    cmd.run();
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(commands.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(commands[clamped]);
    }
  };

  let lastGroup = '';
  return (
    <Dialog open onClose={onClose} title="Command palette" hideTitle top size="md">
      <div className="grid gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 focus-within:border-brand">
          <Search size={16} className="text-muted" aria-hidden />
          <input
            data-autofocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIndex(0);
            }}
            onKeyDown={onKey}
            placeholder="Type a command, project or task…"
            aria-label="Command"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={commands[clamped] ? `cmd-${commands[clamped]!.id}` : undefined}
            className="min-h-11 flex-1 bg-transparent text-sm outline-none"
          />
          <Kbd>Esc</Kbd>
        </div>
        <ul
          id="palette-list"
          role="listbox"
          aria-label="Commands"
          className="scrollbar-thin max-h-[50vh] overflow-y-auto"
        >
          {commands.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            const Icon = c.icon;
            return (
              <li key={c.id} role="presentation">
                {header ? (
                  <p className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">
                    {header}
                  </p>
                ) : null}
                <div
                  id={`cmd-${c.id}`}
                  role="option"
                  aria-selected={i === clamped}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => run(c)}
                  className={`flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm ${i === clamped ? 'bg-elevated text-fg' : 'text-muted'}`}
                >
                  {c.emoji ? (
                    <span aria-hidden>{c.emoji}</span>
                  ) : Icon ? (
                    <Icon size={16} aria-hidden />
                  ) : null}
                  <span className="flex-1 truncate">{c.label}</span>
                  {c.hint ? <Kbd>{c.hint}</Kbd> : null}
                </div>
              </li>
            );
          })}
          {!commands.length ? (
            <li className="px-2 py-6 text-center text-sm text-muted">No matches.</li>
          ) : null}
        </ul>
      </div>
    </Dialog>
  );
}
