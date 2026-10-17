import { useEffect } from 'react';
import { getSettings, updateSettings } from '../db/db';
import { releaseQueuedCards } from '../db/ops/review';
import { reconcileStreaks } from '../db/ops/streak';
import { useSettingsLoaded } from '../hooks/useSettings';
import { useToast } from './Toasts';
import { useToday } from '../hooks/useToday';
import { applyTheme } from './theme';

/** Daily bookkeeping (streaks, freezes, queued cards) on launch and at each new day; theme sync. */
export function useStartup(): void {
  const today = useToday();
  const settings = useSettingsLoaded();
  const theme = settings?.theme;

  const { toast } = useToast();
  useEffect(() => {
    void (async () => {
      try {
        const r = await reconcileStreaks();
        const released = await releaseQueuedCards();
        const s = await getSettings();
        if (r.freezesUsed > 0) {
          toast(
            `A streak freeze covered ${r.freezesUsed === 1 ? 'a missed day' : `${r.freezesUsed} missed days`}. Streak safe.`,
          );
        } else if (r.brokeOn && s.longestStreak > 0) {
          toast(
            `Fresh start. Your longest is ${s.longestStreak} day${s.longestStreak === 1 ? '' : 's'}.`,
          );
        }
        if (r.freezesEarned > 0) toast(`You earned a streak freeze (${s.freezes}/3).`);
        if (released > 0)
          toast(`${released} queued card${released === 1 ? '' : 's'} unlocked for review.`);
      } catch (e) {
        console.error('Daily bookkeeping failed', e);
      }
    })();
  }, [today, toast]);

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
