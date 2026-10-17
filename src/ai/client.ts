/**
 * The only module that imports the Anthropic SDK. Browser-direct calls with VJ's own key
 * (`dangerouslyAllowBrowser` sets the `anthropic-dangerous-direct-browser-access` header).
 */
import Anthropic from '@anthropic-ai/sdk';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';
export const MODEL_OPTIONS = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (default)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (cheaper, faster)' },
] as const;

export const TIMEOUT_MS = 60_000;

export type AiErrorKind =
  'auth' | 'rate_limit' | 'overloaded' | 'offline' | 'timeout' | 'aborted' | 'refusal' | 'api';

export class AiError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClientOptions {
  apiKey: string;
  /** Injected in tests; defaults to the global fetch. */
  fetch?: typeof fetch;
}

function makeClient({ apiKey, fetch: fetchImpl }: ClientOptions): Anthropic {
  return new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
    // The UI shows its own spinner, timeout and retry advice; SDK retries would hide them.
    maxRetries: 0,
    timeout: TIMEOUT_MS,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
}

export function resolveModel(settings: { aiModel: string; aiModelOverride?: string }): string {
  return settings.aiModelOverride?.trim() || settings.aiModel || DEFAULT_MODEL;
}

/** Per-model request options, from the current Anthropic model docs. */
export function modelProfile(model: string): { effort: boolean; fallbacks: boolean } {
  const m = model.toLowerCase();
  const gen5 = /claude-(opus|sonnet|haiku|fable|mythos)-5/.test(m);
  return {
    effort: gen5 || /claude-opus-4-[5-8]|claude-sonnet-4-6/.test(m),
    // Server-side refusal fallback ("default" routing) is available for these models on the Claude API.
    fallbacks: /claude-(sonnet-5-5|opus-5-5|opus-5$|fable-5-1)/.test(m),
  };
}

/** Maps SDK/network errors to calm, actionable messages. */
export function friendlyError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof Anthropic.APIUserAbortError) return new AiError('aborted', 'Cancelled.');
  if (e instanceof Anthropic.APIConnectionTimeoutError) {
    return new AiError(
      'timeout',
      'No reply within 60 seconds. Try again, or try a shorter question.',
    );
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return typeof navigator !== 'undefined' && navigator.onLine === false
      ? new AiError('offline', "You're offline. EDGE needs an internet connection.")
      : new AiError(
          'offline',
          "Couldn't reach api.anthropic.com. Check your connection and try again.",
        );
  }
  if (e instanceof Anthropic.AuthenticationError) {
    return new AiError('auth', 'Anthropic rejected the API key (401). Check it in Settings > AI.');
  }
  if (e instanceof Anthropic.RateLimitError) {
    return new AiError(
      'rate_limit',
      'Rate limited by Anthropic (429). Give it a minute and try again.',
    );
  }
  if (e instanceof Anthropic.APIError) {
    const body = e.error as { error?: { type?: string; message?: string } } | undefined;
    if (e.status === 529 || body?.error?.type === 'overloaded_error') {
      return new AiError(
        'overloaded',
        'Anthropic is overloaded right now (529). Try again in a moment.',
      );
    }
    return new AiError(
      'api',
      `Anthropic API error ${e.status ?? ''}: ${body?.error?.message ?? e.message}`.trim(),
    );
  }
  if (e instanceof DOMException && e.name === 'AbortError')
    return new AiError('aborted', 'Cancelled.');
  return new AiError('api', (e as Error)?.message || 'Something went wrong talking to Claude.');
}

export interface StreamChatOptions extends ClientOptions {
  model: string;
  /** Stable persona text (cached) and per-conversation context (e.g. the data snapshot). */
  system: { persona: string; context?: string };
  messages: ChatMessage[];
  maxTokens?: number;
  signal?: AbortSignal;
  onText?: (delta: string, snapshot: string) => void;
}

export interface ChatResult {
  text: string;
  usage: AiUsage;
  stopReason: string | null;
}

/** Streams a conversational reply, calling `onText` as text arrives. */
export async function streamChat(opts: StreamChatOptions): Promise<ChatResult> {
  const client = makeClient(opts);
  const profile = modelProfile(opts.model);
  const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: 'text', text: opts.system.persona }];
  if (opts.system.context) {
    // Cache persona + context together; follow-up turns in the same conversation reuse it.
    system.push({ type: 'text', text: opts.system.context, cache_control: { type: 'ephemeral' } });
  }
  try {
    const stream = client.beta.messages.stream(
      {
        model: opts.model,
        max_tokens: opts.maxTokens ?? 2048,
        system,
        messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
        ...(profile.effort ? { output_config: { effort: 'low' as const } } : {}),
        ...(profile.fallbacks
          ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
          : {}),
      },
      { signal: opts.signal, timeout: TIMEOUT_MS },
    );
    if (opts.onText) stream.on('text', (delta, snapshot) => opts.onText!(delta, snapshot));
    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') {
      throw new AiError('refusal', 'Claude declined to answer that one. Try rephrasing.');
    }
    const text = message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const u = message.usage;
    return {
      text: message.stop_reason === 'max_tokens' ? `${text}…` : text,
      usage: {
        inputTokens:
          (u.input_tokens ?? 0) +
          (u.cache_creation_input_tokens ?? 0) +
          (u.cache_read_input_tokens ?? 0),
        outputTokens: u.output_tokens ?? 0,
      },
      stopReason: message.stop_reason,
    };
  } catch (e) {
    throw friendlyError(e);
  }
}

/** Sends a tiny request to check the key and model. Resolves with usage, rejects with AiError. */
export async function testKey(
  opts: ClientOptions & { model: string; signal?: AbortSignal },
): Promise<AiUsage> {
  const client = makeClient(opts);
  try {
    const message = await client.messages.create(
      {
        model: opts.model,
        max_tokens: 64,
        messages: [{ role: 'user', content: 'Reply with the single word: online' }],
      },
      { signal: opts.signal, timeout: TIMEOUT_MS },
    );
    return { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens };
  } catch (e) {
    throw friendlyError(e);
  }
}
