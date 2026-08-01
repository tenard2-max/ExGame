/**
 * Media Editor → 로컬 Python 서버(/api/media-export) Export 클라이언트.
 * 원본 파일은 수정하지 않고, 업로드 사본으로 새 MP4만 생성합니다.
 * Export는 비동기 job + 진행률 폴링으로 UI가 멈추지 않게 합니다.
 */
import {
  TRACK_KIND_IMAGE,
  TRACK_KIND_VIDEO,
  type MediaAssetRef,
  type MediaTimelineSnapshot,
  type TimelineClip,
} from './media-timeline-types';

export type ExportResolution = '1280x720' | '1920x1080' | '720x1280';
export type ExportFps = 30 | 60;

export interface MediaExportOptions {
  resolution: ExportResolution;
  fps: ExportFps;
  /** MP4 전역 재생 속도 (0.2 ~ 1.0). PNG/오디오에는 영향 없음 */
  videoSpeed: number;
}

export interface MediaExportStatus {
  ok: boolean;
  ready: boolean;
  ffmpeg: string | null;
}

interface ExportJobStatus {
  ok: boolean;
  id?: string;
  state?: 'queued' | 'running' | 'done' | 'error' | string;
  progress?: number;
  message?: string;
  path?: string | null;
  bytes?: number | null;
  error?: string | null;
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

async function mediaBlob(asset: MediaAssetRef): Promise<Blob> {
  if (asset.file && asset.file.size > 0) {
    return asset.file;
  }
  try {
    const response = await fetch(asset.objectUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const blob = await response.blob();
    if (!blob || blob.size < 1) {
      throw new Error('empty blob');
    }
    return blob;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `미디어를 읽을 수 없습니다: ${asset.name} (${detail}). 파일을 다시 드롭한 뒤 Export 하세요.`,
    );
  }
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

function mapFetchError(error: unknown, timeoutMs: number): Error {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new Error(
      `Export 시간 초과 (${Math.round(timeoutMs / 1000)}초). 해상도/길이를 줄이거나 서버를 재시작하세요.`,
    );
  }
  const raw = error instanceof Error ? error.message : String(error);
  if (/failed to fetch/i.test(raw) || /networkerror/i.test(raw)) {
    return new Error(
      '서버 연결이 끊겼습니다 (Failed to fetch).\n' +
        '1) auto-run 서버 창이 열려 있는지 확인\n' +
        '2) 미디어를 다시 드롭한 뒤 Export\n' +
        '3) 서버 창 오류 메시지를 확인해 주세요',
    );
  }
  return error instanceof Error ? error : new Error(raw);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function pollExportJob(
  jobId: string,
  timeoutMs: number,
  onProgress?: (message: string, progress: number) => void,
): Promise<{ path: string; bytes: number | null }> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    let data: ExportJobStatus;
    try {
      const response = await fetch(`/api/media-export/job?id=${encodeURIComponent(jobId)}`, {
        method: 'GET',
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(`job status HTTP ${response.status}`);
      }
      data = (await response.json()) as ExportJobStatus;
    } catch (error) {
      throw mapFetchError(error, timeoutMs);
    }

    const progress = Math.max(0, Math.min(100, Number(data.progress ?? 0)));
    const elapsedSec = Math.round((Date.now() - started) / 1000);
    const message = data.message || data.state || '진행 중…';
    onProgress?.(`${message} · ${progress}% · ${elapsedSec}s`, progress);

    if (data.state === 'done') {
      if (!data.path) throw new Error('Export 경로가 비어 있습니다.');
      return { path: data.path, bytes: data.bytes ?? null };
    }
    if (data.state === 'error') {
      throw new Error(data.error || data.message || 'Export 실패');
    }
    await sleep(700);
  }
  throw new Error(
    `Export 시간 초과 (${Math.round(timeoutMs / 1000)}초). 해상도를 1280×720으로 낮추거나 길이를 줄여 보세요.`,
  );
}

/**
 * 타임라인 스냅샷을 multipart로 보낸 뒤 job 진행률을 폴링합니다.
 */
export async function exportTimelineMp4(
  snapshot: MediaTimelineSnapshot,
  options: MediaExportOptions,
  onProgress?: (message: string, progress?: number) => void,
): Promise<{ blob: Blob | null; savedPath: string | null }> {
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
    videoSpeed: Math.max(0.2, Math.min(1, Number(options.videoSpeed) || 1)),
    masterDurationSec: snapshot.masterDurationSec,
    audioAssetId: snapshot.masterAudio.id,
    videoClips: videoClips.map(clipPayload),
    imageClips: imageClips.map(clipPayload),
    returnMode: 'path',
  };

  onProgress?.('미디어 준비 중…', 1);
  const form = new FormData();
  form.append('job', JSON.stringify(job));

