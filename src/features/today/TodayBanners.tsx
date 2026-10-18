import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarCheck, HardDrive, Inbox } from 'lucide-react';
import { Link } from 'react-router';
import { db } from '../../db/db';
import { countPackTasks } from '../../domain/inbox';
import { diffDays, dateOfIso } from '../../domain/week';
import { reviewTargetWeek, weeklyReviewWindow } from '../../domain/progress';
import { useSettings } from '../../hooks/useSettings';
import { exportAndDownload } from '../settings/download';

/**
 * Gentle nudges: inbox suggestions waiting, backup overdue, and "New week. Pick your Big 3." from
 * Sunday 17:00 through Monday.
 */
export function TodayBanners({ today }: { today: string }) {
  const settings = useSettings();
  const now = new Date();
  const weekStart = reviewTargetWeek(now);
  const info = useLiveQuery(async () => {
    const [review, taskCount] = await Promise.all([
      db.weeklyReviews.get(weekStart),
      db.tasks.count(),
    ]);
    return { hasReview: !!review, taskCount };
  }, [weekStart, today]);

  const daysSinceBackup = settings.lastBackupAt
    ? diffDays(today, dateOfIso(settings.lastBackupAt))
    : null;
  const backupDue =
    settings.backupReminderDays > 0 &&
    (info?.taskCount ?? 0) > 0 &&
    (daysSinceBackup === null || daysSinceBackup >= settings.backupReminderDays);
  const reviewDue = weeklyReviewWindow(now) && info && !info.hasReview;
  const sundayEvening = now.getDay() === 0;

  const packs = settings.inboxPending;
  const suggestions = packs.reduce((n, p) => n + countPackTasks(p.text), 0);

  if (!backupDue && !reviewDue && !packs.length) return null;
  return (
    <div className="grid gap-2">
      {packs.length ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-sm">
          <Inbox size={18} className="text-violet-600 dark:text-violet-300" aria-hidden />
          <span className="flex-1">
            {suggestions
              ? `${suggestions} new suggestion${suggestions === 1 ? '' : 's'} from your inbox.`
              : 'A new note from your inbox.'}
          </span>
          <Link to="/import" className="font-medium text-brand hover:underline">
            Review suggestions
          </Link>
        </div>
      ) : null}
      {reviewDue ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-sm">
          <CalendarCheck size={18} className="text-violet-600 dark:text-violet-300" aria-hidden />
          <span className="flex-1">
            {sundayEvening ? 'New week tomorrow. Pick your Big 3.' : 'New week. Pick your Big 3.'}
          </span>
          <Link to="/weekly-review" className="font-medium text-brand hover:underline">
            Start weekly review
          </Link>
        </div>
      ) : null}
      {backupDue ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
          <HardDrive size={18} className="text-muted" aria-hidden />
          <span className="flex-1">
            {daysSinceBackup === null
              ? 'Your data only lives in this browser. Save a backup file.'
              : `Last backup was ${daysSinceBackup} days ago.`}
          </span>
          <button
            type="button"
            onClick={() => void exportAndDownload()}
            className="font-medium text-brand hover:underline"
          >
            Export backup
          </button>
        </div>
      ) : null}
    </div>
  );
}
