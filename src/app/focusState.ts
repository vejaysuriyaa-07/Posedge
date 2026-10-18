/** The focus timer's saved state (localStorage), shared so Flow can tell when it is running. */

const KEY = 'posedge-focus';

export interface FocusState {
  startedAt: number;
  durationMin: 25 | 50;
  projectId: string;
  taskId?: string;
  pausedAt?: number;
  pausedMs: number;
}

export function loadFocusState(): FocusState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as FocusState) : null;
  } catch {
    return null;
  }
}

export function saveFocusState(s: FocusState | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    // Timer still works for this session.
  }
}

/** True while a focus timer session exists (running or paused). */
export function focusTimerRunning(): boolean {
  return loadFocusState() !== null;
}
