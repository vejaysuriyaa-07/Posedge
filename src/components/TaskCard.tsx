import { Brain, CalendarClock, Check, Star } from 'lucide-react';
import { useState, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { useTaskActions } from '../app/useTaskActions';
import { useUi } from '../app/ui';
import { formatMinutes } from '../domain/quickAddParser';
import { formatDate } from '../domain/week';
import type { Project, Task } from '../db/types';
import { isTypingTarget } from '../hooks/useHotkeys';
import { ProjectBadge } from './ProjectBadge';

export interface TaskCardProps {
  task: Task;
  project?: Project;
  showProject?: boolean;
  today: string;
  /** Rendered at the left edge (e.g. a drag handle). */
  handle?: ReactNode;
  dragging?: boolean;
  className?: string;
  rootProps?: HTMLAttributes<HTMLDivElement>;
  /** Narrow columns: emoji-only project badge, tighter spacing. */
  compact?: boolean;
}

export function TaskCard({
  task,
  project,
  showProject = true,
  today,
  handle,
  dragging,
  className = '',
  rootProps,
  compact = false,
}: TaskCardProps) {
  const { toggle } = useTaskActions();
  const ui = useUi();
  const [pop, setPop] = useState(false);
  const done = task.status === 'done';

  const onToggle = () => {
    if (!done) setPop(true);
    void toggle(task.id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'e' || e.key === 'E') {
      e.preventDefault();
      ui.openTask(task.id);
    } else if (e.key === 'x' || e.key === 'X') {
      e.preventDefault();
      onToggle();
    }
  };

  const overdueDue = !done && task.dueDate && task.dueDate < today;

  return (
    <div
      data-pc={project?.color}
      data-task-id={task.id}
      onKeyDown={onKeyDown}
      className={`group relative flex items-start rounded-xl border border-border border-l-[3px] border-l-(--pc,var(--pe-border)) bg-surface shadow-card transition ${compact ? 'gap-1.5 py-1.5 pr-1.5 pl-1.5' : 'gap-2 py-2 pr-2.5 pl-2'} ${
        dragging ? 'rotate-1 shadow-xl ring-1 ring-brand/40' : ''
      } ${className}`}
      {...rootProps}
    >
      {handle}
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={`${done ? 'Mark not done' : 'Complete'}: ${task.title}`}
        onClick={onToggle}
        onAnimationEnd={() => setPop(false)}
        className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors ${
          done
            ? 'border-(--pc,var(--pe-brand)) bg-(--pc,var(--pe-brand)) text-bg'
            : 'border-muted/60 hover:border-(--pc,var(--pe-brand))'
        } ${pop ? 'animate-pop' : ''}`}
      >
        {done ? <Check size={14} strokeWidth={3} /> : null}
      </button>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => ui.openTask(task.id)}
          className="block w-full text-left"
          aria-label={`Edit ${task.title}`}
        >
          <span
            className={`bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1.5px] bg-[position:0_55%] bg-no-repeat leading-snug [overflow-wrap:break-word] transition-[background-size,color] duration-200 ease-out ${compact ? 'text-[13px]' : 'text-sm'} ${
              done ? 'bg-[length:100%_1.5px] text-muted' : ''
            }`}
          >
            {task.title}
          </span>
        </button>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          {showProject && project ? (
            compact ? (
              <span
                data-pc={project.color}
                className="rounded bg-(--pc-tint) px-1 py-0.5"
                title={project.name}
                aria-label={project.name}
                role="img"
              >
                {project.emoji}
              </span>
            ) : (
              <ProjectBadge project={project} short />
            )
          ) : null}
          {task.estimateMin ? (
            <span className="tabular rounded bg-elevated px-1.5 py-0.5">
              ~{formatMinutes(task.estimateMin)}
            </span>
          ) : null}
          {task.priority === 1 ? (
            <span
              className="rounded bg-danger/12 px-1.5 py-0.5 font-semibold text-danger"
              title="Priority 1"
            >
              P1
            </span>
          ) : task.priority === 3 ? (
            <span className="px-0.5" title="Priority 3">
              P3
            </span>
          ) : null}
          {task.dueDate ? (
            <span className={`inline-flex items-center gap-1 ${overdueDue ? 'text-warn' : ''}`}>
              <CalendarClock size={12} aria-hidden />
              due {formatDate(task.dueDate, 'MMM d')}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 pt-0.5">
        {task.kind === 'learn' ? (
          <Brain
            size={15}
            className="text-sky-500 dark:text-sky-300"
            aria-label="Learning task"
            role="img"
          />
        ) : null}
        {task.isBig3 ? (
          <Star
            size={15}
            className="fill-amber-400 text-amber-500 dark:text-amber-300"
            aria-label="Big 3"
            role="img"
          />
        ) : null}
      </div>
    </div>
  );
}
