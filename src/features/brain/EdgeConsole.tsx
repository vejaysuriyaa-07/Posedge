import { Mic, RotateCcw, SendHorizontal, Square, Volume2, VolumeX } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import { Link } from 'react-router';
import { AiError, streamChat, type ChatMessage } from '../../ai/client';
import { EDGE_PERSONA, snapshotContext } from '../../ai/edgePrompt';
import { updateSettings } from '../../db/db';
import { loadSnapshot, recordAiUsage } from '../../db/ops/ai';
import type { CoreActivity } from './hud';
import { useSpeaker, useVoiceInput } from './speech';

export const SUGGESTIONS = [
  'Brief me',
  "What's due this week?",
  'What should I study today?',
  "How's my DV prep going?",
] as const;

/** Keep requests small: the snapshot plus the last few exchanges. */
const MAX_HISTORY = 20;

interface Turn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface EdgeConsoleHandle {
  focus: () => void;
  ask: (text: string) => void;
}

interface Props {
  available: boolean;
  apiKey: string;
  model: string;
  voiceReplies: boolean;
  greeting: string;
  onActivity: (a: CoreActivity) => void;
  ref?: Ref<EdgeConsoleHandle>;
}

export function EdgeConsole({
  available,
  apiKey,
  model,
  voiceReplies,
  greeting,
  onActivity,
  ref,
}: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const context = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const speaker = useSpeaker(voiceReplies);

  const activity: CoreActivity =
    busy && !streaming ? 'thinking' : streaming || speaker.speaking ? 'speaking' : 'idle';
  useEffect(() => onActivity(activity), [activity, onActivity]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, streaming, error]);

  useEffect(() => () => abort.current?.abort(), []);

  const run = useCallback(
    async (history: Turn[]) => {
      if (!available) return;
      setBusy(true);
      setError(null);
      setStreaming('');
      speaker.cancel();
      const controller = new AbortController();
      abort.current = controller;
      let partial = '';
      try {
        // The snapshot is taken once per conversation so follow-ups hit the prompt cache.
        context.current ??= snapshotContext(JSON.stringify(await loadSnapshot()));
        let messages: ChatMessage[] = history
          .slice(-MAX_HISTORY)
          .map((t) => ({ role: t.role, content: t.content }));
        while (messages[0]?.role === 'assistant') messages = messages.slice(1);
        const result = await streamChat({
          apiKey,
          model,
          system: { persona: EDGE_PERSONA, context: context.current },
          messages,
          signal: controller.signal,
          onText: (delta) => {
            partial += delta;
            setStreaming(partial);
            speaker.feed(delta);
          },
        });
        speaker.flush();
        setTurns((ts) => [
          ...ts,
          { id: crypto.randomUUID(), role: 'assistant', content: result.text },
        ]);
        void recordAiUsage(result.usage);
      } catch (e) {
        const err = e instanceof AiError ? e : new AiError('api', String(e));
        if (err.kind === 'aborted') {
          if (partial.trim()) {
            setTurns((ts) => [
              ...ts,
              { id: crypto.randomUUID(), role: 'assistant', content: `${partial.trim()}…` },
            ]);
          }
        } else {
          speaker.cancel();
          setError(err.message);
        }
      } finally {
        abort.current = null;
        setStreaming(null);
        setBusy(false);
      }
    },
    [available, apiKey, model, speaker],
  );

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || busy || !available) return;
      const next = [...turns, { id: crypto.randomUUID(), role: 'user' as const, content: text }];
      setTurns(next);
      setInput('');
      void run(next);
    },
    [busy, available, turns, run],
  );

  const voice = useVoiceInput(send);

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus(), ask: send }), [send]);

  const reset = () => {
    abort.current?.abort();
    speaker.cancel();
    context.current = null;
    setTurns([]);
    setError(null);
    setInput('');
  };

  const last = turns[turns.length - 1];
  const canRetry = !busy && !!error && last?.role === 'user';
  const status = !available
    ? 'Offline'
    : busy && !streaming
      ? 'Thinking'
      : streaming
        ? 'Transmitting'
        : voice.listening
          ? 'Listening'
          : 'Standby';

  return (
    <section className="hud-panel flex min-h-0 flex-col" aria-label="EDGE console">
      <header className="flex items-center gap-2 border-b border-cyan-300/10 px-3 py-2">
        <h2 className="hud-label text-cyan-200">EDGE // Console</h2>
        <span className="hud-label text-cyan-300/50" aria-live="polite">
          {status}
        </span>
        <div className="flex-1" />
        {available && speaker.supported ? (
          <button
            type="button"
            className="hud-icon-btn"
            aria-pressed={voiceReplies}
            aria-label={voiceReplies ? 'Mute spoken replies' : 'Speak replies aloud'}
            title={voiceReplies ? 'Mute spoken replies' : 'Speak replies aloud'}
            onClick={() => {
              if (voiceReplies) speaker.cancel();
              void updateSettings({ aiVoiceReplies: !voiceReplies });
            }}
          >
            {voiceReplies ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
        ) : null}
        {turns.length ? (
          <button
            type="button"
            className="hud-icon-btn"
            aria-label="New conversation"
            title="New conversation"
            onClick={reset}
          >
            <RotateCcw size={15} />
          </button>
        ) : null}
      </header>

      <div
        ref={logRef}
        role="log"
        aria-busy={busy}
        aria-label="Conversation with EDGE"
        className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3 text-[13.5px] leading-relaxed"
      >
        <Line role="assistant">{greeting}</Line>
        {!available ? (
          <p className="text-cyan-100/70">
            EDGE is offline. Add your Anthropic API key in{' '}
            <Link
              to="/settings"
              className="text-cyan-300 underline underline-offset-2 hover:text-cyan-200"
            >
              Settings › AI
            </Link>{' '}
            to bring it online. Everything else here works without it.
          </p>
        ) : null}
        {turns.map((t) => (
          <Line key={t.id} role={t.role}>
            {t.content}
          </Line>
        ))}
        {streaming !== null ? (
          <Line role="assistant">
            {streaming}
            <span className="hud-caret" aria-hidden />
          </Line>
        ) : null}
        {error ? (
          <div className="flex flex-wrap items-center gap-2 text-amber-200/90" role="alert">
            <span>{error}</span>
            {canRetry ? (
              <button type="button" className="hud-chip" onClick={() => void run(turns)}>
                Try again
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {available ? (
        <div
          className="flex gap-1.5 overflow-x-auto px-3 pb-2"
          role="group"
          aria-label="Suggestions"
        >
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="hud-chip shrink-0"
              disabled={busy}
              onClick={() => send(s)}
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      <form
        className="flex items-center gap-2 border-t border-cyan-300/10 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        {available && voice.supported ? (
          <button
            type="button"
            className={`hud-icon-btn ${voice.listening ? 'hud-icon-btn-live' : ''}`}
            aria-pressed={voice.listening}
            aria-label={voice.listening ? 'Stop listening' : 'Talk to EDGE'}
            title={voice.listening ? 'Stop listening' : 'Talk to EDGE'}
            disabled={busy}
            onClick={() => (voice.listening ? voice.stop() : voice.start())}
          >
            <Mic size={16} />
          </button>
        ) : null}
        <label htmlFor="edge-input" className="sr-only">
          Ask EDGE
        </label>
        <input
          id="edge-input"
          ref={inputRef}
          value={voice.listening ? voice.interim : input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!available}
          placeholder={
            available
              ? voice.listening
                ? 'Listening…'
                : 'Ask EDGE about your week…  ( / )'
              : 'EDGE is offline'
          }
          autoComplete="off"
          className="hud-input min-w-0 flex-1"
        />
        {busy ? (
          <button
            type="button"
            className="hud-icon-btn"
            aria-label="Stop"
            title="Stop"
            onClick={() => abort.current?.abort()}
          >
            <Square size={14} />
          </button>
        ) : (
          <button
            type="submit"
            className="hud-icon-btn"
            aria-label="Send"
            title="Send"
            disabled={!available || !input.trim()}
          >
            <SendHorizontal size={16} />
          </button>
        )}
      </form>
      {voice.error ? (
        <p className="px-3 pb-2 text-[12px] text-amber-200/90">{voice.error}</p>
      ) : null}
    </section>
  );
}

function Line({ role, children }: { role: Turn['role']; children: ReactNode }) {
  return role === 'user' ? (
    <p className="whitespace-pre-wrap text-cyan-100/65">
      <span className="hud-label mr-2 text-cyan-300/60">VJ ›</span>
      {children}
    </p>
  ) : (
    <p className="whitespace-pre-wrap text-cyan-50">
      <span className="hud-label mr-2 text-cyan-300">EDGE ›</span>
      {children}
    </p>
  );
}
