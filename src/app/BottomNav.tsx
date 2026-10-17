import { NavLink } from 'react-router';
import { Brain, CalendarDays, Ellipsis, FolderKanban, Sun } from 'lucide-react';

const TABS = [
  { to: '/', label: 'Today', icon: Sun },
  { to: '/week', label: 'Week', icon: CalendarDays },
  { to: '/review', label: 'Review', icon: Brain },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/more', label: 'More', icon: Ellipsis },
];

export function BottomNav() {
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
                `flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                  isActive ? 'text-brand' : 'text-muted'
                }`
              }
            >
              <Icon size={20} aria-hidden />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
