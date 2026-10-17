import { useCallback, useState } from 'react';
import type { GraphOptions } from '../../domain/brain';
import { DEFAULT_GRAPH_SETTINGS, type GraphSettings } from './graphEngine';

/** Slider ranges for the graph settings (shared by the popover and by validation on load). */
export const SETTING_RANGES: Record<
  keyof GraphSettings,
  { min: number; max: number; step: number }
> = {
  centerForce: { min: 0.2, max: 2, step: 0.05 },
  repelForce: { min: 0.2, max: 3, step: 0.05 },
  linkForce: { min: 0.1, max: 2, step: 0.05 },
  linkDistance: { min: 0.4, max: 2.5, step: 0.05 },
  nodeSize: { min: 0.5, max: 2.5, step: 0.05 },
  linkThickness: { min: 0.3, max: 3, step: 0.05 },
  textFade: { min: 0.8, max: 3, step: 0.05 },
};

export const DEFAULT_GRAPH_OPTIONS: GraphOptions = {
  includeCards: true,
  includeDone: false,
  includeTopics: true,
};

const KEY = 'posedge.graph.v1';

interface Prefs {
  settings: GraphSettings;
  options: GraphOptions;
}

/** Reads saved prefs, keeping only known keys with in-range values. */
export function parsePrefs(raw: string | null): Prefs {
  const settings = { ...DEFAULT_GRAPH_SETTINGS };
  const options = { ...DEFAULT_GRAPH_OPTIONS };
  try {
    const data = raw
      ? (JSON.parse(raw) as Partial<Record<'settings' | 'options', Record<string, unknown>>>)
      : {};
    for (const key of Object.keys(SETTING_RANGES) as (keyof GraphSettings)[]) {
      const v = data.settings?.[key];
      const r = SETTING_RANGES[key];
      if (typeof v === 'number' && Number.isFinite(v))
        settings[key] = Math.min(r.max, Math.max(r.min, v));
    }
    for (const key of Object.keys(DEFAULT_GRAPH_OPTIONS) as (keyof GraphOptions)[]) {
      const v = data.options?.[key];
      if (typeof v === 'boolean') options[key] = v;
    }
  } catch {
    // Corrupt or foreign data: fall back to defaults.
  }
  return { settings, options };
}

function load(): Prefs {
  try {
    return parsePrefs(localStorage.getItem(KEY));
  } catch {
    return parsePrefs(null);
  }
}

function save(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage blocked (private mode): prefs simply don't persist.
  }
}

/** Graph filters and display/force settings, remembered in this browser. */
export function useGraphPrefs() {
  const [prefs, setPrefs] = useState<Prefs>(load);
  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      save(next);
      return next;
    });
  }, []);
  return {
    settings: prefs.settings,
    options: prefs.options,
    setSettings: useCallback((settings: GraphSettings) => update({ settings }), [update]),
    setOptions: useCallback((options: GraphOptions) => update({ options }), [update]),
  };
}
