import type { BgmPlaylistPlayer } from './bgm-playlist-player';
import type { BgmPlaylistSnapshot } from './bgm-types';
import type { SfxPlayer } from './sfx-player';

const STACK_ID = 'exgame-settings-stack';
const SETTINGS_BTN_ID = 'exgame-settings-gear';
const AUDIO_BTN_ID = 'exgame-audio-gear';
const OVERLAY_ID = 'exgame-audio-settings-overlay';

/**
 * 좌측 상단: 게임 설정 / 오디오 설정 버튼을 분리합니다.
 * 오디오 UI만 HTML로 구성합니다(파일 선택창 지원).
 */
export class DomAudioSettingsUi {
  private settingsButton: HTMLButtonElement | null = null;
  private audioButton: HTMLButtonElement | null = null;
  private overlay: HTMLDivElement | null = null;
  private bgm: BgmPlaylistPlayer | null = null;
  private sfx: SfxPlayer | null = null;
  private onGameSettingsToggle: ((open: boolean) => void) | null = null;
  private gameSettingsOpen = false;
  private audioOpen = false;
  private renderQueued = false;

  mount(
    bgm: BgmPlaylistPlayer,
    sfx: SfxPlayer,
    onGameSettingsToggle: (open: boolean) => void,
  ): void {
    this.destroy();
    this.bgm = bgm;
    this.sfx = sfx;
    this.onGameSettingsToggle = onGameSettingsToggle;
    this.ensureStyle();
    this.buildButtons();

    bgm.addListener((snapshot) => this.queueRender(snapshot));
    sfx.addListener(() => {
      if (this.bgm) this.queueRender(this.bgm.getSnapshot());
    });
  }

  isOverlayOpen(): boolean {
    return this.audioOpen && this.overlay !== null;
  }

  /** 게임 설정 패널 열림 상태만 버튼 표시에 반영합니다. */
  setGameSettingsOpen(open: boolean): void {
    this.gameSettingsOpen = open;
    if (this.settingsButton) {
      this.settingsButton.textContent = open ? '설정 닫기' : '설정';
      this.settingsButton.classList.toggle('is-open', open);
    }
  }

  /** 오디오 패널만 열고 닫습니다. 게임 설정과는 무관합니다. */
  setAudioOpen(open: boolean): void {
    this.audioOpen = open;
    if (this.audioButton) {
      this.audioButton.textContent = open ? '오디오 닫기' : '오디오';
      this.audioButton.classList.toggle('is-open', open);
    }
    if (open) this.showOverlay();
    else this.hideOverlay();
  }

  destroy(): void {
    this.hideOverlay();
    document.getElementById(STACK_ID)?.remove();
    document.getElementById(SETTINGS_BTN_ID)?.remove();
    document.getElementById(AUDIO_BTN_ID)?.remove();
    document.getElementById(OVERLAY_ID)?.remove();
    document.getElementById('exgame-bgm-add-bar')?.remove();
    document.getElementById('exgame-bgm-url-modal')?.remove();
    this.settingsButton = null;
    this.audioButton = null;
    this.bgm = null;
    this.sfx = null;
    this.onGameSettingsToggle = null;
  }

