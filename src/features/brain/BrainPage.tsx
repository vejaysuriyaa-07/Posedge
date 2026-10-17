import { useLiveQuery } from 'dexie-react-hooks';
import {
  BookOpen,
  CalendarClock,
  ChevronRight,
  KeyRound,
  MessageSquareText,
  Plus,
  Sun,
  Target,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { citedRefs } from '../../ai/citations';
import type { RefInfo } from '../../ai/context';
import { useToast } from '../../app/Toasts';
import { useUi } from '../../app/ui';
import { db, updateSettings } from '../../db/db';
import { buildKnowledgeGraph } from '../../domain/brain';
import { useAi } from '../../hooks/useAi';
import { useProjects } from '../../hooks/useData';
import { useHotkeys } from '../../hooks/useHotkeys';
import { useIsDark } from '../../hooks/useIsDark';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useSettings } from '../../hooks/useSettings';
import { useToday } from '../../hooks/useToday';
import { AskBox } from './AskBox';
import { GraphPanel } from './GraphPanel';
import { useSpeaker, useVoiceInput } from './speech';
import { ExchangeView, Related } from './Thread';
import { useAsk, type Exchange } from './useAsk';
import { useGraphPrefs } from './useGraphPrefs';

export const SUGGESTIONS = [
  { q: 'Brief me on today', icon: Sun },
  { q: "What's due this week?", icon: CalendarClock },
  { q: 'What should I study today?', icon: BookOpen },
  { q: "How's my DV prep going?", icon: Target },
] as const;

const RELATED = [
  'What should I study today?',
  "What's due this week?",
  'What can I move to next week?',
  'Which project needs attention?',
  'Brief me on today',
];

/** Width of the full-screen answers drawer (px), so the graph's controls stay clear of it. */
const DRAWER_W = 416;

/** "claude-sonnet-5-5" → "Sonnet 5.5"; custom ids are shown as typed. */
export function modelLabel(id: string): string {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d+))?$/.exec(id);
  if (!m) return id;
  return `${m[1]![0]!.toUpperCase()}${m[1]!.slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ''}`;
}

