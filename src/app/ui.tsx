import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { mondayOf, todayStr } from '../domain/week';

export interface QuickAddDefaults {
  day?: string;
  weekStart?: string;
  projectId?: string;
  isBig3?: boolean;
}

interface UiState {
  quickAdd: { open: boolean; defaults?: QuickAddDefaults };
  editTaskId?: string;
  lockItInTaskId?: string;
  paletteOpen: boolean;
  helpOpen: boolean;
  newProjectOpen: boolean;
  focusOpen: boolean;
  /** Task to preselect when the focus timer opens. */
  focusTaskId?: string;
  /** Monday of the week the Week view shows; quick-add @mon..@sun resolve against it. */
  viewedWeek: string;
}

interface UiApi extends UiState {
  openQuickAdd: (defaults?: QuickAddDefaults) => void;
  closeQuickAdd: () => void;
  openTask: (id: string) => void;
  closeTask: () => void;
  openLockItIn: (taskId: string) => void;
  closeLockItIn: () => void;
  setPaletteOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;
  setNewProjectOpen: (open: boolean) => void;
  setFocusOpen: (open: boolean) => void;
  openFocus: (taskId?: string) => void;
  setViewedWeek: (weekStart: string) => void;
}

const UiContext = createContext<UiApi | null>(null);

export function useUi(): UiApi {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi must be used inside UiProvider');
  return ctx;
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UiState>(() => ({
    quickAdd: { open: false },
    paletteOpen: false,
    helpOpen: false,
    newProjectOpen: false,
    focusOpen: false,
    viewedWeek: mondayOf(todayStr()),
  }));
  const patch = useCallback((p: Partial<UiState>) => setState((s) => ({ ...s, ...p })), []);

  const api = useMemo<UiApi>(
    () => ({
      ...state,
      openQuickAdd: (defaults) => patch({ quickAdd: { open: true, defaults } }),
      closeQuickAdd: () => patch({ quickAdd: { open: false } }),
      openTask: (id) => patch({ editTaskId: id }),
      closeTask: () => patch({ editTaskId: undefined }),
      openLockItIn: (taskId) => patch({ lockItInTaskId: taskId, editTaskId: undefined }),
      closeLockItIn: () => patch({ lockItInTaskId: undefined }),
      setPaletteOpen: (paletteOpen) => patch({ paletteOpen }),
      setHelpOpen: (helpOpen) => patch({ helpOpen }),
      setNewProjectOpen: (newProjectOpen) => patch({ newProjectOpen }),
      setFocusOpen: (focusOpen) =>
        patch({ focusOpen, ...(focusOpen ? {} : { focusTaskId: undefined }) }),
      openFocus: (taskId) => patch({ focusOpen: true, focusTaskId: taskId, editTaskId: undefined }),
      setViewedWeek: (viewedWeek) =>
        setState((s) => (s.viewedWeek === viewedWeek ? s : { ...s, viewedWeek })),
    }),
    [state, patch],
  );

  return <UiContext.Provider value={api}>{children}</UiContext.Provider>;
}
