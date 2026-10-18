import { beforeEach, describe, expect, it } from 'vitest';
import { exportBackup, resetAllData } from '../backup';
import { getSettings, updateSettings } from '../db';
import { checkInbox, resolvePack, restorePack, setInboxRepo } from './inbox';

const NOW = new Date(2026, 9, 18, 9, 0, 0);
const BASE = 'https://api.github.com/repos/vj/brain';

type Route = { status?: number; body?: unknown; headers?: Record<string, string> };

/** A fake fetch serving canned GitHub responses by URL, recording what it was asked. */
function fakeGitHub(routes: Record<string, Route | Error>) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const r = routes[url];
    if (r instanceof Error) throw r;
    if (!r) return new Response('{"message":"Not Found"}', { status: 404 });
    const body = typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? {});
    return new Response(body, { status: r.status ?? 200, headers: r.headers });
  }) as typeof fetch;
  return { fetch: f, calls };
}

const listing = (...names: string[]) => ({
  body: [...names.map((name) => ({ name, type: 'file' })), { name: 'old', type: 'dir' }],
});

beforeEach(async () => {
  await resetAllData();
  await updateSettings({ inboxRepo: 'vj/brain', inboxToken: 'github_pat_test' });
});

describe('inbox sync', () => {
  it('queues new packs and refreshes the profile and agenda', async () => {
    const gh = fakeGitHub({
      [`${BASE}/contents/inbox`]: listing('2026-10-17.md', '2026-10-18.md', 'README.md'),
      [`${BASE}/contents/inbox/2026-10-17.md`]: { body: '# Project: A\n- one' },
      [`${BASE}/contents/inbox/2026-10-18.md`]: { body: '> Hi\n\n# Project: B\n- two' },
      [`${BASE}/contents/me.md`]: { body: 'VJ, MS ECE at USC.' },
      [`${BASE}/contents/agenda.md`]: { body: 'Mon: office hours 10-12' },
    });
    expect(await checkInbox({ now: NOW, fetch: gh.fetch })).toEqual({ ok: true, added: 2 });
    const s = await getSettings();
    expect(s.inboxPending.map((p) => p.name)).toEqual(['2026-10-17.md', '2026-10-18.md']);
    expect(s.brainAbout).toBe('VJ, MS ECE at USC.');
    expect(s.brainAgenda).toBe('Mon: office hours 10-12');
    expect(s.inboxCheckedAt).toBe(NOW.toISOString());
    expect(s.inboxError).toBeUndefined();
    expect(gh.calls[0]?.headers.Authorization).toBe('Bearer github_pat_test');
    expect(gh.calls.find((c) => c.url.endsWith('me.md'))?.headers.Accept).toBe(
      'application/vnd.github.raw+json',
    );

    // A second check fetches nothing new.
    expect(await checkInbox({ now: NOW, fetch: gh.fetch })).toEqual({ ok: true, added: 0 });
  });

  it('does not offer resolved packs again, and undo restores them', async () => {
    const gh = fakeGitHub({
      [`${BASE}/contents/inbox`]: listing('2026-10-18.md'),
      [`${BASE}/contents/inbox/2026-10-18.md`]: { body: '# Project: A\n- one' },
    });
    await checkInbox({ now: NOW, fetch: gh.fetch });
    const pack = (await getSettings()).inboxPending[0]!;
    await resolvePack(pack.name, NOW);
    expect((await getSettings()).inboxPending).toEqual([]);
    expect(await checkInbox({ now: NOW, fetch: gh.fetch })).toEqual({ ok: true, added: 0 });
    await restorePack(pack);
    const s = await getSettings();
    expect(s.inboxPending).toEqual([pack]);
    expect(s.inboxSeen).toEqual([]);
  });

  it('treats a missing inbox folder as empty and clears stale notes', async () => {
    await updateSettings({ brainAbout: 'old', brainAgenda: 'old' });
    const gh = fakeGitHub({ [BASE]: { body: { full_name: 'vj/brain' } } });
    expect(await checkInbox({ now: NOW, fetch: gh.fetch })).toEqual({ ok: true, added: 0 });
    const s = await getSettings();
    expect(s.brainAbout).toBeUndefined();
    expect(s.brainAgenda).toBeUndefined();
  });

  it('explains failures calmly and keeps the queue', async () => {
    const cases: [Record<string, Route | Error>, RegExp][] = [
      [{}, /Couldn't find vj\/brain/],
      [{ [`${BASE}/contents/inbox`]: { status: 401 } }, /didn't accept the token/],
      [{ [`${BASE}/contents/inbox`]: { status: 403 } }, /can't read vj\/brain/],
      [
        {
          [`${BASE}/contents/inbox`]: {
            status: 403,
            headers: { 'x-ratelimit-remaining': '0' },
          },
        },
        /rate limit/,
      ],
      [{ [`${BASE}/contents/inbox`]: new TypeError('Failed to fetch') }, /Couldn't reach GitHub/],
    ];
    for (const [routes, message] of cases) {
      const r = await checkInbox({ now: NOW, fetch: fakeGitHub(routes).fetch });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(message);
      expect((await getSettings()).inboxError).toMatch(message);
    }
  });

  it('needs a token and a valid repo name', async () => {
    await updateSettings({ inboxToken: undefined });
    expect((await checkInbox({ now: NOW })).ok).toBe(false);
    await updateSettings({ inboxToken: 'x', inboxRepo: 'nope' });
    const r = await checkInbox({ now: NOW });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/owner\/name/);
  });

  it('shares one check between concurrent callers', async () => {
    const gh = fakeGitHub({
      [`${BASE}/contents/inbox`]: listing('2026-10-18.md'),
      [`${BASE}/contents/inbox/2026-10-18.md`]: { body: '# Project: A\n- one' },
    });
    const [a, b] = await Promise.all([
      checkInbox({ now: NOW, fetch: gh.fetch }),
      checkInbox({ now: NOW, fetch: gh.fetch }),
    ]);
    expect(a).toEqual(b);
    expect((await getSettings()).inboxPending).toHaveLength(1);
  });

  it('forgets the old repo when switching', async () => {
    await updateSettings({ inboxSeen: ['2026-10-17.md'], brainAbout: 'x' });
    await setInboxRepo('vj/other');
    const s = await getSettings();
    expect(s.inboxRepo).toBe('vj/other');
    expect(s.inboxSeen).toEqual([]);
    expect(s.brainAbout).toBeUndefined();
  });

  it('never puts the inbox token in a backup', async () => {
    await updateSettings({ aiApiKey: 'sk-ant-test', aiKeyInBackup: true });
    const withKey = await exportBackup(NOW, { includeApiKey: true });
    expect(withKey.data.settings[0]?.aiApiKey).toBe('sk-ant-test');
    expect(withKey.data.settings[0]).not.toHaveProperty('inboxToken');
    const plain = await exportBackup(NOW);
    expect(plain.data.settings[0]).not.toHaveProperty('aiApiKey');
    expect(plain.data.settings[0]).not.toHaveProperty('inboxToken');
  });
});
