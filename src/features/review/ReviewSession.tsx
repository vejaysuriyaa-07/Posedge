import { Eye, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { celebrate } from '../../app/celebrate';
import { useToast } from '../../app/Toasts';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Kbd } from '../../components/Kbd';
import { ProjectBadge } from '../../components/ProjectBadge';
import { Textarea } from '../../components/Field';
import { rateReviewCard } from '../../db/ops/review';
import type { Project, Rating, ReviewCard } from '../../db/types';
import { previewIntervals } from '../../domain/srs';
import { useHotkeys } from '../../hooks/useHotkeys';
import { useSettings } from '../../hooks/useSettings';

export const RATING_LABELS: Record<Rating, string> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
};
const RATING_STYLE: Record<Rating, string> = {
  1: 'border-rose-400/50 hover:bg-rose-500/10',
  2: 'border-amber-400/50 hover:bg-amber-400/10',
  3: 'border-emerald-400/50 hover:bg-emerald-500/10',
  4: 'border-sky-400/50 hover:bg-sky-500/10',
};

interface Result {
  rating: Rating;
  durationMs: number;
}

/**
 * One review session over a snapshot of the queue. "Again" sends a card back once to the end.
 */
export function ReviewSession({
  initial,
  byId,
  onDone,
}: {
  initial: ReviewCard[];
  byId: Map<string, Project>;
  onDone: () => void;
}) {
  const settings = useSettings();
  const { toast, announce } = useToast();
  const [queue, setQueue] = useState<{ card: ReviewCard; again: boolean }[]>(() =>
    initial.map((card) => ({ card, again: false })),
  );
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [scratch, setScratch] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [shownAt, setShownAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => new Date());

  const entry = queue[index];
  const card = entry?.card;
  const finished = index >= queue.length;
  const previews = useMemo(
    () =>
      card
        ? previewIntervals(card.fsrs, now, { requestRetention: settings.requestRetention })
        : null,
    [card, now, settings.requestRetention],
  );

  const reveal = () => {
    if (!card || revealed) return;
    setRevealed(true);
    setNow(new Date());
    announce('Answer revealed. Rate 1 Again, 2 Hard, 3 Good, 4 Easy.');
  };

  const rate = async (rating: Rating) => {
    if (!entry || !card || !revealed || busy) return;
    setBusy(true);
    try {
      const r = await rateReviewCard(card.id, rating, Date.now() - shownAt);
      const nextResults = [...results, { rating, durationMs: Date.now() - shownAt }];
      setResults(nextResults);
      // "Again" sends a card back once, to the end of this session.
      const requeue = rating === 1 && !entry.again && !!r;
      if (requeue) setQueue((q) => [...q, { card: r.card, again: true }]);
      if (r && r.levelsGained > 0 && settings.gamification) {
        toast({ message: `Level ${r.levelAfter.level}: ${r.levelAfter.title}`, tone: 'xp' });
        celebrate(settings.confetti);
      }
      setRevealed(false);
      setScratch('');
      setShownAt(Date.now());
      setNow(new Date());
      const nextIndex = index + 1;
      setIndex(nextIndex);
      if (nextIndex >= queue.length + (requeue ? 1 : 0) && nextResults.length >= 10) {
        celebrate(settings.confetti);
      }
    } finally {
      setBusy(false);
    }
  };

  useHotkeys({
    ' ': (e) => {
      if (!revealed && !finished) {
        e.preventDefault();
        reveal();
      }
    },
    '1': () => void rate(1),
    '2': () => void rate(2),
    '3': () => void rate(3),
    '4': () => void rate(4),
  });

  if (!initial.length) {
    return <EmptyState message="All caught up. New cards unlock as you finish learning tasks." />;
  }

  if (finished) {
    const reviewed = results.length;
    const correct = results.filter((r) => r.rating > 1).length;
    const minutes = Math.max(1, Math.round(results.reduce((s, r) => s + r.durationMs, 0) / 60000));
    return (
      <div className="mx-auto grid max-w-lg grid-cols-1 gap-5 rounded-2xl border border-border bg-surface p-6 text-center shadow-card">
        <h2 className="text-xl">Session done</h2>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Reviewed" value={String(reviewed)} />
          <Stat
            label="Recalled"
            value={reviewed ? `${Math.round((correct / reviewed) * 100)}%` : '–'}
          />
          <Stat label="Time" value={`${minutes}m`} />
          {settings.gamification ? (
            <Stat label="XP" value={`+${reviewed * 2}`} />
          ) : (
            <Stat label="Cards" value={String(new Set(queue.map((q) => q.card.id)).size)} />
          )}
        </dl>
        <div className="flex justify-center gap-2">
          <Button variant="primary" onClick={onDone}>
            Done
          </Button>
          <Link
            to="/"
            className="inline-flex min-h-10 items-center rounded-lg px-3.5 text-sm font-medium text-muted hover:text-fg"
          >
            Back to Today
          </Link>
        </div>
      </div>
    );
  }

  if (!card) return null;
  const project = byId.get(card.projectId);

  return (
    <div className="mx-auto grid max-w-2xl grid-cols-1 gap-4">
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-brand transition-[width]"
            style={{ width: `${(index / queue.length) * 100}%` }}
          />
        </div>
        <span className="tabular text-[13px] text-muted" aria-live="polite">
          {index + 1} / {queue.length}
        </span>
      </div>
      <article
        className="grid gap-4 rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6"
        aria-label="Review card"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {project ? <ProjectBadge project={project} /> : null}
          {card.tags.map((t) => (
            <span key={t} className="rounded-md bg-elevated px-1.5 py-0.5 text-[11px] text-muted">
              #{t}
            </span>
          ))}
          {entry.again ? (
            <span className="ml-auto flex items-center gap-1 text-[11px] text-muted">
              <RotateCcw size={11} /> second look
            </span>
          ) : null}
        </div>
        <p className="text-lg leading-relaxed font-medium sm:text-xl">{card.prompt}</p>
        {!revealed ? (
          <>
            <Textarea
              aria-label="Type your answer (not graded)"
              rows={3}
              value={scratch}
              onChange={(e) => setScratch(e.target.value)}
              placeholder="Type your answer first (not graded, it just makes you actually recall)"
            />
            <Button variant="primary" onClick={reveal} className="justify-self-start">
              <Eye size={16} /> Reveal <Kbd>Space</Kbd>
            </Button>
          </>
        ) : (
          <div className={`grid gap-3 ${scratch.trim() ? 'sm:grid-cols-2' : ''}`}>
            {scratch.trim() ? (
              <div className="rounded-xl border border-border bg-bg p-3">
                <p className="mb-1 text-[12px] font-medium text-muted">Your answer</p>
                <p className="text-sm whitespace-pre-wrap">{scratch}</p>
              </div>
            ) : null}
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/5 p-3">
              <p className="mb-1 text-[12px] font-medium text-muted">Answer</p>
              <p className="text-sm whitespace-pre-wrap">{card.answer}</p>
            </div>
            {card.codeSnippet ? (
              <pre className="scrollbar-thin overflow-x-auto rounded-xl border border-border bg-bg p-3 font-mono text-[12.5px] sm:col-span-2">
                <code>{card.codeSnippet}</code>
              </pre>
            ) : null}
          </div>
        )}
      </article>
      {revealed && previews ? (
        <div
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          role="group"
          aria-label="Rate your recall"
        >
          {([1, 2, 3, 4] as Rating[]).map((r) => (
            <button
              key={r}
              type="button"
              disabled={busy}
              onClick={() => void rate(r)}
              className={`grid min-h-14 place-items-center rounded-xl border bg-surface px-2 py-2 text-sm font-medium transition ${RATING_STYLE[r]}`}
            >
              <span>
                {RATING_LABELS[r]} <Kbd>{r}</Kbd>
              </span>
              <span className="tabular text-[12px] font-normal text-muted">
                {previews[r].label}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="tabular text-2xl font-semibold">{value}</dd>
    </div>
  );
}
