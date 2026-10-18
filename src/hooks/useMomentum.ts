import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import {
  momentumDelta,
  momentumSeries,
  PROJECT_TARGET,
  type MomentumOptions,
  type MomentumPoint,
} from '../domain/momentum';
import { addDaysStr, atHour, dateOfIso } from '../domain/week';
import { useSettings } from './useSettings';
import { useToday } from './useToday';

/** Long enough for the score to settle before the shown window starts. */
const LOOKBACK_DAYS = 180;

export interface Momentum {
  series: MomentumPoint[];
  /** 0..100 */
  score: number;
  /** Change over the last 7 days, in points. */
  delta: number;
}

export interface MomentumData {
  overall: Momentum;
  byProject: Map<string, Momentum>;
}

function summarize(
  active: Set<string>,
  today: string,
  window: number,
  opts: MomentumOptions,
): Momentum {
  const start = [...active].sort()[0] ?? addDaysStr(today, 1);
  const series = momentumSeries(active, start, today, window, opts);
  return {
    series,
    score: Math.round((series.at(-1)?.score ?? 0) * 100),
    delta: momentumDelta(series),
  };
}

/**
 * Momentum overall (any task, review or focus; aiming for every day) and per project (tasks
 * completed and focus sessions; aiming for three days a week), over the last `window` days.
 */
export function useMomentum(window = 30): MomentumData | undefined {
  const today = useToday();
  const settings = useSettings();
  const restKey = settings.restDays.join(',');
  const vacationFrom =
    settings.vacationMode && settings.vacationStartedAt
      ? dateOfIso(settings.vacationStartedAt)
      : undefined;

  return useLiveQuery(async () => {
    const since = addDaysStr(today, -LOOKBACK_DAYS);
    const sinceIso = atHour(since, 0).toISOString();
    const [tasks, sessions, days] = await Promise.all([
      db.tasks.where('completedAt').aboveOrEqual(sinceIso).toArray(),
      db.focusSessions.where('startedAt').aboveOrEqual(sinceIso).toArray(),
      db.activityDays.where('date').aboveOrEqual(since).toArray(),
    ]);
    const perProject = new Map<string, Set<string>>();
    const mark = (projectId: string, date: string) => {
      if (date > today) return;
      let s = perProject.get(projectId);
      if (!s) perProject.set(projectId, (s = new Set()));
      s.add(date);
    };
    for (const t of tasks)
      if (t.status === 'done' && t.completedAt) mark(t.projectId, dateOfIso(t.completedAt));
    for (const f of sessions) if (f.minutes > 0) mark(f.projectId, dateOfIso(f.startedAt));

    const overallActive = new Set(
      days.filter((d) => d.tasksDone > 0 || d.reviewsDone > 0 || d.focusMin > 0).map((d) => d.date),
    );
    const excused = new Set(days.filter((d) => d.freezeUsed || d.isRestDay).map((d) => d.date));
    const opts: MomentumOptions = {
      restDays: restKey ? restKey.split(',').map(Number) : [],
      skip: (d) => excused.has(d) || (!!vacationFrom && d >= vacationFrom),
    };
    const byProject = new Map<string, Momentum>();
    for (const [id, active] of perProject)
      byProject.set(id, summarize(active, today, window, { ...opts, target: PROJECT_TARGET }));
    return { overall: summarize(overallActive, today, window, opts), byProject };
  }, [today, window, restKey, vacationFrom]);
}
