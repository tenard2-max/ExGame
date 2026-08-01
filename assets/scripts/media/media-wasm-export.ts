/**
 * 브라우저 안에서 직접 MP4를 만드는 Export 경로 (ffmpeg.wasm, 단일 스레드).
 *
 * 모바일(APK)에는 ffmpeg.exe도 로컬 파이썬 서버도 없기 때문에 사용합니다.
 * 인코딩 전략(검은 구간 + 클립을 순차 concat)은 서버 경로
 * `scripts/exgame-local-server.py`의 build_export 와 동일하게 유지합니다.
 * 둘 중 어느 경로로 뽑아도 결과가 같아야 하므로, 한쪽 필터를 고치면
 * 다른 쪽도 같이 고쳐야 합니다.
 *
 * 원본 파일은 읽기만 합니다(Non-Destructive).
 */
import type { MediaExportOptions } from './media-ffmpeg-export';
import {
  TRACK_KIND_IMAGE,
  TRACK_KIND_VIDEO,
  type MediaAssetRef,
  type MediaTimelineSnapshot,
  type TimelineClip,
} from './media-timeline-types';

/** 빌드 산출물에서 ffmpeg.wasm 런타임이 놓이는 폴더 (build-web.ps1이 복사) */
const RUNTIME_DIR = 'ffmpeg-wasm';

/**
 * 단일 스레드 wasm은 입력·출력을 전부 힙에 올립니다.
 * 폰에서 이 값을 넘기면 브라우저가 조용히 죽어버리므로 미리 막습니다.
 */
const MAX_TOTAL_INPUT_BYTES = 600 * 1024 * 1024;

type ProgressFn = (message: string, progress?: number) => void;

interface FFmpegLogEvent {
  type: string;
  message: string;
}

/** time은 마이크로초 단위입니다. */
interface FFmpegProgressEvent {
  progress: number;
  time: number;
}

interface FFmpegLike {
  loaded: boolean;
  load(config: { coreURL: string; wasmURL: string }): Promise<boolean>;
  exec(args: string[]): Promise<number>;
  writeFile(path: string, data: Uint8Array): Promise<boolean>;
  readFile(path: string): Promise<Uint8Array | string>;
  deleteFile(path: string): Promise<boolean>;
  terminate(): void;
  on(event: 'log', cb: (entry: FFmpegLogEvent) => void): void;
  on(event: 'progress', cb: (entry: FFmpegProgressEvent) => void): void;
  off(event: 'progress', cb: (entry: FFmpegProgressEvent) => void): void;
}

let ffmpegSingleton: FFmpegLike | null = null;
let loadPromise: Promise<FFmpegLike> | null = null;

/** 최근 ffmpeg 로그. 실패했을 때 원인 파악용으로만 씁니다. */
const logTail: string[] = [];

function runtimeUrl(file: string): string {
  return new URL(`${RUNTIME_DIR}/${file}`, document.baseURI).href;
}

async function loadScriptOnce(src: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(`script[data-exgame-ffmpeg="1"]`);
  if (existing) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.exgameFfmpeg = '1';
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(
        new Error(
          'ffmpeg.wasm 런타임을 찾지 못했습니다.\n' +
            '앱을 최신 버전으로 다시 설치하거나, PC에서는 scripts/build-web.ps1 로 다시 빌드하세요.',
        ),
      );
    };
    document.head.appendChild(script);
  });
}

async function getFFmpeg(onProgress?: ProgressFn): Promise<FFmpegLike> {
  if (ffmpegSingleton?.loaded) return ffmpegSingleton;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    onProgress?.('인코더 준비 중… (최초 1회 약 31MB 로드)', 2);
    await loadScriptOnce(runtimeUrl('ffmpeg.js'));

    const globalScope = window as unknown as {
      FFmpegWASM?: { FFmpeg: new () => FFmpegLike };
    };
    const ctor = globalScope.FFmpegWASM?.FFmpeg;
    if (!ctor) {
      throw new Error('ffmpeg.wasm 로드 실패: FFmpegWASM 전역이 없습니다.');
    }

    const instance = new ctor();
    instance.on('log', ({ message }) => {
      logTail.push(message);
      if (logTail.length > 80) logTail.shift();
    });

    // coreURL을 넘기지 않으면 워커가 unpkg CDN으로 폴백합니다. 오프라인이라 반드시 지정합니다.
    await instance.load({
      coreURL: runtimeUrl('ffmpeg-core.js'),
      wasmURL: runtimeUrl('ffmpeg-core.wasm'),
    });

    ffmpegSingleton = instance;
    return instance;
  })();

  try {
    return await loadPromise;
  } catch (error) {
    loadPromise = null;
    ffmpegSingleton = null;
    throw error;
  }
}

