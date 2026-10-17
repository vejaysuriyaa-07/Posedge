import { useLiveQuery } from 'dexie-react-hooks';
import { getSettings } from '../db/db';
import { DEFAULT_SETTINGS, type Settings } from '../db/types';

/** Live settings merged over defaults. Returns defaults until the first read resolves. */
export function useSettings(): Settings {
  return useLiveQuery(getSettings, [], DEFAULT_SETTINGS);
}

/** Like useSettings but `undefined` until loaded (for first-run decisions). */
export function useSettingsLoaded(): Settings | undefined {
  return useLiveQuery(getSettings, []);
}
