import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Check, ChevronDown, Copy, Flag, Undo2 } from 'lucide-react';
import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { useToast } from '../../app/Toasts';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Textarea } from '../../components/Field';
import { db } from '../../db/db';
import { commitImport, selectAll, selKey, undoImport } from '../../db/ops/import';
import { resolvePack, restorePack } from '../../db/ops/inbox';
import type { InboxPack } from '../../db/types';
import { splitInboxPack } from '../../domain/inbox';
import type { ParsedPlan } from '../../domain/planParser';
import { parsePlan, PLAN_EXAMPLE, PLAN_PROMPT } from '../../domain/planParser';
import { formatMinutes } from '../../domain/quickAddParser';
import { formatDate, formatWeekRange, mondayOf, weekLabel } from '../../domain/week';
import { useProjects } from '../../hooks/useData';
import { useToday } from '../../hooks/useToday';
import { InboxPanel } from './InboxPanel';

export default function ImportPage() {
  const [text, setText] = useState('');
  /** The inbox pack loaded into the editor; importing resolves it. */
  const [fromPack, setFromPack] = useState<InboxPack | null>(null);
  const deferred = useDeferredValue(text);
  const today = useToday();
  const { projects } = useProjects();
  const { toast } = useToast();
  const previewRef = useRef<HTMLDivElement>(null);
  const plan = useMemo(
    () => (deferred.trim() ? parsePlan(deferred, { today, projects }) : null),
    [deferred, today, projects],
  );
  const [sel, setSel] = useState<{ plan: ParsedPlan; keys: Set<string> } | null>(null);
  const keys = useMemo(
    () => (plan ? (sel?.plan === plan ? sel.keys : selectAll(plan)) : new Set<string>()),
    [plan, sel],
  );

  const toggle = (key: string, children: string[] = []) => {
    if (!plan) return;
    const next = new Set(keys);
    const on = !next.has(key);
    for (const k of [key, ...children]) {
      if (on) next.add(k);
      else next.delete(k);
    }
    setSel({ plan, keys: next });
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(PLAN_PROMPT);
      toast('Prompt copied. Paste it under your plan in Claude.');
    } catch {
      toast({
        message: 'Clipboard blocked. Select the prompt in the Format reference and copy it.',
        tone: 'warn',
      });
    }
  };

  const editText = (v: string) => {
    setText(v);
    if (!v.trim()) setFromPack(null);
  };

  const reviewPack = (pack: InboxPack) => {
    const previous = text;
    if (previous.trim() && !fromPack) {
      toast({
        message: 'Your pasted plan was replaced.',
        action: { label: 'Restore', onClick: () => editText(previous) },
        duration: 8000,
      });
    }
    setText(splitInboxPack(pack.text).plan);
    setSel(null);
    setFromPack(pack);
    previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const dismissPack = async (pack: InboxPack) => {
    if (fromPack?.name === pack.name) editText('');
    await resolvePack(pack.name);
    toast({
      message: 'Dismissed.',
      action: { label: 'Undo', onClick: () => void restorePack(pack) },
    });
  };

  const doImport = async () => {
    if (!plan) return;
    const pack = fromPack;
    const { batch, big3Dropped } = await commitImport(plan, keys, text);
    if (pack) await resolvePack(pack.name);
    setText('');
    setSel(null);
    setFromPack(null);
    toast({
      message: `Imported ${plural(batch.created.tasks.length, 'task')}${pack ? ' from your inbox' : ''}${big3Dropped ? ` (${big3Dropped} Big 3 already full)` : ''}.`,
      action: {
        label: 'Undo',
        onClick: () =>
          void (async () => {
            await undoImport(batch.id);
            if (pack) await restorePack(pack);
          })(),
      },
      duration: 8000,
    });
  };

  const counts = useMemo(() => {
    if (!plan) return { tasks: 0, milestones: 0, projects: 0 };
    let tasks = 0;
    let milestones = 0;
    let newProjects = 0;
    plan.projects.forEach((p, pi) => {
      if (!keys.has(selKey.project(pi))) return;
      if (!p.match) newProjects++;
      p.tasks.forEach((_, ti) => keys.has(selKey.task(pi, ti)) && tasks++);
      p.milestones.forEach((_, mi) => keys.has(selKey.milestone(pi, mi)) && milestones++);
    });
    return { tasks, milestones, projects: newProjects };
  }, [plan, keys]);

  return (
    <section className="mx-auto grid max-w-5xl grid-cols-1 gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl">Import</h1>
          <p className="text-[13px] text-muted">
            Turn a plan from Claude into tasks without retyping.
          </p>
        </div>
        <Button onClick={() => void copyPrompt()}>
          <Copy size={15} /> Copy prompt for Claude
        </Button>
      </header>

      <InboxPanel
        active={fromPack?.name}
        onReview={reviewPack}
        onDismiss={(p) => void dismissPack(p)}
      />

      <ol className="grid gap-1 rounded-xl border border-border bg-surface p-4 text-[13px] text-muted sm:grid-cols-3">
        <li>
          <span className="font-semibold text-fg">1.</span> In your Claude chat, paste the copied
          prompt under the plan.
        </li>
        <li>
          <span className="font-semibold text-fg">2.</span> Copy Claude&apos;s Markdown (or JSON)
          reply.
        </li>
        <li>
          <span className="font-semibold text-fg">3.</span> Paste it below, untick anything you
          don&apos;t want, import.
        </li>
      </ol>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="grid content-start gap-2">
          <Textarea
            aria-label="Plan to import (Markdown or JSON)"
            rows={18}
            value={text}
            onChange={(e) => editText(e.target.value)}
            placeholder={PLAN_EXAMPLE}
            className="font-mono text-[12.5px]"
            spellCheck={false}
          />
          <div className="flex gap-2">
            <Button
              variant="primary"
              disabled={!text.trim()}
              onClick={() =>
                previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              Parse
            </Button>
            <Button variant="ghost" disabled={!text} onClick={() => editText('')}>
              Clear
            </Button>
          </div>
          <FormatReference />
        </div>

        <div ref={previewRef} className="grid content-start gap-3" aria-live="polite">
          {!plan ? (
            <EmptyState message="Paste a plan to see a preview here." />
          ) : (
            <>
              {plan.warnings.length ? (
                <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-[13px]">
                  <p className="mb-1 flex items-center gap-2 font-medium">
                    <AlertTriangle size={15} aria-hidden /> {plan.warnings.length} line
                    {plan.warnings.length === 1 ? '' : 's'} need a look
                  </p>
                  <ul className="grid gap-0.5 text-muted">
                    {plan.warnings.map((w, i) => (
                      <li key={i}>
                        {w.line > 0 ? (
                          <span className="tabular font-medium text-fg">Line {w.line}: </span>
                        ) : null}
                        {w.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {plan.projects.map((p, pi) => {
                const pKey = selKey.project(pi);
                const children = [
                  ...p.milestones.map((_, mi) => selKey.milestone(pi, mi)),
                  ...p.tasks.map((_, ti) => selKey.task(pi, ti)),
                ];
                const pOn = keys.has(pKey);
                const existing = p.match ? projects.find((x) => x.id === p.match!.id) : undefined;
                const color = existing?.color ?? p.color ?? 'violet';
                const weeks = groupByWeek(p.tasks.map((t, ti) => ({ t, ti })));
                return (
                  <div
                    key={pi}
                    data-pc={color}
                    className={`rounded-xl border border-border bg-surface p-3 ${pOn ? '' : 'opacity-60'}`}
                  >
                    <label className="flex min-h-9 cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={pOn}
                        onChange={() => toggle(pKey, children)}
                        className="size-4 accent-violet-500"
                      />
                      <span className="size-3 rounded-full bg-(--pc)" aria-hidden />
                      <span className="font-medium">
                        {existing ? `${existing.emoji} ${existing.name}` : p.name}
                      </span>
                      <span
                        className={`ml-auto rounded-md px-1.5 py-0.5 text-[11px] ${existing ? 'bg-elevated text-muted' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-200'}`}
                      >
                        {existing
                          ? `matches existing (${Math.round((p.match?.score ?? 0) * 100)}%)`
                          : 'new project'}
                      </span>
                    </label>
                    {p.milestones.length ? (
                      <ul className="mt-1 grid gap-0.5 pl-6">
                        {p.milestones.map((m, mi) => (
                          <li key={mi}>
                            <label className="flex min-h-8 items-center gap-2 text-[13px]">
                              <input
                                type="checkbox"
                                disabled={!pOn}
                                checked={keys.has(selKey.milestone(pi, mi))}
                                onChange={() => toggle(selKey.milestone(pi, mi))}
                                className="size-4 accent-violet-500"
                              />
                              <Flag size={13} className="text-(--pc)" aria-hidden />
                              <span className="flex-1">{m.title}</span>
                              <span className="text-[12px] text-muted">
                                {formatWeekRange(m.weekStart)}
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {weeks.map(([week, items]) => (
                      <div key={week} className="mt-2 pl-6">
                        <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">
                          {week === 'none'
                            ? 'Unplanned'
                            : `${weekLabel(week, mondayOf(today))} · ${formatWeekRange(week)}`}
                        </p>
                        <ul className="grid gap-0.5">
                          {items.map(({ t, ti }) => (
                            <li key={ti}>
                              <label className="flex min-h-8 items-start gap-2 py-0.5 text-[13px]">
                                <input
                                  type="checkbox"
                                  disabled={!pOn}
                                  checked={keys.has(selKey.task(pi, ti))}
                                  onChange={() => toggle(selKey.task(pi, ti))}
                                  className="mt-0.5 size-4 accent-violet-500"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className={t.done ? 'text-muted line-through' : ''}>
                                    {t.title}
                                  </span>
                                  <span className="ml-1.5 text-[11px] text-muted">
                                    {[
                                      t.day ? formatDate(t.day, 'EEE') : null,
                                      t.estimateMin ? `~${formatMinutes(t.estimateMin)}` : null,
                                      t.priority === 1 ? 'P1' : t.priority === 3 ? 'P3' : null,
                                      t.kind === 'learn' ? '#learn' : null,
                                      t.isBig3 ? '#big3' : null,
                                      t.dueDate ? `due ${formatDate(t.dueDate, 'MMM d')}` : null,
                                      t.notes ? 'notes' : null,
                                    ]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </span>
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                );
              })}
              {plan.projects.length ? (
                <Button
                  variant="primary"
                  disabled={!counts.tasks && !counts.milestones && !counts.projects}
                  onClick={() => void doImport()}
                  className="justify-self-start"
                >
                  <Check size={15} /> Import {plural(counts.tasks, 'task')}
                  {counts.milestones ? `, ${plural(counts.milestones, 'milestone')}` : ''}
                  {counts.projects ? `, ${plural(counts.projects, 'new project')}` : ''}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>

      <RecentImports />
    </section>
  );
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function groupByWeek<T extends { t: { weekStart?: string } }>(items: T[]): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = it.t.weekStart ?? 'none';
    m.set(k, [...(m.get(k) ?? []), it]);
  }
  return [...m.entries()].sort(([a], [b]) =>
    a === 'none' ? 1 : b === 'none' ? -1 : a.localeCompare(b),
  );
}

function FormatReference() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-surface">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center gap-2 px-4 text-left text-sm"
      >
        <ChevronDown size={16} className={open ? '' : '-rotate-90'} aria-hidden /> Format reference
      </button>
      {open ? (
        <div className="grid gap-3 px-4 pb-4 text-[13px] text-muted">
          <pre className="scrollbar-thin overflow-x-auto rounded-lg bg-bg p-3 font-mono text-[12px] text-fg">
            {PLAN_EXAMPLE}
          </pre>
          <p>
            Tokens at the end of a task: <code>~90m</code> <code>~1.5h</code> estimate,{' '}
            <code>!1</code>/<code>!2</code>/<code>!3</code> priority, <code>#learn</code>,{' '}
            <code>#big3</code>, <code>@mon</code>..<code>@sun</code>, <code>due:YYYY-MM-DD</code>.
            Indented lines after a task become its notes. <code>## Week +1</code> means one week
            after the previous week header. JSON in the format{' '}
            <code>{'{ "version": 1, "projects": [...] }'}</code> works too.
          </p>
          <details>
            <summary className="cursor-pointer text-fg">The prompt that gets copied</summary>
            <p className="mt-2 rounded-lg bg-bg p-3 whitespace-pre-wrap select-all">
              {PLAN_PROMPT}
            </p>
          </details>
        </div>
      ) : null}
    </div>
  );
}

function RecentImports() {
  const { toast } = useToast();
  const batches = useLiveQuery(
    () => db.importBatches.orderBy('createdAt').reverse().limit(10).toArray(),
    [],
  );
  if (!batches?.length) return null;
  return (
    <div className="grid gap-2">
      <h2 className="text-sm text-muted">Recent imports</h2>
      <ul className="grid gap-2">
        {batches.map((b) => (
          <li
            key={b.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm"
          >
            <span className="text-muted">{new Date(b.createdAt).toLocaleString()}</span>
            <span className="min-w-0 flex-1 truncate">{b.summary}</span>
            {b.undoneAt ? (
              <span className="text-[12px] text-muted">Undone</span>
            ) : (
              <Button
                size="sm"
                onClick={async () => {
                  if (await undoImport(b.id)) toast('Import undone.');
                }}
              >
                <Undo2 size={14} /> Undo import
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
