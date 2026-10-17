import type { Project } from '../db/types';

/** First two meaningful words ("C++ / Python" -> "C++ Python"). */
export function shortName(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w))
    .slice(0, 2)
    .join(' ');
}

/** Emoji + name on the project's tint. Color is always paired with the emoji. */
export function ProjectBadge({
  project,
  short = false,
  className = '',
}: {
  project: Pick<Project, 'name' | 'emoji' | 'color'>;
  short?: boolean;
  className?: string;
}) {
  return (
    <span
      data-pc={project.color}
      className={`inline-flex max-w-full items-center gap-1 rounded-md bg-(--pc-tint) px-1.5 py-0.5 text-[11px] font-medium text-(--pc-fg) ${className}`}
    >
      <span aria-hidden>{project.emoji}</span>
      <span className="truncate">{short ? shortName(project.name) : project.name}</span>
    </span>
  );
}

export function ProjectDot({
  color,
  className = '',
}: {
  color: Project['color'];
  className?: string;
}) {
  return (
    <span
      data-pc={color}
      aria-hidden
      className={`inline-block size-2.5 shrink-0 rounded-full bg-(--pc) ${className}`}
    />
  );
}
