/**
 * Media Timeline Editor — 셸 + MP3 Master + VIDEO/IMAGE 클립 + Preview.
 * Export(FFmpeg)는 별도 확인 후 연결합니다.
 */
import {
  downloadBlob,
  exportTimelineMp4,
  fetchExportStatus,
  saveBlobWithPicker,
  type ExportFps,
  type ExportResolution,
} from '../media/media-ffmpeg-export';
import { findClipAtTime, listVisualClips } from '../media/media-timeline-layout';
import {
  MediaTimelineProject,
  probeMediaDuration,
} from '../media/media-timeline-project';
import {
  formatTimelineTime,
  TRACK_KIND_IMAGE,
  TRACK_KIND_VIDEO,
  type MediaTimelineSnapshot,
  type TimelineClip,
} from '../media/media-timeline-types';
import { setMediaEditorOpen } from './hud-layout';

const ROOT_ID = 'exgame-media-editor';
const STYLE_ID = 'exgame-media-editor-style';
const ASSET_MIME = 'application/x-exme-asset';

type ResizeSession = {
  clipId: string;
  startX: number;
  startDuration: number;
  pxPerSec: number;
};

type MoveSession = {
  clipId: string;
  trackId: string;
  startX: number;
  moved: boolean;
};

export class DomMediaTimelineEditor {
  private root: HTMLDivElement | null = null;
  private readonly project = new MediaTimelineProject();
  private readonly audio = new Audio();
  private readonly previewVideo = document.createElement('video');
  private readonly previewImage = document.createElement('img');
  private playing = false;
  private rafId = 0;
  private resizeSession: ResizeSession | null = null;
  private moveSession: MoveSession | null = null;
  private zoom = 1;
  private exportResolution: ExportResolution = '1280x720';
  private exportFps: ExportFps = 30;
  /** 전역 MP4 속도 (0.2~1.0). Preview + Export에 적용 */
  private exportVideoSpeed = 1;
  private exporting = false;
  private exportOverlay: HTMLElement | null = null;
  private exportProgressBar: HTMLElement | null = null;
  private exportProgressText: HTMLElement | null = null;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.root) return;
    if (event.key === 'Escape' || event.code === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (this.exporting) {
        this.setStatus('Export 진행 중에는 닫을 수 없습니다. 완료를 기다려 주세요.');
        return;
      }
      this.close();
      return;
    }
    if (this.isTypingTarget(event.target)) return;
    if (event.code === 'Space') {
      event.preventDefault();
      event.stopPropagation();
      void this.togglePlay();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      const selected = this.project.getSnapshot().selectedClipId;
      if (selected) {
        event.preventDefault();
        this.project.removeClip(selected);
        this.setStatus('클립을 삭제했습니다.');
      }
    }
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyD') {
      const selected = this.project.getSnapshot().selectedClipId;
      if (selected) {
        event.preventDefault();
        this.project.duplicateClip(selected);
        this.setStatus('클립을 복제했습니다.');
      }
    }
  };

  private durationLabel: HTMLElement | null = null;
  private currentLabel: HTMLElement | null = null;
  private playButton: HTMLButtonElement | null = null;
  private ruler: HTMLElement | null = null;
  private playhead: HTMLElement | null = null;
  private masterName: HTMLElement | null = null;
  private folderLabel: HTMLElement | null = null;
  private fileList: HTMLElement | null = null;
  private statusLabel: HTMLElement | null = null;
  private videoLane: HTMLElement | null = null;
  private imageLane: HTMLElement | null = null;
  private previewStage: HTMLElement | null = null;
  private inspector: HTMLElement | null = null;

  open(): void {
    this.ensureStyle();
    this.closeDomOnly();
    setMediaEditorOpen(true);

    this.previewVideo.muted = true;
    this.previewVideo.playsInline = true;
    this.previewVideo.preload = 'auto';
    this.previewImage.alt = 'preview image';
    this.previewImage.draggable = false;

    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="exme-shell">
        <header class="exme-topbar">
          <strong>Media Editor</strong>
          <span class="exme-status" data-role="status">MP3를 로드한 뒤 MP4/PNG를 타임라인에 배치하세요.</span>
          <button type="button" class="exme-close" data-action="close">닫기 (Esc)</button>
        </header>

        <section class="exme-timeline-sector" data-role="timeline-sector">
          <div class="exme-timeline-header">
            <span data-role="duration">time line sector ( 00:00:00 )</span>
            <div class="exme-transport">
              <button type="button" data-action="play" class="exme-play">▶</button>
              <span data-role="current">00:00:00</span>
              <span class="exme-sep">/</span>
              <span data-role="duration-plain">00:00:00</span>
              <button type="button" data-action="zoom-out" title="Zoom Out">−</button>
              <button type="button" data-action="zoom-in" title="Zoom In">+</button>
            </div>
            <span data-role="master-name" class="exme-master-name">MP3 미로드</span>
          </div>
          <div class="exme-ruler-wrap" data-role="ruler-wrap">
            <div class="exme-ruler" data-role="ruler">
              <div class="exme-ticks" data-role="ticks"></div>
              <div class="exme-playhead" data-role="playhead"></div>
              <div class="exme-track-lane exme-track-audio" title="Master Audio (MP3)">
                <span class="exme-track-tag">AUD</span>
                <div class="exme-lane-body">
                  <div class="exme-audio-bar" data-role="audio-bar"></div>
                </div>
              </div>
              <div class="exme-track-lane exme-track-video" data-role="video-lane" data-track-kind="video"
                   title="VIDEO Track — MP4 드롭">
                <span class="exme-track-tag">VID</span>
                <div class="exme-lane-body" data-role="video-clips"></div>
              </div>
              <div class="exme-track-lane exme-track-image" data-role="image-lane" data-track-kind="image"
                   title="IMAGE Track — PNG 드롭 (VIDEO와 시간 겹침 없음)">
                <span class="exme-track-tag">IMG</span>
                <div class="exme-lane-body" data-role="image-clips"></div>
              </div>
            </div>
          </div>
        </section>

        <section class="exme-work-sector">
          <aside class="exme-actions">
            <button type="button" data-action="load-mp3">MP3 로드</button>
            <button type="button" data-action="pick-folder">작업폴더 설정</button>
            <div class="exme-export-opts">
              <label>해상도
                <select data-role="export-res">
                  <option value="1280x720" selected>1280×720 (가로)</option>
                  <option value="1920x1080">1920×1080 (가로)</option>
                  <option value="720x1280">720×1280 (세로)</option>
                </select>
              </label>
              <label>FPS
                <select data-role="export-fps">
                  <option value="30" selected>30</option>
                  <option value="60">60</option>
                </select>
              </label>
              <label class="exme-speed-label">MP4 속도
                <span class="exme-speed-row">
                  <input type="range" min="0.2" max="1" step="0.05" value="1" data-role="export-speed" />
                  <span data-role="export-speed-value">1.00x</span>
                </span>
              </label>
              <p class="exme-quality-hint">속도 0.2~1.0 (느림↔보통). PNG/BGM에는 영향 없음</p>
            </div>
            <button type="button" data-action="export">MP4 Export</button>
            <p class="exme-folder" data-role="folder-label">폴더: (없음)</p>
            <div class="exme-inspector" data-role="inspector">
              <div class="exme-inspector-title">클립 속성</div>
              <p class="exme-inspector-empty" data-role="inspector-empty">클립을 선택하세요.</p>
              <div class="exme-inspector-body" data-role="inspector-body" hidden>
                <label>Scale <input type="range" min="0.1" max="3" step="0.05" data-role="scale" /></label>
                <label>Opacity <input type="range" min="0" max="1" step="0.05" data-role="opacity" /></label>
                <div class="exme-inspector-actions">
                  <button type="button" data-action="dup-clip">복제</button>
                  <button type="button" data-action="del-clip" class="exme-danger">삭제</button>
                </div>
              </div>
            </div>
            <input type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac" data-role="mp3-input" hidden />
            <input type="file" accept="video/mp4,video/*,image/png,image/jpeg,.mp4,.png,.jpg,.jpeg"
              data-role="folder-input" multiple webkitdirectory directory hidden />
          </aside>
          <div class="exme-preview-panel">
            <div class="exme-preview-title">Preview</div>
            <div class="exme-preview-stage" data-role="preview-stage"></div>
          </div>
          <div class="exme-files">
            <div class="exme-files-title">파일 리스트 (타임라인으로 Drag & Drop)</div>
            <div class="exme-file-list" data-role="file-list">
              <div class="exme-empty">작업폴더를 설정하면 MP4/PNG가 여기에 표시됩니다.</div>
            </div>
          </div>
        </section>
      </div>
      <div class="exme-export-overlay" data-role="export-overlay" hidden>
        <div class="exme-export-card">
          <div class="exme-export-title">MP4 Export 진행 중</div>
          <div class="exme-export-msg" data-role="export-progress-text">준비 중…</div>
          <div class="exme-export-track">
            <div class="exme-export-bar" data-role="export-progress-bar"></div>
          </div>
          <p class="exme-export-hint">작업 파일은 게임 폴더 exports\\.work 에만 둡니다 (C: Temp 사용 안 함).<br/>끝나면 exports\\exgame-export-*.mp4 로 저장됩니다.</p>
        </div>
      </div>
    `;

    document.body.appendChild(root);
    this.root = root;
    this.bindElements(root);
    this.bindEvents(root);
    this.mountPreview();
    this.project.addListener(this.onProjectChange);
    this.onProjectChange(this.project.getSnapshot());
    window.addEventListener('keydown', this.onKeyDown, true);
    this.audio.addEventListener('ended', this.onAudioEnded);
    this.audio.addEventListener('timeupdate', this.onAudioTimeUpdate);
  }

  close(): void {
    this.pausePlayback();
    this.project.removeListener(this.onProjectChange);
    this.audio.removeEventListener('ended', this.onAudioEnded);
    this.audio.removeEventListener('timeupdate', this.onAudioTimeUpdate);
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('pointermove', this.onResizePointerMove);
    window.removeEventListener('pointerup', this.onResizePointerUp);
    window.removeEventListener('pointermove', this.onMovePointerMove);
    window.removeEventListener('pointerup', this.onMovePointerUp);
    this.project.dispose();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.previewVideo.pause();
    this.previewVideo.removeAttribute('src');
    this.previewVideo.load();
    this.previewImage.removeAttribute('src');
    this.closeDomOnly();
    setMediaEditorOpen(false);
  }

  isOpen(): boolean {
    return this.root !== null;
  }

  private closeDomOnly(): void {
    cancelAnimationFrame(this.rafId);
    this.root?.remove();
    this.root = null;
    document.getElementById(ROOT_ID)?.remove();
  }

  private bindElements(root: HTMLElement): void {
    this.durationLabel = root.querySelector('[data-role="duration"]');
    this.currentLabel = root.querySelector('[data-role="current"]');
    this.playButton = root.querySelector('[data-action="play"]');
    this.ruler = root.querySelector('[data-role="ruler"]');
    this.playhead = root.querySelector('[data-role="playhead"]');
    this.masterName = root.querySelector('[data-role="master-name"]');
    this.folderLabel = root.querySelector('[data-role="folder-label"]');
    this.fileList = root.querySelector('[data-role="file-list"]');
    this.statusLabel = root.querySelector('[data-role="status"]');
    this.videoLane = root.querySelector('[data-role="video-clips"]');
    this.imageLane = root.querySelector('[data-role="image-clips"]');
    this.previewStage = root.querySelector('[data-role="preview-stage"]');
    this.inspector = root.querySelector('[data-role="inspector"]');
    this.exportOverlay = root.querySelector('[data-role="export-overlay"]');
    this.exportProgressBar = root.querySelector('[data-role="export-progress-bar"]');
    this.exportProgressText = root.querySelector('[data-role="export-progress-text"]');
  }

  private mountPreview(): void {
    if (!this.previewStage) return;
    this.previewStage.replaceChildren();
    const stack = document.createElement('div');
    stack.className = 'exme-preview-stack';
    this.previewVideo.className = 'exme-preview-video';
    this.previewImage.className = 'exme-preview-image';
    stack.append(this.previewVideo, this.previewImage);
    this.previewStage.appendChild(stack);
  }

  private bindEvents(root: HTMLElement): void {
    root.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      const action = target?.closest('[data-action]')?.getAttribute('data-action');
      if (!action) return;
      event.preventDefault();
      if (action === 'close') this.close();
      if (action === 'play') void this.togglePlay();
      if (action === 'load-mp3') this.openMp3Picker();
      if (action === 'pick-folder') this.openFolderPicker();
      if (action === 'zoom-in') this.setZoom(this.zoom * 1.25);
      if (action === 'zoom-out') this.setZoom(this.zoom / 1.25);
      if (action === 'export') void this.runExport();
      if (action === 'del-clip') {
        const id = this.project.getSnapshot().selectedClipId;
        if (id) this.project.removeClip(id);
      }
      if (action === 'dup-clip') {
        const id = this.project.getSnapshot().selectedClipId;
        if (id) this.project.duplicateClip(id);
      }
    });

    const scaleInput = root.querySelector('[data-role="scale"]') as HTMLInputElement | null;
    const opacityInput = root.querySelector(
      '[data-role="opacity"]',
    ) as HTMLInputElement | null;
    scaleInput?.addEventListener('input', () => {
      const id = this.project.getSnapshot().selectedClipId;
      if (!id) return;
      this.project.updateClipParams(id, { scale: Number(scaleInput.value) });
      this.syncPreviewVisualParams();
    });
    opacityInput?.addEventListener('input', () => {
      const id = this.project.getSnapshot().selectedClipId;
      if (!id) return;
      this.project.updateClipParams(id, { opacity: Number(opacityInput.value) });
      this.syncPreviewVisualParams();
    });

    const resSelect = root.querySelector('[data-role="export-res"]') as HTMLSelectElement | null;
    const fpsSelect = root.querySelector('[data-role="export-fps"]') as HTMLSelectElement | null;
    const speedInput = root.querySelector('[data-role="export-speed"]') as HTMLInputElement | null;
    const speedValue = root.querySelector('[data-role="export-speed-value"]');
    resSelect?.addEventListener('change', () => {
      this.exportResolution = resSelect.value as ExportResolution;
    });
    fpsSelect?.addEventListener('change', () => {
      this.exportFps = Number(fpsSelect.value) as ExportFps;
    });
    const syncSpeedUi = (announce: boolean): void => {
      if (!speedInput) return;
      const speed = Math.max(0.2, Math.min(1, Number(speedInput.value) || 1));
      this.exportVideoSpeed = speed;
      if (speedValue) speedValue.textContent = `${speed.toFixed(2)}x`;
      this.previewVideo.playbackRate = speed;
      if (announce) {
        this.setStatus(`MP4 속도 ${speed.toFixed(2)}x (타임라인 길이는 유지, 영상만 느리게)`);
      }
    };
    speedInput?.addEventListener('input', () => syncSpeedUi(true));
    syncSpeedUi(false);

    void fetchExportStatus().then((status) => {
      if (!status.ready) {
        this.setStatus(
          'Export 준비: tools/ffmpeg/ffmpeg.exe 필요 (scripts/fetch-ffmpeg.ps1). auto-run 서버로 실행하세요.',
        );
      }
    });

    const mp3Input = root.querySelector('[data-role="mp3-input"]') as HTMLInputElement | null;
    mp3Input?.addEventListener('change', () => {
      const file = mp3Input.files?.[0];
      mp3Input.value = '';
      if (file) void this.loadMasterMp3(file);
    });

    const folderInput = root.querySelector(
      '[data-role="folder-input"]',
    ) as HTMLInputElement | null;
    folderInput?.addEventListener('change', () => {
      const files = folderInput.files ? Array.from(folderInput.files) : [];
      folderInput.value = '';
      void this.ingestWorkFolderFiles(files);
    });

    this.ruler?.addEventListener('pointerdown', (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.exme-clip')) return;
      this.seekFromPointer(event as PointerEvent);
    });

    const sector = root.querySelector('[data-role="timeline-sector"]');
    sector?.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    });
    sector?.addEventListener('drop', (event) => {
      event.preventDefault();
      void this.handleTimelineDrop(event as DragEvent);
    });

    for (const lane of [root.querySelector('[data-role="video-lane"]'), root.querySelector('[data-role="image-lane"]')]) {
      lane?.addEventListener('dragover', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      lane?.addEventListener('drop', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.handleTimelineDrop(event as DragEvent);
      });
    }
  }

  private openMp3Picker(): void {
    const input = this.root?.querySelector('[data-role="mp3-input"]') as HTMLInputElement | null;
    input?.click();
  }

  private openFolderPicker(): void {
    const input = this.root?.querySelector(
      '[data-role="folder-input"]',
    ) as HTMLInputElement | null;
    input?.click();
  }

  private async loadMasterMp3(file: File): Promise<void> {
    if (!this.isAudioFile(file)) {
      this.setStatus(`오디오가 아닙니다: ${file.name}`);
      return;
    }
    this.pausePlayback();
    const objectUrl = URL.createObjectURL(file);
    try {
      const durationSec = await probeMediaDuration(objectUrl, false);
      if (durationSec <= 0) {
        URL.revokeObjectURL(objectUrl);
        this.setStatus('MP3 길이를 확인할 수 없습니다.');
        return;
      }
      this.project.setMasterAudio(file, durationSec, objectUrl);
      this.audio.src = objectUrl;
      this.audio.currentTime = 0;
      this.updatePlayhead(0);
      this.setStatus(`MP3 로드 완료 · 타임라인 ${formatTimelineTime(durationSec)}`);
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      this.setStatus(error instanceof Error ? error.message : 'MP3 로드 실패');
    }
  }

  private async ingestWorkFolderFiles(files: File[]): Promise<void> {
    const mediaFiles = files.filter(
      (file) => this.isVideoFile(file) || this.isImageFile(file) || this.isAudioFile(file),
    );
    if (mediaFiles.length === 0) {
      this.setStatus('폴더에서 MP4/PNG/MP3를 찾지 못했습니다.');
      return;
    }
    const topDir = mediaFiles[0]?.webkitRelativePath?.split('/')[0] ?? '선택 폴더';
    this.project.clearLibraryAssets();
    this.project.setWorkFolderLabel(topDir);

    for (const file of mediaFiles) {
      const objectUrl = URL.createObjectURL(file);
      try {
        if (this.isVideoFile(file)) {
          const durationSec = await probeMediaDuration(objectUrl, true);
          this.project.registerFileAsset(file, 'video', objectUrl, durationSec);
        } else if (this.isImageFile(file)) {
          this.project.registerFileAsset(file, 'image', objectUrl, 0);
        } else if (this.isAudioFile(file)) {
          const durationSec = await probeMediaDuration(objectUrl, false);
          this.project.registerFileAsset(file, 'audio', objectUrl, durationSec);
        } else {
          URL.revokeObjectURL(objectUrl);
        }
      } catch {
        URL.revokeObjectURL(objectUrl);
      }
    }
    this.setStatus(`작업폴더 「${topDir}」 · ${this.project.listLibraryAssets().length}개 파일`);
  }

  private async handleTimelineDrop(event: DragEvent): Promise<void> {
    const dt = event.dataTransfer;
    if (!dt) return;

    const assetId = dt.getData(ASSET_MIME);
    if (assetId) {
      this.placeAssetOnTimeline(assetId);
      return;
    }

    const files = dt.files?.length ? Array.from(dt.files) : [];
    if (files.length === 0) return;

    const audio = files.find((file) => this.isAudioFile(file));
    if (audio) {
      await this.loadMasterMp3(audio);
      return;
    }

    for (const file of files) {
      if (!this.isVideoFile(file) && !this.isImageFile(file)) continue;
      const objectUrl = URL.createObjectURL(file);
      try {
        if (this.isVideoFile(file)) {
          const durationSec = await probeMediaDuration(objectUrl, true);
          const asset = this.project.registerFileAsset(file, 'video', objectUrl, durationSec);
          this.placeAssetOnTimeline(asset.id);
        } else {
          const asset = this.project.registerFileAsset(file, 'image', objectUrl, 0);
          this.placeAssetOnTimeline(asset.id);
        }
      } catch {
        URL.revokeObjectURL(objectUrl);
      }
    }
  }

  private placeAssetOnTimeline(assetId: string): void {
    const snap = this.project.getSnapshot();
    if (!snap.masterAudio || snap.masterDurationSec <= 0) {
      this.setStatus('먼저 MP3를 로드하세요. (타임라인 길이가 필요합니다)');
      return;
    }
    const clip = this.project.addClipFromAsset(assetId);
    if (!clip) {
      this.setStatus('배치할 수 없는 파일입니다. (MP4/PNG만)');
      return;
    }
    const asset = this.project.getAsset(assetId);
    this.setStatus(`배치: ${asset?.name ?? clip.id} · MP4/PNG 균등(시간 겹침 없음)`);
  }

  private setExportProgress(message: string, progress = 0): void {
    this.setStatus(message);
    if (this.exportProgressText) this.exportProgressText.textContent = message;
    if (this.exportProgressBar) {
      this.exportProgressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
    }
  }

  private showExportOverlay(show: boolean): void {
    if (!this.exportOverlay) return;
    this.exportOverlay.hidden = !show;
  }

  private async runExport(): Promise<void> {
    if (this.exporting) return;
    const snap = this.project.getSnapshot();
    if (!snap.masterAudio) {
      this.setStatus('Export: 먼저 MP3를 로드하세요.');
      window.alert('Export: 먼저 MP3를 로드하세요.');
      return;
    }
    this.exporting = true;
    this.showExportOverlay(true);
    this.setExportProgress('Export 시작…', 1);
    try {
      const status = await fetchExportStatus();
      if (!status.ready) {
        throw new Error(
          'ffmpeg.exe 없음. game/scripts/fetch-ffmpeg.ps1 실행 후 auto-run.bat 으로 다시 실행하세요.',
        );
      }
      this.setExportProgress(
        `업로드/인코딩 준비 (${this.exportResolution} @ ${this.exportFps}, speed ${this.exportVideoSpeed.toFixed(2)}x)`,
        4,
      );
      const { blob, savedPath } = await exportTimelineMp4(
        snap,
        {
          resolution: this.exportResolution,
          fps: this.exportFps,
          videoSpeed: this.exportVideoSpeed,
        },
        (message, progress) => this.setExportProgress(message, progress ?? 0),
      );
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `exgame-export-${stamp}.mp4`;
      let picked: string | null = null;
      if (blob) {
        picked = await saveBlobWithPicker(blob, filename);
        if (!picked) {
          downloadBlob(blob, filename);
        }
      }
      const where = savedPath
        ? `서버 저장:\n${savedPath}\n\n탐색기에서 이 파일을 여세요.`
        : picked
          ? `저장: ${picked}`
          : `브라우저 다운로드: ${filename} (다운로드 폴더 확인)`;
      this.setExportProgress(`Export 완료 · ${savedPath || picked || filename}`, 100);
      window.alert(`Export 완료\n\n${where}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export 실패';
      this.setExportProgress(message, 0);
      window.alert(`Export 실패\n\n${message}`);
    } finally {
      this.exporting = false;
      this.showExportOverlay(false);
    }
  }

  private async togglePlay(): Promise<void> {
    const snap = this.project.getSnapshot();
    if (!snap.masterAudio || snap.masterDurationSec <= 0) {
      this.setStatus('먼저 MP3를 로드하세요.');
      return;
    }
    if (this.playing) {
      this.pausePlayback();
      return;
    }
    try {
      await this.audio.play();
      this.playing = true;
      if (this.playButton) this.playButton.textContent = '❚❚';
      void this.previewVideo.play().catch(() => undefined);
      this.tick();
    } catch {
      this.setStatus('재생을 시작할 수 없습니다.');
    }
  }

  private pausePlayback(): void {
    this.audio.pause();
    this.previewVideo.pause();
    this.playing = false;
    if (this.playButton) this.playButton.textContent = '▶';
    cancelAnimationFrame(this.rafId);
  }

  private tick = (): void => {
    if (!this.playing) return;
    this.updatePlayhead(this.audio.currentTime);
    this.updatePreview(this.audio.currentTime);
    this.rafId = requestAnimationFrame(this.tick);
  };

  private readonly onAudioEnded = (): void => {
    this.pausePlayback();
    const duration = this.project.getSnapshot().masterDurationSec;
    this.audio.currentTime = duration;
    this.updatePlayhead(duration);
    this.updatePreview(duration);
  };

  private readonly onAudioTimeUpdate = (): void => {
    if (!this.playing) {
      this.updatePlayhead(this.audio.currentTime);
      this.updatePreview(this.audio.currentTime);
    }
  };

  private seekFromPointer(event: PointerEvent): void {
    const duration = this.project.getSnapshot().masterDurationSec;
    if (!this.ruler || duration <= 0) return;
    const body = this.ruler.querySelector('.exme-lane-body') as HTMLElement | null;
    const rect = (body ?? this.ruler).getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const time = ratio * duration;
    this.audio.currentTime = time;
    this.updatePlayhead(time);
    this.updatePreview(time);
  }

  private setZoom(next: number): void {
    this.zoom = Math.min(4, Math.max(0.5, next));
    const wrap = this.root?.querySelector('[data-role="ruler-wrap"]') as HTMLElement | null;
    if (wrap) {
      wrap.style.overflowX = this.zoom > 1 ? 'auto' : 'hidden';
    }
    if (this.ruler) {
      this.ruler.style.width = `${this.zoom * 100}%`;
    }
    this.setStatus(`Zoom ${Math.round(this.zoom * 100)}%`);
  }

  private updatePlayhead(timeSec: number): void {
    const duration = this.project.getSnapshot().masterDurationSec;
    const clamped = duration > 0 ? Math.min(duration, Math.max(0, timeSec)) : 0;
    if (this.currentLabel) {
      this.currentLabel.textContent = formatTimelineTime(clamped);
    }
    if (this.playhead && duration > 0) {
      // 트랙 태그(36) + 좌우 마진(10)에 맞춰 lane-body 기준으로 맞춤
      const ratio = clamped / duration;
      this.playhead.style.left = `calc(46px + (100% - 56px) * ${ratio})`;
    }
  }

  private updatePreview(timeSec: number): void {
    const snap = this.project.getSnapshot();
    const videoTrack = snap.tracks.find((track) => track.kind === TRACK_KIND_VIDEO);
    const imageTrack = snap.tracks.find((track) => track.kind === TRACK_KIND_IMAGE);
    const videoClip = videoTrack
      ? findClipAtTime(snap.clips, videoTrack.id, timeSec)
      : null;
    const imageClip = imageTrack
      ? findClipAtTime(snap.clips, imageTrack.id, timeSec)
      : null;

    this.applyPreviewVideo(videoClip, timeSec, snap);
    this.applyPreviewImage(imageClip, timeSec, snap);
  }

  private applyPreviewVideo(
    clip: TimelineClip | null,
    timeSec: number,
    snap: MediaTimelineSnapshot,
  ): void {
    if (!clip) {
      this.previewVideo.pause();
      this.previewVideo.style.visibility = 'hidden';
      return;
    }
    const asset = snap.assets.find((entry) => entry.id === clip.assetId);
    if (!asset) return;
    if (this.previewVideo.src !== asset.objectUrl) {
      this.previewVideo.src = asset.objectUrl;
    }
    this.previewVideo.style.visibility = 'visible';
    this.previewVideo.style.opacity = String(clip.opacity);
    this.previewVideo.style.transform = `scale(${clip.scale})`;
    this.previewVideo.playbackRate = this.exportVideoSpeed;
    const local = timeSec - clip.startSec;
    const srcDur = Math.max(0.001, asset.durationSec || 0.001);
    const speed = Math.max(0.2, Math.min(1, this.exportVideoSpeed));
    const mediaTimeRaw = local * speed;
    const mediaTime = clip.loop ? mediaTimeRaw % srcDur : Math.min(mediaTimeRaw, srcDur);
    if (Math.abs(this.previewVideo.currentTime - mediaTime) > 0.12) {
      try {
        this.previewVideo.currentTime = mediaTime;
      } catch {
        /* seek 중 ignore */
      }
    }
    const fade = this.fadeFactor(clip, timeSec);
    this.previewVideo.style.opacity = String(clip.opacity * fade);
    if (this.playing && this.previewVideo.paused) {
      void this.previewVideo.play().catch(() => undefined);
    }
  }

  private applyPreviewImage(
    clip: TimelineClip | null,
    timeSec: number,
    snap: MediaTimelineSnapshot,
  ): void {
    if (!clip) {
      this.previewImage.style.visibility = 'hidden';
      return;
    }
    const asset = snap.assets.find((entry) => entry.id === clip.assetId);
    if (!asset) return;
    if (this.previewImage.src !== asset.objectUrl) {
      this.previewImage.src = asset.objectUrl;
    }
    this.previewImage.style.visibility = 'visible';
    const fade = this.fadeFactor(clip, timeSec);
    this.previewImage.style.opacity = String(clip.opacity * fade);
    this.previewImage.style.transform = `scale(${clip.scale})`;
  }

  private fadeFactor(clip: TimelineClip, timeSec: number): number {
    const local = timeSec - clip.startSec;
    let factor = 1;
    if (clip.fadeInSec > 0 && local < clip.fadeInSec) {
      factor = Math.min(factor, local / clip.fadeInSec);
    }
    const toEnd = clip.durationSec - local;
    if (clip.fadeOutSec > 0 && toEnd < clip.fadeOutSec) {
      factor = Math.min(factor, Math.max(0, toEnd / clip.fadeOutSec));
    }
    return Math.min(1, Math.max(0, factor));
  }

  private syncPreviewVisualParams(): void {
    this.updatePreview(this.audio.currentTime || 0);
  }

  private readonly onProjectChange = (snapshot: MediaTimelineSnapshot): void => {
    const dur = snapshot.masterDurationSec;
    const durText = formatTimelineTime(dur);
    if (this.durationLabel) {
      this.durationLabel.textContent = `time line sector ( ${durText} )`;
    }
    const plain = this.root?.querySelector('[data-role="duration-plain"]');
    if (plain) plain.textContent = durText;
    if (this.masterName) {
      this.masterName.textContent = snapshot.masterAudio
        ? snapshot.masterAudio.name
        : 'MP3 미로드';
    }
    if (this.folderLabel) {
      this.folderLabel.textContent = snapshot.workFolderLabel
        ? `폴더: ${snapshot.workFolderLabel}`
        : '폴더: (없음)';
    }
    const audioBar = this.root?.querySelector('[data-role="audio-bar"]') as HTMLElement | null;
    if (audioBar) {
      audioBar.style.display = snapshot.masterAudio ? 'block' : 'none';
    }
    this.renderTicks(dur);
    this.renderClips(snapshot);
    this.renderFileList();
    this.renderInspector(snapshot);
    this.updatePlayhead(this.audio.currentTime || 0);
    this.updatePreview(this.audio.currentTime || 0);
  };

  private renderTicks(durationSec: number): void {
    const ticks = this.root?.querySelector('[data-role="ticks"]');
    if (!ticks) return;
    ticks.replaceChildren();
    if (durationSec <= 0) return;
    const step = durationSec > 600 ? 60 : durationSec > 120 ? 30 : durationSec > 30 ? 10 : 5;
    for (let t = 0; t <= durationSec + 0.001; t += step) {
      const mark = document.createElement('div');
      mark.className = 'exme-tick';
      mark.style.left = `${(t / durationSec) * 100}%`;
      mark.innerHTML = `<span>${formatTimelineTime(t)}</span>`;
      ticks.appendChild(mark);
    }
  }

  private renderClips(snapshot: MediaTimelineSnapshot): void {
    if (!this.videoLane || !this.imageLane) return;
    const master = snapshot.masterDurationSec;
    const videoTrack = snapshot.tracks.find((track) => track.kind === TRACK_KIND_VIDEO);
    const imageTrack = snapshot.tracks.find((track) => track.kind === TRACK_KIND_IMAGE);

    this.videoLane.replaceChildren();
    this.imageLane.replaceChildren();

    if (master <= 0) {
      this.videoLane.appendChild(this.makeLaneHint('MP3 로드 후 MP4를 드롭하세요'));
      this.imageLane.appendChild(this.makeLaneHint('이미지 트랙 — PNG (VIDEO와 시간 겹침 없음)'));
      return;
    }

    const videoClips = snapshot.clips.filter((clip) => clip.trackId === videoTrack?.id);
    const imageClips = snapshot.clips.filter((clip) => clip.trackId === imageTrack?.id);

    if (videoClips.length === 0) {
      this.videoLane.appendChild(this.makeLaneHint('비디오 트랙 — MP4 Drag & Drop'));
    } else {
      for (const clip of videoClips) {
        this.videoLane.appendChild(this.buildClipEl(clip, snapshot, master));
      }
    }
    if (imageClips.length === 0) {
      this.imageLane.appendChild(this.makeLaneHint('이미지 트랙 — PNG (VIDEO와 시간 겹침 없음)'));
    } else {
      for (const clip of imageClips) {
        this.imageLane.appendChild(this.buildClipEl(clip, snapshot, master));
      }
    }
  }

  private makeLaneHint(text: string): HTMLElement {
    const hint = document.createElement('div');
    hint.className = 'exme-lane-hint';
    hint.textContent = text;
    return hint;
  }

  private buildClipEl(
    clip: TimelineClip,
    snapshot: MediaTimelineSnapshot,
    master: number,
  ): HTMLElement {
    const asset = snapshot.assets.find((entry) => entry.id === clip.assetId);
    const el = document.createElement('div');
    el.className = 'exme-clip';
    if (snapshot.selectedClipId === clip.id) el.classList.add('is-selected');
    el.dataset.clipId = clip.id;
    el.style.left = `${(clip.startSec / master) * 100}%`;
    el.style.width = `${(clip.durationSec / master) * 100}%`;
    const kind = asset?.kind === 'video' ? 'MP4' : 'PNG';
    el.innerHTML = `
      <span class="exme-clip-label"></span>
      <span class="exme-clip-handle" data-role="resize-handle" title="좌우 드래그로 길이 변경"></span>
    `;
    const label = el.querySelector('.exme-clip-label');
    if (label) {
      label.textContent = `${kind} ${asset?.name ?? ''}`.trim();
    }

    el.addEventListener('pointerdown', (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-role="resize-handle"]')) {
        event.preventDefault();
        event.stopPropagation();
        this.beginResize(clip, event as PointerEvent);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.beginMove(clip, event as PointerEvent);
    });

    return el;
  }

  private beginMove(clip: TimelineClip, event: PointerEvent): void {
    this.project.selectClip(clip.id);
    this.moveSession = {
      clipId: clip.id,
      trackId: clip.trackId,
      startX: event.clientX,
      moved: false,
    };
    const el = this.root?.querySelector(
      `.exme-clip[data-clip-id="${clip.id}"]`,
    ) as HTMLElement | null;
    el?.classList.add('is-dragging');
    window.addEventListener('pointermove', this.onMovePointerMove);
    window.addEventListener('pointerup', this.onMovePointerUp);
  }

  private readonly onMovePointerMove = (event: PointerEvent): void => {
    if (!this.moveSession) return;
    if (Math.abs(event.clientX - this.moveSession.startX) > 6) {
      this.moveSession.moved = true;
    }
    if (!this.moveSession.moved || !this.ruler) return;
    const body = this.laneBodyForTrack(this.moveSession.trackId);
    if (!body) return;
    const rect = body.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const ghost = this.root?.querySelector(
      `.exme-clip[data-clip-id="${this.moveSession.clipId}"]`,
    ) as HTMLElement | null;
    if (ghost) {
      ghost.style.outline = '2px dashed #ffe08a';
      ghost.dataset.dropRatio = String(ratio);
    }
  };

  private readonly onMovePointerUp = (event: PointerEvent): void => {
    const session = this.moveSession;
    this.moveSession = null;
    window.removeEventListener('pointermove', this.onMovePointerMove);
    window.removeEventListener('pointerup', this.onMovePointerUp);
    if (!session) return;

    const ghost = this.root?.querySelector(
      `.exme-clip[data-clip-id="${session.clipId}"]`,
    ) as HTMLElement | null;
    ghost?.classList.remove('is-dragging');
    if (ghost) ghost.style.outline = '';

    if (!session.moved) return;

    const body = this.laneBodyForTrack(session.trackId);
    if (!body) return;
    const rect = body.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const snap = this.project.getSnapshot();
    const visualClips = listVisualClips(snap.clips, snap.tracks);
    if (visualClips.length <= 1) return;
    const toIndex = Math.min(
      visualClips.length - 1,
      Math.max(0, Math.floor(ratio * visualClips.length)),
    );
    if (this.project.reorderClip(session.clipId, toIndex)) {
      this.setStatus('클립 순서를 변경했습니다. (MP4/PNG 시간 겹침 없음)');
    }
  };

  private laneBodyForTrack(trackId: string): HTMLElement | null {
    const snap = this.project.getSnapshot();
    const track = snap.tracks.find((entry) => entry.id === trackId);
    if (!track) return null;
    if (track.kind === TRACK_KIND_VIDEO) return this.videoLane;
    if (track.kind === TRACK_KIND_IMAGE) return this.imageLane;
    return null;
  }

  private beginResize(clip: TimelineClip, event: PointerEvent): void {
    const master = this.project.getSnapshot().masterDurationSec;
    if (!this.ruler || master <= 0) return;
    const body = this.laneBodyForTrack(clip.trackId) ?? this.videoLane;
    const width = (body ?? this.ruler).getBoundingClientRect().width;
    if (width <= 0) return;
    this.resizeSession = {
      clipId: clip.id,
      startX: event.clientX,
      startDuration: clip.durationSec,
      pxPerSec: width / master,
    };
    this.project.selectClip(clip.id);
    window.addEventListener('pointermove', this.onResizePointerMove);
    window.addEventListener('pointerup', this.onResizePointerUp);
  }

  private readonly onResizePointerMove = (event: PointerEvent): void => {
    if (!this.resizeSession) return;
    const deltaPx = event.clientX - this.resizeSession.startX;
    const deltaSec = deltaPx / this.resizeSession.pxPerSec;
    const next = this.resizeSession.startDuration + deltaSec;
    this.project.resizeClip(this.resizeSession.clipId, next);
  };

  private readonly onResizePointerUp = (): void => {
    this.resizeSession = null;
    window.removeEventListener('pointermove', this.onResizePointerMove);
    window.removeEventListener('pointerup', this.onResizePointerUp);
  };

  private renderInspector(snapshot: MediaTimelineSnapshot): void {
    if (!this.inspector) return;
    const empty = this.inspector.querySelector(
      '[data-role="inspector-empty"]',
    ) as HTMLElement | null;
    const body = this.inspector.querySelector(
      '[data-role="inspector-body"]',
    ) as HTMLElement | null;
    const clip = snapshot.clips.find((entry) => entry.id === snapshot.selectedClipId);
    if (!clip || !empty || !body) {
      if (empty) empty.hidden = false;
      if (body) body.hidden = true;
      return;
    }
    empty.hidden = true;
    body.hidden = false;
    const scaleInput = body.querySelector('[data-role="scale"]') as HTMLInputElement | null;
    const opacityInput = body.querySelector(
      '[data-role="opacity"]',
    ) as HTMLInputElement | null;
    if (scaleInput && document.activeElement !== scaleInput) {
      scaleInput.value = String(clip.scale);
    }
    if (opacityInput && document.activeElement !== opacityInput) {
      opacityInput.value = String(clip.opacity);
    }
  }

  private renderFileList(): void {
    if (!this.fileList) return;
    const assets = this.project.listLibraryAssets().filter(
      (asset) => asset.kind === 'video' || asset.kind === 'image',
    );
    this.fileList.replaceChildren();
    if (assets.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'exme-empty';
      empty.textContent = '작업폴더를 설정하면 MP4/PNG가 여기에 표시됩니다.';
      this.fileList.appendChild(empty);
      return;
    }
    for (const asset of assets) {
      const row = document.createElement('div');
      row.className = 'exme-file-row';
      row.draggable = true;
      row.dataset.assetId = asset.id;
      row.dataset.kind = asset.kind;
      const kind = asset.kind === 'video' ? 'MP4' : 'PNG';
      const dur = asset.durationSec > 0 ? ` · ${formatTimelineTime(asset.durationSec)}` : '';
      row.innerHTML = `<span class="exme-kind">${kind}</span><span class="exme-fname"></span>`;
      const nameEl = row.querySelector('.exme-fname');
      if (nameEl) nameEl.textContent = `${asset.name}${dur}`;
      row.addEventListener('dragstart', (event) => {
        event.dataTransfer?.setData(ASSET_MIME, asset.id);
        event.dataTransfer!.effectAllowed = 'copy';
      });
      row.addEventListener('dblclick', () => {
        this.placeAssetOnTimeline(asset.id);
      });
      this.fileList.appendChild(row);
    }
  }

  private setStatus(message: string): void {
    if (this.statusLabel) this.statusLabel.textContent = message;
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
  }

  private isAudioFile(file: File): boolean {
    return file.type.startsWith('audio/')
      || /\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(file.name);
  }

  private isVideoFile(file: File): boolean {
    return file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name);
  }

  private isImageFile(file: File): boolean {
    return file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(file.name);
  }

  private ensureStyle(): void {
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `
#${ROOT_ID} {
  position: fixed; inset: 0; z-index: 2147483000;
  background: #0b0e14; color: #e8eef7;
  font-family: "Pretendard", "Noto Sans KR", "Segoe UI", sans-serif;
  display: flex; flex-direction: column;
}
#${ROOT_ID} .exme-shell {
  flex: 1; min-height: 0; display: grid;
  grid-template-rows: auto minmax(140px, 1fr) minmax(0, 5fr);
}
#${ROOT_ID} .exme-topbar {
  display: flex; align-items: center; gap: 16px;
  padding: 10px 16px; border-bottom: 1px solid #2a3344;
  background: #121722;
}
#${ROOT_ID} .exme-status { flex: 1; color: #9eb0c8; font-size: 13px; }
#${ROOT_ID} .exme-export-overlay {
  position: absolute; inset: 0; z-index: 50;
  background: rgba(8, 12, 18, 0.72);
  display: flex; align-items: center; justify-content: center;
}
#${ROOT_ID} .exme-export-overlay[hidden] { display: none !important; }
#${ROOT_ID} .exme-export-card {
  width: min(520px, 92vw); padding: 22px 24px;
  border-radius: 14px; border: 1px solid #3a4d66;
  background: #161d29; box-shadow: 0 18px 50px rgba(0,0,0,0.45);
}
#${ROOT_ID} .exme-export-title { font-size: 18px; font-weight: 800; margin-bottom: 10px; }
#${ROOT_ID} .exme-export-msg { color: #c5d4e8; font-size: 13px; min-height: 1.4em; margin-bottom: 12px; }
#${ROOT_ID} .exme-export-track {
  height: 12px; border-radius: 999px; background: #243041; overflow: hidden;
}
#${ROOT_ID} .exme-export-bar {
  height: 100%; width: 0%; border-radius: inherit;
  background: linear-gradient(90deg, #3d8bff, #6ed0ff);
  transition: width 0.25s ease;
}
#${ROOT_ID} .exme-export-hint {
  margin: 14px 0 0; color: #8092ab; font-size: 12px; line-height: 1.45;
}
#${ROOT_ID} .exme-close, #${ROOT_ID} .exme-actions button, #${ROOT_ID} .exme-play,
#${ROOT_ID} .exme-transport button {
  border: 1px solid #5a7a9a; border-radius: 8px; background: #1c2634;
  color: #ebf5ff; cursor: pointer; font-weight: 700;
}
#${ROOT_ID} .exme-close { padding: 8px 14px; }
#${ROOT_ID} .exme-danger { border-color: #a55 !important; color: #ffc9c9 !important; }
#${ROOT_ID} .exme-timeline-sector {
  min-height: 0; padding: 10px 16px 14px; border-bottom: 1px solid #2a3344;
  background: #0f141d; display: flex; flex-direction: column; gap: 8px;
}
#${ROOT_ID} .exme-timeline-header {
  display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
  font-variant-numeric: tabular-nums;
}
#${ROOT_ID} .exme-transport { display: flex; align-items: center; gap: 8px; }
#${ROOT_ID} .exme-play { width: 40px; height: 32px; }
#${ROOT_ID} .exme-transport button { width: 32px; height: 28px; }
#${ROOT_ID} .exme-sep { color: #6a7a90; }
#${ROOT_ID} .exme-master-name { color: #8fa3bd; font-size: 13px; margin-left: auto; }
#${ROOT_ID} .exme-ruler-wrap { flex: 1; min-height: 150px; overflow: hidden; }
#${ROOT_ID} .exme-ruler {
  position: relative; height: 100%; min-height: 150px; width: 100%;
  background: linear-gradient(180deg, #151b26, #10151e);
  border: 1px solid #30384a; border-radius: 10px; cursor: crosshair;
  overflow: hidden; padding-top: 18px; box-sizing: border-box;
}
#${ROOT_ID} .exme-ticks {
  position: absolute; left: 46px; right: 10px; top: 0; height: 18px;
  pointer-events: none; z-index: 2;
}
#${ROOT_ID} .exme-tick {
  position: absolute; top: 0; height: 100%;
  border-left: 1px solid #3a465c; font-size: 10px; color: #7f90a8;
}
#${ROOT_ID} .exme-tick span { position: relative; left: 4px; top: 1px; }
#${ROOT_ID} .exme-playhead {
  position: absolute; top: 0; bottom: 0; width: 2px; left: 0;
  background: #ff5a5a; z-index: 5; pointer-events: none;
  box-shadow: 0 0 6px rgba(255,90,90,0.7);
}
#${ROOT_ID} .exme-track-lane {
  position: relative; height: 40px; margin: 6px 10px 0;
  border-radius: 6px; background: #1a2230; border: 1px solid #2c3648;
  display: flex; align-items: stretch; gap: 0; padding: 0;
}
#${ROOT_ID} .exme-track-tag {
  font-size: 11px; font-weight: 800; color: #8eb4ff;
  width: 36px; display: flex; align-items: center; justify-content: center;
  border-right: 1px solid #2c3648; flex-shrink: 0;
}
#${ROOT_ID} .exme-lane-body {
  position: relative; flex: 1; min-width: 0; overflow: hidden;
}
#${ROOT_ID} .exme-audio-bar {
  display: none; position: absolute; inset: 8px 4px;
  border-radius: 4px;
  background: linear-gradient(90deg, #3d6cff, #6aa1ff);
}
#${ROOT_ID} .exme-lane-hint {
  position: absolute; inset: 0; display: flex; align-items: center;
  padding: 0 10px; font-size: 12px; color: #6f8098; pointer-events: none;
}
#${ROOT_ID} .exme-clip {
  position: absolute; top: 4px; bottom: 4px;
  border-radius: 4px; background: #2a4a78; border: 1px solid #6aa1ff;
  overflow: hidden; cursor: grab; z-index: 1;
  box-sizing: border-box; min-width: 4px;
}
#${ROOT_ID} .exme-clip.is-dragging {
  cursor: grabbing; opacity: 0.75; z-index: 3;
}
#${ROOT_ID} .exme-track-image .exme-clip {
  background: #3a3a58; border-color: #c9a0ff;
}
#${ROOT_ID} .exme-clip.is-selected {
  outline: 2px solid #ffe08a; z-index: 2;
}
#${ROOT_ID} .exme-clip-label {
  display: block; padding: 4px 18px 4px 6px; font-size: 11px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  pointer-events: none;
}
#${ROOT_ID} .exme-clip-handle {
  position: absolute; top: 0; right: 0; width: 10px; height: 100%;
  cursor: ew-resize; background: rgba(255,255,255,0.18);
}
#${ROOT_ID} .exme-work-sector {
  min-height: 0; display: grid;
  grid-template-columns: 220px minmax(240px, 1.2fr) minmax(0, 1fr);
  gap: 0;
}
#${ROOT_ID} .exme-actions {
  padding: 14px; border-right: 1px solid #2a3344; background: #121722;
  display: flex; flex-direction: column; gap: 10px; overflow-y: auto;
}
#${ROOT_ID} .exme-actions button { height: 40px; font-size: 14px; }
#${ROOT_ID} .exme-actions button:disabled { opacity: 0.45; cursor: not-allowed; }
#${ROOT_ID} .exme-folder { font-size: 12px; color: #8fa3bd; margin: 4px 0 0; }
#${ROOT_ID} .exme-export-opts {
  display: flex; flex-direction: column; gap: 8px;
  padding: 8px 0; border-top: 1px solid #2a3344; border-bottom: 1px solid #2a3344;
}
#${ROOT_ID} .exme-export-opts label {
  display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #b8c6d9;
}
#${ROOT_ID} .exme-export-opts select {
  height: 32px; border-radius: 6px; border: 1px solid #3a465c;
  background: #1c2634; color: #ebf5ff;
}
#${ROOT_ID} .exme-speed-row {
  display: flex; align-items: center; gap: 10px;
}
#${ROOT_ID} .exme-speed-row input[type="range"] { flex: 1; }
#${ROOT_ID} .exme-speed-row span {
  min-width: 48px; text-align: right; font-variant-numeric: tabular-nums;
  color: #d7e6f8; font-weight: 700;
}
#${ROOT_ID} .exme-quality-hint { font-size: 11px; color: #6f8098; margin: 0; }
#${ROOT_ID} .exme-inspector {
  margin-top: 8px; padding-top: 10px; border-top: 1px solid #2a3344;
}
#${ROOT_ID} .exme-inspector-title { font-weight: 700; margin-bottom: 8px; }
#${ROOT_ID} .exme-inspector-empty { font-size: 12px; color: #6f8098; }
#${ROOT_ID} .exme-inspector-body label {
  display: flex; flex-direction: column; gap: 4px;
  font-size: 12px; margin-bottom: 10px; color: #b8c6d9;
}
#${ROOT_ID} .exme-inspector-actions { display: flex; gap: 8px; }
#${ROOT_ID} .exme-inspector-actions button { flex: 1; height: 34px; font-size: 12px; }
#${ROOT_ID} .exme-preview-panel {
  min-height: 0; display: flex; flex-direction: column;
  border-right: 1px solid #2a3344; background: #0a0d13;
}
#${ROOT_ID} .exme-preview-title {
  padding: 10px 14px; border-bottom: 1px solid #2a3344; font-weight: 700;
}
#${ROOT_ID} .exme-preview-stage {
  flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center;
  padding: 12px; background:
    linear-gradient(45deg, #151a22 25%, transparent 25%),
    linear-gradient(-45deg, #151a22 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #151a22 75%),
    linear-gradient(-45deg, transparent 75%, #151a22 75%);
  background-size: 24px 24px;
  background-position: 0 0, 0 12px, 12px -12px, -12px 0;
  background-color: #0e131b;
}
#${ROOT_ID} .exme-preview-stack {
  position: relative; width: min(100%, 720px); aspect-ratio: 16 / 9;
  background: #000; overflow: hidden; border: 1px solid #30384a;
}
#${ROOT_ID} .exme-preview-video,
#${ROOT_ID} .exme-preview-image {
  position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: contain; visibility: hidden; transform-origin: center center;
}
#${ROOT_ID} .exme-preview-image { z-index: 2; pointer-events: none; }
#${ROOT_ID} .exme-preview-video { z-index: 1; }
#${ROOT_ID} .exme-files {
  min-height: 0; display: flex; flex-direction: column; background: #0d1118;
}
#${ROOT_ID} .exme-files-title {
  padding: 10px 14px; border-bottom: 1px solid #2a3344; font-weight: 700;
}
#${ROOT_ID} .exme-file-list {
  flex: 1; min-height: 0; overflow-y: auto; padding: 8px;
}
#${ROOT_ID} .exme-empty { color: #6f8098; padding: 24px 12px; font-size: 13px; }
#${ROOT_ID} .exme-file-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; margin-bottom: 6px; border-radius: 8px;
  background: #171e2a; border: 1px solid #2a3344; cursor: grab;
}
#${ROOT_ID} .exme-kind {
  font-size: 11px; font-weight: 800; color: #ffd28a; min-width: 36px;
}
#${ROOT_ID} .exme-fname {
  font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
`;
  }
}

/** 싱글톤 진입 — SaveControls 버튼에서 호출. */
let editorSingleton: DomMediaTimelineEditor | null = null;

export function openMediaTimelineEditor(): void {
  if (!editorSingleton) editorSingleton = new DomMediaTimelineEditor();
  if (editorSingleton.isOpen()) return;
  editorSingleton.open();
}

declare global {
  interface Window {
    exgameOpenMediaTimelineEditor?: () => void;
  }
}

if (typeof window !== 'undefined') {
  window.exgameOpenMediaTimelineEditor = openMediaTimelineEditor;
}
