import { Check, Inbox } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import type { InboxPack } from '../../db/types';
import { countPackTasks, packDate, splitInboxPack } from '../../domain/inbox';
import { formatDate } from '../../domain/week';
import { useSettings } from '../../hooks/useSettings';

interface Props {
  /** The pack currently loaded into the editor, if any. */
  active?: string;
  onReview: (pack: InboxPack) => void;
  onDismiss: (pack: InboxPack) => void;
}

/** "From your inbox": suggestion packs from the daily email/calendar check, waiting for review. */
export function InboxPanel({ active, onReview, onDismiss }: Props) {
  const s = useSettings();
  const packs = s.inboxPending;
  if (!packs.length) return null;
  return (
    <section
      aria-labelledby="inbox-heading"
      className="grid gap-3 rounded-xl border border-violet-400/30 bg-violet-500/[0.06] p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="inbox-heading" className="flex items-center gap-2 text-base">
          <Inbox size={16} className="text-brand" aria-hidden /> From your inbox
        </h2>
        <Link to="/settings" className="text-[12px] text-muted hover:text-fg">
          Inbox settings
        </Link>
      </div>
      <ul className="grid gap-2">
        {packs.map((p) => {
          const { summary } = splitInboxPack(p.text);
          const count = countPackTasks(p.text);
          const date = packDate(p.name);
          const isActive = p.name === active;
          return (
            <li
              key={p.name}
              className={`flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border bg-surface p-3 ${isActive ? 'border-brand/50' : 'border-border'}`}
            >
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-sm font-medium">
                  {date ? formatDate(date, 'EEE, MMM d') : p.name}
                  <span className="font-normal text-muted">
                    {' · '}
                    {count ? `${count} suggestion${count === 1 ? '' : 's'}` : 'Notes only'}
                  </span>
                </p>
                {summary ? (
                  <p className="mt-0.5 line-clamp-4 text-[13px] whitespace-pre-line text-muted">
                    {summary}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-2">
                {count ? (
                  <Button
                    size="sm"
                    variant={isActive ? 'secondary' : 'primary'}
                    disabled={isActive}
                    onClick={() => onReview(p)}
                  >
                    {isActive ? 'In review below' : 'Review'}
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => onDismiss(p)}>
                  {count ? (
                    'Dismiss'
                  ) : (
                    <>
                      <Check size={14} /> Got it
                    </>
                  )}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
