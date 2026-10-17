import { useLiveQuery } from 'dexie-react-hooks';
import { Palmtree, Shuffle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useToast } from '../../app/Toasts';
import { useUi } from '../../app/ui';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Field, Input, Select, Textarea } from '../../components/Field';
import { Tabs } from '../../components/Tabs';
import { db } from '../../db/db';
import { catchUp, createCards } from '../../db/ops/review';
import type { ReviewCard, ReviewLog, Task } from '../../db/types';
import { shouldOfferCatchUp } from '../../domain/srs';
import { addDaysStr, atHour, dateOfIso } from '../../domain/week';
import { useProjects } from '../../hooks/useData';
import { useReviewQueue } from '../../hooks/useReviewQueue';
import { useSettings } from '../../hooks/useSettings';
import { useToday } from '../../hooks/useToday';
import { CardBrowser } from './CardBrowser';
import { ReviewSession } from './ReviewSession';

type TabKey = 'review' | 'cards' | 'add' | 'needs';

/** Consecutive days with at least one review, counting back from today (today pending). */
export function reviewDayStreak(logs: Pick<ReviewLog, 'reviewedAt'>[], today: string): number {
  const days = new Set(logs.map((l) => dateOfIso(l.reviewedAt)));
  let d = days.has(today) ? today : addDaysStr(today, -1);
  let n = 0;
  while (days.has(d)) {
    n++;
    d = addDaysStr(d, -1);
  }
  return n;
}

export default function ReviewPage() {
  const [tab, setTab] = useState<TabKey>('review');
  const [sessionKey, setSessionKey] = useState(0);
  const today = useToday();
  const settings = useSettings();
  const { byId } = useProjects();
  const { queue, loaded } = useReviewQueue();
  const { toast } = useToast();
  const thirtyDaysAgo = atHour(addDaysStr(today, -30), 0).toISOString();
  const stats = useLiveQuery(async () => {
    const [logs, cards, needs] = await Promise.all([
      db.reviewLogs.where('reviewedAt').aboveOrEqual(thirtyDaysAgo).toArray(),
      db.reviewCards.toArray(),
      db.tasks.filter((t) => !!t.needsCards).toArray(),
    ]);
    return { logs, cards, needs };
  }, [thirtyDaysAgo]);

  const header = useMemo(() => {
    const logs = stats?.logs ?? [];
    const cards: ReviewCard[] = stats?.cards ?? [];
    const good = logs.filter((l) => l.rating >= 3).length;
    const startOfToday = atHour(today, 0).toISOString();
    return {
      released: cards.filter((c) => c.slotDate === today).length,
      retention: logs.length ? Math.round((good / logs.length) * 100) : null,
      streak: reviewDayStreak(logs, today),
      overdue: cards.filter((c) => !c.suspended && !c.queued && c.due < startOfToday).length,
      queued: cards.filter((c) => c.queued).length,
    };
  }, [stats, today]);

  // Snapshot the queue when a session starts so live updates don't reshuffle cards mid-session.
  const [snapshot, setSnapshot] = useState<{ key: number; cards: ReviewCard[] } | null>(null);
  const sessionCards = snapshot?.key === sessionKey ? snapshot.cards : null;
  if (loaded && tab === 'review' && !sessionCards) setSnapshot({ key: sessionKey, cards: queue });

  const needs = stats?.needs ?? [];

  return (
    <section className="mx-auto grid max-w-4xl grid-cols-1 gap-5">
      <header className="grid gap-4">
        <h1 className="text-2xl">Review</h1>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HeaderStat
            label="Due today"
            value={String(queue.length)}
            hint={`cap ${settings.dailyReviewCap}`}
          />
          <HeaderStat
            label="New today"
            value={String(header.released)}
            hint={`of ${settings.newCardsPerDay}${header.queued ? ` · ${header.queued} queued` : ''}`}
          />
          <HeaderStat label="Review streak" value={`${header.streak}d`} />
          <HeaderStat
            label="30-day retention"
            value={header.retention === null ? '–' : `${header.retention}%`}
            hint="Good or Easy"
          />
        </dl>
      </header>

      {settings.vacationMode ? (
        <div className="flex items-center gap-3 rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm">
          <Palmtree size={18} className="text-sky-600 dark:text-sky-300" aria-hidden />
          Vacation mode is on. Nothing comes due and your streak is frozen. Turn it off in Settings
          when you are back.
        </div>
      ) : shouldOfferCatchUp(header.overdue, settings.dailyReviewCap) ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm">
          <Shuffle size={18} className="text-amber-700 dark:text-amber-300" aria-hidden />
          <span className="flex-1">
            {header.overdue} cards piled up. Spread them evenly over the next 5 days, hardest first?
          </span>
          <Button
            size="sm"
            onClick={async () => {
              const n = await catchUp();
              toast(`Spread ${n} cards over 5 days.`);
              setSessionKey((k) => k + 1);
            }}
          >
            Spread them out
          </Button>
        </div>
      ) : null}

      <Tabs
        label="Review sections"
        value={tab}
        onChange={(k) => {
          setTab(k);
          if (k === 'review') setSessionKey((n) => n + 1);
        }}
        items={[
          { key: 'review', label: 'Review' },
          { key: 'cards', label: 'Cards' },
          { key: 'add', label: 'Add card' },
          { key: 'needs', label: `Needs cards${needs.length ? ` (${needs.length})` : ''}` },
        ]}
      />
      <div role="tabpanel">
        {tab === 'review' && sessionCards ? (
          <ReviewSession
            key={sessionKey}
            initial={sessionCards}
            byId={byId}
            onDone={() => setSessionKey((k) => k + 1)}
          />
        ) : null}
        {tab === 'cards' ? <CardBrowser /> : null}
        {tab === 'add' ? <AddCard /> : null}
        {tab === 'needs' ? <NeedsCards tasks={needs} /> : null}
      </div>
    </section>
  );
}

function HeaderStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3 shadow-card">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="tabular text-2xl font-semibold">{value}</dd>
      {hint ? <dd className="text-[11px] text-muted">{hint}</dd> : null}
    </div>
  );
}

function AddCard() {
  const { active } = useProjects();
  const settings = useSettings();
  const { toast } = useToast();
  const [projectId, setProjectId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [code, setCode] = useState('');
  const [tags, setTags] = useState('');
  const pid = projectId || settings.lastProjectId || active[0]?.id || '';
  if (!active.length)
    return <EmptyState message="Create a project first; every card belongs to one." />;
  const save = async () => {
    const r = await createCards([
      {
        projectId: pid,
        prompt,
        answer,
        codeSnippet: code || undefined,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      },
    ]);
    toast({
      message: r.queued ? 'Card queued for a later day.' : 'Card added. First review tomorrow.',
      tone: 'success',
    });
    setPrompt('');
    setAnswer('');
    setCode('');
  };
  return (
    <form
      className="grid max-w-2xl gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (prompt.trim() && answer.trim()) void save();
      }}
    >
      <Field label="Project">
        <Select value={pid} onChange={(e) => setProjectId(e.target.value)}>
          {active.map((p) => (
            <option key={p.id} value={p.id}>
              {p.emoji} {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Prompt">
        <Textarea
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask why/how, contrast, produce code, predict output…"
        />
      </Field>
      <Field label="Answer">
        <Textarea
          rows={3}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="In your own words"
        />
      </Field>
      <Field label="Code snippet (optional)">
        <Textarea
          rows={3}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="font-mono text-[12.5px]"
          spellCheck={false}
        />
      </Field>
      <Field label="Tags">
        <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="SVA, UVM" />
      </Field>
      <Button
        type="submit"
        variant="primary"
        disabled={!prompt.trim() || !answer.trim()}
        className="justify-self-start"
      >
        Add card
      </Button>
    </form>
  );
}

function NeedsCards({ tasks }: { tasks: Task[] }) {
  const ui = useUi();
  const { byId } = useProjects();
  if (!tasks.length)
    return <EmptyState message="Nothing waiting. Every finished learning task has cards." />;
  return (
    <ul className="grid gap-2">
      {[...tasks]
        .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
        .map((t) => {
          const p = byId.get(t.projectId);
          return (
            <li
              key={t.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3"
            >
              <span aria-hidden>{p?.emoji}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
              <Button size="sm" variant="primary" onClick={() => ui.openLockItIn(t.id)}>
                Lock it in
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const { needsCards: _n, ...rest } = t;
                  await db.tasks.put(rest);
                }}
              >
                Dismiss
              </Button>
            </li>
          );
        })}
    </ul>
  );
}
