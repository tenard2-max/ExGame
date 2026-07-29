/**
 * Media Timeline Editor 프로젝트 상태.
 * Master Timeline 길이는 로드된 MP3 duration 과 동일합니다.
 */
import {
  applyAdjacentFades,
  createDefaultTracks,
  packSequential,
  rebalanceTrackEqual,
  resizeClipOnTrack,
  trackIdForAssetKind,
} from './media-timeline-layout';
import {
  createId,
  type MediaAssetRef,
  type MediaTimelineSnapshot,
  type MediaTrack,
  type TimelineClip,
} from './media-timeline-types';

export type MediaProjectListener = (snapshot: MediaTimelineSnapshot) => void;

export class MediaTimelineProject {
  private masterAudio: MediaAssetRef | null = null;
  private readonly assets = new Map<string, MediaAssetRef>();
  private readonly tracks: MediaTrack[] = createDefaultTracks();
  private readonly clips: TimelineClip[] = [];
  private selectedClipId: string | null = null;
  private workFolderLabel: string | null = null;
  private readonly listeners = new Set<MediaProjectListener>();

  addListener(listener: MediaProjectListener): void {
    this.listeners.add(listener);
  }

  removeListener(listener: MediaProjectListener): void {
    this.listeners.delete(listener);
  }

  getSnapshot(): MediaTimelineSnapshot {
    const videoTrackId = this.tracks.find((track) => track.kind === 'video')?.id;
    return {
      masterDurationSec: this.masterAudio?.durationSec ?? 0,
      masterAudio: this.masterAudio,
      assets: Array.from(this.assets.values()),
      tracks: this.tracks.map((track) => ({ ...track })),
      clips: this.clips.map((clip) => ({ ...clip })),
      selectedClipId: this.selectedClipId,
      workFolderLabel: this.workFolderLabel,
      videoClips: this.clips
        .filter((clip) => clip.trackId === videoTrackId)
        .map((clip) => ({ ...clip })),
    };
  }

  getAsset(assetId: string): MediaAssetRef | undefined {
    return this.assets.get(assetId);
  }

  getClip(clipId: string): TimelineClip | undefined {
    return this.clips.find((clip) => clip.id === clipId);
  }

  /** MP3를 Master Audio 로 설정. 이전 마스터 URL 은 revoke. */
  setMasterAudio(file: File, durationSec: number, objectUrl: string): MediaAssetRef {
    if (this.masterAudio) {
      URL.revokeObjectURL(this.masterAudio.objectUrl);
      this.assets.delete(this.masterAudio.id);
    }
    const asset: MediaAssetRef = {
      id: createId('aud'),
      kind: 'audio',
      name: file.name,
      mimeType: file.type || 'audio/mpeg',
      objectUrl,
      durationSec,
    };
    this.masterAudio = asset;
    this.assets.set(asset.id, asset);
    this.rebalanceAllVisualTracks();
    this.emit();
    return asset;
  }

  setWorkFolderLabel(label: string | null): void {
    this.workFolderLabel = label;
    this.emit();
  }

  registerFileAsset(
    file: File,
    kind: MediaAssetRef['kind'],
    objectUrl: string,
    durationSec: number,
  ): MediaAssetRef {
    const asset: MediaAssetRef = {
      id: createId(kind === 'video' ? 'vid' : kind === 'image' ? 'img' : 'aud'),
      kind,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      objectUrl,
      durationSec,
    };
    this.assets.set(asset.id, asset);
    this.emit();
    return asset;
  }

  listLibraryAssets(): ReadonlyArray<MediaAssetRef> {
    return Array.from(this.assets.values()).filter(
      (asset) => asset.id !== this.masterAudio?.id,
    );
  }

  /** 라이브러리 에셋을 VIDEO/IMAGE 트랙에 추가 후 해당 트랙 균등 재배치. */
  addClipFromAsset(assetId: string): TimelineClip | null {
    const asset = this.assets.get(assetId);
    if (!asset || (asset.kind !== 'video' && asset.kind !== 'image')) return null;
    const master = this.masterAudio?.durationSec ?? 0;
    if (master <= 0) return null;

    const trackId = trackIdForAssetKind(this.tracks, asset.kind);
    if (!trackId) return null;

    const clip: TimelineClip = {
      id: createId('clip'),
      trackId,
      assetId: asset.id,
      startSec: 0,
      durationSec: master,
      loop: asset.kind === 'video',
      scale: 1,
      opacity: 1,
      fadeInSec: 0,
      fadeOutSec: 0,
    };
    this.clips.push(clip);
    rebalanceTrackEqual(this.clips, trackId, master, this.assets);
    this.selectedClipId = clip.id;
    this.emit();
    return clip;
  }

  selectClip(clipId: string | null): void {
    this.selectedClipId = clipId;
    this.emit();
  }

  removeClip(clipId: string): boolean {
    const index = this.clips.findIndex((clip) => clip.id === clipId);
    if (index < 0) return false;
    const trackId = this.clips[index].trackId;
    this.clips.splice(index, 1);
    if (this.selectedClipId === clipId) this.selectedClipId = null;
    const master = this.masterAudio?.durationSec ?? 0;
    if (master > 0) {
      rebalanceTrackEqual(this.clips, trackId, master, this.assets);
    }
    this.emit();
    return true;
  }

