import { BgmFileStore } from './bgm-file-store';
import {
  DEFAULT_BGM_VOLUME,
  type BgmPlaylistListener,
  type BgmPlaylistSnapshot,
  type BgmTrackMeta,
} from './bgm-types';

const META_STORAGE_KEY = 'exgame:v1:bgm-playlist';

/**
 * 설정에서 등록한 배경음을 순서대로 재생합니다.
 * 마지막 곡이 끝나면 처음으로 돌아갑니다.
 * (웹 자동재생 정책상 첫 클릭/터치 이후부터 실제로 소리가 납니다.)
 */
export class BgmPlaylistPlayer {
  private readonly fileStore = new BgmFileStore();
  private readonly listeners = new Set<BgmPlaylistListener>();
  private readonly objectUrls = new Map<string, string>();
  private tracks: BgmTrackMeta[] = [];
  private currentIndex = 0;
  private volume = DEFAULT_BGM_VOLUME;
  private enabled = true;
  private audio: HTMLAudioElement | null = null;
  private unlocked = false;
  private unlockBound = false;
  private starting = false;

  async initialize(): Promise<void> {
    this.loadMeta();
    this.bindUnlockGesture();
    if (this.enabled && this.tracks.length > 0) {
      await this.ensurePlaying();
    }
    this.notify();
  }

