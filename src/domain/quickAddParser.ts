import { format } from 'date-fns';
import type { Priority } from '../db/types';
import { bestMatch } from './fuzzy';
import { addDaysStr, dayInWeek, isDateStr, parseDate, WEEKDAY_LONG, WEEKDAY_TOKENS } from './week';

export interface QuickAddProject {
  id: string;
  name: string;
  archived?: boolean;
}

export interface QuickAddContext {
  today: string;
  /** Monday of the week being viewed; `@mon`..`@sun` resolve inside it. */
  weekStart: string;
  projects: QuickAddProject[];
  lastProjectId?: string;
}

export type QuickAddTokenType =
  'estimate' | 'priority' | 'learn' | 'big3' | 'day' | 'due' | 'project';

export interface QuickAddToken {
  type: QuickAddTokenType;
  raw: string;
  label: string;
}

export interface QuickAddResult {
  title: string;
  estimateMin?: number;
  priority?: Priority;
  isLearn: boolean;
  isBig3: boolean;
  day?: string;
  dueDate?: string;
  projectId?: string;
  projectQuery?: string;
  projectMatched: boolean;
  tokens: QuickAddToken[];
  errors: string[];
}

export interface TaskTokenContext {
  today: string;
  weekStart: string;
}

export type TaskToken =
  | { type: 'estimate'; minutes: number }
  | { type: 'priority'; priority: Priority }
  | { type: 'learn' }
  | { type: 'big3' }
  | { type: 'day'; day: string }
  | { type: 'due'; date: string }
  | { type: 'project'; query: string };

export type TaskTokenResult = TaskToken | { type: 'invalid'; message: string } | null;

const ESTIMATE_RE = /^~(?:(\d+(?:\.\d+)?)h(?:(\d+)m)?|(\d+(?:\.\d+)?)m)$/i;
const PRIORITY_RE = /^!([123])$/;
const DUE_RE = /^due:(.*)$/i;

const WEEKDAY_NAMES: string[] = WEEKDAY_LONG.map((d) => d.toLowerCase());

/** 45 -> "45m", 90 -> "1.5h", 120 -> "2h", 100 -> "1h 40m". */
export function formatMinutes(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  const hours = m / 60;
  if (Number.isInteger(hours * 4)) return `${Number(hours.toFixed(2))}h`;
  return `${Math.floor(hours)}h ${m % 60}m`;
}

/**
 * Reads one whitespace-separated word. Returns a token, an `invalid` marker for a recognisable but
 * broken token (currently only `due:` with a bad date), or null when the word is ordinary text.
 */
export function readTaskToken(word: string, ctx: TaskTokenContext): TaskTokenResult {
  const lower = word.toLowerCase();

  const est = ESTIMATE_RE.exec(word);
  if (est) {
    const minutes = est[3] ? Number(est[3]) : Number(est[1] ?? 0) * 60 + Number(est[2] ?? 0);
    return { type: 'estimate', minutes: Math.round(minutes) };
  }

  const pri = PRIORITY_RE.exec(word);
  if (pri) return { type: 'priority', priority: Number(pri[1]) as Priority };

  if (lower === '#learn') return { type: 'learn' };
  if (lower === '#big3') return { type: 'big3' };

  if (lower.startsWith('@')) {
    const name = lower.slice(1);
    if (name === 'today') return { type: 'day', day: ctx.today };
    if (name === 'tomorrow') return { type: 'day', day: addDaysStr(ctx.today, 1) };
    let idx = (WEEKDAY_TOKENS as readonly string[]).indexOf(name);
    if (idx < 0) idx = WEEKDAY_NAMES.indexOf(name);
    if (idx >= 0) return { type: 'day', day: dayInWeek(ctx.weekStart, idx) };
    return null;
  }

  const due = DUE_RE.exec(word);
  if (due) {
    const value = due[1] ?? '';
    if (isDateStr(value)) return { type: 'due', date: value };
    return { type: 'invalid', message: `Invalid due date "${value}" (use due:YYYY-MM-DD)` };
  }

  if (word.length > 1 && word.startsWith('+')) {
    return { type: 'project', query: word.slice(1).replace(/[-_]+/g, ' ').trim() };
  }

  return null;
}

function dayLabel(day: string): string {
  return format(parseDate(day), 'EEE MMM d');
}

/** Parses a Quick Add line such as "Read SVA chapter ~45m !1 #learn @tue +dv". */
export function parseQuickAdd(input: string, ctx: QuickAddContext): QuickAddResult {
  const result: QuickAddResult = {
    title: '',
    isLearn: false,
    isBig3: false,
    projectMatched: false,
    tokens: [],
    errors: [],
  };
  const titleWords: string[] = [];
  let projectRaw: string | undefined;

  for (const word of input.split(/\s+/).filter(Boolean)) {
    const tok = readTaskToken(word, { today: ctx.today, weekStart: ctx.weekStart });
    if (!tok) {
      titleWords.push(word);
      continue;
    }
    switch (tok.type) {
      case 'invalid':
        result.errors.push(tok.message);
        break;
      case 'estimate':
        result.estimateMin = tok.minutes;
        result.tokens.push({
          type: 'estimate',
          raw: word,
          label: `~${formatMinutes(tok.minutes)}`,
        });
        break;
      case 'priority':
        result.priority = tok.priority;
        result.tokens.push({ type: 'priority', raw: word, label: `P${tok.priority}` });
        break;
      case 'learn':
        result.isLearn = true;
        result.tokens.push({ type: 'learn', raw: word, label: 'Learn' });
        break;
      case 'big3':
        result.isBig3 = true;
        result.tokens.push({ type: 'big3', raw: word, label: 'Big 3' });
        break;
      case 'day':
        result.day = tok.day;
        result.tokens.push({ type: 'day', raw: word, label: dayLabel(tok.day) });
        break;
      case 'due':
        result.dueDate = tok.date;
        result.tokens.push({
          type: 'due',
          raw: word,
          label: `Due ${format(parseDate(tok.date), 'MMM d')}`,
        });
        break;
      case 'project':
        result.projectQuery = tok.query;
        projectRaw = word;
        break;
    }
  }

  result.title = titleWords.join(' ').trim();

  if (result.projectQuery !== undefined && projectRaw !== undefined) {
    const active = ctx.projects.filter((p) => !p.archived);
    const match = bestMatch(result.projectQuery, active, 0.5);
    if (match) {
      result.projectId = match.item.id;
      result.projectMatched = true;
      result.tokens.push({ type: 'project', raw: projectRaw, label: match.item.name });
    } else {
      result.projectId = ctx.lastProjectId;
      result.errors.push(`No project matches "${result.projectQuery}"`);
      result.tokens.push({ type: 'project', raw: projectRaw, label: `+${result.projectQuery}` });
    }
  } else {
    result.projectId = ctx.lastProjectId;
  }

  if (!result.title) result.errors.push('Add a title');
  return result;
}
