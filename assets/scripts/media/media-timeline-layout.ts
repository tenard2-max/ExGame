/**
 * 타임라인 클립 배치·리사이즈·맞닿는 Fade 규칙.
 *
 * - 균등 재배치: 트랙 내 클립을 Master 길이를 N등분.
 * - 리사이즈: 대상 클립만 늘림.
 *   · VIDEO(MP4) 다른 클립은 길이 유지.
 *   · IMAGE(PNG) 나머지끼리 남은 시간을 균등 분할.
 * - 겹침 없음(순차 pack).
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

/** 트랙 클립을 Master 길이로 균등 재배치 + 맞닿는 Fade. */
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

/**
 * 섹터 좌우 드래그로 duration 변경.
 * MP4(VIDEO 트랙) 다른 항목 길이는 고정, PNG만 남은 시간 균등.
 * IMAGE 트랙은 전부 PNG이므로 대상 제외 나머지가 균등.
 */
export function resizeClipOnTrack(
  clips: TimelineClip[],
  trackId: string,
  clipId: string,
  newDurationSec: number,
  masterDurationSec: number,
  assets: ReadonlyMap<string, MediaAssetRef>,
): boolean {
  const trackClips = clips.filter((clip) => clip.trackId === trackId);
  const target = trackClips.find((clip) => clip.id === clipId);
  if (!target || masterDurationSec <= 0) return false;

  const track = trackClips;
  const isVideoTrack = track.every((clip) => {
    const asset = assets.get(clip.assetId);
    return asset?.kind === 'video';
  });

  const desired = clamp(
    newDurationSec,
    MIN_CLIP_DURATION_SEC,
    masterDurationSec - MIN_CLIP_DURATION_SEC * Math.max(0, track.length - 1),
  );

  if (isVideoTrack) {
    const othersFixed = track
      .filter((clip) => clip.id !== clipId)
      .reduce((sum, clip) => sum + clip.durationSec, 0);
    const maxForTarget = Math.max(
      MIN_CLIP_DURATION_SEC,
      masterDurationSec - othersFixed,
    );
    target.durationSec = Math.min(desired, maxForTarget);
    const asset = assets.get(target.assetId);
    target.loop =
      !!asset && target.durationSec > (asset.durationSec || 0) + 1e-6;
    packSequential(track);
    applyAdjacentFades(track);
    return true;
  }

  // IMAGE 트랙 또는 혼합 시: VIDEO(MP4)는 고정, PNG만 재분배
  const fixedOthers = track.filter((clip) => {
    if (clip.id === clipId) return false;
    const asset = assets.get(clip.assetId);
    return asset?.kind === 'video';
  });
  const flexibleOthers = track.filter((clip) => {
    if (clip.id === clipId) return false;
    const asset = assets.get(clip.assetId);
    return asset?.kind !== 'video';
  });

  const fixedSum = fixedOthers.reduce((sum, clip) => sum + clip.durationSec, 0);
  const maxTarget = Math.max(
    MIN_CLIP_DURATION_SEC,
    masterDurationSec - fixedSum - MIN_CLIP_DURATION_SEC * flexibleOthers.length,
  );
  target.durationSec = Math.min(desired, maxTarget);

  const remain = Math.max(
    0,
    masterDurationSec - fixedSum - target.durationSec,
  );
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

  packSequential(track);
  applyAdjacentFades(track);
  return true;
}

/** 트랙 내 순서를 유지한 채 startSec만 다시 붙인다. */
export function packSequential(trackClips: TimelineClip[]): void {
  let cursor = 0;
  for (const clip of trackClips) {
    clip.startSec = cursor;
    cursor += clip.durationSec;
  }
}

/** 맞닿는(거의 인접) 경계에만 짧은 Fade In/Out. */
export function applyAdjacentFades(
  trackClips: TimelineClip[],
  fadeSec = DEFAULT_FADE_ADJACENT_SEC,
): void {
  for (const clip of trackClips) {
    clip.fadeInSec = 0;
    clip.fadeOutSec = 0;
  }
  for (let i = 0; i < trackClips.length; i += 1) {
    const left = trackClips[i];
    const right = trackClips[i + 1];
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
