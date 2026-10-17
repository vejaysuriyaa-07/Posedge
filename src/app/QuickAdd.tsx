import { Plus } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Dialog } from '../components/Dialog';
import { Kbd } from '../components/Kbd';
import { createTask } from '../db/ops/tasks';
import { parseQuickAdd } from '../domain/quickAddParser';
import { mondayOf } from '../domain/week';
import { useProjects } from '../hooks/useData';
import { useSettings } from '../hooks/useSettings';
import { useToday } from '../hooks/useToday';
import { useToast } from './Toasts';
import { useUi, type QuickAddDefaults } from './ui';

const CHIP: Record<string, string> = {
  estimate: 'bg-sky-500/15 text-sky-700 dark:text-sky-200',
  priority: 'bg-rose-500/15 text-rose-700 dark:text-rose-200',
  learn: 'bg-violet-500/15 text-violet-700 dark:text-violet-200',
  big3: 'bg-amber-400/20 text-amber-800 dark:text-amber-200',
  day: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
  due: 'bg-orange-500/15 text-orange-800 dark:text-orange-200',
  project: 'bg-elevated text-fg',
};

/**
 * Inline quick add with live token chips. Used in the dialog, on Today, and in each day column.
 * Tokens: ~90m ~2h !1 #learn #big3 @mon..@sun @today @tomorrow due:YYYY-MM-DD +project
 */
export function QuickAddInput({
  defaults,
  autoFocus,
  compact,
  onAdded,
  placeholder = 'Add a task… ~1h !1 #learn @tue +project',
}: {
  defaults?: QuickAddDefaults;
  autoFocus?: boolean;
  compact?: boolean;
  onAdded?: () => void;
  placeholder?: string;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const today = useToday();
  const ui = useUi();
  const settings = useSettings();
  const { active, byId } = useProjects();
  const { toast, announce } = useToast();

  const fallbackProject =
    defaults?.projectId ??
    (settings.lastProjectId &&
    byId.get(settings.lastProjectId) &&
    !byId.get(settings.lastProjectId)!.archived
      ? settings.lastProjectId
      : active[0]?.id);
  const [projectOverride, setProjectOverride] = useState<string | undefined>(undefined);

  const contextWeek =
    defaults?.weekStart ?? (defaults?.day ? mondayOf(defaults.day) : ui.viewedWeek);
  const lastProjectId = projectOverride ?? fallbackProject;
  const parsed = useMemo(
    () => parseQuickAdd(text, { today, weekStart: contextWeek, projects: active, lastProjectId }),
    [text, today, contextWeek, active, lastProjectId],
  );

  const projectId = parsed.projectMatched
    ? parsed.projectId
    : (projectOverride ?? parsed.projectId);
  const project = projectId ? byId.get(projectId) : undefined;

  const submit = async () => {
    if (busy) return;
    if (!parsed.title) return;
    if (!project) {
      toast({ message: 'Create a project first.', tone: 'warn' });
      ui.setNewProjectOpen(true);
      return;
    }
    setBusy(true);
    try {
      const day = parsed.day ?? defaults?.day;
      const { task, big3Full } = await createTask({
        projectId: project.id,
        title: parsed.title,
        kind: parsed.isLearn ? 'learn' : 'task',
        priority: parsed.priority,
        estimateMin: parsed.estimateMin,
        day,
        weekStart: day
          ? undefined
          : (defaults?.weekStart ?? (parsed.isBig3 ? ui.viewedWeek : undefined)),
        dueDate: parsed.dueDate,
        isBig3: parsed.isBig3 || defaults?.isBig3,
      });
      announce(`Added ${task.title}`);
      if (big3Full)
        toast({ message: 'Added, but this week already has 3 Big 3 tasks.', tone: 'warn' });
      setText('');
      setProjectOverride(undefined);
      onAdded?.();
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={compact ? '' : 'grid gap-2'}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className={`flex items-center gap-2 rounded-xl border border-border bg-bg focus-within:border-brand ${compact ? 'px-2' : 'px-3'}`}
      >
        <Plus size={16} className="shrink-0 text-muted" aria-hidden />
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          aria-label="Quick add task"
          autoFocus={autoFocus}
          data-autofocus={autoFocus ? true : undefined}
          className={`min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted/70 ${compact ? 'min-h-9' : 'min-h-11'}`}
        />
        {!compact && active.length > 0 ? (
          <select
            aria-label="Project"
            value={projectId ?? ''}
            onChange={(e) => setProjectOverride(e.target.value)}
            className="max-w-40 truncate bg-transparent text-[12px] text-muted outline-none"
          >
            {active.map((p) => (
              <option key={p.id} value={p.id}>
                {p.emoji} {p.name}
              </option>
            ))}
          </select>
        ) : null}
      </form>
      {text.trim() && (parsed.tokens.length > 0 || parsed.errors.length > 0 || !compact) ? (
        <div className="flex flex-wrap items-center gap-1.5 px-1 text-[11px]" aria-live="polite">
          {project && !compact ? (
            <span
              data-pc={project.color}
              className="rounded-md bg-(--pc-tint) px-1.5 py-0.5 font-medium text-(--pc-fg)"
            >
              {project.emoji} {project.name}
            </span>
          ) : null}
          {parsed.tokens
            .filter((t) => t.type !== 'project')
            .map((t, i) => (
              <span
                key={i}
                className={`rounded-md px-1.5 py-0.5 font-medium ${CHIP[t.type] ?? ''}`}
              >
                {t.label}
              </span>
            ))}
          {parsed.errors.map((e) => (
            <span key={e} className="text-warn">
              {e}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function QuickAddDialog() {
  const ui = useUi();
  return (
    <Dialog
      open={ui.quickAdd.open}
      onClose={ui.closeQuickAdd}
      title="Quick add"
      top
      footer={
        <p className="mr-auto text-[12px] text-muted">
          <Kbd>Enter</Kbd> to add · <Kbd>Esc</Kbd> to close · <code>~45m</code> <code>!1</code>{' '}
          <code>#learn</code> <code>#big3</code> <code>@thu</code> <code>due:2026-11-01</code>{' '}
          <code>+isp</code>
        </p>
      }
    >
      <QuickAddInput defaults={ui.quickAdd.defaults} autoFocus />
    </Dialog>
  );
}
