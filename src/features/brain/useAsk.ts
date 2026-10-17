import { useCallback, useEffect, useRef, useState } from 'react';
import { AiError, streamChat, type ChatMessage } from '../../ai/client';
import { withShortRefs, type RefInfo } from '../../ai/context';
import { EDGE_PERSONA, snapshotContext } from '../../ai/edgePrompt';
import { loadSnapshot, recordAiUsage } from '../../db/ops/ai';

export interface Exchange {
  id: string;
  question: string;
  answer: string;
  status: 'reading' | 'streaming' | 'done' | 'stopped' | 'error';
  error?: string;
}

/** Earlier exchanges sent with each question (the snapshot always goes with the persona). */
const MAX_PRIOR_EXCHANGES = 8;

interface Options {
  available: boolean;
  apiKey: string;
  model: string;
  /** Called with each streamed delta (spoken replies) and when an answer ends. */
  onDelta?: (delta: string) => void;
  onEnd?: (finished: boolean) => void;
}

/**
 * A Perplexity-style thread with EDGE. The data snapshot is taken on the first question and reused
 * for follow-ups (prompt caching); "New thread" takes a fresh one.
 */
export function useAsk({ available, apiKey, model, onDelta, onEnd }: Options) {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [refs, setRefs] = useState<Record<string, RefInfo>>({});
  const [busy, setBusy] = useState(false);
  const context = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const cb = useRef({ onDelta, onEnd });
  useEffect(() => {
    cb.current = { onDelta, onEnd };
  });
  useEffect(() => () => abort.current?.abort(), []);

  const patch = (id: string, p: Partial<Exchange>) =>
    setExchanges((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const run = useCallback(
    async (target: Exchange, prior: Exchange[]) => {
      if (!available) return;
      setBusy(true);
      const controller = new AbortController();
      abort.current = controller;
      let answer = '';
      try {
        if (!context.current) {
          const { snapshot, refs: map } = withShortRefs(await loadSnapshot());
          context.current = snapshotContext(JSON.stringify(snapshot));
          setRefs(map);
        }
        const messages: ChatMessage[] = prior
          .filter((x) => (x.status === 'done' || x.status === 'stopped') && x.answer.trim())
          .slice(-MAX_PRIOR_EXCHANGES)
          .flatMap((x) => [
            { role: 'user' as const, content: x.question },
            { role: 'assistant' as const, content: x.answer },
          ]);
        messages.push({ role: 'user', content: target.question });
        const result = await streamChat({
          apiKey,
          model,
          system: { persona: EDGE_PERSONA, context: context.current },
          messages,
          signal: controller.signal,
          onText: (delta) => {
            answer += delta;
            patch(target.id, { answer, status: 'streaming' });
            cb.current.onDelta?.(delta);
          },
        });
        patch(target.id, { answer: result.text, status: 'done' });
        cb.current.onEnd?.(true);
        void recordAiUsage(result.usage);
      } catch (e) {
        const err = e instanceof AiError ? e : new AiError('api', String(e));
        if (err.kind === 'aborted') {
          patch(target.id, { answer: answer.trim() ? `${answer.trim()}…` : '', status: 'stopped' });
        } else {
          patch(target.id, { status: 'error', error: err.message });
        }
        cb.current.onEnd?.(false);
      } finally {
        abort.current = null;
        setBusy(false);
      }
    },
    [available, apiKey, model],
  );

  const ask = useCallback(
    (raw: string) => {
      const question = raw.trim();
      if (!question || busy || !available) return;
      const x: Exchange = { id: crypto.randomUUID(), question, answer: '', status: 'reading' };
      const prior = exchanges;
      setExchanges([...prior, x]);
      void run(x, prior);
    },
    [busy, available, exchanges, run],
  );

  const retry = useCallback(() => {
    const last = exchanges[exchanges.length - 1];
    if (!last || busy) return;
    const x: Exchange = { ...last, answer: '', status: 'reading', error: undefined };
    setExchanges([...exchanges.slice(0, -1), x]);
    void run(x, exchanges.slice(0, -1));
  }, [exchanges, busy, run]);

  const stop = useCallback(() => abort.current?.abort(), []);

  const reset = useCallback(() => {
    abort.current?.abort();
    context.current = null;
    setExchanges([]);
    setRefs({});
  }, []);

  return { exchanges, refs, busy, ask, retry, stop, reset };
}
