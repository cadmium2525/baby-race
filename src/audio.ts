type Cue = 'start' | 'finish' | 'awakening' | 'duck' | 'sit' | 'tick';
type AudioContextConstructor = typeof AudioContext;

/** Small, local-only sound kit. Call unlock() from a click, touch or key gesture. */
export class GameAudio {
  enabled = true;

  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private sources = new Set<AudioScheduledSourceNode>();
  private disposed = false;

  unlock(): void {
    if (this.disposed || !this.enabled || typeof window === 'undefined') return;
    try {
      if (!this.context) {
        const audioWindow = window as Window & { webkitAudioContext?: AudioContextConstructor };
        const Constructor = globalThis.AudioContext ?? audioWindow.webkitAudioContext;
        if (!Constructor) return;
        const context = new Constructor();
        const output = context.createGain();
        output.gain.value = 0.24;
        output.connect(context.destination);
        this.context = context;
        this.output = output;
        this.noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.2), context.sampleRate);
        const samples = this.noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    } catch {
      // Audio support is optional; gameplay remains usable in restricted browsers.
    }
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.enabled) this.unlock();
    if (this.context && this.output) {
      const now = this.context.currentTime;
      this.output.gain.cancelScheduledValues(now);
      this.output.gain.setTargetAtTime(this.enabled ? 0.24 : 0, now, 0.012);
    }
    return this.enabled;
  }

  ring(superRing = false): void {
    if (!this.ready()) return;
    const repeats = superRing ? 5 : 3;
    for (let i = 0; i < repeats; i++) {
      const delay = i * 0.055;
      this.shake(delay, superRing ? 0.65 : 0.42);
      this.tone(1500 + i * 165, 0.055, delay, 'sine', 0.12, 1100 + i * 100);
    }
    if (superRing) {
      [523.25, 659.25, 783.99, 1046.5].forEach((note, i) => this.tone(note, 0.19, i * 0.08, 'triangle', 0.28));
    }
  }

  cue(kind: Cue): void {
    if (!this.ready()) return;
    switch (kind) {
      case 'start':
        [523.25, 659.25, 783.99, 1046.5].forEach((note, i) => this.tone(note, i === 3 ? 0.35 : 0.14, i * 0.1, 'triangle', 0.45));
        break;
      case 'finish':
        [783.99, 659.25, 783.99, 1046.5, 1318.51].forEach((note, i) => this.tone(note, i === 4 ? 0.6 : 0.2, i * 0.13, 'triangle', 0.4));
        this.tone(523.25, 0.7, 0.52, 'sine', 0.25);
        break;
      case 'awakening':
        this.tone(330, 0.45, 0, 'sine', 0.33, 1760);
        [1318.51, 1760, 2093].forEach((note, i) => this.tone(note, 0.32, 0.28 + i * 0.06, 'triangle', 0.25));
        this.shake(0.35, 0.42);
        break;
      case 'duck':
        this.tone(710, 0.13, 0, 'triangle', 0.35, 410);
        this.tone(640, 0.16, 0.16, 'triangle', 0.3, 360);
        break;
      case 'sit':
        this.tone(260, 0.19, 0, 'sine', 0.6, 100);
        this.tone(420, 0.1, 0.05, 'triangle', 0.18, 180);
        break;
      case 'tick':
        this.tone(880, 0.075, 0, 'sine', 0.36);
        break;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.enabled = false;
    for (const source of this.sources) {
      try { source.stop(); } catch { /* A source may already have ended. */ }
      source.disconnect();
    }
    this.sources.clear();
    this.output?.disconnect();
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {});
    this.context = null;
    this.output = null;
    this.noise = null;
  }

  private ready(): boolean {
    return !this.disposed && this.enabled && this.context?.state === 'running' && this.output !== null;
  }

  private tone(frequency: number, duration: number, delay: number, type: OscillatorType, volume: number, endFrequency = frequency): void {
    const context = this.context;
    const output = this.output;
    if (!context || !output) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.012, duration / 4));
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(output);
    this.sources.add(oscillator);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
      this.sources.delete(oscillator);
    };
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  }

  private shake(delay: number, volume: number): void {
    const context = this.context;
    const output = this.output;
    if (!context || !output || !this.noise) return;
    const start = context.currentTime + delay;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = this.noise;
    source.playbackRate.value = 0.85 + Math.random() * 0.3;
    filter.type = 'bandpass';
    filter.frequency.value = 4200;
    filter.Q.value = 0.8;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(volume, start + 0.005);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.07);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(output);
    this.sources.add(source);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      envelope.disconnect();
      this.sources.delete(source);
    };
    source.start(start);
    source.stop(start + 0.08);
  }
}
