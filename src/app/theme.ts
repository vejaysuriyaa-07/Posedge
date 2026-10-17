export type ThemeChoice = 'dark' | 'light' | 'system';

const STORAGE_KEY = 'posedge-theme';

export function resolveDark(theme: ThemeChoice): boolean {
  if (theme === 'system') {
    return (
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    );
  }
  return theme === 'dark';
}

/** Applies the theme class and mirrors the choice to localStorage so index.html can apply it pre-paint. */
export function applyTheme(theme: ThemeChoice): void {
  const dark = resolveDark(theme);
  document.documentElement.classList.toggle('dark', dark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#0B0D12' : '#F7F8FA');
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode or storage disabled: the class is still applied for this session.
  }
}

export function storedTheme(): ThemeChoice {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    if (t === 'dark' || t === 'light' || t === 'system') return t;
  } catch {
    // ignore
  }
  return 'dark';
}
