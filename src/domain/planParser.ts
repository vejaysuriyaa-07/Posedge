import { z } from 'zod';
import {
  COLOR_KEYS,
  PROJECT_KINDS,
  type ColorKey,
  type Priority,
  type ProjectKind,
} from '../db/types';
import { bestMatch, normalizeName } from './fuzzy';
import { readTaskToken } from './quickAddParser';
import {
  addWeeksStr,
  dayInWeek,
  diffDays,
  isDateStr,
  mondayOf,
  WEEKDAY_LONG,
  WEEKDAY_TOKENS,
} from './week';

export interface PlanProjectRef {
  id: string;
  name: string;
  color: ColorKey;
  kind: ProjectKind;
  archived?: boolean;
}

export interface PlanContext {
  today: string;
  projects: PlanProjectRef[];
}

export interface ParsedTask {
  line: number;
  title: string;
  notes?: string;
  done: boolean;
  estimateMin?: number;
  priority: Priority;
  kind: 'task' | 'learn';
  isBig3: boolean;
  weekStart?: string;
  day?: string;
  dueDate?: string;
}

export interface ParsedMilestone {
  line: number;
  title: string;
  weekStart: string;
}

export interface ParsedProject {
  line: number;
  name: string;
  color?: ColorKey;
  kind?: ProjectKind;
  match?: { id: string; name: string; score: number };
  milestones: ParsedMilestone[];
  tasks: ParsedTask[];
}

export interface PlanWarning {
  line: number;
  message: string;
}

export interface ParsedPlan {
  format: 'markdown' | 'json';
  projects: ParsedProject[];
  warnings: PlanWarning[];
}

export const PLAN_PROMPT =
  "Please rewrite the plan above in this exact Markdown format so I can import it into Posedge. Rules: one '# Project: <name> | color: <violet|sky|emerald|amber|rose|teal|indigo|orange|lime|fuchsia> | kind: <course|work|prep|learning|passion|pipeline>' line per project; optional '## Milestone: <title> | week: <YYYY-MM-DD>' lines; '## Week <YYYY-MM-DD of that week's Monday>' headers; tasks as '- [ ] <title>' with optional tokens at the end: ~<minutes>m or ~<hours>h estimate, !1/!2/!3 priority (1 = high), #learn for study tasks I should later review, #big3 for the week's top priorities, @mon..@sun for a specific day, due:YYYY-MM-DD. Output only the Markdown in one code block, no commentary.";

export const PLAN_EXAMPLE = `# Project: Camera ISP | color: teal | kind: passion
## Milestone: Golden model complete | week: 2026-10-26
## Week 2026-10-19
- [ ] Implement bilinear demosaic in Python ~2h !1 #learn @mon
- [ ] Write AWB gray-world model ~1.5h @wed
- [ ] Read Tiny Tapeout submission guide ~45m #learn
  Focus on pin limits and clock constraints.
## Week +1
- [ ] Compare golden model vs reference images ~2h !2 #big3

# Project: DV Interview Prep | color: violet | kind: prep
## Week 2026-10-19
- [ ] SVA: implication operators and sequences ~1h #learn @tue
- [ ] UVM phases deep dive ~1.5h #learn #big3 @thu`;

/* ------------------------------------------------------------------ */
/* Shared helpers                                                       */
/* ------------------------------------------------------------------ */

