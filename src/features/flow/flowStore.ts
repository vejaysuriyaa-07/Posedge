import { useSyncExternalStore } from 'react';
import type { AmbientKind } from '../../app/ambient';
import { parseFlowState, startFlow, type FlowState } from '../../domain/flow';
import { todayStr } from '../../domain/week';

/**
 * Flow state shared by the overlay, the corner pill and the entry points. Persisted in
 * localStorage so a reload resumes where you were.
 */

const KEY = 'posedge.flow.v1';
const PREFS_KEY = 'posedge.flow.prefs';

export interface FlowSnapshot {
  flow: FlowState | null;
  /** The pre-flow planner is open. */
  planning: boolean;
}

export interface FlowPrefs {
  sound: AmbientKind;
  volume: number;
  chime: boolean;
}

const DEFAULT_PREFS: FlowPrefs = { sound: 'off', volume: 0.5, chime: true };

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: Flow still works for this session.
  }
}

let snapshot: FlowSnapshot = { flow: parseFlowState(read(KEY), todayStr()), planning: false };
const listeners = new Set<() => void>();

function emit(next: FlowSnapshot) {
  snapshot = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getFlow(): FlowState | null {
  return snapshot.flow;
}

export function setFlow(flow: FlowState | null): void {
  write(KEY, flow ? JSON.stringify(flow) : null);
  emit({ ...snapshot, flow });
}

/** Applies a transition to the current flow (no-op when there is none). */
export function updateFlow(fn: (s: FlowState) => FlowState): void {
  const cur = snapshot.flow;
  if (!cur) return;
  const next = fn(cur);
  if (next !== cur) setFlow(next);
}

/** Starts a flow with these tasks, in order, and closes the planner. */
export function beginFlow(taskIds: string[], today: string): void {
  const flow = startFlow(taskIds, today, Date.now());
  write(KEY, JSON.stringify(flow));
  emit({ flow, planning: false });
}

/** Opens the planner, or brings an active flow back to full screen. */
export function openFlow(): void {
  const f = snapshot.flow;
  if (f) {
    if (f.minimized) setFlow({ ...f, minimized: false });
    return;
  }
  emit({ ...snapshot, planning: true });
}

export function closePlanner(): void {
  if (snapshot.planning) emit({ ...snapshot, planning: false });
}

export function useFlowStore(): FlowSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot);
}

/** True while a flow is running (used to keep the focus timer and Flow from overlapping). */
export function flowActive(): boolean {
  return !!snapshot.flow;
}

export function loadFlowPrefs(): FlowPrefs {
  try {
    const raw = read(PREFS_KEY);
    const p = raw ? (JSON.parse(raw) as Partial<FlowPrefs>) : {};
    return {
      sound: (['off', 'brown', 'rain', 'waves'] as const).includes(p.sound as AmbientKind)
        ? (p.sound as AmbientKind)
        : DEFAULT_PREFS.sound,
      volume:
        typeof p.volume === 'number' && p.volume >= 0 && p.volume <= 1
          ? p.volume
          : DEFAULT_PREFS.volume,
      chime: typeof p.chime === 'boolean' ? p.chime : DEFAULT_PREFS.chime,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveFlowPrefs(p: FlowPrefs): void {
  write(PREFS_KEY, JSON.stringify(p));
}

// Another tab started, changed or ended a flow.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) emit({ ...snapshot, flow: parseFlowState(e.newValue, todayStr()) });
  });
}
