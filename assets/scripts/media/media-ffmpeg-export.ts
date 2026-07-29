/**
 * Media Editor → 로컬 Python 서버(/api/media-export) Export 클라이언트.
 * 원본 파일은 수정하지 않고, 업로드 사본으로 새 MP4만 생성합니다.
 */
import {
  TRACK_KIND_IMAGE,
  TRACK_KIND_VIDEO,
  type MediaTimelineSnapshot,
  type TimelineClip,
} from './media-timeline-types';

export type ExportResolution = '1280x720' | '1920x1080';
export type ExportFps = 30 | 60;

export interface MediaExportOptions {
  resolution: ExportResolution;
  fps: ExportFps;
}

export interface MediaExportStatus {
  ok: boolean;
  ready: boolean;
  ffmpeg: string | null;
}

function clipPayload(clip: TimelineClip) {
  return {
    assetId: clip.assetId,
    startSec: clip.startSec,
    durationSec: clip.durationSec,
    loop: clip.loop,
    scale: clip.scale,
    opacity: clip.opacity,
    fadeInSec: clip.fadeInSec,
    fadeOutSec: clip.fadeOutSec,
  };
}

async function blobFromObjectUrl(objectUrl: string): Promise<Blob> {
  const response = await fetch(objectUrl);
  if (!response.ok) throw new Error('미디어 blob을 읽지 못했습니다.');
  return response.blob();
}

export async function fetchExportStatus(): Promise<MediaExportStatus> {
  try {
    const response = await fetch('/api/media-export/status', { method: 'GET' });
    if (!response.ok) {
      return { ok: false, ready: false, ffmpeg: null };
    }
    const data = (await response.json()) as MediaExportStatus;
    return {
      ok: !!data.ok,
      ready: !!data.ready,
      ffmpeg: data.ffmpeg ?? null,
    };
  } catch {
    return { ok: false, ready: false, ffmpeg: null };
  }
}

/**
 * 타임라인 스냅샷을 multipart로 보내 최종 MP4 Blob을 받습니다.
 */
export async function exportTimelineMp4(
  snapshot: MediaTimelineSnapshot,
  options: MediaExportOptions,
): Promise<Blob> {
  if (!snapshot.masterAudio || snapshot.masterDurationSec <= 0) {
    throw new Error('먼저 MP3(Master Timeline)를 로드하세요.');
  }

  const videoTrack = snapshot.tracks.find((track) => track.kind === TRACK_KIND_VIDEO);
  const imageTrack = snapshot.tracks.find((track) => track.kind === TRACK_KIND_IMAGE);
  const videoClips = snapshot.clips.filter((clip) => clip.trackId === videoTrack?.id);
  const imageClips = snapshot.clips.filter((clip) => clip.trackId === imageTrack?.id);

  const job = {
    resolution: options.resolution,
    fps: options.fps,
    masterDurationSec: snapshot.masterDurationSec,
    audioAssetId: snapshot.masterAudio.id,
    videoClips: videoClips.map(clipPayload),
    imageClips: imageClips.map(clipPayload),
    qualityNote: 'PNG 기준(알파 유지 시도), PNG 없으면 MP4 기준',
  };

  const form = new FormData();
  form.append('job', JSON.stringify(job));

  const audioBlob = await blobFromObjectUrl(snapshot.masterAudio.objectUrl);
  form.append(
    `file_${snapshot.masterAudio.id}`,
    audioBlob,
    snapshot.masterAudio.name || 'master.mp3',
  );

  const needed = new Set<string>();
  for (const clip of [...videoClips, ...imageClips]) needed.add(clip.assetId);
  for (const assetId of needed) {
    const asset = snapshot.assets.find((entry) => entry.id === assetId);
    if (!asset) throw new Error(`에셋 없음: ${assetId}`);
    const blob = await blobFromObjectUrl(asset.objectUrl);
    form.append(`file_${asset.id}`, blob, asset.name || asset.id);
  }

  const response = await fetch('/api/media-export', {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    let detail = `Export 실패 (${response.status})`;
    try {
      const err = (await response.json()) as { error?: string };
      if (err.error) detail = err.error;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }

  const contentType = response.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) {
    const err = (await response.json()) as { error?: string };
    throw new Error(err.error || 'Export 실패');
  }
  return response.blob();
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
