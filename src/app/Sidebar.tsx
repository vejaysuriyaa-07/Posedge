import { NavLink } from 'react-router';
import { Logo } from '../components/Logo';
import { PRIMARY_NAV, SECONDARY_NAV, type NavItem } from './navItems';

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

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Logo size={28} />
        <span className="text-[15px] font-semibold tracking-tight">Posedge</span>
      </div>
      <nav aria-label="Main" className="flex flex-col gap-0.5 px-3">
        {PRIMARY_NAV.map((item) => (
          <SideLink key={item.to} item={item} />
        ))}
        <div className="my-3 h-px bg-border" />
        {SECONDARY_NAV.map((item) => (
          <SideLink key={item.to} item={item} />
        ))}
      </nav>
    </aside>
  );
}
