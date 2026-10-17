import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { Check, Copy, Layers, ListPlus, Plus, RotateCcw, Volume2 } from 'lucide-react';
import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import {
  citedRefs,
  hideIncompleteCitation,
  replaceCitations,
  stripCitations,
} from '../../ai/citations';
import type { RefInfo } from '../../ai/context';
import { Logo } from '../../components/Logo';
import type { Exchange } from './useAsk';

const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Markdown answer → sanitized HTML with numbered citation chips (`data-ref` buttons). */
export function answerHtml(
  text: string,
  numbering: Map<string, number>,
  refs: Record<string, RefInfo>,
  streaming: boolean,
): string {
  const src = replaceCitations(streaming ? hideIncompleteCitation(text) : text, (ref) =>
    numbering.has(ref) ? `⟦${ref}⟧` : null,
  );
  let html = marked.parse(src, { async: false, gfm: true, breaks: false });
  html = html.replace(/⟦([pmt]\d+)⟧/g, (_, ref: string) => {
    const n = numbering.get(ref)!;
    const title = escapeAttr(refs[ref]?.title ?? ref);
    return `<button type="button" class="pe-cite" data-ref="${ref}" aria-label="Source ${n}: ${title}">${n}</button>`;
  });
  if (streaming) {
    const caret = '<span class="pe-caret" aria-hidden="true"></span>';
    html = /<\/(p|li)>\s*(<\/[uo]l>\s*)?$/.test(html)
      ? html.replace(/<\/(p|li)>(\s*(?:<\/[uo]l>\s*)?)$/, `${caret}</$1>$2`)
      : html + caret;
  }
  return DOMPurify.sanitize(html, { ADD_ATTR: ['data-ref'] });
}

function SectionLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-[13px] font-semibold text-fg">
      <span className="text-muted" aria-hidden>
        {icon}
      </span>
      {children}
    </h3>
  );
}

interface ExchangeProps {
  exchange: Exchange;
  refs: Record<string, RefInfo>;
  isLast: boolean;
  readingLabel: string;
  canSpeak: boolean;
  onOpenRef: (info: RefInfo) => void;
  onRetry: () => void;
  onSpeak: (text: string) => void;
  onCopy: (text: string) => void;
  /** Tighter type for the full-screen answers drawer. */
  compact?: boolean;
}

export function ExchangeView({
  exchange: x,
  refs,
  isLast,
  readingLabel,
  canSpeak,
  onOpenRef,
  onRetry,
  onSpeak,
  onCopy,
  compact = false,
}: ExchangeProps) {
  const [copied, setCopied] = useState(false);
  const sources = useMemo(() => citedRefs(x.answer, (r) => r in refs), [x.answer, refs]);
  const numbering = useMemo(() => new Map(sources.map((r, i) => [r, i + 1])), [sources]);
  const html = useMemo(
    () => (x.answer ? answerHtml(x.answer, numbering, refs, x.status === 'streaming') : ''),
    [x.answer, numbering, refs, x.status],
  );
  const finished = x.status === 'done' || x.status === 'stopped';

  const onProseClick = (e: MouseEvent<HTMLDivElement>) => {
    const ref = (e.target as HTMLElement).closest<HTMLElement>('[data-ref]')?.dataset.ref;
    const info = ref ? refs[ref] : undefined;
    if (info) onOpenRef(info);
  };

  return (
    <article className={`border-b border-border last:border-b-0 ${compact ? 'pb-6' : 'pb-9'}`}>
      <h2
        className={`leading-snug font-semibold tracking-tight break-words ${
          compact ? 'text-[18px]' : 'text-[22px] md:text-[26px]'
        }`}
      >
        {x.question}
      </h2>

      {sources.length ? (
        <section className="mt-6" aria-label="Sources">
          <SectionLabel icon={<Layers size={15} />}>Sources</SectionLabel>
          <ol className="scrollbar-thin mt-2.5 flex gap-2 overflow-x-auto pb-1">
            {sources.map((ref, i) => {
              const s = refs[ref]!;
              return (
                <li key={ref} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenRef(s)}
                    className={`flex h-[74px] flex-col justify-between rounded-xl border border-border bg-surface px-3 py-2 text-left transition hover:bg-elevated ${
                      compact ? 'w-44' : 'w-48'
                    }`}
                  >
                    <span className="line-clamp-2 text-[13px] leading-snug">{s.title}</span>
                    <span className="flex items-center gap-1.5 text-[11.5px] text-muted">
                      <span className="tabular grid size-4 place-items-center rounded-full bg-elevated text-[10px] font-semibold text-fg">
                        {i + 1}
                      </span>
                      <span className="truncate">
                        {s.emoji} {s.kind === 'project' ? 'Project' : s.projectName}
                        {s.kind === 'milestone' ? ' · milestone' : ''}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      <section className="mt-6" aria-label="Answer">
        <SectionLabel icon={<Logo size={15} className="rounded-[4px]" />}>Answer</SectionLabel>
        {x.status === 'reading' ? (
          <p className="mt-3 flex items-center gap-2.5 text-[14px] text-muted">
            <span className="pe-dots" aria-hidden>
              <span />
              <span />
              <span />
            </span>
            {readingLabel}
          </p>
        ) : null}
        {html ? (
          <div
            className={`prose-posedge prose-answer mt-2.5 break-words ${compact ? 'prose-compact' : ''}`}
            onClick={onProseClick}
            // Sanitized with DOMPurify in answerHtml.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : null}
        {x.status === 'stopped' && !x.answer ? (
          <p className="mt-2.5 text-[14px] text-muted">Stopped.</p>
        ) : null}
        {x.status === 'error' ? (
          <div
            className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-[14px]"
            role="alert"
          >
            <span className="flex-1">{x.error}</span>
            {isLast ? (
              <button
                type="button"
                onClick={onRetry}
                className="font-medium text-brand hover:underline"
              >
                Try again
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      {finished && x.answer ? (
        <div className="mt-4 flex items-center gap-1 text-muted">
          <button
            type="button"
            className="flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] hover:bg-elevated hover:text-fg"
            onClick={() => {
              onCopy(stripCitations(x.answer));
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          {canSpeak ? (
            <button
              type="button"
              className="flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] hover:bg-elevated hover:text-fg"
              onClick={() => onSpeak(x.answer)}
            >
              <Volume2 size={14} /> Listen
            </button>
          ) : null}
          {isLast ? (
            <button
              type="button"
              className="flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] hover:bg-elevated hover:text-fg"
              onClick={onRetry}
            >
              <RotateCcw size={14} /> Rewrite
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function Related({ items, onAsk }: { items: string[]; onAsk: (q: string) => void }) {
  if (!items.length) return null;
  return (
    <section className="pt-2" aria-label="Related">
      <SectionLabel icon={<ListPlus size={15} />}>Related</SectionLabel>
      <ul className="mt-2 divide-y divide-border border-y border-border">
        {items.map((q) => (
          <li key={q}>
            <button
              type="button"
              onClick={() => onAsk(q)}
              className="flex min-h-11 w-full items-center gap-3 text-left text-[14.5px] hover:text-brand"
            >
              <span className="flex-1">{q}</span>
              <Plus size={16} className="text-muted" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
