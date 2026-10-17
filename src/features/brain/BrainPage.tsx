import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, CalendarClock, KeyRound, Plus, Sun, Target } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
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
import { useSettings } from '../../hooks/useSettings';
import { useToday } from '../../hooks/useToday';
import { AskBox } from './AskBox';
import { GraphPanel } from './GraphPanel';
import { useSpeaker, useVoiceInput } from './speech';
import { ExchangeView, Related } from './Thread';
import { useAsk } from './useAsk';

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
  const [input, setInput] = useState('');
  const [options, setOptions] = useState({ includeCards: true, includeDone: false });
  const [selectedId, setSelectedId] = useState<string>();
  const [focus, setFocus] = useState<{ id: string; seq: number }>();
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
      speaker.cancel();
      thread.ask(q);
      setInput('');
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
        options,
      ),
    [today, active, data, options],
  );

  // The latest answer's sources light up in the graph.
  const { exchanges, refs } = thread;
  const last = exchanges[exchanges.length - 1];
  const highlightIds = useMemo(
    () => new Set(last ? citedRefs(last.answer, (r) => r in refs).map((r) => refs[r]!.id) : []),
    [last, refs],
  );

  const focusProject = (id: string) => {
    setSelectedId(id);
    setFocus((f) => ({ id, seq: (f?.seq ?? 0) + 1 }));
  };
  const openRef = (info: RefInfo) => {
    if (info.kind === 'task') ui.openTask(info.id);
    else focusProject(info.projectId);
  };

  useHotkeys({
    '/': (e) => {
      e.preventDefault();
      inputRef.current?.focus();
    },
  });

  const asked = new Set(exchanges.map((x) => x.question));
  const related = RELATED.filter((q) => !asked.has(q)).slice(0, 3);
  const readingLabel = `Reading ${graph.counts.projects} projects and ${graph.counts.tasks} tasks…`;
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
    inputRef,
  };

  return (
    <section className="mx-auto grid max-w-[1440px] gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(380px,36%)] xl:gap-8">
      <div className="min-w-0">
        {exchanges.length ? (
          <div className="mx-auto max-w-[46rem]">
            <h1 className="sr-only">Brain</h1>
            <div className="mb-6 flex items-center justify-between">
              <span className="text-[13px] text-muted">
                Thread · {exchanges.length} question{exchanges.length === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                onClick={() => {
                  speaker.cancel();
                  thread.reset();
                  setInput('');
                }}
                className="flex min-h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[13px] font-medium hover:bg-elevated"
              >
                <Plus size={14} /> New thread
              </button>
            </div>
            <div className="grid grid-cols-1 gap-9">
              {exchanges.map((x, i) => (
                <ExchangeView
                  key={x.id}
                  exchange={x}
                  refs={refs}
                  isLast={i === exchanges.length - 1}
                  readingLabel={readingLabel}
                  canSpeak={speaker.supported}
                  onOpenRef={openRef}
                  onRetry={thread.retry}
                  onSpeak={speaker.speak}
                  onCopy={(text) => {
                    void navigator.clipboard?.writeText(text).then(
                      () => toast('Copied'),
                      () =>
                        toast({ message: "Couldn't copy. Select the text instead.", tone: 'warn' }),
                    );
                  }}
                />
              ))}
              {!thread.busy && last?.status === 'done' ? (
                <Related items={related} onAsk={ask} />
              ) : null}
            </div>
            <div className="sticky bottom-[4.5rem] z-10 mt-8 bg-gradient-to-t from-bg via-bg to-transparent pt-6 pb-3 md:bottom-0">
              <AskBox variant="followup" {...askBoxProps} />
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col items-center pt-[6vh] xl:pt-[14vh]">
            <h1 className="text-center text-[30px] font-semibold tracking-tight md:text-[38px]">
              Ask your brain
            </h1>
            <p className="mt-2 text-center text-[15px] text-muted">
              Answers from your projects, tasks and review cards, with sources.
            </p>
            <div className="mt-7 w-full">
              <AskBox variant="hero" {...askBoxProps} />
            </div>
            {voice.error ? (
              <p className="mt-2 w-full text-[13px] text-warn">{voice.error}</p>
            ) : null}
            {ai.available ? (
              <ul className="mt-5 grid w-full gap-2 sm:grid-cols-2" aria-label="Suggestions">
                {SUGGESTIONS.map(({ q, icon: Icon }) => (
                  <li key={q}>
                    <button
                      type="button"
                      onClick={() => ask(q)}
                      className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-border px-3.5 py-2.5 text-left text-[14px] transition hover:bg-surface"
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
            <p className="mt-6 text-center text-[12.5px] text-muted">
              Reads {graph.counts.projects} projects, {graph.counts.tasks} open tasks and{' '}
              {graph.counts.cards} cards from this browser. Press <kbd className="font-sans">/</kbd>{' '}
              to ask.
            </p>
          </div>
        )}
      </div>

      <aside className="min-w-0 xl:sticky xl:top-[4.75rem] xl:h-[calc(100dvh-7.25rem)]">
        <GraphPanel
          graph={graph}
          today={today}
          isDark={isDark}
          highlightIds={highlightIds}
          selectedId={selectedId}
          focus={focus}
          options={options}
          onOptions={setOptions}
          onSelectProject={setSelectedId}
          onFocusProject={focusProject}
          onOpenTask={ui.openTask}
          onAskAbout={
            ai.available
              ? (name) => ask(`How is ${name} going, and what should I do next for it?`)
              : undefined
          }
          loaded={!!data}
        />
      </aside>
    </section>
  );
}