  const audioBlob = await mediaBlob(snapshot.masterAudio);
  form.append(
    `file_${snapshot.masterAudio.id}`,
    audioBlob,
    snapshot.masterAudio.name || 'master.mp3',
  );

  const needed = new Set<string>();
  for (const clip of [...videoClips, ...imageClips]) needed.add(clip.assetId);
  let prepared = 0;
  for (const assetId of needed) {
    const asset = snapshot.assets.find((entry) => entry.id === assetId);
    if (!asset) throw new Error(`에셋 없음: ${assetId}`);
    const blob = await mediaBlob(asset);
    form.append(`file_${asset.id}`, blob, asset.name || asset.id);
    prepared += 1;
    onProgress?.(
      `업로드 준비 ${prepared}/${needed.size}: ${asset.name}`,
      2 + Math.round((prepared / Math.max(1, needed.size)) * 6),
    );
  }

  onProgress?.('서버로 업로드 중… (반응 대기)', 8);
  const timeoutMs = Math.max(300_000, Math.ceil(snapshot.masterDurationSec) * 8000);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch('/api/media-export', {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
  } catch (error) {
    throw mapFetchError(error, timeoutMs);
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

  const startPayload = (await response.json()) as {
    ok?: boolean;
    jobId?: string;
    path?: string;
    error?: string;
  };
  if (startPayload.error) throw new Error(startPayload.error);

  // Backward compat: old servers returned path immediately.
  if (startPayload.path && !startPayload.jobId) {
    onProgress?.('완료', 100);
    return { blob: null, savedPath: startPayload.path };
  }
  if (!startPayload.jobId) {
    throw new Error('Export jobId가 없습니다. 서버를 0.1.39 이상으로 재시작하세요.');
  }

  onProgress?.('인코딩 시작…', 10);
  const result = await pollExportJob(startPayload.jobId, timeoutMs, onProgress);
  onProgress?.('완료', 100);
  return { blob: null, savedPath: result.path };
}

interface ExGameNativeBridge {
  saveVideoBegin(filename: string): string;
  saveVideoChunk(token: string, base64: string): boolean;
  saveVideoEnd(token: string): string;
  saveVideoAbort(token: string): void;
}

/** APK 안에서 실행 중이고 저장 브리지를 쓸 수 있으면 반환합니다. */
export function androidSaveBridge(): ExGameNativeBridge | null {
  const scope = window as Window & { ExGameNative?: Partial<ExGameNativeBridge> };
  const bridge = scope.ExGameNative;
  if (!bridge || typeof bridge.saveVideoBegin !== 'function') return null;
  return bridge as ExGameNativeBridge;
}

/** 큰 배열을 한 번에 넘기면 스택이 넘치므로 나눠서 문자열로 만듭니다. */
function toBase64(bytes: Uint8Array): string {
  const STEP = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += STEP) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + STEP));
  }
  return btoa(binary);
}

/**
 * 폰에서 만든 MP4를 네이티브로 넘겨 Movies/ExGame 에 저장합니다.
 * WebView에는 blob: 다운로드 처리기가 없어 &lt;a download&gt;가 통하지 않습니다.
 * 수십 MB를 한 문자열로 넘기면 OOM이 나므로 청크로 나눠 보냅니다.
 */
export async function saveBlobToAndroid(
  blob: Blob,
  filename: string,
  onProgress?: (message: string, progress?: number) => void,
): Promise<string | null> {
  const bridge = androidSaveBridge();
  if (!bridge) return null;

  const CHUNK_BYTES = 1024 * 1024;
  const token = bridge.saveVideoBegin(filename);
  if (!token) {
    throw new Error('저장을 시작하지 못했습니다. 저장 공간을 확인해 주세요.');
  }

  try {
    for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
      const slice = blob.slice(offset, Math.min(offset + CHUNK_BYTES, blob.size));
      const bytes = new Uint8Array(await slice.arrayBuffer());
      if (!bridge.saveVideoChunk(token, toBase64(bytes))) {
        throw new Error('저장 중 오류가 발생했습니다.');
      }
      const done = Math.min(offset + CHUNK_BYTES, blob.size);
      onProgress?.(
        `저장 중 ${Math.round((done / blob.size) * 100)}%…`,
        Math.round((done / blob.size) * 100),
      );
      // 브리지 호출 사이에 UI가 그려질 틈을 줍니다.
      await sleep(0);
    }
    const saved = bridge.saveVideoEnd(token);
    if (!saved) {
      throw new Error('저장에 실패했습니다. 저장 공간을 확인해 주세요.');
    }
    return saved;
  } catch (error) {
    bridge.saveVideoAbort(token);
    throw error;
  }
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
    if (error instanceof DOMException && error.name === 'AbortError') {
      return null;
    }
    throw error;
  }
}
