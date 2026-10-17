import { NavLink } from 'react-router';
import { Brain, CalendarDays, Ellipsis, FolderKanban, Sun } from 'lucide-react';
import { useReviewQueue } from '../hooks/useReviewQueue';

const TABS = [
  { to: '/', label: 'Today', icon: Sun },
  { to: '/week', label: 'Week', icon: CalendarDays },
  { to: '/review', label: 'Review', icon: Brain },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/more', label: 'More', icon: Ellipsis },
];

export function BottomNav() {
  const { queue } = useReviewQueue();
  return (
    <nav
      aria-label="Main"
      className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-5">
        {TABS.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                  isActive ? 'text-brand' : 'text-muted'
                }`
              }
            >
              <Icon size={20} aria-hidden />
              {label}
              {to === '/review' && queue.length > 0 ? (
                <span className="tabular absolute top-1.5 left-1/2 ml-2 rounded-full bg-brand px-1.5 text-[10px] font-semibold text-brand-fg">
                  {queue.length}
                  <span className="sr-only"> due</span>
                </span>
              ) : null}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
