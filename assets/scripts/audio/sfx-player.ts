export type SfxId = 'hit-ore' | 'hit-tree' | 'hit-monster';

export type SfxListener = (player: SfxPlayer) => void;

const STORAGE_KEY = 'exgame:v1:sfx-settings';

/**
 * 광석·나무·몬스터 타격 효과음입니다.
 * 외부 파일 없이 Web Audio로 짧은 음을 합성해 재생합니다.
 */
export class SfxPlayer {
  private readonly listeners = new Set<SfxListener>();
  private context: AudioContext | null = null;
  private enabled = true;
  private volume = 0.7;

  constructor() {
    this.load();
  }

  addListener(listener: SfxListener): void {
    this.listeners.add(listener);
    listener(this);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getVolumePercent(): number {
    return Math.round(this.volume * 100);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.persist();
    this.notify();
  }

  toggleEnabled(): void {
    this.setEnabled(!this.enabled);
  }

  adjustVolume(direction: 1 | -1): void {
    this.volume = clamp(this.volume + direction * 0.05, 0, 1);
    this.volume = Math.round(this.volume * 100) / 100;
    this.persist();
    this.notify();
  }

  /** 첫 사용자 제스처에서 AudioContext를 깨웁니다. */
  unlock(): void {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
  }

  play(id: SfxId): void {
    if (!this.enabled || this.volume <= 0) return;
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      void ctx.resume().then(() => this.playInternal(id));
      return;
    }
    this.playInternal(id);
  }

  private playInternal(id: SfxId): void {
    switch (id) {
      case 'hit-ore':
        this.playTone({
          frequency: 520,
          duration: 0.07,
          type: 'square',
          decay: 0.08,
          filterFreq: 1800,
        });
        this.playNoise({ duration: 0.04, gain: 0.18, filterFreq: 2400 });
        break;
      case 'hit-tree':
        this.playTone({
          frequency: 140,
          duration: 0.1,
          type: 'triangle',
          decay: 0.12,
          filterFreq: 700,
        });
        this.playNoise({ duration: 0.06, gain: 0.22, filterFreq: 900 });
        break;
      case 'hit-monster':
        this.playTone({
          frequency: 220,
          duration: 0.09,
          type: 'sawtooth',
          decay: 0.1,
          filterFreq: 1100,
        });
        this.playTone({
          frequency: 90,
          duration: 0.11,
          type: 'sine',
          decay: 0.14,
          filterFreq: 500,
          gainScale: 0.7,
        });
        break;
      default:
        break;
    }
  }

  private playTone(options: {
    frequency: number;
    duration: number;
    type: OscillatorType;
    decay: number;
    filterFreq: number;
    gainScale?: number;
  }): void {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = options.type;
    osc.frequency.setValueAtTime(options.frequency, now);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(options.filterFreq, now);
    const peak = this.volume * (options.gainScale ?? 0.35);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + options.decay);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + options.duration + 0.02);
  }

  private playNoise(options: {
    duration: number;
    gain: number;
    filterFreq: number;
  }): void {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;
    const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * options.duration));
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / sampleCount);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(options.filterFreq, now);
    filter.Q.setValueAtTime(0.8, now);
    const gain = ctx.createGain();
    const peak = this.volume * options.gain;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + options.duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(now);
    source.stop(now + options.duration + 0.02);
  }

  private ensureContext(): AudioContext {
    if (!this.context) {
      const AudioCtx = window.AudioContext
        || (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.context = new AudioCtx();
    }
    return this.context;
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { enabled?: boolean; volume?: number };
      if (typeof parsed.enabled === 'boolean') this.enabled = parsed.enabled;
      if (typeof parsed.volume === 'number') {
        this.volume = clamp(parsed.volume, 0, 1);
      }
    } catch {
      // keep defaults
    }
  }

  private persist(): void {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ enabled: this.enabled, volume: this.volume }),
    );
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