  addListener(listener: BgmPlaylistListener): void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
  }

  getSnapshot(): BgmPlaylistSnapshot {
    return {
      enabled: this.enabled,
      volume: this.volume,
      tracks: [...this.tracks],
      currentIndex: this.currentIndex,
    };
  }

  getVolumePercent(): number {
    return Math.round(this.volume * 100);
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled;
    this.persistMeta();
    if (!enabled) {
      this.pauseInternal();
    } else {
      await this.ensurePlaying();
    }
    this.notify();
  }

  async toggleEnabled(): Promise<void> {
    await this.setEnabled(!this.enabled);
  }

  adjustVolume(direction: 1 | -1): void {
    const next = clamp(this.volume + direction * 0.05, 0, 1);
    this.volume = Math.round(next * 100) / 100;
    if (this.audio) this.audio.volume = this.volume;
    this.persistMeta();
    this.notify();
  }

  async addUrl(rawUrl: string): Promise<string | null> {
    const url = rawUrl.trim();
    if (!url) return 'URL이 비어 있습니다.';
    let parsed: URL;
    try {
      parsed = new URL(url, window.location.href);
    } catch {
      return '올바른 URL이 아닙니다.';
    }
    const name = decodeURIComponent(
      parsed.pathname.split('/').filter(Boolean).pop() ?? 'bgm',
    );
    const track: BgmTrackMeta = {
      id: createId('url'),
      name,
      kind: 'url',
      url: parsed.href,
    };
    this.tracks = [...this.tracks, track];
    this.persistMeta();
    this.notify();
    if (this.enabled && this.tracks.length === 1) {
      await this.ensurePlaying();
    }
    return null;
  }

  async addFiles(files: ReadonlyArray<File>): Promise<string | null> {
    const audioFiles = files.filter((file) => isAudioFile(file));
    if (audioFiles.length === 0) return '오디오 파일을 선택해 주세요.';

    for (const file of audioFiles) {
      const id = createId('file');
      await this.fileStore.putFile(id, file);
      this.tracks = [
        ...this.tracks,
        { id, name: file.name, kind: 'file' },
      ];
    }
    this.persistMeta();
    this.notify();
    if (this.enabled) await this.ensurePlaying();
    return null;
  }

  async removeTrack(id: string): Promise<void> {
    const index = this.tracks.findIndex((track) => track.id === id);
    if (index < 0) return;

    const track = this.tracks[index];
    this.tracks = this.tracks.filter((entry) => entry.id !== id);
    this.releaseObjectUrl(id);
    if (track.kind === 'file') {
      await this.fileStore.deleteFile(id);
    }

    if (this.tracks.length === 0) {
      this.currentIndex = 0;
      this.pauseInternal();
    } else if (index < this.currentIndex) {
      this.currentIndex -= 1;
    } else if (index === this.currentIndex) {
      this.currentIndex %= this.tracks.length;
      if (this.enabled) await this.playIndex(this.currentIndex);
      else this.pauseInternal();
    }

    this.persistMeta();
    this.notify();
  }

  async playNext(): Promise<void> {
    if (this.tracks.length === 0) return;
    this.currentIndex = (this.currentIndex + 1) % this.tracks.length;
    this.persistMeta();
    await this.playIndex(this.currentIndex);
    this.notify();
  }

  /** 사용자가 파일을 고를 수 있게 hidden input을 엽니다. */
  openFilePicker(): void {
    if (typeof document === 'undefined') return;
    const existing = document.getElementById('exgame-bgm-file-input');
    existing?.remove();

    const input = document.createElement('input');
    input.id = 'exgame-bgm-file-input';
    input.type = 'file';
    input.accept = 'audio/*,.mp3,.ogg,.wav,.m4a,.aac,.flac';
    input.multiple = true;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.top = '0';
    input.addEventListener('change', () => {
      const files = input.files ? Array.from(input.files) : [];
      void this.addFiles(files).finally(() => input.remove());
    });
    document.body.appendChild(input);
    // mousedown 제스처 안에서 동기 호출해야 브라우저가 허용합니다.
    input.click();
  }

  /** URL 입력을 위한 브라우저 prompt 대신 DOM 폼으로 받습니다. */
  promptAddUrl(): void {
    if (typeof document === 'undefined') return;
    document.getElementById('exgame-bgm-url-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'exgame-bgm-url-modal';
    modal.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:99999',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'background:rgba(0,0,0,0.55)',
      'font-family:sans-serif',
    ].join(';');

    const box = document.createElement('div');
    box.style.cssText = [
      'background:#1c2838',
      'color:#eef5ff',
      'padding:20px',
      'border-radius:12px',
      'width:min(480px,90vw)',
      'box-shadow:0 8px 28px rgba(0,0,0,0.45)',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = '배경음 URL 추가';
    title.style.cssText = 'font-size:18px;margin-bottom:12px;font-weight:600;';

    const input = document.createElement('input');
    input.type = 'url';
    input.placeholder = 'https://... 또는 ./audio/bgm.mp3';
    input.style.cssText = [
      'width:100%',
      'box-sizing:border-box',
      'padding:10px 12px',
      'border-radius:8px',
      'border:1px solid #5a7aa0',
      'background:#0f1622',
      'color:#fff',
      'font-size:14px',
      'margin-bottom:14px',
    ].join(';');

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;';

    const cancel = document.createElement('button');
    cancel.textContent = '취소';
    cancel.style.cssText = buttonStyle('#3a4a60');
    cancel.onclick = () => modal.remove();

    const ok = document.createElement('button');
    ok.textContent = '추가';
    ok.style.cssText = buttonStyle('#3f6f9f');
    ok.onclick = () => {
      const value = input.value;
      modal.remove();
      void this.addUrl(value);
    };

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') ok.click();
      if (event.key === 'Escape') cancel.click();
    });

    row.append(cancel, ok);
    box.append(title, input, row);
    modal.append(box);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.remove();
    });
    document.body.appendChild(modal);
    input.focus();
  }

  private bindUnlockGesture(): void {
    if (this.unlockBound || typeof window === 'undefined') return;
    this.unlockBound = true;
    const unlock = (): void => {
      this.unlocked = true;
      this.unlockBound = false;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      void this.ensurePlaying();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private async ensurePlaying(): Promise<void> {
    if (!this.enabled || this.tracks.length === 0) return;
    if (!this.unlocked) return;
    await this.playIndex(this.currentIndex);
  }

  private async playIndex(index: number): Promise<void> {
    if (this.starting) return;
    if (this.tracks.length === 0) return;
    const safeIndex = ((index % this.tracks.length) + this.tracks.length)
      % this.tracks.length;
    this.currentIndex = safeIndex;
    const track = this.tracks[safeIndex];
    const src = await this.resolveSource(track);
    if (!src) {
      console.warn('[ExGame] BGM source missing:', track.name);
      await this.skipBrokenTrack(safeIndex);
      return;
    }

    this.starting = true;
    try {
      this.disposeAudioElement();
      const audio = new Audio();
      audio.preload = 'auto';
      audio.loop = false;
      audio.volume = this.volume;
      audio.src = src;
      audio.onended = () => {
        void this.playNext();
      };
      audio.onerror = () => {
        console.warn('[ExGame] BGM play error:', track.name);
        void this.skipBrokenTrack(safeIndex);
      };
      this.audio = audio;
      try {
        await audio.play();
      } catch (error) {
        // 자동재생 차단 — 다음 제스처에서 재시도
        this.unlocked = false;
        this.bindUnlockGesture();
        console.warn('[ExGame] BGM autoplay blocked; waiting for gesture.', error);
      }
      this.persistMeta();
      this.notify();
    } finally {
      this.starting = false;
    }
  }

  private async skipBrokenTrack(failedIndex: number): Promise<void> {
    if (this.tracks.length <= 1) {
      this.pauseInternal();
      return;
    }
    this.currentIndex = (failedIndex + 1) % this.tracks.length;
    this.persistMeta();
    await this.playIndex(this.currentIndex);
  }

  private async resolveSource(track: BgmTrackMeta): Promise<string | null> {
    if (track.kind === 'url') return track.url ?? null;
    const cached = this.objectUrls.get(track.id);
    if (cached) return cached;
    const url = await this.fileStore.getObjectUrl(track.id);
    if (!url) return null;
    this.objectUrls.set(track.id, url);
    return url;
  }

  private pauseInternal(): void {
    if (!this.audio) return;
    this.audio.pause();
  }

  private disposeAudioElement(): void {
    if (!this.audio) return;
    this.audio.onended = null;
    this.audio.onerror = null;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.audio = null;
  }

  private releaseObjectUrl(id: string): void {
    const url = this.objectUrls.get(id);
    if (!url) return;
    URL.revokeObjectURL(url);
    this.objectUrls.delete(id);
  }

  private loadMeta(): void {
    try {
      const raw = localStorage.getItem(META_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<BgmPlaylistSnapshot>;
      this.enabled = parsed.enabled !== false;
      this.volume = typeof parsed.volume === 'number'
        ? clamp(parsed.volume, 0, 1)
        : DEFAULT_BGM_VOLUME;
      this.tracks = Array.isArray(parsed.tracks)
        ? parsed.tracks.filter(isTrackMeta)
        : [];
      this.currentIndex = typeof parsed.currentIndex === 'number'
        ? Math.max(0, Math.floor(parsed.currentIndex))
        : 0;
      if (this.tracks.length > 0) {
        this.currentIndex %= this.tracks.length;
      } else {
        this.currentIndex = 0;
      }
    } catch {
      this.tracks = [];
      this.currentIndex = 0;
      this.volume = DEFAULT_BGM_VOLUME;
      this.enabled = true;
    }
  }

  private persistMeta(): void {
    const snapshot: BgmPlaylistSnapshot = this.getSnapshot();
    localStorage.setItem(META_STORAGE_KEY, JSON.stringify(snapshot));
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}

function isAudioFile(file: File): boolean {
  if (file.type.startsWith('audio/')) return true;
  return /\.(mp3|ogg|wav|m4a|aac|flac)$/i.test(file.name);
}

function isTrackMeta(value: unknown): value is BgmTrackMeta {
  if (!value || typeof value !== 'object') return false;
  const track = value as Partial<BgmTrackMeta>;
  return typeof track.id === 'string'
    && typeof track.name === 'string'
    && (track.kind === 'url' || track.kind === 'file');
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buttonStyle(background: string): string {
  return [
    `background:${background}`,
    'color:#fff',
    'border:none',
    'border-radius:8px',
    'padding:8px 16px',
    'font-size:14px',
    'cursor:pointer',
  ].join(';');
}
