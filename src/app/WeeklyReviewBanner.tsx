import { useLiveQuery } from 'dexie-react-hooks';
import { ClipboardCheck } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { db } from '../db/db';
import { reviewTargetWeek, weeklyReviewWindow } from '../domain/progress';
import { useToday } from '../hooks/useToday';

/** From Sunday 17:00 through Monday, nudge toward the weekly review if it isn't done yet. */
export function WeeklyReviewBanner() {
  const today = useToday();
  const { pathname } = useLocation();
  const now = new Date();
  const target = reviewTargetWeek(now);
  const inWindow = weeklyReviewWindow(now);
  const review = useLiveQuery(() => db.weeklyReviews.get(target), [target, today], null);
  // Today shows its own Monday banner; the review page needs no nudge.
  if (
    !inWindow ||
    review !== undefined ||
    pathname === '/' ||
    pathname.startsWith('/weekly-review')
  )
    return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-2.5 text-sm">
      <ClipboardCheck size={17} className="text-violet-600 dark:text-violet-300" aria-hidden />
      <span className="flex-1">Weekly review time: ten minutes to set up a good week.</span>
      <Link to="/weekly-review" className="font-medium text-brand hover:underline">
        Start
      </Link>
    </div>
  );
}