  duplicateClip(clipId: string): TimelineClip | null {
    const source = this.clips.find((clip) => clip.id === clipId);
    if (!source) return null;
    const master = this.masterAudio?.durationSec ?? 0;
    if (master <= 0) return null;

    const copy: TimelineClip = {
      ...source,
      id: createId('clip'),
    };
    const insertAt = this.clips.findIndex((clip) => clip.id === clipId) + 1;
    this.clips.splice(insertAt, 0, copy);
    rebalanceTrackEqual(this.clips, source.trackId, master, this.assets);
    this.selectedClipId = copy.id;
    this.emit();
    return copy;
  }

  resizeClip(clipId: string, newDurationSec: number): boolean {
    const clip = this.clips.find((entry) => entry.id === clipId);
    if (!clip) return false;
    const master = this.masterAudio?.durationSec ?? 0;
    const ok = resizeClipOnTrack(
      this.clips,
      clip.trackId,
      clipId,
      newDurationSec,
      master,
      this.assets,
    );
    if (ok) this.emit();
    return ok;
  }

  updateClipParams(
    clipId: string,
    patch: Partial<Pick<TimelineClip, 'scale' | 'opacity'>>,
  ): boolean {
    const clip = this.clips.find((entry) => entry.id === clipId);
    if (!clip) return false;
    if (patch.scale !== undefined) {
      clip.scale = Math.min(4, Math.max(0.05, patch.scale));
    }
    if (patch.opacity !== undefined) {
      clip.opacity = Math.min(1, Math.max(0, patch.opacity));
    }
    this.emit();
    return true;
  }

  /**
   * 같은 트랙 내 순서만 변경. duration은 유지하고 순차 pack(균등 재배치하지 않음).
   * toIndex: 이동 후 트랙 내 목표 인덱스(0-based).
   */
  reorderClip(clipId: string, toIndex: number): boolean {
    const trackId = this.clips.find((entry) => entry.id === clipId)?.trackId;
    if (!trackId) return false;

    const trackIndices: number[] = [];
    for (let i = 0; i < this.clips.length; i += 1) {
      if (this.clips[i].trackId === trackId) trackIndices.push(i);
    }
    const fromTrackPos = trackIndices.findIndex(
      (globalIndex) => this.clips[globalIndex].id === clipId,
    );
    if (fromTrackPos < 0) return false;
    const bounded = Math.max(0, Math.min(toIndex, trackIndices.length - 1));
    if (fromTrackPos === bounded) {
      this.selectedClipId = clipId;
      this.emit();
      return false;
    }

    const globalFrom = trackIndices[fromTrackPos];
    const [clip] = this.clips.splice(globalFrom, 1);
    // splice 후 트랙 인덱스 재계산
    const afterIndices: number[] = [];
    for (let i = 0; i < this.clips.length; i += 1) {
      if (this.clips[i].trackId === trackId) afterIndices.push(i);
    }
    const insertGlobal =
      bounded >= afterIndices.length
        ? this.clips.length
        : afterIndices[bounded];
    this.clips.splice(insertGlobal, 0, clip);

    const trackClips = this.clips.filter((entry) => entry.trackId === trackId);
    packSequential(trackClips);
    applyAdjacentFades(trackClips);
    this.selectedClipId = clip.id;
    this.emit();
    return true;
  }

  clearLibraryAssets(): void {
    for (const asset of this.assets.values()) {
      if (asset.id === this.masterAudio?.id) continue;
      URL.revokeObjectURL(asset.objectUrl);
      this.assets.delete(asset.id);
    }
    this.clips.length = 0;
    this.selectedClipId = null;
    this.emit();
  }

  dispose(): void {
    for (const asset of this.assets.values()) {
      URL.revokeObjectURL(asset.objectUrl);
    }
    this.assets.clear();
    this.clips.length = 0;
    this.selectedClipId = null;
    this.masterAudio = null;
    this.workFolderLabel = null;
    this.emit();
  }

  private rebalanceAllVisualTracks(): void {
    const master = this.masterAudio?.durationSec ?? 0;
    if (master <= 0) return;
    for (const track of this.tracks) {
      if (track.kind === 'video' || track.kind === 'image') {
        rebalanceTrackEqual(this.clips, track.id, master, this.assets);
      }
    }
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

/** File → HTMLMediaElement 로 duration(초) 측정. */
export function probeMediaDuration(objectUrl: string, isVideo: boolean): Promise<number> {
  return new Promise((resolve, reject) => {
    const el = document.createElement(isVideo ? 'video' : 'audio');
    el.preload = 'metadata';
    const cleanup = (): void => {
      el.removeAttribute('src');
      el.load();
    };
    el.onloadedmetadata = () => {
      const duration = Number.isFinite(el.duration) ? el.duration : 0;
      cleanup();
      resolve(Math.max(0, duration));
    };
    el.onerror = () => {
      cleanup();
      reject(new Error('미디어 길이를 읽을 수 없습니다.'));
    };
    el.src = objectUrl;
  });
}
