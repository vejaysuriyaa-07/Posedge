/**
 * Generated ambient sound for Flow mode (no audio files): brown noise, rain (filtered pink noise)
 * and waves (brown noise swelling slowly), plus a soft two-note chime. Silently does nothing where
 * Web Audio isn't available.
 */

export type AmbientKind = 'off' | 'brown' | 'rain' | 'waves';

export const AMBIENT_LABELS: Record<AmbientKind, string> = {
  off: 'Off',
  brown: 'Brown noise',
  rain: 'Rain',
  waves: 'Waves',
};

type Ctx = AudioContext;

function makeContext(): Ctx | null {
  const C =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  try {
    return C ? new C() : null;
  } catch {
    return null;
  }
}

/** Six seconds of looping noise. Brown integrates white noise; pink uses Paul Kellet's filter. */
function noiseBuffer(ctx: Ctx, color: 'brown' | 'pink'): AudioBuffer {
  const len = ctx.sampleRate * 6;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const out = buf.getChannelData(0);
  let last = 0;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    if (color === 'brown') {
      last = (last + 0.02 * white) / 1.02;
      out[i] = last * 3.5;
    } else {
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
  }
  return buf;
}

class AmbientEngine {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private nodes: AudioScheduledSourceNode[] = [];
  private volume = 0.5;
  private ducked = false;
  kind: AmbientKind = 'off';

  private ensure(): Ctx | null {
    if (!this.ctx) {
      this.ctx = makeContext();
      if (this.ctx) {
        this.master = this.ctx.createGain();
        this.master.gain.value = 0;
        this.master.connect(this.ctx.destination);
      }
    }
    if (this.ctx?.state === 'suspended') void this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  private target(): number {
    return this.kind === 'off' || this.ducked ? 0 : this.volume * 0.5;
  }

  private ramp(seconds: number) {
    if (!this.ctx || !this.master) return;
    const g = this.master.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(this.target(), t + seconds);
  }

  private stopNodes(after: number) {
    const old = this.nodes;
    this.nodes = [];
    const t = (this.ctx?.currentTime ?? 0) + after;
    for (const n of old) {
      try {
        n.stop(t);
      } catch {
        // Already stopped.
      }
    }
  }

  /** Starts (or switches to) a sound, fading in. Call from a user gesture the first time. */
  play(kind: AmbientKind, volume = this.volume): void {
    this.volume = volume;
    if (kind === this.kind && this.nodes.length) {
      this.ramp(0.4);
      return;
    }
    if (kind === 'off') {
      this.stop();
      return;
    }
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const g = this.master.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    // Fade the old sound out before swapping graphs.
    const switching = this.nodes.length > 0;
    if (switching) {
      g.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
      this.stopNodes(0.32);
    }
    const at = ctx.currentTime + (switching ? 0.32 : 0);
    this.kind = kind;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, kind === 'rain' ? 'pink' : 'brown');
    src.loop = true;
    const nodes: AudioScheduledSourceNode[] = [src];
    if (kind === 'rain') {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 400;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 6500;
      src.connect(hp).connect(lp).connect(this.master);
    } else if (kind === 'waves') {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      const swell = ctx.createGain();
      swell.gain.value = 0.55;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.09;
      const depth = ctx.createGain();
      depth.gain.value = 0.45;
      lfo.connect(depth).connect(swell.gain);
      src.connect(lp).connect(swell).connect(this.master);
      lfo.start(at);
      nodes.push(lfo);
    } else {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1200;
      src.connect(lp).connect(this.master);
    }
    src.start(at);
    this.nodes = nodes;
    g.setValueAtTime(0, at);
    g.linearRampToValueAtTime(this.target(), at + 1.2);
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    this.ramp(0.15);
  }

  /** Quiet while paused, back when resumed. */
  duck(on: boolean): void {
    if (this.ducked === on) return;
    this.ducked = on;
    this.ramp(0.6);
  }

  stop(): void {
    this.kind = 'off';
    this.ramp(0.6);
    this.stopNodes(0.65);
  }

  /** Creates or wakes the audio context. Browsers only allow this inside a user gesture. */
  prime(): void {
    this.ensure();
  }

  /**
   * A soft two-note chime (E5 then B5) for "time's up". Plays only once a gesture has primed
   * audio, so a reload never trips the browser's autoplay block.
   */
  chime(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    [659.25, 987.77].forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = ctx.createGain();
      const start = t + i * 0.18;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.16, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 1.6);
      osc.connect(g).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 1.7);
    });
  }
}

export const ambient = new AmbientEngine();
