/**
 * 타임라인 클립 배치·리사이즈·맞닿는 Fade 규칙.
 *
 * - MP4/PNG는 같은 시간대에 겹치지 않음 (공유 시퀀스로 순차 배치).
 * - 균등 재배치: VIDEO+IMAGE 전체 N등분.
 * - 리사이즈: 대상만 늘림 · 다른 MP4 길이 유지 · 나머지 PNG 균등.
 */
import {
  DEFAULT_FADE_ADJACENT_SEC,
  MIN_CLIP_DURATION_SEC,
  TRACK_KIND_IMAGE,
  TRACK_KIND_VIDEO,
  type MediaAssetRef,
  type MediaTrack,
  type TimelineClip,
} from './media-timeline-types';

export function createDefaultTracks(): MediaTrack[] {
  return [
    { id: 'track_audio', kind: 'audio', label: 'AUDIO' },
    { id: 'track_video', kind: TRACK_KIND_VIDEO, label: 'VIDEO' },
    { id: 'track_image', kind: TRACK_KIND_IMAGE, label: 'IMAGE' },
  ];
}

export function trackIdForAssetKind(
  tracks: ReadonlyArray<MediaTrack>,
  kind: MediaAssetRef['kind'],
): string | null {
  if (kind === 'video') {
    return tracks.find((track) => track.kind === TRACK_KIND_VIDEO)?.id ?? null;
  }
  if (kind === 'image') {
    return tracks.find((track) => track.kind === TRACK_KIND_IMAGE)?.id ?? null;
  }
  return null;
}

export function isVisualTrackKind(kind: string): boolean {
  return kind === TRACK_KIND_VIDEO || kind === TRACK_KIND_IMAGE;
}

/** clips 배열 순서를 유지한 VIDEO+IMAGE 클립 목록. */
export function listVisualClips(
  clips: ReadonlyArray<TimelineClip>,
  tracks: ReadonlyArray<MediaTrack>,
): TimelineClip[] {
  const visualIds = new Set(
    tracks.filter((track) => isVisualTrackKind(track.kind)).map((track) => track.id),
  );
  return clips.filter((clip) => visualIds.has(clip.trackId));
}

/** MP4+PNG 전체를 Master 길이로 균등 재배치 (시간 겹침 없음). */
export function rebalanceVisualEqual(
  clips: TimelineClip[],
  tracks: ReadonlyArray<MediaTrack>,
  masterDurationSec: number,
  assets: ReadonlyMap<string, MediaAssetRef>,
): void {
  const visual = listVisualClips(clips, tracks);
  if (visual.length === 0 || masterDurationSec <= 0) return;

  const each = masterDurationSec / visual.length;
  let cursor = 0;
  for (const clip of visual) {
    clip.startSec = cursor;
    clip.durationSec = each;
    const asset = assets.get(clip.assetId);
    clip.loop = asset?.kind === 'video' && each > (asset.durationSec || 0) + 1e-6;
    cursor += each;
  }
  applyAdjacentFades(visual);
}

/**
 * 공유 시퀀스에서 리사이즈.
 * 다른 MP4 길이는 유지, 나머지 PNG만 남은 시간을 균등 분할.
 */
export function resizeVisualClip(
  clips: TimelineClip[],
  tracks: ReadonlyArray<MediaTrack>,
  clipId: string,
  newDurationSec: number,
  masterDurationSec: number,
  assets: ReadonlyMap<string, MediaAssetRef>,
): boolean {
  const visual = listVisualClips(clips, tracks);
  const target = visual.find((clip) => clip.id === clipId);
  if (!target || masterDurationSec <= 0) return false;

  const desired = clamp(
    newDurationSec,
    MIN_CLIP_DURATION_SEC,
    masterDurationSec - MIN_CLIP_DURATION_SEC * Math.max(0, visual.length - 1),
  );

  const fixedOthers = visual.filter((clip) => {
    if (clip.id === clipId) return false;
    return assets.get(clip.assetId)?.kind === 'video';
  });
  const flexibleOthers = visual.filter((clip) => {
    if (clip.id === clipId) return false;
    return assets.get(clip.assetId)?.kind !== 'video';
  });

  const fixedSum = fixedOthers.reduce((sum, clip) => sum + clip.durationSec, 0);
  const maxTarget = Math.max(
    MIN_CLIP_DURATION_SEC,
    masterDurationSec - fixedSum - MIN_CLIP_DURATION_SEC * flexibleOthers.length,
  );
  target.durationSec = Math.min(desired, maxTarget);

  const remain = Math.max(0, masterDurationSec - fixedSum - target.durationSec);
  if (flexibleOthers.length > 0) {
    const each = remain / flexibleOthers.length;
    for (const clip of flexibleOthers) {
      clip.durationSec = Math.max(MIN_CLIP_DURATION_SEC, each);
    }
  }

  const asset = assets.get(target.assetId);
  if (asset?.kind === 'video') {
    target.loop = target.durationSec > (asset.durationSec || 0) + 1e-6;
  }

  packSequential(visual);
  applyAdjacentFades(visual);
  return true;
}

