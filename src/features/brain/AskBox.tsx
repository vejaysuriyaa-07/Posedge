import { ArrowUp, Mic, Square, Volume2, VolumeX } from 'lucide-react';
import type { KeyboardEvent, Ref } from 'react';

export interface VoiceControls {
  supported: boolean;
  listening: boolean;
  interim: string;
  start: () => void;
  stop: () => void;
}

interface Props {
  variant: 'hero' | 'followup';
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  busy: boolean;
  disabled: boolean;
  voice: VoiceControls;
  autoRead: { supported: boolean; on: boolean; toggle: () => void };
  modelLabel: string;
  inputRef?: Ref<HTMLTextAreaElement>;
}

const MAX_HEIGHT = 200;

/** The ask field: grows with its text; Enter sends, Shift+Enter adds a line. */
export function AskBox({ inputRef, ...p }: Props) {
  const hero = p.variant === 'hero';
  const text = p.voice.listening ? p.voice.interim : p.value;
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      p.onSubmit();
    }
  };
  return (
    <form
      className="w-full rounded-2xl border border-border bg-surface shadow-card transition focus-within:border-brand/50 focus-within:ring-4 focus-within:ring-brand/10"
      onSubmit={(e) => {
        e.preventDefault();
        p.onSubmit();
      }}
    >
      <label htmlFor={`ask-${p.variant}`} className="sr-only">
        {hero ? 'Ask your brain' : 'Ask a follow-up'}
      </label>
      <textarea
        id={`ask-${p.variant}`}
        ref={inputRef}
        rows={hero ? 2 : 1}
        value={text}
        disabled={p.disabled}
        onChange={(e) => p.onChange(e.target.value)}
        onInput={(e) => {
          const el = e.currentTarget;
          el.style.height = 'auto';
          el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
        }}
        onKeyDown={onKeyDown}
        placeholder={
          p.disabled
            ? 'Connect an API key to ask questions'
            : p.voice.listening
              ? 'Listening…'
              : hero
                ? 'Ask anything about your projects, tasks or reviews…'
                : 'Ask a follow-up…'
        }
        className={`block w-full resize-none bg-transparent px-4 text-[15.5px] leading-relaxed outline-none placeholder:text-muted/80 disabled:cursor-not-allowed ${
          hero ? 'pt-4 pb-1' : 'pt-3 pb-0'
        }`}
      />
      <div className="flex items-center gap-1 px-2 pb-2">
        {p.voice.supported && !p.disabled ? (
          <button
            type="button"
            onClick={() => (p.voice.listening ? p.voice.stop() : p.voice.start())}
            disabled={p.busy}
            aria-pressed={p.voice.listening}
            aria-label={p.voice.listening ? 'Stop listening' : 'Ask by voice'}
            title={p.voice.listening ? 'Stop listening' : 'Ask by voice'}
            className={`grid size-9 place-items-center rounded-full transition disabled:opacity-40 ${
              p.voice.listening
                ? 'bg-brand/15 text-brand'
                : 'text-muted hover:bg-elevated hover:text-fg'
            }`}
          >
            <Mic size={17} />
          </button>
        ) : null}
        {p.autoRead.supported && !p.disabled ? (
          <button
            type="button"
            onClick={p.autoRead.toggle}
            aria-pressed={p.autoRead.on}
            aria-label={p.autoRead.on ? 'Stop reading answers aloud' : 'Read answers aloud'}
            title={p.autoRead.on ? 'Reading answers aloud' : 'Read answers aloud'}
            className={`grid size-9 place-items-center rounded-full transition ${
              p.autoRead.on ? 'text-brand' : 'text-muted hover:bg-elevated hover:text-fg'
            }`}
          >
            {p.autoRead.on ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
        ) : null}
        <span className="flex-1" />
        {!p.disabled ? (
          <span className="mr-1.5 hidden text-xs text-muted sm:inline">{p.modelLabel}</span>
        ) : null}
        {p.busy ? (
          <button
            type="button"
            onClick={p.onStop}
            aria-label="Stop"
            title="Stop"
            className="grid size-9 place-items-center rounded-full bg-fg text-bg transition hover:opacity-85"
          >
            <Square size={13} fill="currentColor" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={p.disabled || !p.value.trim()}
            aria-label="Ask"
            title="Ask"
            className="grid size-9 place-items-center rounded-full bg-brand text-brand-fg transition hover:brightness-110 disabled:bg-elevated disabled:text-muted"
          >
            <ArrowUp size={18} />
          </button>
        )}
      </div>
    </form>
  );
}
