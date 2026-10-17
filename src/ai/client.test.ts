import { describe, expect, it, vi } from 'vitest';
import { AiError, modelProfile, resolveModel, streamChat, testKey } from './client';

function sse(events: { event: string; data: unknown }[]): string {
  return events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join('');
}

function streamResponse(text: string, usage = { input_tokens: 1200, output_tokens: 40 }) {
  const body = sse([
    {
      event: 'message_start',
      data: {
        type: 'message_start',
        message: {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-5-5',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: usage.input_tokens, output_tokens: 1 },
        },
      },
    },
    {
      event: 'content_block_start',
      data: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    },
    ...text.split(' ').map((w, i) => ({
      event: 'content_block_delta',
      data: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: (i ? ' ' : '') + w },
      },
    })),
    { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
    {
      event: 'message_delta',
      data: {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: usage.output_tokens },
      },
    },
    { event: 'message_stop', data: { type: 'message_stop' } },
  ]);
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function errorResponse(status: number, type: string, message: string) {
  return new Response(JSON.stringify({ type: 'error', error: { type, message } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const base = {
  apiKey: 'sk-ant-test',
  model: 'claude-sonnet-5-5',
  system: { persona: 'You are EDGE.', context: '{"today":"2026-10-17"}' },
  messages: [{ role: 'user' as const, content: 'Brief me' }],
};

describe('AI client', () => {
  it('streams text, reports usage and sends browser-direct headers', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      streamResponse('Good evening, VJ. Three reviews are due.'),
    );
    const deltas: string[] = [];
    const r = await streamChat({
      ...base,
      fetch: fetchMock as typeof fetch,
      onText: (d) => deltas.push(d),
    });
    expect(r.text).toBe('Good evening, VJ. Three reviews are due.');
    expect(deltas.join('')).toBe(r.text);
    expect(r.usage).toEqual({ inputTokens: 1200, outputTokens: 40 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('https://api.anthropic.com/v1/messages');
    const headers = new Headers(init?.headers);
    expect(headers.get('x-api-key')).toBe('sk-ant-test');
    expect(headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      model: 'claude-sonnet-5-5',
      stream: true,
      output_config: { effort: 'low' },
      fallbacks: 'default',
    });
    expect(body.system[1]).toMatchObject({ cache_control: { type: 'ephemeral' } });
  });

  it('maps 401, 429 and 529 to friendly errors', async () => {
    const cases: [number, string, string][] = [
      [401, 'authentication_error', 'auth'],
      [429, 'rate_limit_error', 'rate_limit'],
      [529, 'overloaded_error', 'overloaded'],
    ];
    for (const [status, type, kind] of cases) {
      const fetchMock = vi.fn(async () => errorResponse(status, type, 'nope'));
      const err = await streamChat({ ...base, fetch: fetchMock as typeof fetch }).catch((e) => e);
      expect(err).toBeInstanceOf(AiError);
      expect((err as AiError).kind).toBe(kind);
    }
  });

  it('cancels when the abort signal fires', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const pending = streamChat({
      ...base,
      fetch: fetchMock as typeof fetch,
      signal: controller.signal,
    });
    controller.abort();
    const err = (await pending.catch((e) => e)) as AiError;
    expect(err).toBeInstanceOf(AiError);
    expect(err.kind).toBe('aborted');
  });

  it('tests a key with a tiny request', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'msg_2',
            type: 'message',
            role: 'assistant',
            model: 'claude-haiku-5-5',
            content: [{ type: 'text', text: 'online' }],
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: { input_tokens: 12, output_tokens: 2 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    await expect(
      testKey({ apiKey: 'k', model: 'claude-haiku-5-5', fetch: fetchMock as typeof fetch }),
    ).resolves.toEqual({
      inputTokens: 12,
      outputTokens: 2,
    });
  });

  it('resolves the model and its request options', () => {
    expect(resolveModel({ aiModel: 'claude-sonnet-5-5' })).toBe('claude-sonnet-5-5');
    expect(
      resolveModel({ aiModel: 'claude-sonnet-5-5', aiModelOverride: ' claude-future-9 ' }),
    ).toBe('claude-future-9');
    expect(modelProfile('claude-haiku-5-5')).toEqual({ effort: true, fallbacks: false });
    expect(modelProfile('claude-sonnet-5-5')).toEqual({ effort: true, fallbacks: true });
    expect(modelProfile('some-other-model')).toEqual({ effort: false, fallbacks: false });
  });
});