/** Best existing (non-archived) project for a plan's project name, if similar enough. */
export function matchProject(name: string, projects: PlanProjectRef[]): ParsedProject['match'] {
  const m = bestMatch(
    name,
    projects.filter((p) => !p.archived),
    0.6,
  );
  return m ? { id: m.item.id, name: m.item.name, score: m.score } : undefined;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTHS_LONG = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

function monthIndex(word: string): number {
  const w = word.toLowerCase().replace(/\.$/, '');
  if (w === 'sept') return 8;
  const short = MONTHS.indexOf(w);
  if (short >= 0) return short;
  return MONTHS_LONG.indexOf(w);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** "Oct 20", "October 20, 2026" -> Monday of that week, or undefined. */
function parseMonthDay(phrase: string, today: string): string | undefined {
  const m = /^([A-Za-z]+\.?)\s+(\d{1,2})(?:(?:,\s*|\s+)(\d{4}))?$/.exec(phrase.trim());
  if (!m) return undefined;
  const month = monthIndex(m[1] ?? '');
  if (month < 0) return undefined;
  const day = Number(m[2]);
  const build = (y: number) => `${y}-${pad(month + 1)}-${pad(day)}`;
  if (m[3]) {
    const s = build(Number(m[3]));
    return isDateStr(s) ? mondayOf(s) : undefined;
  }
  const year = Number(today.slice(0, 4));
  let best: string | undefined;
  for (const y of [year - 1, year, year + 1]) {
    const s = build(y);
    if (!isDateStr(s)) continue;
    if (!best || Math.abs(diffDays(s, today)) < Math.abs(diffDays(best, today))) best = s;
  }
  return best ? mondayOf(best) : undefined;
}

function dayFromWeekday(value: string, weekStart: string): string | undefined {
  const v = value.toLowerCase();
  let idx = (WEEKDAY_TOKENS as readonly string[]).indexOf(v);
  if (idx < 0) idx = WEEKDAY_LONG.map((d) => d.toLowerCase()).indexOf(v);
  return idx >= 0 ? dayInWeek(weekStart, idx) : undefined;
}

/** Returns the text inside the first ``` fence (if any) with original 1-based line numbers. */
function fencedLines(text: string): { line: number; text: string }[] {
  const all = text.split(/\r?\n/).map((t, i) => ({ line: i + 1, text: t }));
  const open = all.findIndex((l) => /^\s*```/.test(l.text));
  if (open < 0) return all;
  const rest = all.slice(open + 1);
  const close = rest.findIndex((l) => /^\s*```\s*$/.test(l.text));
  return close < 0 ? rest : rest.slice(0, close);
}

class ProjectCollector {
  readonly projects: ParsedProject[] = [];
  private byKey = new Map<string, ParsedProject>();

  constructor(private ctx: PlanContext) {}

  get(
    name: string,
    line: number,
    color: ColorKey | undefined,
    kind: ProjectKind | undefined,
  ): ParsedProject {
    const key = normalizeName(name);
    const existing = this.byKey.get(key);
    if (existing) {
      existing.color ??= color;
      existing.kind ??= kind;
      return existing;
    }
    const project: ParsedProject = {
      line,
      name,
      color,
      kind,
      match: matchProject(name, this.ctx.projects),
      milestones: [],
      tasks: [],
    };
    this.byKey.set(key, project);
    this.projects.push(project);
    return project;
  }
}

/* ------------------------------------------------------------------ */
/* Markdown                                                             */
/* ------------------------------------------------------------------ */

const UNRECOGNIZED =
  'Unrecognized line. Expected "# Project: …", "## Milestone: … | week: …", "## Week …", a task ("- [ ] …") or an indented note under a task.';

function splitPipes(content: string): { head: string; pairs: { key: string; value: string }[] } {
  const [head = '', ...rest] = content.split('|').map((s) => s.trim());
  const pairs = rest
    .filter((s) => s.length > 0)
    .map((s) => {
      const i = s.indexOf(':');
      return i < 0
        ? { key: s.toLowerCase(), value: '' }
        : { key: s.slice(0, i).trim().toLowerCase(), value: s.slice(i + 1).trim() };
    });
  return { head, pairs };
}

/** Parses the Posedge plan Markdown format (SPEC section 6.10 / 10). */
export function parseMarkdownPlan(text: string, ctx: PlanContext): ParsedPlan {
  const warnings: PlanWarning[] = [];
  const collector = new ProjectCollector(ctx);
  const currentCalendarWeek = mondayOf(ctx.today);

  let project: ParsedProject | undefined;
  let week: string | undefined;
  /** Task whose notes block is open (plain lines attach while no blank line intervenes). */
  let openTask: { task: ParsedTask; notes: string[] } | undefined;
  /** Most recent task in the current project (indented lines attach even after blank lines). */
  let lastTask: { task: ParsedTask; notes: string[] } | undefined;
  const allNotes: { task: ParsedTask; notes: string[] }[] = [];

  const warn = (line: number, message: string) => warnings.push({ line, message });

  for (const { line, text: raw } of fencedLines(text)) {
    const text = raw.replace(/\s+$/, '');
    if (text.trim() === '') {
      openTask = undefined;
      continue;
    }

    const leading = /^[ \t]*/.exec(text)?.[0] ?? '';
    const indented = leading.includes('\t') || leading.length >= 2;
    const body = text.trim();

    // Headings
    const heading = /^(#{1,6})\s+(.*)$/.exec(body);
    if (heading && !indented) {
      openTask = undefined;
      const level = (heading[1] ?? '').length;
      const content = (heading[2] ?? '').trim();

      if (level === 1) {
        const { head, pairs } = splitPipes(content);
        const name = head.replace(/^project\s*:\s*/i, '').trim();
        if (!name) {
          warn(line, 'Project heading has no name.');
          project = undefined;
          continue;
        }
        let color: ColorKey | undefined;
        let kind: ProjectKind | undefined;
        for (const { key, value } of pairs) {
          if (key === 'color') {
            const v = value.toLowerCase();
            if ((COLOR_KEYS as readonly string[]).includes(v)) color = v as ColorKey;
            else warn(line, `Unknown color "${value}"; expected one of ${COLOR_KEYS.join(', ')}.`);
          } else if (key === 'kind') {
            const v = value.toLowerCase();
            if ((PROJECT_KINDS as readonly string[]).includes(v)) kind = v as ProjectKind;
            else
              warn(line, `Unknown kind "${value}"; expected one of ${PROJECT_KINDS.join(', ')}.`);
          } else {
            warn(line, `Unknown project field "${key}"; expected color or kind.`);
          }
        }
        project = collector.get(name, line, color, kind);
        week = undefined;
        lastTask = undefined;
        continue;
      }

      if (level === 2) {
        const milestone = /^milestone\s*:\s*(.*)$/i.exec(content);
        if (milestone) {
          const { head: title, pairs } = splitPipes(milestone[1] ?? '');
          if (!project) {
            warn(line, 'Milestone before any "# Project" heading was skipped.');
            continue;
          }
          if (!title) {
            warn(line, 'Milestone has no title.');
            continue;
          }
          const weekValue = pairs.find((p) => p.key === 'week')?.value;
          let ms: string | undefined;
          if (weekValue && isDateStr(weekValue)) ms = mondayOf(weekValue);
          else if (weekValue && /^[+-]\d+$/.test(weekValue))
            ms = addWeeksStr(week ?? currentCalendarWeek, Number(weekValue));
          if (!ms) {
            warn(line, `Milestone "${title}" needs "| week: YYYY-MM-DD"; it was skipped.`);
            continue;
          }
          project.milestones.push({ line, title, weekStart: ms });
          continue;
        }

        const weekHeader = /^week\b\s*(.*)$/i.exec(content);
        if (weekHeader) {
          const rest = (weekHeader[1] ?? '').trim();
          const rel = /^([+-])\s*(\d+)$/.exec(rest);
          const of = /^of\s+(.+)$/i.exec(rest);
          let resolved: string | undefined;
          if (isDateStr(rest)) resolved = mondayOf(rest);
          else if (rel)
            resolved = addWeeksStr(
              week ?? currentCalendarWeek,
              (rel[1] === '-' ? -1 : 1) * Number(rel[2]),
            );
          else if (of) resolved = parseMonthDay(of[1] ?? '', ctx.today);
          if (resolved) week = resolved;
          else
            warn(
              line,
              `Couldn't read the week "${rest}". Use "## Week YYYY-MM-DD", "## Week +1" or "## Week of Oct 20".`,
            );
          continue;
        }

        warn(line, `Unrecognized heading. Expected "## Week …" or "## Milestone: … | week: …".`);
        continue;
      }

      warn(line, UNRECOGNIZED);
      continue;
    }

    // Tasks (bullet indented by at most one space)
    const bullet = !indented ? /^[-*]\s+(?:\[([ xX])\](?:\s+|$))?(.*)$/.exec(body) : null;
    if (bullet) {
      if (!project) {
        warn(line, 'Task before any "# Project" heading was skipped.');
        openTask = undefined;
        lastTask = undefined;
        continue;
      }
      const done = (bullet[1] ?? '').toLowerCase() === 'x';
      const words = (bullet[2] ?? '').split(/\s+/).filter(Boolean);
      const tokenCtx = { today: ctx.today, weekStart: week ?? currentCalendarWeek };
      const task: ParsedTask = {
        line,
        title: '',
        done,
        priority: 2,
        kind: 'task',
        isBig3: false,
        weekStart: week,
      };
      // Tokens are read from the end of the line backwards.
      while (words.length > 0) {
        const tok = readTaskToken(words[words.length - 1] ?? '', tokenCtx);
        if (!tok) break;
        words.pop();
        switch (tok.type) {
          case 'invalid':
            warn(line, tok.message);
            break;
          case 'estimate':
            task.estimateMin ??= tok.minutes;
            break;
          case 'priority':
            task.priority = tok.priority;
            break;
          case 'learn':
            task.kind = 'learn';
            break;
          case 'big3':
            task.isBig3 = true;
            break;
          case 'day':
            task.day ??= tok.day;
            break;
          case 'due':
            task.dueDate ??= tok.date;
            break;
          case 'project':
            warn(
              line,
              `Project tokens like "+${tok.query}" are ignored in plans; put the task under its "# Project" heading.`,
            );
            break;
        }
      }
      if (task.day) task.weekStart = mondayOf(task.day);
      task.title = words.join(' ').trim();
      if (!task.title) {
        warn(line, 'Task has no title; it was skipped.');
        openTask = undefined;
        continue;
      }
      project.tasks.push(task);
      openTask = { task, notes: [] };
      lastTask = openTask;
      allNotes.push(openTask);
      continue;
    }

    // Notes
    const noteTarget = indented ? (openTask ?? lastTask) : openTask;
    if (noteTarget) {
      noteTarget.notes.push(body);
      continue;
    }

    warn(line, UNRECOGNIZED);
  }

  for (const { task, notes } of allNotes) {
    if (notes.length > 0) task.notes = notes.join('\n');
  }

  return { format: 'markdown', projects: collector.projects, warnings };
}

/* ------------------------------------------------------------------ */
/* JSON                                                                 */
/* ------------------------------------------------------------------ */

const blankToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

const RealDate = z.string().refine((s) => isDateStr(s), 'Expected a date as YYYY-MM-DD');
const WeekRef = z
  .string()
  .refine((s) => isDateStr(s) || /^[+-]?\d+$/.test(s), 'Expected YYYY-MM-DD or +N');
const isWeekdayName = (s: string): boolean =>
  (WEEKDAY_TOKENS as readonly string[]).includes(s.toLowerCase()) ||
  WEEKDAY_LONG.map((d) => d.toLowerCase()).includes(s.toLowerCase());
const DayRef = z
  .string()
  .refine((s) => isWeekdayName(s) || isDateStr(s), 'Expected mon..sun or YYYY-MM-DD');

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(blankToUndefined, schema.optional());

export const PlanJsonSchema = z.object({
  version: z.literal(1),
  projects: z.array(
    z.object({
      name: z.string().trim().min(1, 'Project name is required'),
      color: optional(z.enum(COLOR_KEYS)),
      kind: optional(z.enum(PROJECT_KINDS)),
      milestones: z
        .array(
          z.object({
            title: z.string().trim().min(1, 'Milestone title is required'),
            week: WeekRef,
          }),
        )
        .optional(),
      tasks: z
        .array(
          z.object({
            title: z.string().trim().min(1, 'Task title is required'),
            week: optional(WeekRef),
            day: optional(DayRef),
            estimateMin: z.number().int().nonnegative().optional(),
            priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
            kind: optional(z.enum(['task', 'learn'])),
            big3: z.boolean().optional(),
            notes: optional(z.string()),
            done: z.boolean().optional(),
            due: optional(RealDate),
          }),
        )
        .optional(),
    }),
  ),
});
export type PlanJson = z.infer<typeof PlanJsonSchema>;

function resolveWeekRef(ref: string, base: string): string {
  return isDateStr(ref) ? mondayOf(ref) : addWeeksStr(base, Number(ref));
}

/** Parses the JSON plan format, validated with zod. */
export function parseJsonPlan(text: string, ctx: PlanContext): ParsedPlan {
  const inner = fencedLines(text)
    .map((l) => l.text)
    .join('\n');
  let data: unknown;
  try {
    data = JSON.parse(inner);
  } catch (e) {
    return {
      format: 'json',
      projects: [],
      warnings: [{ line: 1, message: `Invalid JSON: ${(e as Error).message}` }],
    };
  }
  const parsed = PlanJsonSchema.safeParse(data);
  if (!parsed.success) {
    return {
      format: 'json',
      projects: [],
      warnings: parsed.error.issues.map((issue) => ({
        line: 0,
        message: `${issue.path.length ? issue.path.join('.') : '(root)'}: ${issue.message}`,
      })),
    };
  }

  const currentWeek = mondayOf(ctx.today);
  const collector = new ProjectCollector(ctx);
  for (const p of parsed.data.projects) {
    const project = collector.get(p.name.trim(), 0, p.color, p.kind);
    for (const m of p.milestones ?? []) {
      project.milestones.push({
        line: 0,
        title: m.title.trim(),
        weekStart: resolveWeekRef(m.week, currentWeek),
      });
    }
    for (const t of p.tasks ?? []) {
      let weekStart = t.week ? resolveWeekRef(t.week, currentWeek) : undefined;
      let day: string | undefined;
      if (t.day) {
        day = isDateStr(t.day) ? t.day : dayFromWeekday(t.day, weekStart ?? currentWeek);
        if (day) weekStart = mondayOf(day);
      }
      project.tasks.push({
        line: 0,
        title: t.title.trim(),
        notes: t.notes?.trim() || undefined,
        done: t.done ?? false,
        estimateMin: t.estimateMin ? t.estimateMin : undefined,
        priority: t.priority ?? 2,
        kind: t.kind ?? 'task',
        isBig3: t.big3 ?? false,
        weekStart,
        day,
        dueDate: t.due,
      });
    }
  }
  return { format: 'json', projects: collector.projects, warnings: [] };
}

/** Detects JSON vs Markdown and parses accordingly. */
export function parsePlan(text: string, ctx: PlanContext): ParsedPlan {
  const inner = fencedLines(text)
    .map((l) => l.text)
    .join('\n')
    .trimStart();
  return inner.startsWith('{') ? parseJsonPlan(text, ctx) : parseMarkdownPlan(text, ctx);
}
