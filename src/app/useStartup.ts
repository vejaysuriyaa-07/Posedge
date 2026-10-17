import { useEffect } from 'react';
import { getSettings, updateSettings } from '../db/db';
import { releaseQueuedCards } from '../db/ops/review';
import { reconcileStreaks } from '../db/ops/streak';
import { useSettingsLoaded } from '../hooks/useSettings';
import { useToday } from '../hooks/useToday';
import { applyTheme } from './theme';

/** Daily bookkeeping (streaks, freezes, queued cards) on launch and at each new day; theme sync. */
export function useStartup(): void {
  const today = useToday();
  const settings = useSettingsLoaded();
  const theme = settings?.theme;

  useEffect(() => {
    void (async () => {
      try {
        await reconcileStreaks();
        await releaseQueuedCards();
      } catch (e) {
        console.error('Daily bookkeeping failed', e);
      }
    })();
  }, [today]);

  useEffect(() => {
    if (theme) applyTheme(theme);
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  // Ask for persistent storage once, on first run, and remember the answer.
  useEffect(() => {
    void (async () => {
      const s = await getSettings();
      if (s.storagePersisted !== undefined) return;
      const persisted = await navigator.storage?.persist?.().catch(() => false);
      await updateSettings({ storagePersisted: persisted ?? false });
    })();
  }, []);
}
