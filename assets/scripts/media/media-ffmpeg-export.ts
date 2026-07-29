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
  onProgress?: (message: string) => void,
): Promise<{ blob: Blob; savedPath: string | null }> {
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

  onProgress?.('미디어 준비 중…');
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

  onProgress?.('로컬 ffmpeg Export 중… (길면 수 분 걸릴 수 있음)');
  const controller = new AbortController();
  const timeoutMs = Math.max(120_000, Math.ceil(snapshot.masterDurationSec) * 4000);
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch('/api/media-export', {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Export 시간 초과 (${Math.round(timeoutMs / 1000)}초). 타임라인이 길면 해상도/길이를 줄여 보세요.`);
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }

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
  const savedPath = response.headers.get('X-ExGame-Export-Path');
  const blob = await response.blob();
  if (!blob || blob.size < 32) {
    throw new Error('Export 결과가 비어 있습니다. (ffmpeg 실패 가능)');
  }
  return { blob, savedPath };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 2000);
}

/** File System Access API 가 있으면 저장 위치를 사용자가 고르게 합니다. */
export async function saveBlobWithPicker(blob: Blob, filename: string): Promise<string | null> {
  const w = window as Window & {
    showSaveFilePicker?: (options: unknown) => Promise<{
      createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
      name: string;
    }>;
  };
  if (typeof w.showSaveFilePicker !== 'function') return null;
  try {
    const handle = await w.showSaveFilePicker({
      suggestedName: filename,
      types: [
        {
          description: 'MP4 Video',
          accept: { 'video/mp4': ['.mp4'] },
        },
      ],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return handle.name || filename;
  } catch (error) {
    // user cancel
    if (error instanceof DOMException && error.name === 'AbortError') {
      return null;
    }
    throw error;
  }
}