/** wasm이 한 번 깨지면 이후 실행도 계속 실패하므로 통째로 버립니다. */
function disposeFFmpeg(): void {
  try {
    ffmpegSingleton?.terminate();
  } catch {
    /* ignore */
  }
  ffmpegSingleton = null;
  loadPromise = null;
}

function extensionOf(name: string, fallback: string): string {
  const match = /\.([a-z0-9]{1,5})$/i.exec(name || '');
  return match ? match[1].toLowerCase() : fallback;
}

async function assetBytes(asset: MediaAssetRef): Promise<Uint8Array> {
  if (asset.file && asset.file.size > 0) {
    return new Uint8Array(await asset.file.arrayBuffer());
  }
  const response = await fetch(asset.objectUrl);
  if (!response.ok) {
    throw new Error(`미디어를 읽을 수 없습니다: ${asset.name} (HTTP ${response.status})`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function assetSize(asset: MediaAssetRef): number {
  return asset.file?.size ?? 0;
}

/**
 * 서버 build_export의 clip_scale_pad 포팅.
 * 타임라인 길이는 dur로 유지하고, 느린 MP4(speed<1)는 원본을 dur*speed 만큼만 써서 늘립니다.
 */
function clipScalePad(
  inputIdx: number,
  label: string,
  clip: TimelineClip,
  width: number,
  height: number,
  dur: number,
  isImage: boolean,
  videoSpeed: number,
  fps: number,
): string {
  const scale = Number(clip.scale) || 1;
  const opacity = Math.max(0, Math.min(1, Number(clip.opacity ?? 1)));
  const fadeIn = Number(clip.fadeInSec) || 0;
  const fadeOut = Number(clip.fadeOutSec) || 0;
  const speed = Math.max(0.2, Math.min(1, videoSpeed || 1));

  let trimDur = dur;
  let setpts = 'setpts=PTS-STARTPTS';
  if (!isImage && Math.abs(speed - 1) >= 1e-6) {
    trimDur = Math.max(0.05, dur * speed);
    setpts = `setpts=(PTS-STARTPTS)/${speed.toFixed(6)}`;
  }

  const parts = [
    `trim=duration=${trimDur.toFixed(6)}`,
    setpts,
    `fps=${Math.round(fps)}`,
    `scale=iw*${scale}:ih*${scale}`,
    `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
    'format=yuv420p',
    'setsar=1',
  ];
  if (opacity < 0.999) {
    parts.push(`colorchannelmixer=aa=${opacity}`);
    parts.push('format=yuv420p');
  }
  if (fadeIn > 0) {
    parts.push(`fade=t=in:st=0:d=${fadeIn.toFixed(6)}`);
  }
  if (fadeOut > 0) {
    parts.push(`fade=t=out:st=${Math.max(0, dur - fadeOut).toFixed(6)}:d=${fadeOut.toFixed(6)}`);
  }
  return `[${inputIdx}:v]${parts.join(',')}[${label}]`;
}

type Segment =
  | { kind: 'black'; durationSec: number }
  | { kind: 'clip'; clip: TimelineClip; isImage: boolean; durationSec: number };

/** 시각 클립을 시작 시간 순으로 이어 붙이고 빈 구간은 검은 화면으로 채웁니다. */
function buildSegments(
  videoClips: TimelineClip[],
  imageClips: TimelineClip[],
  masterSec: number,
): Segment[] {
  const visual: Array<{ clip: TimelineClip; isImage: boolean }> = [
    ...videoClips.map((clip) => ({ clip, isImage: false })),
    ...imageClips.map((clip) => ({ clip, isImage: true })),
  ].sort((a, b) => a.clip.startSec - b.clip.startSec);

  const segments: Segment[] = [];
  let cursor = 0;
  for (const { clip, isImage } of visual) {
    let start = clip.startSec;
    let dur = clip.durationSec;
    if (start < cursor) {
      dur -= cursor - start;
      start = cursor;
    }
    if (dur <= 0.001) continue;
    if (start > cursor + 0.001) {
      segments.push({ kind: 'black', durationSec: start - cursor });
      cursor = start;
    }
    segments.push({ kind: 'clip', clip, isImage, durationSec: dur });
    cursor = start + dur;
  }
  if (cursor < masterSec - 0.001) {
    segments.push({ kind: 'black', durationSec: masterSec - cursor });
  }
  return segments.length > 0 ? segments : [{ kind: 'black', durationSec: masterSec }];
}

/**
 * 타임라인을 폰/브라우저 안에서 직접 MP4로 인코딩합니다.
 * 서버 경로와 달리 결과를 Blob으로 돌려주고, 저장은 호출한 쪽이 정합니다.
 */
export async function exportTimelineMp4Wasm(
  snapshot: MediaTimelineSnapshot,
  options: MediaExportOptions,
  onProgress?: ProgressFn,
): Promise<{ blob: Blob }> {
  if (!snapshot.masterAudio || snapshot.masterDurationSec <= 0) {
    throw new Error('먼저 MP3(Master Timeline)를 로드하세요.');
  }

  const [width, height] = options.resolution.split('x').map((value) => parseInt(value, 10));
  const fps = options.fps;
  const masterSec = snapshot.masterDurationSec;
  const videoSpeed = Math.max(0.2, Math.min(1, Number(options.videoSpeed) || 1));

  const videoTrack = snapshot.tracks.find((track) => track.kind === TRACK_KIND_VIDEO);
  const imageTrack = snapshot.tracks.find((track) => track.kind === TRACK_KIND_IMAGE);
  const videoClips = snapshot.clips.filter(
    (clip) => clip.trackId === videoTrack?.id && clip.durationSec > 0,
  );
  const imageClips = snapshot.clips.filter(
    (clip) => clip.trackId === imageTrack?.id && clip.durationSec > 0,
  );

  const segments = buildSegments(videoClips, imageClips, masterSec);

  // 필요한 에셋만 모아 용량을 먼저 확인합니다.
  const usedAssetIds = new Set<string>();
  for (const segment of segments) {
    if (segment.kind === 'clip') usedAssetIds.add(segment.clip.assetId);
  }
  const usedAssets: MediaAssetRef[] = [];
  for (const assetId of usedAssetIds) {
    const asset = snapshot.assets.find((entry) => entry.id === assetId);
    if (!asset) throw new Error(`에셋 없음: ${assetId}`);
    usedAssets.push(asset);
  }

  const totalBytes =
    assetSize(snapshot.masterAudio) + usedAssets.reduce((sum, a) => sum + assetSize(a), 0);
  if (totalBytes > MAX_TOTAL_INPUT_BYTES) {
    throw new Error(
      `이 기기에서 처리하기에 원본 용량이 너무 큽니다 (${Math.round(totalBytes / 1024 / 1024)}MB).\n` +
        `${Math.round(MAX_TOTAL_INPUT_BYTES / 1024 / 1024)}MB 아래로 줄이거나, PC에서 Export 하세요.`,
    );
  }

  const ffmpeg = await getFFmpeg(onProgress);
  logTail.length = 0;

  const writtenFiles: string[] = [];
  const cleanup = async () => {
    for (const name of writtenFiles) {
      try {
        await ffmpeg.deleteFile(name);
      } catch {
        /* ignore */
      }
    }
  };

  const onFfmpegProgress = ({ time }: FFmpegProgressEvent) => {
    // filter_complex에서는 progress 값이 부정확할 때가 있어 time으로 계산합니다.
    const ratio = Math.max(0, Math.min(1, time / 1_000_000 / masterSec));
    const pct = 15 + Math.round(ratio * 80);
    onProgress?.(`인코딩 ${pct}%…`, pct);
  };

  try {
    onProgress?.('미디어 준비 중…', 6);

    const audioName = `audio.${extensionOf(snapshot.masterAudio.name, 'mp3')}`;
    await ffmpeg.writeFile(audioName, await assetBytes(snapshot.masterAudio));
    writtenFiles.push(audioName);

    // 에셋 하나가 여러 클립에 쓰일 수 있으므로 파일은 한 번만 씁니다.
    const assetFileNames = new Map<string, string>();
    let index = 0;
    for (const asset of usedAssets) {
      const name = `src${index}.${extensionOf(asset.name, 'mp4')}`;
      await ffmpeg.writeFile(name, await assetBytes(asset));
      writtenFiles.push(name);
      assetFileNames.set(asset.id, name);
      index += 1;
      onProgress?.(
        `미디어 준비 ${index}/${usedAssets.length}: ${asset.name}`,
        6 + Math.round((index / Math.max(1, usedAssets.length)) * 8),
      );
    }

    // 입력 0번은 항상 오디오. 이후 실제 클립만 입력으로 추가하고,
    // 검은 구간은 입력 없이 color 소스 필터로 만듭니다.
    const args: string[] = ['-y', '-hide_banner', '-loglevel', 'error', '-i', audioName];
    const filters: string[] = [];
    const labels: string[] = [];
    let inputIdx = 1;

    segments.forEach((segment, order) => {
      const label = `s${order}`;
      labels.push(label);

      if (segment.kind === 'black') {
        filters.push(
          `color=c=black:s=${width}x${height}:d=${segment.durationSec.toFixed(6)}:r=${fps},` +
            `format=yuv420p,setsar=1[${label}]`,
        );
        return;
      }

      const fileName = assetFileNames.get(segment.clip.assetId);
      if (!fileName) throw new Error(`에셋 파일 없음: ${segment.clip.assetId}`);

      if (segment.isImage) {
        args.push('-loop', '1', '-t', segment.durationSec.toFixed(6), '-i', fileName);
      } else {
        if (segment.clip.loop) args.push('-stream_loop', '-1');
        args.push('-t', Math.max(0.05, segment.durationSec * videoSpeed).toFixed(6), '-i', fileName);
      }
      filters.push(
        clipScalePad(
          inputIdx,
          label,
          segment.clip,
          width,
          height,
          segment.durationSec,
          segment.isImage,
          videoSpeed,
          fps,
        ),
      );
      inputIdx += 1;
    });

    filters.push(`${labels.map((l) => `[${l}]`).join('')}concat=n=${labels.length}:v=1:a=0[vout]`);

    args.push(
      '-filter_complex',
      filters.join(';'),
      '-map',
      '[vout]',
      '-map',
      '0:a:0',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-preset',
      'ultrafast',
      '-crf',
      imageClips.length > 0 ? '20' : '22',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest',
      '-t',
      masterSec.toFixed(6),
      'output.mp4',
    );

    onProgress?.('인코딩 시작…', 15);
    ffmpeg.on('progress', onFfmpegProgress);
    let code: number;
    try {
      code = await ffmpeg.exec(args);
    } finally {
      ffmpeg.off('progress', onFfmpegProgress);
    }
    if (code !== 0) {
      throw new Error(`인코딩 실패 (코드 ${code})\n${logTail.slice(-8).join('\n')}`);
    }

    writtenFiles.push('output.mp4');
    onProgress?.('파일 정리 중…', 97);
    const data = await ffmpeg.readFile('output.mp4');
    if (typeof data === 'string' || data.byteLength < 32) {
      throw new Error('인코딩 결과가 비어 있습니다.');
    }

    // Uint8Array를 그대로 넘기면 뷰가 아닌 전체 버퍼가 잡힐 수 있어 잘라서 복사합니다.
    const blob = new Blob([data.slice()], { type: 'video/mp4' });
    onProgress?.('완료', 100);
    return { blob };
  } catch (error) {
    disposeFFmpeg();
    throw error;
  } finally {
    if (ffmpegSingleton) {
      await cleanup();
    }
  }
}
