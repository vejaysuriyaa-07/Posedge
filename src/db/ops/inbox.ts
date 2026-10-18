import {
  ABOUT_MAX_CHARS,
  AGENDA_MAX_CHARS,
  capText,
  newPackNames,
  parseRepo,
  pruneSeen,
} from '../../domain/inbox';
import { todayStr } from '../../domain/week';
import { db, getSettings } from '../db';
import type { InboxPack } from '../types';

const API = 'https://api.github.com';
/** At most this many new packs are fetched per check (the newest win). */
const MAX_NEW_PER_CHECK = 10;

export type InboxCheckResult = { ok: true; added: number } | { ok: false; error: string };

class InboxError extends Error {}

interface Ctx {
  repo: string;
  token: string;
  fetch: typeof fetch;
}

/** GETs a repo path from the GitHub contents API; null on 404. */
async function getContents(ctx: Ctx, path: string, raw: boolean): Promise<Response | null> {
  const url = `${API}/repos/${ctx.repo}${path ? `/contents/${path.split('/').map(encodeURIComponent).join('/')}` : ''}`;
  let res: Response;
  try {
    res = await ctx.fetch(url, {
      headers: {
        Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
        Authorization: `Bearer ${ctx.token}`,
      },
    });
  } catch {
    throw new InboxError("Couldn't reach GitHub. Posedge will try again when you're online.");
  }
  if (res.ok) return res;
  if (res.status === 404) return null;
  if (res.status === 401)
    throw new InboxError("GitHub didn't accept the token. It may have expired; create a new one.");
  if (res.status === 403 || res.status === 429) {
    if (res.headers.get('x-ratelimit-remaining') === '0' || res.status === 429)
      throw new InboxError("GitHub's rate limit was reached. Posedge will try again later.");
    throw new InboxError(
      `The token can't read ${ctx.repo}. Give it read access to Contents on that repository.`,
    );
  }
  throw new InboxError(`GitHub returned an error (${res.status}). Posedge will try again later.`);
}

async function getText(ctx: Ctx, path: string): Promise<string | undefined> {
  const res = await getContents(ctx, path, true);
  return res ? res.text() : undefined;
}

/** File names in the repo's inbox/ folder (empty when the folder doesn't exist yet). */
async function listInbox(ctx: Ctx): Promise<string[]> {
  const res = await getContents(ctx, 'inbox', false);
  if (!res) {
    // A missing folder and a missing (or invisible) repo both 404; tell them apart.
    if (!(await getContents(ctx, '', false)))
      throw new InboxError(
        `Couldn't find ${ctx.repo}. Check the name, and that the token has access to it.`,
      );
    return [];
  }
  const body: unknown = await res.json();
  if (!Array.isArray(body)) return [];
  return body
    .filter(
      (e): e is { name: string; type: string } =>
        !!e && typeof e === 'object' && typeof e.name === 'string' && e.type === 'file',
    )
    .map((e) => e.name);
}

let inflight: Promise<InboxCheckResult> | null = null;

/**
 * Checks the brain repo: refreshes the profile and agenda for EDGE and queues new suggestion
 * packs for review. Concurrent calls share one check.
 */
export function checkInbox(
  opts: { now?: Date; fetch?: typeof fetch } = {},
): Promise<InboxCheckResult> {
  inflight ??= runCheck(opts).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function runCheck(opts: { now?: Date; fetch?: typeof fetch }): Promise<InboxCheckResult> {
  const now = opts.now ?? new Date();
  const today = todayStr(now);
  const s = await getSettings();
  const token = s.inboxToken?.trim();
  if (!token) return { ok: false, error: 'Add a GitHub token to connect your inbox.' };
  const repo = parseRepo(s.inboxRepo);
  if (!repo) return { ok: false, error: 'The repository should look like owner/name.' };
  const ctx: Ctx = { repo, token, fetch: opts.fetch ?? globalThis.fetch.bind(globalThis) };

  try {
    const [files, about, agenda] = await Promise.all([
      listInbox(ctx),
      getText(ctx, 'me.md'),
      getText(ctx, 'agenda.md'),
    ]);
    const known = [...s.inboxSeen, ...s.inboxPending.map((p) => p.name)];
    const names = newPackNames(files, known, today).slice(-MAX_NEW_PER_CHECK);
    const texts = await Promise.all(names.map((n) => getText(ctx, `inbox/${n}`)));
    const fetchedAt = now.toISOString();
    const fresh: InboxPack[] = names.flatMap((name, i) => {
      const text = texts[i];
      return text?.trim() ? [{ name, text, fetchedAt }] : [];
    });

    let added = 0;
    await db.transaction('rw', db.settings, async () => {
      // Re-read: a pack may have been resolved while the requests were in flight.
      const cur = await getSettings();
      const seen = new Set([...cur.inboxSeen, ...cur.inboxPending.map((p) => p.name)]);
      const toAdd = fresh.filter((p) => !seen.has(p.name));
      added = toAdd.length;
      await db.settings.put({
        ...cur,
        inboxPending: [...cur.inboxPending, ...toAdd].sort((a, b) => a.name.localeCompare(b.name)),
        inboxSeen: pruneSeen(cur.inboxSeen, today),
        inboxCheckedAt: fetchedAt,
        inboxError: undefined,
        brainAbout: about?.trim() ? capText(about, ABOUT_MAX_CHARS) : undefined,
        brainAgenda: agenda?.trim() ? capText(agenda, AGENDA_MAX_CHARS) : undefined,
      });
    });
    return { ok: true, added };
  } catch (e) {
    const error = e instanceof InboxError ? e.message : 'Checking the inbox failed unexpectedly.';
    if (!(e instanceof InboxError)) console.error('Inbox check failed', e);
    await db.transaction('rw', db.settings, async () => {
      const cur = await getSettings();
      await db.settings.put({ ...cur, inboxCheckedAt: now.toISOString(), inboxError: error });
    });
    return { ok: false, error };
  }
}

/** Marks a pack as handled (applied or dismissed) so it isn't offered again. */
export async function resolvePack(name: string, now: Date = new Date()): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const s = await getSettings();
    await db.settings.put({
      ...s,
      inboxPending: s.inboxPending.filter((p) => p.name !== name),
      inboxSeen: pruneSeen([...s.inboxSeen, name], todayStr(now)),
    });
  });
}

/** Puts a resolved pack back in the inbox (used by undo). */
export async function restorePack(pack: InboxPack): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const s = await getSettings();
    if (s.inboxPending.some((p) => p.name === pack.name)) return;
    await db.settings.put({
      ...s,
      inboxPending: [...s.inboxPending, pack].sort((a, b) => a.name.localeCompare(b.name)),
      inboxSeen: s.inboxSeen.filter((n) => n !== pack.name),
    });
  });
}

/** Switches the brain repo, forgetting what came from the previous one. */
export async function setInboxRepo(repo: string): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const s = await getSettings();
    if (s.inboxRepo === repo) return;
    await db.settings.put({
      ...s,
      inboxRepo: repo,
      inboxPending: [],
      inboxSeen: [],
      inboxCheckedAt: undefined,
      inboxError: undefined,
      brainAbout: undefined,
      brainAgenda: undefined,
    });
  });
}