  private queueRender(snapshot: BgmPlaylistSnapshot): void {
    if (!this.audioOpen) return;
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      if (this.audioOpen) this.renderOverlayBody(snapshot);
    });
  }

  private buildButtons(): void {
    document.getElementById(STACK_ID)?.remove();
    const stack = document.createElement('div');
    stack.id = STACK_ID;
    stack.className = 'exgame-settings-stack';

    const settingsBtn = document.createElement('button');
    settingsBtn.id = SETTINGS_BTN_ID;
    settingsBtn.type = 'button';
    settingsBtn.className = 'exgame-dom-gear';
    settingsBtn.textContent = '설정';
    settingsBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.sfx?.unlock();
      const next = !this.gameSettingsOpen;
      this.onGameSettingsToggle?.(next);
    });

    const audioBtn = document.createElement('button');
    audioBtn.id = AUDIO_BTN_ID;
    audioBtn.type = 'button';
    audioBtn.className = 'exgame-dom-gear exgame-dom-audio-btn';
    audioBtn.textContent = '오디오';
    audioBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.sfx?.unlock();
      this.setAudioOpen(!this.audioOpen);
    });

    stack.appendChild(settingsBtn);
    stack.appendChild(audioBtn);
    document.body.appendChild(stack);
    this.settingsButton = settingsBtn;
    this.audioButton = audioBtn;
  }

  private showOverlay(): void {
    this.hideOverlay();
    if (!this.bgm || !this.sfx) return;

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'exgame-audio-overlay';

    const panel = document.createElement('div');
    panel.className = 'exgame-audio-panel';
    panel.addEventListener('mousedown', (event) => event.stopPropagation());
    panel.addEventListener('click', (event) => event.stopPropagation());
    panel.addEventListener('wheel', (event) => event.stopPropagation());

    const title = document.createElement('h2');
    title.textContent = '오디오 설정';
    panel.appendChild(title);

    const body = document.createElement('div');
    body.id = 'exgame-audio-panel-body';
    panel.appendChild(body);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'exgame-dom-btn';
    close.textContent = '오디오 닫기';
    close.style.marginTop = '12px';
    close.addEventListener('click', () => {
      this.setAudioOpen(false);
    });
    panel.appendChild(close);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    this.overlay = overlay;
    this.renderOverlayBody(this.bgm.getSnapshot());
  }

  private hideOverlay(): void {
    this.overlay?.remove();
    this.overlay = null;
    document.getElementById(OVERLAY_ID)?.remove();
  }

  private renderOverlayBody(snapshot: BgmPlaylistSnapshot): void {
    const body = document.getElementById('exgame-audio-panel-body');
    if (!body || !this.bgm || !this.sfx) return;
    body.innerHTML = '';

    const bgm = this.bgm;
    const sfx = this.sfx;

    body.appendChild(this.sectionTitle('배경음 (BGM)'));
    body.appendChild(this.row([
      this.button(snapshot.enabled ? '재생 중 · 정지' : '정지됨 · 재생', () => {
        void bgm.toggleEnabled();
      }),
      this.button('다음 곡', () => {
        void bgm.playNext();
      }),
      this.label(`볼륨 ${Math.round(snapshot.volume * 100)}%`),
      this.button('−', () => bgm.adjustVolume(-1)),
      this.button('+', () => bgm.adjustVolume(1)),
    ]));

    const fileRow = document.createElement('div');
    fileRow.className = 'exgame-audio-row';
    const fileLabel = document.createElement('label');
    fileLabel.className = 'exgame-dom-btn exgame-file-label';
    fileLabel.textContent = '파일 추가';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'audio/*,.mp3,.ogg,.wav,.m4a,.aac,.flac';
    fileInput.multiple = true;
    fileInput.className = 'exgame-native-file';
    fileInput.addEventListener('change', () => {
      const files = fileInput.files ? Array.from(fileInput.files) : [];
      void bgm.addFiles(files).then(() => {
        fileInput.value = '';
      });
    });
    fileLabel.appendChild(fileInput);
    fileRow.appendChild(fileLabel);

    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.placeholder = 'https://... 또는 ./audio/bgm.mp3';
    urlInput.className = 'exgame-url-input';
    urlInput.autocomplete = 'off';
    const urlAdd = this.button('URL 추가', () => {
      void bgm.addUrl(urlInput.value).then((error) => {
        if (error) {
          globalThis.alert?.(error);
          return;
        }
        urlInput.value = '';
      });
    });
    fileRow.appendChild(urlInput);
    fileRow.appendChild(urlAdd);
    body.appendChild(fileRow);

    const list = document.createElement('div');
    list.className = 'exgame-track-list';
    if (snapshot.tracks.length === 0) {
      list.textContent = '등록된 곡이 없습니다.';
    } else {
      snapshot.tracks.forEach((track, index) => {
        const row = document.createElement('div');
        row.className = 'exgame-track-row';
        const name = document.createElement('span');
        name.textContent = `${index + 1}. ${track.name}`;
        const del = this.button('삭제', () => {
          void bgm.removeTrack(track.id);
        }, true);
        row.appendChild(name);
        row.appendChild(del);
        list.appendChild(row);
      });
    }
    body.appendChild(list);

    body.appendChild(this.sectionTitle('효과음 (SFX)'));
    body.appendChild(this.row([
      this.button(sfx.isEnabled() ? '효과음 ON' : '효과음 OFF', () => {
        sfx.unlock();
        sfx.toggleEnabled();
        if (sfx.isEnabled()) sfx.play('hit-ore');
      }),
      this.label(`볼륨 ${Math.round(sfx.getVolume() * 100)}%`),
      this.button('−', () => sfx.adjustVolume(-1)),
      this.button('+', () => {
        sfx.adjustVolume(1);
        sfx.play('hit-tree');
      }),
    ]));

    const tip = document.createElement('p');
    tip.className = 'exgame-tip';
    tip.textContent = '오디오만 닫힙니다. 게임 설정은 「설정」 버튼으로 따로 여닫습니다.';
    body.appendChild(tip);
  }

  private sectionTitle(text: string): HTMLElement {
    const h = document.createElement('h3');
    h.textContent = text;
    return h;
  }

  private label(text: string): HTMLElement {
    const span = document.createElement('span');
    span.className = 'exgame-inline-label';
    span.textContent = text;
    return span;
  }

  private button(
    text: string,
    onClick: () => void,
    danger = false,
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = danger ? 'exgame-dom-btn exgame-dom-btn-danger' : 'exgame-dom-btn';
    button.textContent = text;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.sfx?.unlock();
      onClick();
    });
    return button;
  }

  private row(children: HTMLElement[]): HTMLElement {
    const row = document.createElement('div');
    row.className = 'exgame-audio-row';
    for (const child of children) row.appendChild(child);
    return row;
  }

  private ensureStyle(): void {
    let style = document.getElementById('exgame-audio-style') as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = 'exgame-audio-style';
      document.head.appendChild(style);
    }
    style.textContent = `
.exgame-settings-stack {
  position: fixed !important;
  left: 12px !important;
  top: 12px !important;
  z-index: 2147483000 !important;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none !important;
}
.exgame-dom-gear {
  pointer-events: auto !important;
  width: 88px;
  height: 56px;
  border: 3px solid #ffc43c;
  border-radius: 12px;
  background: #1c2434;
  color: #ffe68c;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  font-family: "Pretendard", "Noto Sans KR", "Segoe UI", sans-serif;
}
body.exgame-mobile .exgame-settings-stack {
  left: max(8px, env(safe-area-inset-left, 0px)) !important;
  top: max(8px, env(safe-area-inset-top, 0px)) !important;
  gap: 5px;
}
body.exgame-mobile .exgame-dom-gear {
  width: 44px;
  height: 28px;
  border-width: 2px;
  border-radius: 8px;
  font-size: 9px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.35);
}
.exgame-dom-audio-btn {
  border-color: #7ec8ff;
  color: #cfe9ff;
}
.exgame-dom-gear.is-open { border-color: #7ec8ff; background: #243448; }
.exgame-dom-audio-btn.is-open { border-color: #ffc43c; }
.exgame-audio-overlay {
  position: fixed !important;
  inset: 0 !important;
  z-index: 2147483001 !important;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 16px 16px 24px;
  background: transparent;
  pointer-events: none !important;
  font-family: "Segoe UI", sans-serif;
}
.exgame-audio-panel {
  width: min(440px, 38vw);
  max-height: min(520px, calc(100vh - 120px));
  overflow: auto;
  background: #152033;
  color: #eef5ff;
  border: 2px solid #82aad2;
  border-radius: 14px;
  padding: 18px 18px 14px;
  text-align: left;
  box-shadow: 0 12px 40px rgba(0,0,0,0.45);
  -webkit-user-select: text !important;
  user-select: text !important;
  pointer-events: auto !important;
}
.exgame-audio-panel h2 { margin: 0 0 10px; font-size: 22px; }
.exgame-audio-panel h3 { margin: 16px 0 8px; font-size: 16px; color: #9fd0ff; }
.exgame-audio-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}
.exgame-dom-btn, .exgame-file-label {
  background: #3f6f9f;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  pointer-events: auto !important;
}
.exgame-dom-btn-danger { background: #8a3f4a; }
.exgame-file-label { position: relative; overflow: hidden; display: inline-block; }
.exgame-native-file {
  position: absolute;
  left: 0; top: 0;
  width: 100%; height: 100%;
  opacity: 0;
  cursor: pointer;
  font-size: 0;
}
.exgame-url-input {
  flex: 1 1 180px;
  min-width: 160px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #5a7aa0;
  background: #0f1622;
  color: #fff;
  font-size: 14px;
  -webkit-user-select: text !important;
  user-select: text !important;
  pointer-events: auto !important;
}
.exgame-inline-label { color: #ffe08a; font-size: 14px; min-width: 64px; }
.exgame-track-list {
  background: #0f1622;
  border-radius: 8px;
  padding: 8px 10px;
  min-height: 48px;
  font-size: 13px;
  color: #c9d7ea;
}
.exgame-track-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid #243248;
}
.exgame-tip { margin: 12px 0 0; font-size: 12px; color: #9aa8bc; }
`;
  }
}
