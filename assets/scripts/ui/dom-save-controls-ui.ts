/**
 * 우측 상단 저장/불러오기/내보내기/새로시작 버튼입니다.
 * 모바일에서는 좌측 설정 스택(오디오 아래)에 절반 크기로 붙습니다.
 * Cocos 좌표 히트 오차를 피하기 위해 실제 HTML 버튼으로 처리합니다.
 */
import {
  consumeKeyEvent,
  isPrimaryModifier,
  matchesKeyCode,
} from '../input/dom-keyboard';
import type { SaveSessionController } from '../save/save-session-controller';
import { openMediaTimelineEditor } from './dom-media-timeline-editor';
import { isMobileShell, mobileFontUnifyCss } from './mobile-shell';

const ROOT_ID = 'exgame-save-controls';
const STYLE_ID = 'exgame-save-controls-style';
const STACK_ID = 'exgame-settings-stack';

interface SaveControlButton {
  readonly id: string;
  readonly code: string;
  readonly label: string;
  readonly action: () => void;
  readonly danger?: boolean;
}

export class DomSaveControlsUi {
  private root: HTMLDivElement | null = null;
  private saveSession: SaveSessionController | null = null;
  private buttons: SaveControlButton[] = [];

  private readonly onDomKeyDown = (event: KeyboardEvent): void => {
    if (!isPrimaryModifier(event)) return;
    if (matchesKeyCode(event, 'KeyI') || matchesKeyCode(event, 'KeyL')) {
      consumeKeyEvent(event);
      this.saveSession?.openLoadMenu();
      return;
    }
    const button = this.buttons.find(
      (entry) => entry.code && matchesKeyCode(event, entry.code),
    );
    if (!button) return;
    consumeKeyEvent(event);
    button.action();
  };

  mount(saveSession: SaveSessionController): void {
    this.destroy();
    this.saveSession = saveSession;
    this.buttons = [
      {
        id: 'media',
        code: '',
        label: 'MP4 생성',
        action: () => openMediaTimelineEditor(),
      },
      {
        id: 'save',
        code: 'KeyS',
        label: '저장  (S)',
        action: () => this.saveSession?.openSaveMenu(),
      },
      {
        id: 'load',
        code: 'KeyL',
        label: '불러오기  (L)',
        action: () => this.saveSession?.openLoadMenu(),
      },
      {
        id: 'export',
        code: 'KeyE',
        label: '내보내기  (E)',
        action: () => {
          void this.saveSession?.exportNow();
        },
      },
      {
        id: 'new',
        code: 'KeyN',
        label: '새로 시작  (N)',
        action: () => {
          void this.saveSession?.startNewGame();
        },
        danger: true,
      },
    ];
    this.ensureStyle();
    this.build();
    window.addEventListener('keydown', this.onDomKeyDown, true);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onDomKeyDown, true);
    this.root?.remove();
    this.root = null;
    document.getElementById(ROOT_ID)?.remove();
    this.saveSession = null;
  }

  private build(): void {
    document.getElementById(ROOT_ID)?.remove();
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.className = 'exgame-save-controls';

    for (const button of this.buttons) {
      const el = document.createElement('button');
      el.type = 'button';
      let className = 'exgame-save-btn';
      if (button.danger) className += ' exgame-save-btn-danger';
      if (button.id === 'media') className += ' exgame-save-btn-media';
      el.className = className;
      el.dataset.id = button.id;
      el.textContent = isMobileShell()
        ? button.label.replace(/\s*\([A-Z]\)\s*$/, '')
        : button.label;
      el.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        button.action();
      });
      root.appendChild(el);
    }

    const ver = document.createElement('div');
    ver.className = 'exgame-save-build-tag';
    ver.textContent = 'build media-ui';
    root.appendChild(ver);

    const stack = document.getElementById(STACK_ID);
    if (isMobileShell() && stack) {
      root.classList.add('exgame-save-controls-in-stack');
      stack.appendChild(root);
    } else {
      document.body.appendChild(root);
    }
    this.root = root;
  }

  private ensureStyle(): void {
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `
#${ROOT_ID}.exgame-save-controls {
  position: fixed !important;
  top: 16px !important;
  right: 16px !important;
  z-index: 2147482900 !important;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: calc(100dvh - 24px);
  overflow-x: hidden;
  overflow-y: auto;
  pointer-events: none !important;
  padding-bottom: 8px;
  box-sizing: border-box;
}
#${ROOT_ID} .exgame-save-btn {
  pointer-events: auto !important;
  width: 200px;
  min-height: 40px;
  height: 40px;
  flex-shrink: 0;
  border: 2px solid #7896b4;
  border-radius: 10px;
  background: rgba(28, 38, 52, 0.92);
  color: #ebf5ff;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  font-family: "Pretendard", "Noto Sans KR", "Segoe UI", sans-serif;
  box-shadow: 0 4px 14px rgba(0,0,0,0.35);
}
#${ROOT_ID} .exgame-save-btn:hover {
  border-color: #a8d0ff;
  transform: translateY(-1px);
}
#${ROOT_ID} .exgame-save-btn:active {
  transform: translateY(1px);
}
#${ROOT_ID} .exgame-save-btn-danger {
  background: rgba(72, 36, 28, 0.94);
  border-color: #ffaa6e;
  color: #ffe8d8;
}
#${ROOT_ID} .exgame-save-btn-media {
  background: rgba(28, 48, 40, 0.94);
  border-color: #6ecf9a;
  color: #e8fff3;
}
#${ROOT_ID} .exgame-save-build-tag {
  pointer-events: none;
  font-size: 11px;
  color: #6ecf9a;
  text-align: right;
  padding: 0 4px;
  opacity: 0.85;
}
body.exgame-mobile #${ROOT_ID}.exgame-save-controls,
body.exgame-mobile #${ROOT_ID}.exgame-save-controls-in-stack {
  position: static !important;
  top: auto !important;
  right: auto !important;
  z-index: auto !important;
  gap: 5px;
  margin-top: 2px;
  max-height: none;
  overflow: visible;
  padding-bottom: 0;
}
body.exgame-mobile #${ROOT_ID}.exgame-save-controls:not(.exgame-save-controls-in-stack) {
  position: fixed !important;
  left: max(8px, env(safe-area-inset-left, 0px)) !important;
  top: 72px !important;
  right: auto !important;
  max-height: calc(100dvh - 80px);
  overflow-y: auto;
}
body.exgame-mobile #${ROOT_ID} .exgame-save-btn {
  width: 100px;
  height: 24px;
  min-height: 24px;
  border-width: 1px;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
${mobileFontUnifyCss(`#${ROOT_ID}`)}
`;
  }
}
