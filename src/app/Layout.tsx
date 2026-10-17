import { useRef } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { TaskEditorHost } from '../components/TaskEditor';
import { LockItInHost } from '../features/review/LockItInSheet';
import { NewProjectDialog } from '../features/projects/ProjectForm';
import { useHotkeys } from '../hooks/useHotkeys';
import { BottomNav } from './BottomNav';
import { PRIMARY_NAV, SECONDARY_NAV } from './navItems';
import { QuickAddDialog } from './QuickAdd';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useUi } from './ui';
import { useStartup } from './useStartup';
import { WelcomeDialog } from './WelcomeDialog';

const CHORDS = Object.fromEntries(
  [...PRIMARY_NAV, ...SECONDARY_NAV].filter((n) => n.chord).map((n) => [n.chord!, n.to]),
);

function GlobalHotkeys() {
  const ui = useUi();
  const navigate = useNavigate();
  const gAt = useRef(0);
  const chordKeys = Object.fromEntries(
    Object.entries(CHORDS).map(([key, to]) => [
      key,
      (e: KeyboardEvent) => {
        if (Date.now() - gAt.current > 1200) return;
        e.preventDefault();
        gAt.current = 0;
        navigate(to);
      },
    ]),
  );
  useHotkeys({
    ...chordKeys,
    // "g" starts a navigation chord; must come after chordKeys so it isn't shadowed.
    g: () => {
      gAt.current = Date.now();
    },
    n: (e) => {
      e.preventDefault();
      ui.openQuickAdd();
    },
  });
  return null;
}

export function Layout() {
  useStartup();
  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
        className="sr-only z-50 rounded-lg bg-brand px-3 py-2 text-brand-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main
          id="main"
          tabIndex={-1}
          className="flex-1 px-4 pt-5 pb-28 outline-none md:px-8 md:pb-10"
        >
          <Outlet />
        </main>
      </div>
      <BottomNav />
      <GlobalHotkeys />
      <QuickAddDialog />
      <TaskEditorHost />
      <LockItInHost />
      <NewProjectDialog />
      <WelcomeDialog />
    </div>
  );
}
