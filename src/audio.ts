import { getEvent, type EventId } from './content';

type Cue = 'start' | 'finish' | 'awakening' | 'duck' | 'sit' | 'tick' | 'groove' | 'laugh';
type AudioContextConstructor = typeof AudioContext;
interface Commentary { text: string; priority: number; expires: number }
interface Speaking { utterance: SpeechSynthesisUtterance; priority: number }
const now = () => typeof performance === 'undefined' ? Date.now() : performance.now();

/** Local synthesis only: neither effects nor commentary download sound assets. */
export class GameAudio {
  enabled = true;
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private sources = new Map<AudioScheduledSourceNode, () => void>();
  private effectSources = new Set<AudioScheduledSourceNode>();
  private schedulingEffect = false;
  private effectPriority = 0;
  private effectUntil = 0;
  private recentEffects = new Map<EventId, number>();
  private disposed = false;
  private commentaryEnabled = false;
  private commentaryQueue: Commentary[] = [];
  private recentCommentary = new Map<string, number>();
  private speaking: Speaking | null = null;
  private voiceTimer: ReturnType<typeof setTimeout> | null = null;
  private voiceWatchdog: ReturnType<typeof setTimeout> | null = null;
  private speechListenerAttached = false;
  private onVoicesChanged = () => this.pumpCommentary();

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
      // Audio support is optional; restricted browsers can still play the game.
    }
  }

  toggle(): boolean {
    if (this.disposed) return false;
    this.enabled = !this.enabled;
    if (this.enabled) this.unlock();
    else this.stopCommentary();
    if (this.context && this.output) {
      const time = this.context.currentTime;
      this.output.gain.cancelScheduledValues(time);
      this.output.gain.setTargetAtTime(this.enabled ? 0.24 : 0, time, 0.012);
    }
    return this.enabled;
  }

  /** Commentary starts off. Only installed Japanese voices are eligible. */
  setCommentary(enabled: boolean): void {
    if (this.disposed) return;
    this.commentaryEnabled = enabled;
    if (!enabled) this.cancelVoice();
    else { this.unlock(); this.ensureSpeechListener(); }
  }

  /** Pause/restart hook: clear speech, queued lines and already scheduled effects. */
  stopCommentary(): void {
    this.cancelVoice();
    this.stopSources();
    this.effectUntil = 0;
    this.recentEffects.clear();
  }

  ring(superRing = false): void {
    if (!this.ready()) return;
    const repeats = superRing ? 5 : 3;
    for (let i = 0; i < repeats; i++) {
      const delay = i * 0.055;
      this.shake(delay, superRing ? 0.65 : 0.42);
      this.tone(1500 + i * 165, 0.055, delay, 'sine', 0.12, 1100 + i * 100);
    }
    if (superRing) this.notes([523.25, 659.25, 783.99, 1046.5], 0.08, 0.19, 'triangle', 0.28);
  }

  cue(kind: Cue): void {
    if (kind === 'start' || kind === 'finish') this.stopCommentary();
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
      case 'tick': this.tone(880, 0.075, 0, 'sine', 0.36); break;
      case 'groove':
        this.notes([659, 784, 988, 1319], 0.07, 0.13, 'triangle', 0.23);
        this.giggle(0.24, 2);
        break;
      case 'laugh': this.giggle(0, 4); break;
    }
  }

  /** Events can preempt quieter effects; user rattle feedback is preserved. */
  event(id: EventId, playerLabel: string, priority?: number): void {
    if (this.disposed || !this.enabled) return;
    const definition = getEvent(id);
    if (!definition) return;
    const defaultPriority = definition.rarity === 'legendary' ? 3 : definition.rarity === 'rare' ? 2 : 1;
    const importance = priority !== undefined && Number.isFinite(priority) ? Math.max(0, Math.min(5, priority)) : defaultPriority;
    const time = now();
    if (time - (this.recentEffects.get(id) ?? -Infinity) >= 1100 && this.ready() &&
        (time >= this.effectUntil || importance > this.effectPriority)) {
      this.stopSources(true);
      this.recentEffects.set(id, time);
      this.effectPriority = importance;
      this.effectUntil = time + (importance >= 3 ? 1300 : 850);
      this.schedulingEffect = true;
      try { this.eventSound(id); } finally { this.schedulingEffect = false; }
    }
    this.queueCommentary(id, `${playerLabel.slice(0, 40)}！ ${definition.name}`, importance);
  }

  dispose(): void {
    if (this.disposed) return;
    this.stopCommentary();
    const speech = this.speech();
    if (this.speechListenerAttached) speech?.removeEventListener('voiceschanged', this.onVoicesChanged);
    this.speechListenerAttached = false;
    this.disposed = true;
    this.enabled = false;
    this.output?.disconnect();
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {});
    this.context = null;
    this.output = null;
    this.noise = null;
  }

  private eventSound(id: EventId): void {
    switch (id) {
      case 'N01': this.cue('duck'); break;
      case 'N02':
        this.tone(510, 0.16, 0, 'sine', 0.24, 720);
        this.tone(630, 0.18, 0.24, 'sine', 0.2, 500);
        break;
      case 'N03': this.cue('sit'); break;
      case 'N04': this.giggle(0, 2); this.tone(1047, 0.2, 0.24, 'sine', 0.18); break;
      case 'N05': this.tone(530, 0.4, 0, 'triangle', 0.25, 230); break;
      case 'N06': this.notes([784, 659, 698, 523], 0.13, 0.13, 'triangle', 0.23); break;
      case 'N07':
        [0, 0.18, 0.36].forEach(delay => this.shake(delay, 0.32, 1300));
        this.giggle(0.4, 2);
        break;
      case 'N08':
        this.tone(420, 0.15, 0, 'sine', 0.17, 780);
        this.shake(0.18, 0.65, 1900);
        this.tone(400, 0.18, 0.19, 'triangle', 0.3, 180);
        break;
      case 'R01':
        this.tone(170, 0.65, 0, 'triangle', 0.27, 1050);
        [0.12, 0.28, 0.44].forEach(delay => this.shake(delay, 0.24, 900));
        break;
      case 'R02': this.notes([196, 247, 294, 392], 0.13, 0.1, 'sine', 0.4); break;
      case 'R03':
        this.notes([523, 659, 523, 784, 659], 0.12, 0.1, 'triangle', 0.25);
        this.giggle(0.5, 2);
        break;
      case 'R04': this.cue('groove'); this.giggle(0.35, 4); break;
      case 'R05': this.giggle(0, 5); this.giggle(0.42, 3, 1.2); break;
      case 'R06': this.notes([523, 659, 784, 1047, 784, 659, 523], 0.08, 0.13, 'sine', 0.25); break;
      case 'R07': this.notes([1047, 1319, 1568, 1319], 0.13, 0.2, 'sine', 0.25); break;
      case 'R08':
        this.notes([392, 523, 659, 784], 0.12, 0.16, 'triangle', 0.29);
        this.tone(392, 0.4, 0.35, 'sine', 0.16);
        break;
      case 'S01': this.cue('awakening'); break;
      case 'S02':
        this.notes([220, 440, 330, 660, 440, 880], 0.15, 0.065, 'square', 0.09);
        [0.1, 0.4, 0.7].forEach(delay => this.tone(1000, 0.045, delay, 'sine', 0.17));
        break;
      case 'S03':
        this.notes([523, 659, 784, 659], 0.2, 0.16, 'triangle', 0.23);
        [0.2, 0.4, 0.6, 0.8].forEach(delay => this.shake(delay, 0.2, 1400));
        break;
      case 'S04':
        [0, 0.22, 0.44].forEach(delay => this.shake(delay, 0.36, 2900));
        this.notes([988, 1175, 1568], 0.15, 0.12, 'sine', 0.23, 0.1);
        break;
      case 'S05':
        this.notes([784, 659, 523, 392], 0.16, 0.18, 'triangle', 0.27);
        this.tone(392, 0.4, 0.55, 'sine', 0.25, 160);
        break;
      case 'S06':
        [0, 0.22, 0.44].forEach((delay, i) => {
          this.tone(784 + i * 130, 0.2, delay, 'sine', 0.3 - i * 0.07, 1568 + i * 130);
          this.shake(delay + 0.06, 0.22 - i * 0.04, 3200);
        });
        break;
      case 'S07':
        this.tone(1200, 0.7, 0, 'triangle', 0.2, 280);
        [0.1, 0.24, 0.38].forEach(delay => this.shake(delay, 0.26, 2200));
        this.tone(659, 0.24, 0.65, 'sine', 0.24, 988);
        break;
      case 'S08':
        this.notes([784, 988, 1319], 0.08, 0.27, 'sine', 0.29);
        this.giggle(0.38, 2, 0.88);
        break;
    }
  }

  private ready(): boolean {
    return !this.disposed && this.enabled && this.context?.state === 'running' && this.output !== null;
  }
  private notes(notes: number[], spacing: number, duration: number, type: OscillatorType, volume: number, delay = 0): void {
    notes.forEach((note, index) => this.tone(note, duration, delay + index * spacing, type, volume));
  }
  /** Rounded two-part syllables suggest giggles without recorded baby voices. */
  private giggle(delay: number, count: number, pitch = 1): void {
    for (let i = 0; i < count; i++) {
      const offset = delay + i * 0.13;
      const frequency = (640 + (i % 3) * 95) * pitch;
      this.tone(frequency, 0.085, offset, 'sine', 0.26, frequency * 1.3);
      this.tone(frequency * 1.7, 0.06, offset + 0.035, 'sine', 0.08, frequency * 1.1);
    }
  }

  private track(source: AudioScheduledSourceNode, nodes: AudioNode[]): void {
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      source.onended = null;
      source.disconnect();
      nodes.forEach(node => node.disconnect());
      this.sources.delete(source);
      this.effectSources.delete(source);
    };
    this.sources.set(source, cleanup);
    if (this.schedulingEffect) this.effectSources.add(source);
    source.onended = cleanup;
  }
  private stopSources(effectsOnly = false): void {
    for (const [source, cleanup] of [...this.sources]) {
      if (effectsOnly && !this.effectSources.has(source)) continue;
      try { source.stop(); } catch { /* A scheduled source may already have ended. */ }
      cleanup();
    }
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
    this.track(oscillator, [envelope]);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  }
  private shake(delay: number, volume: number, frequency = 4200): void {
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
    filter.frequency.value = frequency;
    filter.Q.value = 0.8;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(volume, start + 0.005);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.07);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(output);
    this.track(source, [filter, envelope]);
    source.start(start);
    source.stop(start + 0.08);
  }

  private speech(): SpeechSynthesis | null {
    if (typeof window === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return null;
    try { return window.speechSynthesis ?? null; } catch { return null; }
  }
  private ensureSpeechListener(): SpeechSynthesis | null {
    const speech = this.speech();
    if (speech && !this.speechListenerAttached) {
      speech.addEventListener('voiceschanged', this.onVoicesChanged);
      this.speechListenerAttached = true;
    }
    return speech;
  }
  private queueCommentary(id: EventId, text: string, priority: number): void {
    if (!this.commentaryEnabled || !this.ensureSpeechListener()) return;
    const time = now();
    const key = `${id}:${text}`;
    if (time - (this.recentCommentary.get(key) ?? -Infinity) < 8000) return;
    this.recentCommentary.set(key, time);
    if (this.recentCommentary.size > 64) this.recentCommentary.delete(this.recentCommentary.keys().next().value!);
    this.commentaryQueue = this.commentaryQueue.filter(item => item.expires > time);
    this.commentaryQueue.push({ text, priority, expires: time + 6500 });
    this.commentaryQueue.sort((a, b) => b.priority - a.priority);
    this.commentaryQueue.length = Math.min(4, this.commentaryQueue.length);
    if (this.speaking && priority > this.speaking.priority) this.cancelSpeaking();
    this.pumpCommentary();
  }
  private pumpCommentary(): void {
    if (this.voiceTimer !== null) { clearTimeout(this.voiceTimer); this.voiceTimer = null; }
    if (!this.enabled || this.disposed || !this.commentaryEnabled || this.speaking) return;
    this.commentaryQueue = this.commentaryQueue.filter(item => item.expires > now());
    if (!this.commentaryQueue.length) return;
    const speech = this.speech();
    if (!speech) { this.commentaryQueue = []; return; }
    const voices = speech.getVoices();
    // A remote/default voice could contact a service. Use local Japanese voices only.
    const voice = voices.find(candidate => candidate.localService && /^ja(?:-|_|$)/i.test(candidate.lang));
    if (!voice) {
      if (!voices.length) this.voiceTimer = setTimeout(() => this.pumpCommentary(), 250);
      else this.commentaryQueue = [];
      return;
    }
    const line = this.commentaryQueue.shift()!;
    const utterance = new SpeechSynthesisUtterance(line.text);
    utterance.voice = voice;
    utterance.lang = 'ja-JP';
    utterance.rate = 1.12;
    utterance.pitch = 1.18;
    utterance.volume = 0.8;
    const current: Speaking = { utterance, priority: line.priority };
    this.speaking = current;
    const ended = () => {
      if (this.speaking !== current) return;
      this.speaking = null;
      if (this.voiceWatchdog !== null) clearTimeout(this.voiceWatchdog);
      this.voiceWatchdog = null;
      utterance.onend = null;
      utterance.onerror = null;
      this.voiceTimer = setTimeout(() => this.pumpCommentary(), 140);
    };
    utterance.onend = ended;
    utterance.onerror = ended;
    this.voiceWatchdog = setTimeout(() => {
      if (this.speaking !== current) return;
      this.cancelSpeaking();
      this.pumpCommentary();
    }, 9000);
    try { speech.speak(utterance); } catch { ended(); }
  }
  private cancelSpeaking(): void {
    const current = this.speaking;
    this.speaking = null;
    if (this.voiceWatchdog !== null) clearTimeout(this.voiceWatchdog);
    this.voiceWatchdog = null;
    if (current) {
      current.utterance.onend = null;
      current.utterance.onerror = null;
      try { this.speech()?.cancel(); } catch { /* Speech support may disappear. */ }
    }
  }
  private cancelVoice(): void {
    if (this.voiceTimer !== null) clearTimeout(this.voiceTimer);
    this.voiceTimer = null;
    this.commentaryQueue = [];
    this.recentCommentary.clear();
    this.cancelSpeaking();
  }
}
