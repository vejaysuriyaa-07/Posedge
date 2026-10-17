import { Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { Logo } from '../components/Logo';
import { applyTheme, resolveDark, storedTheme } from './theme';

export function TopBar() {
  const [dark, setDark] = useState(() => resolveDark(storedTheme()));
  const toggle = () => {
    const next = dark ? 'light' : 'dark';
    applyTheme(next);
    setDark(!dark);
  };
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-bg/85 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-2 md:hidden">
        <Logo size={24} />
        <span className="font-semibold tracking-tight">Posedge</span>
      </div>
      <div className="flex-1" />
      <button
        type="button"
        onClick={toggle}
        className="grid size-10 place-items-center rounded-lg text-muted hover:bg-elevated hover:text-fg"
        aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        {dark ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    </header>
  );
}
