import { describe, expect, it } from 'vitest';
import { DEFAULT_GRAPH_SETTINGS } from './graphEngine';
import { DEFAULT_GRAPH_OPTIONS, parsePrefs, SETTING_RANGES } from './useGraphPrefs';

describe('graph prefs', () => {
  it('falls back to defaults for missing, corrupt or foreign data', () => {
    const defaults = { settings: DEFAULT_GRAPH_SETTINGS, options: DEFAULT_GRAPH_OPTIONS };
    expect(parsePrefs(null)).toEqual(defaults);
    expect(parsePrefs('not json')).toEqual(defaults);
    expect(
      parsePrefs('{"settings":{"repelForce":"lots"},"options":{"includeCards":"yes"}}'),
    ).toEqual(defaults);
  });

  it('keeps valid values and clamps out-of-range ones', () => {
    const p = parsePrefs(
      JSON.stringify({
        settings: { repelForce: 2, nodeSize: 99, linkDistance: -5, bogus: 3 },
        options: { includeDone: true },
      }),
    );
    expect(p.settings).toMatchObject({
      repelForce: 2,
      nodeSize: SETTING_RANGES.nodeSize.max,
      linkDistance: SETTING_RANGES.linkDistance.min,
    });
    expect(p.settings).not.toHaveProperty('bogus');
    expect(p.options).toEqual({ ...DEFAULT_GRAPH_OPTIONS, includeDone: true });
  });

  it('has defaults inside the slider ranges', () => {
    for (const [key, r] of Object.entries(SETTING_RANGES)) {
      const v = DEFAULT_GRAPH_SETTINGS[key as keyof typeof DEFAULT_GRAPH_SETTINGS];
      expect(v).toBeGreaterThanOrEqual(r.min);
      expect(v).toBeLessThanOrEqual(r.max);
    }
  });
});
