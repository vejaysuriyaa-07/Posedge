import {
  Brain,
  BrainCircuit,
  CalendarDays,
  ChartColumn,
  ClipboardCheck,
  FolderKanban,
  Import,
  Settings,
  Sun,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Second key of the `G then <key>` navigation chord, if any. */
  chord?: string;
}

export const PRIMARY_NAV: NavItem[] = [
  { to: '/', label: 'Today', icon: Sun, chord: 't' },
  { to: '/week', label: 'Week', icon: CalendarDays, chord: 'w' },
  { to: '/projects', label: 'Projects', icon: FolderKanban, chord: 'p' },
  { to: '/review', label: 'Review', icon: Brain, chord: 'r' },
  { to: '/progress', label: 'Progress', icon: ChartColumn },
  { to: '/brain', label: 'Brain', icon: BrainCircuit, chord: 'b' },
];

export const SECONDARY_NAV: NavItem[] = [
  { to: '/weekly-review', label: 'Weekly Review', icon: ClipboardCheck },
  { to: '/import', label: 'Import', icon: Import },
  { to: '/settings', label: 'Settings', icon: Settings, chord: 's' },
];
