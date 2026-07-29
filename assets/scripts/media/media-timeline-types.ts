/**
 * Media Timeline Editor — 프로젝트/클립 타입.
 * Track kind는 1차에 audio/video/image만 쓰지만, 이후 확장을 위해 하드코딩하지 않는다.
 */

export type MediaAssetKind = 'audio' | 'video' | 'image';

/** 1차 지원 + 향후 LYRIC/TEXT/SUBTITLE/FX 등 확장용 */
export type MediaTrackKind = string;

export const TRACK_KIND_AUDIO = 'audio';
export const TRACK_KIND_VIDEO = 'video';
export const TRACK_KIND_IMAGE = 'image';

export interface MediaAssetRef {
  readonly id: string;
  readonly kind: MediaAssetKind;
  readonly name: string;
  readonly mimeType: string;
  /** object URL — revoke when disposed */
  readonly objectUrl: string;
  /** 초 단위. 오디오/비디오 duration, 이미지는 0 */
  readonly durationSec: number;
}

export interface MediaTrack {
  readonly id: string;
  readonly kind: MediaTrackKind;
  readonly label: string;
}

/**
 * VIDEO / IMAGE 트랙의 클립.
 * 원본 파일은 수정하지 않고 parameter만 둔다.
 */
export interface TimelineClip {
  readonly id: string;
  readonly trackId: string;
  readonly assetId: string;
  /** Master Timeline 상 시작(초) */
  startSec: number;
  /** Timeline 상 표시 길이(초). VIDEO는 원본보다 길면 loop */
  durationSec: number;
  loop: boolean;
  scale: number;
  opacity: number;
  fadeInSec: number;
  fadeOutSec: number;
}

/** @deprecated VideoClip → TimelineClip 로 통합. 호환용 별칭 */
export type VideoClip = TimelineClip;

export interface MediaTimelineSnapshot {
  readonly masterDurationSec: number;
  readonly masterAudio: MediaAssetRef | null;
  readonly assets: ReadonlyArray<MediaAssetRef>;
  readonly tracks: ReadonlyArray<MediaTrack>;
  readonly clips: ReadonlyArray<TimelineClip>;
  readonly selectedClipId: string | null;
  readonly workFolderLabel: string | null;
  /** 하위 호환: video 트랙 클립만 */
  readonly videoClips: ReadonlyArray<TimelineClip>;
}

export const DEFAULT_FADE_ADJACENT_SEC = 0.3;
export const MIN_CLIP_DURATION_SEC = 0.05;

export function formatTimelineTime(totalSec: number): string {
  const safe = Math.max(0, totalSec);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = Math.floor(safe % 60);
  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0'),
  ].join(':');
}

export function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