/** 순서를 유지한 채 startSec만 다시 붙인다. */
export function packSequential(orderedClips: TimelineClip[]): void {
  let cursor = 0;
  for (const clip of orderedClips) {
    clip.startSec = cursor;
    cursor += clip.durationSec;
  }
}

/** 맞닿는(거의 인접) 경계에만 짧은 Fade In/Out. */
export function applyAdjacentFades(
  orderedClips: TimelineClip[],
  fadeSec = DEFAULT_FADE_ADJACENT_SEC,
): void {
  for (const clip of orderedClips) {
    clip.fadeInSec = 0;
    clip.fadeOutSec = 0;
  }
  for (let i = 0; i < orderedClips.length; i += 1) {
    const left = orderedClips[i];
    const right = orderedClips[i + 1];
    if (!right) continue;
    const gap = right.startSec - (left.startSec + left.durationSec);
    if (Math.abs(gap) > 1e-3) continue;
    const amount = Math.min(
      fadeSec,
      left.durationSec / 2,
      right.durationSec / 2,
    );
    if (amount <= 0) continue;
    left.fadeOutSec = amount;
    right.fadeInSec = amount;
  }
}

export function findClipAtTime(
  clips: ReadonlyArray<TimelineClip>,
  trackId: string,
  timeSec: number,
): TimelineClip | null {
  for (const clip of clips) {
    if (clip.trackId !== trackId) continue;
    if (timeSec >= clip.startSec && timeSec < clip.startSec + clip.durationSec) {
      return clip;
    }
  }
  return null;
}

/** @deprecated 트랙 단독 균등 — 공유 시퀀스 rebalanceVisualEqual 사용 */
export function rebalanceTrackEqual(
  clips: TimelineClip[],
  trackId: string,
  masterDurationSec: number,
  assets: ReadonlyMap<string, MediaAssetRef>,
): void {
  const trackClips = clips.filter((clip) => clip.trackId === trackId);
  if (trackClips.length === 0 || masterDurationSec <= 0) return;
  const each = masterDurationSec / trackClips.length;
  let cursor = 0;
  for (const clip of trackClips) {
    clip.startSec = cursor;
    clip.durationSec = each;
    const asset = assets.get(clip.assetId);
    clip.loop = asset?.kind === 'video' && each > (asset.durationSec || 0) + 1e-6;
    cursor += each;
  }
  applyAdjacentFades(trackClips);
}

/** @deprecated resizeVisualClip 사용 */
export function resizeClipOnTrack(
  clips: TimelineClip[],
  trackId: string,
  clipId: string,
  newDurationSec: number,
  masterDurationSec: number,
  assets: ReadonlyMap<string, MediaAssetRef>,
): boolean {
  const tracks: MediaTrack[] = [
    { id: trackId, kind: TRACK_KIND_VIDEO, label: 'VIDEO' },
    { id: 'track_image', kind: TRACK_KIND_IMAGE, label: 'IMAGE' },
  ];
  // Only operate on the given track for backward compat
  const isolated = clips.filter((clip) => clip.trackId === trackId);
  const others = clips.filter((clip) => clip.trackId !== trackId);
  const ok = resizeVisualClip(
    [...isolated],
    tracks.filter((track) => track.id === trackId),
    clipId,
    newDurationSec,
    masterDurationSec,
    assets,
  );
  if (!ok) return false;
  // write back starts into original refs (isolated are same refs)
  void others;
  return true;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
