import { Link } from 'react-router';
import { ChartColumn } from 'lucide-react';
import { SECONDARY_NAV } from './navItems';

const ITEMS = [{ to: '/progress', label: 'Progress', icon: ChartColumn }, ...SECONDARY_NAV];

export default function MorePage() {
  return (
    <section className="mx-auto max-w-lg">
      <h1 className="mb-4 text-2xl">More</h1>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {ITEMS.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <Link to={to} className="flex min-h-12 items-center gap-3 px-4 hover:bg-elevated">
              <Icon size={18} className="text-muted" aria-hidden />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
