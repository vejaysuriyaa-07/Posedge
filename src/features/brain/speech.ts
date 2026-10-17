import { useCallback, useEffect, useRef, useState } from 'react';
import { takeSentences } from '../../domain/brain';

/* Minimal Web Speech API types (not in lib.dom for every browser). */
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  isFinal: boolean;
  0: RecognitionAlternative;
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** Push-to-talk speech input. `onFinal` receives the transcript when VJ stops talking. */
export function useVoiceInput(onFinal: (text: string) => void) {
  const supported = !!recognitionCtor();
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const finalRef = useRef(onFinal);
  useEffect(() => {
    finalRef.current = onFinal;
  });

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || recRef.current) return;
    const rec = new Ctor();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let finalText = '';
    rec.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        if (r.isFinal) finalText += r[0].transcript;
        else live += r[0].transcript;
      }
      setInterim((finalText + live).trim());
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setError('Microphone access is blocked. Allow it in your browser to talk to EDGE.');
      } else if (e.error !== 'aborted' && e.error !== 'no-speech') {
        setError("Didn't catch that. Try again, or type instead.");
      }
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      setInterim('');
      const text = finalText.trim();
      if (text) finalRef.current(text);
    };
    recRef.current = rec;
    setError(null);
    setListening(true);
    try {
      rec.start();
    } catch {
      recRef.current = null;
      setListening(false);
    }
  }, []);

  const stop = useCallback(() => recRef.current?.stop(), []);

  useEffect(() => () => recRef.current?.abort(), []);

  return { supported, listening, interim, error, start, stop };
}

const PREFERRED_VOICES = ['Daniel', 'Google UK English Male', 'Arthur', 'Oliver', 'George'];

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  for (const name of PREFERRED_VOICES) {
    const v = voices.find((x) => x.name.includes(name) && x.lang.startsWith('en'));
    if (v) return v;
  }
  return voices.find((v) => v.lang === 'en-GB') ?? voices.find((v) => v.lang.startsWith('en'));
}

/**
 * Reads answers aloud. With `auto` on, `feed` speaks streamed text sentence by sentence (so the
 * answer starts before it finishes) and `flush` speaks the tail. `speak` reads a whole answer on
 * request; `cancel` stops immediately.
 */
export function useSpeaker(auto: boolean) {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [speaking, setSpeaking] = useState(false);
  const buffer = useRef('');
  const pending = useRef(0);

  useEffect(() => {
    if (!supported) return;
    // Voices load asynchronously in Chrome.
    const load = () => window.speechSynthesis.getVoices();
    load();
    window.speechSynthesis.addEventListener?.('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', load);
  }, [supported]);

  const say = useCallback(
    (sentence: string) => {
      if (!supported) return;
      const u = new SpeechSynthesisUtterance(sentence);
      const voice = pickVoice();
      if (voice) u.voice = voice;
      u.rate = 1.04;
      u.pitch = 0.95;
      const done = () => {
        pending.current = Math.max(0, pending.current - 1);
        if (!pending.current) setSpeaking(false);
      };
      u.onend = done;
      u.onerror = done;
      pending.current++;
      setSpeaking(true);
      window.speechSynthesis.speak(u);
    },
    [supported],
  );

  const feed = useCallback(
    (delta: string) => {
      if (!auto || !supported) return;
      buffer.current += delta;
      const { sentences, rest } = takeSentences(buffer.current);
      buffer.current = rest;
      sentences.forEach(say);
    },
    [auto, supported, say],
  );

  const flush = useCallback(() => {
    if (!auto || !supported) {
      buffer.current = '';
      return;
    }
    const { sentences } = takeSentences(buffer.current, true);
    buffer.current = '';
    sentences.forEach(say);
  }, [auto, supported, say]);

  const speak = useCallback(
    (text: string) => {
      if (!supported) return;
      window.speechSynthesis.cancel();
      pending.current = 0;
      takeSentences(text, true).sentences.forEach(say);
    },
    [supported, say],
  );

  const cancel = useCallback(() => {
    buffer.current = '';
    pending.current = 0;
    if (supported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  useEffect(
    () => () => {
      if (supported) window.speechSynthesis.cancel();
    },
    [supported],
  );

  return { supported, speaking, feed, flush, speak, cancel };
}
