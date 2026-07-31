/**
 * 게임 시작 시 타이틀(스플래시) 화면.
 * 최소 표시 시간 동안은 입력을 막고, 이후 클릭(또는 Enter/Space)으로만 닫습니다.
 */

import { mobileFontUnifyCss } from './mobile-shell';

const ROOT_ID = 'exgame-splash-root';
const STYLE_ID = 'exgame-splash-style';
const HINT_ID = 'exgame-splash-hint';
const DEFAULT_IMAGE_URL = './ui/splash.png';
/** 의무 표시 시간(ms). 이 전에는 클릭해도 넘어가지 않습니다. */
export const SPLASH_MIN_DURATION_MS = 4000;

export class DomSplashUi {
  private root: HTMLDivElement | null = null;
  private shownAtMs = 0;
  private canContinue = false;
  private continueResolver: (() => void) | null = null;

  /** 스플래시를 즉시 표시합니다. 이미 떠 있으면 무시합니다. */
  show(imageUrl = DEFAULT_IMAGE_URL): void {
    if (typeof document === 'undefined') return;
    if (this.root) return;

    this.ensureStyle();
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'ARK MINING');
    root.innerHTML = `
      <img class="exgame-splash-img" alt="ARK MINING" draggable="false" />
      <div id="${HINT_ID}" class="exgame-splash-hint">로딩 중…</div>
    `;
    const img = root.querySelector('img') as HTMLImageElement;
    img.src = new URL(imageUrl, globalThis.location.href).href;
    img.addEventListener('dragstart', (event) => event.preventDefault());
    img.addEventListener('error', () => {
      // 이미지 실패해도 어두운 스플래시 + 문구는 유지
      img.style.display = 'none';
    });

    root.addEventListener('pointerdown', this.onPointerDown, true);
    root.addEventListener('click', this.onClick, true);
    root.addEventListener('keydown', this.onKeyDown, true);
    root.addEventListener('contextmenu', blockEvent, true);
    root.tabIndex = 0;

    document.body.appendChild(root);
    this.root = root;
    this.shownAtMs = Date.now();
    this.canContinue = false;
    root.focus({ preventScroll: true });
  }

  /**
   * 최소 표시 시간이 지난 뒤, 클릭(또는 Enter/Space)을 기다렸다가 닫습니다.
   * 부트스트랩이 더 오래 걸리면 그 시점부터 카운트 잔여 + 클릭을 기다립니다.
   */
  async waitMinimumThenHide(
    minDurationMs: number = SPLASH_MIN_DURATION_MS,
  ): Promise<void> {
    if (!this.root) return;

    const elapsed = Date.now() - this.shownAtMs;
    const remain = Math.max(0, minDurationMs - elapsed);
    if (remain > 0) {
      await delay(remain);
    }
    if (!this.root) return;

    this.enableContinue();
    await this.waitForContinueSignal();
    this.hide();
  }

  hide(): void {
    if (this.root) {
      this.root.removeEventListener('pointerdown', this.onPointerDown, true);
      this.root.removeEventListener('click', this.onClick, true);
      this.root.removeEventListener('keydown', this.onKeyDown, true);
      this.root.remove();
    }
    this.root = null;
    this.canContinue = false;
    const resolve = this.continueResolver;
    this.continueResolver = null;
    resolve?.();
  }

  isVisible(): boolean {
    return this.root !== null;
  }

  private enableContinue(): void {
    if (!this.root || this.canContinue) return;
    this.canContinue = true;
    this.root.classList.add('is-ready');
    const hint = this.root.querySelector(`#${HINT_ID}`) as HTMLElement | null;
    if (hint) {
      hint.hidden = false;
      hint.textContent = '클릭하여 시작';
    }
    this.root.focus({ preventScroll: true });
  }

  private waitForContinueSignal(): Promise<void> {
    if (!this.root) return Promise.resolve();
    return new Promise((resolve) => {
      this.continueResolver = resolve;
    });
  }

  private readonly onPointerDown = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    if (!this.canContinue) return;
    this.signalContinue();
  };

  private readonly onClick = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    if (!this.canContinue) return;
    this.signalContinue();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (!this.canContinue) return;
    if (event.code !== 'Enter' && event.code !== 'Space') return;
    this.signalContinue();
  };

  private signalContinue(): void {
    const resolve = this.continueResolver;
    this.continueResolver = null;
    resolve?.();
  }

  private ensureStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483000;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #05070c;
        cursor: default;
        user-select: none;
        -webkit-user-select: none;
        touch-action: none;
      }
      #${ROOT_ID}.is-ready {
        cursor: pointer;
      }
      #${ROOT_ID} .exgame-splash-img {
        display: block;
        max-width: 100%;
        max-height: 100%;
        width: auto;
        height: auto;
        object-fit: contain;
        pointer-events: none;
      }
      #${ROOT_ID} .exgame-splash-hint {
        position: absolute;
        left: 50%;
        bottom: max(28px, 4vh);
        transform: translateX(-50%);
        padding: 10px 18px;
        border-radius: 999px;
        background: rgba(8, 12, 22, 0.72);
        border: 1px solid rgba(255, 214, 120, 0.55);
        color: #ffe7a8;
        font-family: "Segoe UI", "Malgun Gothic", sans-serif;
        font-size: clamp(14px, 1.6vw, 20px);
        letter-spacing: 0.04em;
        pointer-events: none;
        animation: exgame-splash-hint-pulse 1.6s ease-in-out infinite;
      }
      @keyframes exgame-splash-hint-pulse {
        0%, 100% { opacity: 0.72; }
        50% { opacity: 1; }
      }
${mobileFontUnifyCss(`#${ROOT_ID}`)}
    `;
    document.head.appendChild(style);
  }
}

function blockEvent(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
