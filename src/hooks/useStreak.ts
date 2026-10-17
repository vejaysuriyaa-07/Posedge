import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../db/db';
import type { ActivityDay } from '../db/types';
import { currentStreak, type StreakInfo } from '../domain/streak';
import { dateOfIso } from '../domain/week';
import { useSettings } from './useSettings';
import { useToday } from './useToday';

export function useActivityDays(): ActivityDay[] | undefined {
  return useLiveQuery(() => db.activityDays.toArray(), []);
}

export function useStreak(): StreakInfo & { longest: number; freezes: number } {
  const days = useActivityDays();
  const settings = useSettings();
  const today = useToday();
  return useMemo(() => {
    const map = Object.fromEntries((days ?? []).map((d) => [d.date, d]));
    const info = currentStreak({
      days: map,
      today,
      restDays: settings.restDays,
      vacationFrom:
        settings.vacationMode && settings.vacationStartedAt
          ? dateOfIso(settings.vacationStartedAt)
          : undefined,
    });
    return {
      ...info,
      longest: Math.max(settings.longestStreak, info.count),
      freezes: settings.freezes,
    };
  }, [
    days,
    today,
    settings.restDays,
    settings.vacationMode,
    settings.vacationStartedAt,
    settings.longestStreak,
    settings.freezes,
  ]);
}
