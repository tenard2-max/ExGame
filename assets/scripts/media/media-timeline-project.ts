/**
 * Media Timeline Editor 프로젝트 상태.
 * Master Timeline 길이는 로드된 MP3 duration 과 동일합니다.
 * MP4/PNG는 공유 시퀀스로 배치되어 같은 시간에 겹치지 않습니다.
 */
import {
  applyAdjacentFades,
  createDefaultTracks,
  listVisualClips,
  packSequential,
  rebalanceVisualEqual,
  resizeVisualClip,
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
      file,
    };
    this.masterAudio = asset;
    this.assets.set(asset.id, asset);
    this.rebalanceAllVisual();
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
      file,
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

  /**
   * VIDEO/IMAGE 클립 추가 후 MP4+PNG 전체를 균등 재배치.
   * 같은 시간대에 MP4와 PNG가 겹치지 않는다.
   */
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
    this.rebalanceAllVisual();
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
    this.clips.splice(index, 1);
    if (this.selectedClipId === clipId) this.selectedClipId = null;
    this.rebalanceAllVisual();
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
    this.rebalanceAllVisual();
    this.selectedClipId = copy.id;
    this.emit();
    return copy;
  }

  resizeClip(clipId: string, newDurationSec: number): boolean {
    const master = this.masterAudio?.durationSec ?? 0;
    const ok = resizeVisualClip(
      this.clips,
      this.tracks,
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
   * MP4+PNG 공유 시퀀스에서 순서 변경. duration 유지 후 순차 pack.
   */
  reorderClip(clipId: string, toIndex: number): boolean {
    const visual = listVisualClips(this.clips, this.tracks);
    const fromPos = visual.findIndex((clip) => clip.id === clipId);
    if (fromPos < 0) return false;
    const bounded = Math.max(0, Math.min(toIndex, visual.length - 1));
    if (fromPos === bounded) {
      this.selectedClipId = clipId;
      this.emit();
      return false;
    }

    const visualIds = new Set(visual.map((clip) => clip.id));
    const globalFrom = this.clips.findIndex((clip) => clip.id === clipId);
    const [moved] = this.clips.splice(globalFrom, 1);

    const remainingVisualGlobals: number[] = [];
    for (let i = 0; i < this.clips.length; i += 1) {
      if (visualIds.has(this.clips[i].id)) {
        remainingVisualGlobals.push(i);
      }
    }
    const insertGlobal =
      bounded >= remainingVisualGlobals.length
        ? this.clips.length
        : remainingVisualGlobals[bounded];
    this.clips.splice(insertGlobal, 0, moved);

    const ordered = listVisualClips(this.clips, this.tracks);
    packSequential(ordered);
    applyAdjacentFades(ordered);
    this.selectedClipId = moved.id;
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

  private rebalanceAllVisual(): void {
    const master = this.masterAudio?.durationSec ?? 0;
    if (master <= 0) return;
    rebalanceVisualEqual(this.clips, this.tracks, master, this.assets);
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

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
