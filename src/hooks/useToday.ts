import { useSyncExternalStore } from 'react';
import { todayStr } from '../domain/week';

// One shared clock: re-checks the local date every 30s and when the tab becomes visible.
const listeners = new Set<() => void>();
let current = todayStr();
let timer: ReturnType<typeof setInterval> | undefined;

function check() {
  const t = todayStr();
  if (t !== current) {
    current = t;
    listeners.forEach((l) => l());
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    timer = setInterval(check, 30_000);
    document.addEventListener('visibilitychange', check);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = undefined;
      document.removeEventListener('visibilitychange', check);
    }
  };
}

/** Today's local date ("YYYY-MM-DD"), updating across midnight. */
export function useToday(): string {
  return useSyncExternalStore(subscribe, () => current);
}