export default function BrainPage() {
  const today = useToday();
  const settings = useSettings();
  const ai = useAi();
  const isDark = useIsDark();
  const ui = useUi();
  const { toast } = useToast();
  const { active } = useProjects();
  const prefs = useGraphPrefs();
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>();
  const [focus, setFocus] = useState<{ id: string; seq: number }>();
  const [expanded, setExpanded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const wide = useMediaQuery('(min-width: 768px)');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const overlayInputRef = useRef<HTMLTextAreaElement>(null);
  const expandBtn = useRef<HTMLButtonElement>(null);

  const speaker = useSpeaker(settings.aiVoiceReplies);
  const thread = useAsk({
    available: ai.available,
    apiKey: ai.apiKey,
    model: ai.model,
    onDelta: speaker.feed,
    onEnd: (finished) => (finished ? speaker.flush() : speaker.cancel()),
  });
  const ask = useCallback(
    (q: string) => {
      if (!q.trim() || thread.busy) return;
      speaker.cancel();
      thread.ask(q);
      setInput('');
      setDrawerOpen(true);
    },
    [speaker, thread],
  );
  const voice = useVoiceInput(ask);

  const data = useLiveQuery(async () => {
    const [tasks, milestones, cards] = await Promise.all([
      db.tasks.toArray(),
      db.milestones.toArray(),
      db.reviewCards.toArray(),
    ]);
    return { tasks, milestones, cards };
  }, []);

  const graph = useMemo(
    () =>
      buildKnowledgeGraph(
        {
          today,
          projects: active,
          tasks: data?.tasks ?? [],
          milestones: data?.milestones ?? [],
          cards: data?.cards ?? [],
        },
        prefs.options,
      ),
    [today, active, data, prefs.options],
  );

  // What EDGE reads: every open task and active card in active projects, whatever the graph shows.
  const reads = useMemo(() => {
    const ids = new Set(active.map((p) => p.id));
    return {
      projects: active.length,
      tasks: (data?.tasks ?? []).filter((t) => ids.has(t.projectId) && t.status !== 'done').length,
      cards: (data?.cards ?? []).filter((c) => ids.has(c.projectId) && !c.suspended).length,
    };
  }, [active, data]);

  const { exchanges, refs } = thread;
  const last = exchanges[exchanges.length - 1];
  const sourceIds = useMemo(
    () => new Set(last ? citedRefs(last.answer, (r) => r in refs).map((r) => refs[r]!.id) : []),
    [last, refs],
  );
  const query = search.trim().toLowerCase();
  const matches = useMemo(
    () =>
      query
        ? graph.nodes.filter((n) => n.label.toLowerCase().includes(query)).map((n) => n.id)
        : [],
    [graph, query],
  );
  const matchSet = useMemo(() => new Set(matches), [matches]);
  // Search wins while there's a query; otherwise the latest answer's sources stay lit.
  const highlightIds = query ? matchSet : sourceIds;
  const highlightLabel = query
    ? matches.length
      ? `${matches.length} match${matches.length === 1 ? '' : 'es'}`
      : 'No matches'
    : sourceIds.size
      ? `${sourceIds.size} source${sourceIds.size === 1 ? '' : 's'} from the latest answer`
      : undefined;

  const focusNode = useCallback((id: string) => {
    setFocus((f) => ({ id, seq: (f?.seq ?? 0) + 1 }));
  }, []);
  const focusProject = useCallback(
    (id: string) => {
      setSelectedId(id);
      focusNode(id);
    },
    [focusNode],
  );
  const openRef = (info: RefInfo) => {
    if (info.kind === 'task') ui.openTask(info.id);
    else focusProject(info.projectId);
  };

  const closeExpanded = useCallback(() => {
    setExpanded(false);
    requestAnimationFrame(() => expandBtn.current?.focus());
  }, []);

  useHotkeys({
    '/': (e) => {
      e.preventDefault();
      (expanded ? overlayInputRef : inputRef).current?.focus();
    },
  });
  useHotkeys({ escape: () => closeExpanded() }, { enabled: expanded });

  // Full screen: keep the page behind it from scrolling.
  useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [expanded]);

  const asked = new Set(exchanges.map((x) => x.question));
  const related = RELATED.filter((q) => !asked.has(q)).slice(0, 3);
  const readingLabel = `Reading ${reads.projects} projects and ${reads.tasks} open tasks…`;
  const askBoxProps = {
    value: input,
    onChange: setInput,
    onSubmit: () => ask(input),
    onStop: thread.stop,
    busy: thread.busy,
    disabled: !ai.available,
    voice,
    autoRead: {
      supported: speaker.supported,
      on: settings.aiVoiceReplies,
      toggle: () => {
        if (settings.aiVoiceReplies) speaker.cancel();
        void updateSettings({ aiVoiceReplies: !settings.aiVoiceReplies });
      },
    },
    modelLabel: modelLabel(ai.model),
  };
  const copy = (text: string) => {
    if (!navigator.clipboard) {
      toast({ message: "Couldn't copy. Select the text instead.", tone: 'warn' });
      return;
    }
    void navigator.clipboard.writeText(text).then(
      () => toast('Copied'),
      () => toast({ message: "Couldn't copy. Select the text instead.", tone: 'warn' }),
    );
  };
  const threadList = (compact: boolean) => (
    <ThreadList
      exchanges={exchanges}
      refs={refs}
      compact={compact}
      readingLabel={readingLabel}
      canSpeak={speaker.supported}
      onOpenRef={openRef}
      onRetry={thread.retry}
      onSpeak={speaker.speak}
      onCopy={copy}
      related={!thread.busy && last?.status === 'done' ? related : []}
      onAsk={ask}
    />
  );
  const newThread = () => {
    speaker.cancel();
    thread.reset();
    setInput('');
  };

  const drawerShown = expanded && exchanges.length > 0 && drawerOpen;
  const rightInset = drawerShown && wide ? DRAWER_W : 0;
  const overlay = expanded ? (
    <>
      {drawerShown ? (
        <aside
          className="absolute inset-y-0 right-0 z-20 flex w-full flex-col border-l border-border bg-surface/95 backdrop-blur md:w-[416px]"
          aria-label="Answers"
        >
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <h2 className="flex-1 text-[14px] font-semibold">Answers</h2>
            <button
              type="button"
              onClick={newThread}
              className="flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] text-muted hover:bg-elevated hover:text-fg"
            >
              <Plus size={14} /> New thread
            </button>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="grid size-8 place-items-center rounded-lg text-muted hover:bg-elevated hover:text-fg"
              aria-label="Hide answers"
              title="Hide answers"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-28">
            {threadList(true)}
          </div>
        </aside>
      ) : null}
      {expanded && exchanges.length > 0 && !drawerOpen ? (
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="absolute top-14 right-3 z-20 flex min-h-9 items-center gap-2 rounded-full border border-border bg-elevated px-3 text-[13px] font-medium shadow-card hover:bg-surface"
        >
          <MessageSquareText size={15} className="text-brand" /> Answers ({exchanges.length})
        </button>
      ) : null}
      {ai.available ? (
        <div
          className="pointer-events-none absolute bottom-0 left-0 z-30 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          style={{ right: rightInset }}
        >
          <div className="pointer-events-auto w-full max-w-2xl">
            <AskBox variant="followup" {...askBoxProps} inputRef={overlayInputRef} />
          </div>
        </div>
      ) : null}
    </>
  ) : null;

  return (
    <section className="mx-auto grid max-w-[1440px] grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(380px,36%)] xl:gap-8">
      <div className="min-w-0" inert={expanded}>
        {exchanges.length ? (
          <div className="mx-auto max-w-[46rem]">
            <h1 className="sr-only">Brain</h1>
            <div className="mb-6 flex items-center justify-between gap-3">
              <span className="text-[13px] text-muted">
                Thread · {exchanges.length} question{exchanges.length === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                onClick={newThread}
                className="flex min-h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[13px] font-medium hover:bg-elevated"
              >
                <Plus size={14} /> New thread
              </button>
            </div>
            {threadList(false)}
            <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 mt-8 bg-gradient-to-t from-bg via-bg to-transparent pt-6 pb-3 md:bottom-0">
              <AskBox variant="followup" {...askBoxProps} inputRef={inputRef} />
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col items-center pt-[4vh] md:pt-[6vh] xl:pt-[14vh]">
            <h1 className="text-center text-[30px] font-semibold tracking-tight md:text-[38px]">
              Ask your brain
            </h1>
            <p className="mt-2 text-center text-[15px] text-balance text-muted">
              Answers from your projects, tasks and review cards, with sources.
            </p>
            <div className="mt-7 w-full">
              <AskBox variant="hero" {...askBoxProps} inputRef={inputRef} />
            </div>
            {voice.error ? (
              <p className="mt-2 w-full text-[13px] text-warn" role="alert">
                {voice.error}
              </p>
            ) : null}
            {ai.available ? (
              <ul className="mt-5 grid w-full gap-2 sm:grid-cols-2" aria-label="Suggestions">
                {SUGGESTIONS.map(({ q, icon: Icon }) => (
                  <li key={q}>
                    <button
                      type="button"
                      onClick={() => ask(q)}
                      disabled={thread.busy}
                      className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-border px-3.5 py-2.5 text-left text-[14px] transition hover:bg-surface disabled:opacity-50"
                    >
                      <Icon size={16} className="shrink-0 text-muted" aria-hidden />
                      {q}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-5 flex w-full items-start gap-3 rounded-xl border border-border bg-surface p-4">
                <KeyRound size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                <div className="min-w-0 flex-1 text-[14px]">
                  <p className="font-medium">Connect an Anthropic API key to ask questions</p>
                  <p className="mt-1 text-muted">
                    Answers use your own key from Settings › AI. Everything else here, including the
                    graph, works without it.
                  </p>
                  <Link
                    to="/settings"
                    className="mt-3 inline-flex min-h-8 items-center rounded-lg border border-border px-2.5 text-[13px] font-medium hover:bg-elevated"
                  >
                    Open Settings
                  </Link>
                </div>
              </div>
            )}
            <p className="mt-6 text-center text-[12.5px] text-balance text-muted">
              Reads {reads.projects} project{reads.projects === 1 ? '' : 's'}, {reads.tasks} open
              task{reads.tasks === 1 ? '' : 's'} and {reads.cards} card
              {reads.cards === 1 ? '' : 's'} from this browser. Press{' '}
              <kbd className="font-sans">/</kbd> to ask.
            </p>
          </div>
        )}
      </div>

      <aside
        className={
          expanded
            ? 'fixed inset-0 z-[45] bg-bg'
            : 'min-w-0 xl:sticky xl:top-[4.75rem] xl:h-[calc(100dvh-7.25rem)]'
        }
        aria-label={expanded ? 'Graph, full screen' : undefined}
      >
        <GraphPanel
          graph={graph}
          today={today}
          isDark={isDark}
          highlightIds={highlightIds}
          highlightLabel={highlightLabel}
          selectedId={selectedId}
          focus={focus}
          options={prefs.options}
          onOptions={prefs.setOptions}
          settings={prefs.settings}
          onSettings={prefs.setSettings}
          search={search}
          onSearch={setSearch}
          onSearchEnter={() => {
            if (matches[0]) focusNode(matches[0]);
          }}
          expanded={expanded}
          onToggleExpanded={() => (expanded ? closeExpanded() : setExpanded(true))}
          expandButtonRef={expandBtn}
          onSelectProject={setSelectedId}
          onFocusProject={focusProject}
          onOpenTask={ui.openTask}
          onAskAbout={
            ai.available
              ? (name) => ask(`How is ${name} going, and what should I do next for it?`)
              : undefined
          }
          loaded={!!data}
          overlay={overlay}
          rightInset={rightInset}
          bottomInset={expanded && ai.available ? 96 : 0}
        />
      </aside>
    </section>
  );
}

interface ThreadListProps {
  exchanges: Exchange[];
  refs: Record<string, RefInfo>;
  compact: boolean;
  readingLabel: string;
  canSpeak: boolean;
  onOpenRef: (info: RefInfo) => void;
  onRetry: () => void;
  onSpeak: (text: string) => void;
  onCopy: (text: string) => void;
  related: string[];
  onAsk: (q: string) => void;
}

function ThreadList(p: ThreadListProps) {
  return (
    <div className={`grid grid-cols-1 ${p.compact ? 'gap-6' : 'gap-9'}`}>
      {p.exchanges.map((x, i) => (
        <ExchangeView
          key={x.id}
          exchange={x}
          refs={p.refs}
          compact={p.compact}
          isLast={i === p.exchanges.length - 1}
          readingLabel={p.readingLabel}
          canSpeak={p.canSpeak}
          onOpenRef={p.onOpenRef}
          onRetry={p.onRetry}
          onSpeak={p.onSpeak}
          onCopy={p.onCopy}
        />
      ))}
      <Related items={p.related} onAsk={p.onAsk} />
    </div>
  );
}
