import { formatDistanceToNow } from 'date-fns';
import { Eye, EyeOff, Inbox, Loader2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { Input } from '../../components/Field';
import { updateSettings } from '../../db/db';
import { checkInbox, setInboxRepo } from '../../db/ops/inbox';
import type { Settings } from '../../db/types';
import { parseRepo } from '../../domain/inbox';

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-[13px] font-medium text-muted">{label}</span>
      {children}
      {hint ? <span className="text-[12px] text-muted">{hint}</span> : null}
    </div>
  );
}

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

/** Settings > Inbox: the brain repo, its read-only token, "Check now" and what EDGE receives. */
export function InboxSettings({ s }: { s: Settings }) {
  const [repoDraft, setRepoDraft] = useState(s.inboxRepo);
  const [tokenDraft, setTokenDraft] = useState(s.inboxToken ?? '');
  const [show, setShow] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const repoValid = !!parseRepo(repoDraft);
  const pending = s.inboxPending.length;

  const saveRepo = async () => {
    const repo = parseRepo(repoDraft);
    if (!repo) return;
    setRepoDraft(repo);
    if (repo !== s.inboxRepo) {
      await setInboxRepo(repo);
      setResult(null);
    }
  };

  const saveToken = async () => {
    const t = tokenDraft.trim();
    if (t !== (s.inboxToken ?? '')) await updateSettings({ inboxToken: t || undefined });
  };

  const runCheck = async () => {
    setChecking(true);
    setResult(null);
    try {
      await saveRepo();
      await saveToken();
      const r = await checkInbox();
      if (r.ok)
        setResult(
          r.added
            ? `Found ${r.added} new suggestion pack${r.added === 1 ? '' : 's'}.`
            : 'Nothing new.',
        );
    } finally {
      setChecking(false);
    }
  };

  return (
    <section
      aria-labelledby="inbox-settings"
      className="grid gap-4 rounded-xl border border-border bg-surface p-5 shadow-card"
    >
      <div>
        <h2 id="inbox-settings" className="flex items-center gap-2 text-base">
          <Inbox size={16} className="text-brand" aria-hidden /> Inbox
        </h2>
        <p className="mt-0.5 text-[13px] text-muted">
          Suggestions from a daily check of your email and calendar, delivered through a private
          GitHub repository. Nothing is added until you review it.
        </p>
      </div>
      <Row
        label="Repository"
        hint={
          repoValid ? undefined : 'Use the form owner/name, like vejaysuriyaa-07/posedge-brain.'
        }
      >
        <Input
          value={repoDraft}
          onChange={(e) => setRepoDraft(e.target.value)}
          onBlur={() => void saveRepo()}
          placeholder="owner/name"
          autoComplete="off"
          spellCheck={false}
          aria-label="Brain repository"
          aria-invalid={!repoValid}
          className="font-mono text-[13px]"
        />
      </Row>
      <Row
        label="GitHub token"
        hint={
          <>
            A fine-grained token with read-only access to Contents on that repository only.{' '}
            <a
              href={TOKEN_URL}
              target="_blank"
              rel="noreferrer"
              className="text-brand hover:underline"
            >
              Create one on GitHub
            </a>
            .
          </>
        }
      >
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Input
              type={show ? 'text' : 'password'}
              value={tokenDraft}
              onChange={(e) => setTokenDraft(e.target.value)}
              onBlur={() => void saveToken()}
              placeholder="github_pat_…"
              autoComplete="off"
              spellCheck={false}
              aria-label="GitHub token"
              className="pr-10 font-mono text-[13px]"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Hide token' : 'Show token'}
              className="absolute top-0 right-0 grid size-10 place-items-center text-muted hover:text-fg"
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <Button
            onClick={() => void runCheck()}
            disabled={!tokenDraft.trim() || !repoValid || checking}
          >
            {checking ? <Loader2 size={15} className="animate-spin" /> : null} Check now
          </Button>
        </div>
      </Row>
      <InboxStatus s={s} checking={checking} result={result} pending={pending} />
      {s.brainAbout || s.brainAgenda ? (
        <details className="rounded-lg bg-elevated/60 px-3 py-2 text-[13px]">
          <summary className="flex min-h-8 cursor-pointer items-center">
            What EDGE knows from your brain repo
          </summary>
          <div className="grid gap-3 pt-2 pb-1">
            {s.brainAbout ? <NoteBlock title="About you (me.md)" text={s.brainAbout} /> : null}
            {s.brainAgenda ? <NoteBlock title="Agenda (agenda.md)" text={s.brainAgenda} /> : null}
          </div>
        </details>
      ) : null}
      <p className="text-[13px] text-muted">
        Posedge checks when it opens and about once an hour. The token stays in this browser, is
        only sent to api.github.com, and is never included in backups.
      </p>
    </section>
  );
}

function InboxStatus({
  s,
  checking,
  result,
  pending,
}: {
  s: Settings;
  checking: boolean;
  result: string | null;
  pending: number;
}) {
  if (checking)
    return (
      <p role="status" className="text-[13px] text-muted">
        Checking…
      </p>
    );
  if (!s.inboxToken) return null;
  if (s.inboxError)
    return (
      <p role="status" className="text-[13px] text-warn">
        {s.inboxError}
      </p>
    );
  if (!s.inboxCheckedAt) return null;
  return (
    <p role="status" className="text-[13px] text-muted">
      {result ? <span className="text-ok">{result} </span> : null}
      Checked {formatDistanceToNow(new Date(s.inboxCheckedAt), { addSuffix: true })}.
      {pending ? (
        <>
          {' '}
          <Link to="/import" className="font-medium text-brand hover:underline">
            Review {pending === 1 ? '1 waiting pack' : `${pending} waiting packs`}
          </Link>
        </>
      ) : null}
    </p>
  );
}

function NoteBlock({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <p className="text-[12px] font-semibold tracking-wide text-muted uppercase">{title}</p>
      <pre className="scrollbar-thin mt-1 max-h-56 overflow-auto rounded-md bg-bg p-2.5 font-sans text-[12.5px] whitespace-pre-wrap text-fg">
        {text}
      </pre>
    </div>
  );
}
