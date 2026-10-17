import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../db/db';
import type { ReviewCard } from '../db/types';
import { buildQueue } from '../domain/srs';
import { endOfDay } from '../domain/week';
import { useSettings } from './useSettings';
import { useToday } from './useToday';

/** Cards due by the end of today (not suspended/queued), lowest retrievability first, capped. */
export function useReviewQueue(): { queue: ReviewCard[]; dueTotal: number; loaded: boolean } {
  const today = useToday();
  const settings = useSettings();
  const due = useLiveQuery(
    () => db.reviewCards.where('due').belowOrEqual(endOfDay(today).toISOString()).toArray(),
    [today],
  );
  return useMemo(() => {
    if (!due) return { queue: [], dueTotal: 0, loaded: false };
    if (settings.vacationMode) return { queue: [], dueTotal: 0, loaded: true };
    const eligible = due.filter((c) => !c.suspended && !c.queued);
    const queue = buildQueue(
      eligible,
      new Date(),
      { requestRetention: settings.requestRetention },
      settings.dailyReviewCap,
    );
    return { queue, dueTotal: eligible.length, loaded: true };
  }, [due, settings.vacationMode, settings.requestRetention, settings.dailyReviewCap]);
}
