import { addDaysStr } from './week';

/**
 * Inbox packs: Markdown files named `YYYY-MM-DD[-anything].md` in the brain repo's `inbox/`
 * folder. Each is an ordinary Posedge plan; lines before the first `# Project:` heading are a
 * short summary shown above the review.
 */

/** Packs older than this are never fetched (a long break shouldn't flood the inbox). */
export const PACK_MAX_AGE_DAYS = 14;
/** Seen names are kept a little longer than packs are fetched, then pruned. */
export const SEEN_KEEP_DAYS = 30;
/** Caps on what EDGE receives from me.md and agenda.md. */
export const ABOUT_MAX_CHARS = 2500;
export const AGENDA_MAX_CHARS = 5000;

const PACK_NAME = /^(\d{4}-\d{2}-\d{2})(?:[-_.][\w.-]*)?\.md$/i;

/** The date a pack name starts with, or undefined for files that aren't packs. */
export function packDate(name: string): string | undefined {
  return PACK_NAME.exec(name)?.[1];
}

/** Pack names in a folder listing that are recent and not yet seen or pending, oldest first. */
export function newPackNames(
  listing: string[],
  known: Iterable<string>,
  today: string,
  maxAgeDays = PACK_MAX_AGE_DAYS,
): string[] {
  const skip = new Set(known);
  const since = addDaysStr(today, -maxAgeDays);
  return listing
    .filter((n) => {
      const d = packDate(n);
      return !!d && d >= since && !skip.has(n);
    })
    .sort();
}

/** Drops seen names whose date is too old to be fetched again anyway. */
export function pruneSeen(seen: string[], today: string, keepDays = SEEN_KEEP_DAYS): string[] {
  const since = addDaysStr(today, -keepDays);
  return [...new Set(seen)].filter((n) => (packDate(n) ?? '') >= since);
}

/** Splits a pack into its summary (text before the first `# ` heading) and the plan. */
export function splitInboxPack(text: string): { summary: string; plan: string } {
  const clean = text.replace(/^\uFEFF/, '').replace(/<!--[\s\S]*?-->/g, '');
  const lines = clean.split(/\r?\n/);
  const first = lines.findIndex((l) => /^#\s/.test(l));
  const head = first === -1 ? lines : lines.slice(0, first);
  const summary = head
    .map((l) => l.replace(/^\s*>\s?/, '').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { summary, plan: first === -1 ? '' : lines.slice(first).join('\n').trim() };
}

/** Number of task bullets in a pack (a quick count for badges; the import preview is exact). */
export function countPackTasks(text: string): number {
  const { plan } = splitInboxPack(text);
  return plan.split(/\r?\n/).filter((l) => /^ ?[-*]\s+\S/.test(l)).length;
}

/** Trims text to `max` characters at a line break where possible, marking the cut. */
export function capText(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.lastIndexOf('\n', max);
  return `${t.slice(0, cut > max * 0.6 ? cut : max).trimEnd()}\n…`;
}

/** Normalizes "owner/repo", also accepting a pasted github.com URL. Undefined if invalid. */
export function parseRepo(input: string): string | undefined {
  const s = input
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
  return /^[\w.-]+\/[\w.-]+$/.test(s) ? s : undefined;
}
