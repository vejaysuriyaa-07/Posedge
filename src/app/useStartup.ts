import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { getSettings, updateSettings } from '../db/db';
import { checkInbox } from '../db/ops/inbox';
import { releaseQueuedCards } from '../db/ops/review';
import { reconcileStreaks } from '../db/ops/streak';
import { useSettingsLoaded } from '../hooks/useSettings';
import { useToast } from './Toasts';
import { useToday } from '../hooks/useToday';
import { applyTheme } from './theme';

/** Background inbox checks: hourly while open, and on return after half an hour away. */
const INBOX_EVERY_MS = 60 * 60 * 1000;
const INBOX_STALE_MS = 30 * 60 * 1000;

/**
 * Daily bookkeeping (streaks, freezes, queued cards) on launch and at each new day; theme sync;
 * inbox checks.
 */
export function useStartup(): void {
  const today = useToday();
  const settings = useSettingsLoaded();
  const theme = settings?.theme;
  const inboxOn = !!settings?.inboxToken?.trim();
  // navigate changes identity on every route change; keep the inbox effect from re-running.
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

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

  useEffect(() => {
    if (!inboxOn) return;
    const run = async (when: 'due' | 'stale' | 'failed') => {
      const s = await getSettings();
      const last = s.inboxCheckedAt ? Date.parse(s.inboxCheckedAt) : 0;
      if (when === 'stale' && Date.now() - last < INBOX_STALE_MS) return;
      if (when === 'failed' && !s.inboxError) return;
      const r = await checkInbox();
      // Settings and Import show inbox results inline.
      const inline = /^#\/(settings|import)\b/.test(window.location.hash);
      if (r.ok && r.added > 0 && !inline) {
        toast({
          message: 'New suggestions in your inbox.',
          action: { label: 'Review', onClick: () => void navigateRef.current('/import') },
          duration: 8000,
        });
      }
    };
    // On launch, skip if a check just happened (e.g. a quick reload).
    void run('stale');
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void run('due');
    }, INBOX_EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void run('stale');
    };
    // Back online after a failed check: try again right away.
    const onOnline = () => void run('failed');
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [inboxOn, toast]);

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
