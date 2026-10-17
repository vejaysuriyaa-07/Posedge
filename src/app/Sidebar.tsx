import { DndContext } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import { NavLink } from 'react-router';
import { DroppableList, SortableItem, useBoardDnd } from '../components/dnd';
import { Logo } from '../components/Logo';
import { ProjectDot } from '../components/ProjectBadge';
import { reorderProjects } from '../db/ops/projects';
import { useProjects } from '../hooks/useData';
import { useReviewQueue } from '../hooks/useReviewQueue';
import { PRIMARY_NAV, SECONDARY_NAV, type NavItem } from './navItems';
import { useUi } from './ui';

function SideLink({ item, badge }: { item: NavItem; badge?: number }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        `flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors ${
          isActive ? 'bg-elevated text-fg' : 'text-muted hover:bg-elevated/60 hover:text-fg'
        }`
      }
    >
      <Icon size={17} aria-hidden />
      <span className="flex-1">{item.label}</span>
      {badge ? (
        <span
          className="tabular rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-semibold text-brand"
          aria-label={`${badge} due`}
        >
          {badge}
        </span>
      ) : null}
    </NavLink>
  );
}

function ProjectList() {
  const { active, byId } = useProjects();
  const containers = useMemo(() => ({ projects: active.map((p) => p.id) }), [active]);
  const dnd = useBoardDnd({
    containers,
    onCommit: (_id, _to, ordered) => reorderProjects(ordered),
    itemLabel: (id) => byId.get(id)?.name ?? 'project',
    containerLabel: () => 'the project list',
    instructions:
      'To reorder a project, focus its handle and press Space. Use the arrow keys, then Space to drop.',
  });
  const ids = dnd.items.projects ?? [];
  return (
    <DndContext {...dnd.contextProps}>
      <DroppableList id="projects" items={ids} className="flex flex-col gap-0.5" overClassName="">
        {ids.map((id) => {
          const p = byId.get(id);
          if (!p) return null;
          return (
            <SortableItem key={id} id={id} label={p.name}>
              {({ handle, rootProps }) => (
                <div className="group flex items-center" {...rootProps}>
                  <span className="w-0 overflow-hidden opacity-0 transition-all group-focus-within:w-5 group-focus-within:opacity-100 group-hover:w-5 group-hover:opacity-100">
                    {handle}
                  </span>
                  <NavLink
                    to={`/projects/${p.id}`}
                    className={({ isActive }) =>
                      `flex min-h-9 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 text-[13px] ${
                        isActive
                          ? 'bg-elevated text-fg'
                          : 'text-muted hover:bg-elevated/60 hover:text-fg'
                      }`
                    }
                  >
                    <ProjectDot color={p.color} />
                    <span aria-hidden>{p.emoji}</span>
                    <span className="truncate">{p.name}</span>
                  </NavLink>
                </div>
              )}
            </SortableItem>
          );
        })}
      </DroppableList>
    </DndContext>
  );
}

export function Sidebar() {
  const { queue } = useReviewQueue();
  const ui = useUi();
  return (
    <aside className="scrollbar-thin sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface md:flex">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Logo size={28} />
        <span className="text-[15px] font-semibold tracking-tight">Posedge</span>
      </div>
      <nav aria-label="Main" className="flex flex-col gap-0.5 px-3">
        {PRIMARY_NAV.map((item) => (
          <SideLink
            key={item.to}
            item={item}
            badge={item.to === '/review' ? queue.length : undefined}
          />
        ))}
        <div className="my-3 h-px bg-border" />
        {SECONDARY_NAV.map((item) => (
          <SideLink key={item.to} item={item} />
        ))}
      </nav>
      <div className="mt-5 flex items-center justify-between px-6 pb-1">
        <span className="text-[11px] font-semibold tracking-wider text-muted uppercase">
          Projects
        </span>
        <button
          type="button"
          onClick={() => ui.setNewProjectOpen(true)}
          className="grid size-7 place-items-center rounded-md text-muted hover:bg-elevated hover:text-fg"
          aria-label="New project"
        >
          <Plus size={15} />
        </button>
      </div>
      <nav aria-label="Projects" className="px-3 pb-6">
        <ProjectList />
      </nav>
    </aside>
  );
}
