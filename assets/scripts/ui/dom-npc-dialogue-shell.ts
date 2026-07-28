/**
 * NPC 대화 셸: 좌측 고화질 초상화 + 우측 UI 패널.
 * 빈 영역은 투명·클릭 통과라 배경 타일이 그대로 보입니다.
 */

export type NpcPortraitId = 'blacksmith' | 'merchant' | 'teleporter' | 'banker';

const PORTRAIT_FILES: Record<NpcPortraitId, string> = {
  blacksmith: 'blacksmith.png',
  merchant: 'merchant.png',
  teleporter: 'teleporter.png',
  banker: 'banker.png',
};

/** 초상화 캐시 무효화(파일 교체 시 숫자만 올리면 됩니다). */
const PORTRAIT_CACHE_VERSION = '6';

const SHELL_STYLE_ID = 'exgame-npc-dialogue-shell-style';

/** 데스크톱에서만 살짝 중앙으로 당깁니다(모바일은 잘림 방지로 0). */
const PORTRAIT_SHIFT_DESKTOP_PX = 48;
const PANEL_SHIFT_DESKTOP_PX = 32;

/** 모바일 NPC 패널 타이포 배율(데스크톱 대비). */
export const NPC_MOBILE_FONT_SCALE = 0.4;

/**
 * 빌드 산출물 `ui/portraits/*.png`.
 * origin 절대경로(`/ui/...`)는 Android WebView(`.../assets/www/`)에서 깨지므로
 * 문서 기준 상대경로를 씁니다.
 */
export function getNpcPortraitUrl(portraitId: NpcPortraitId): string {
  const file = PORTRAIT_FILES[portraitId];
  try {
    const base = new URL('.', globalThis.location?.href ?? 'https://local/');
    return new URL(`ui/portraits/${file}?v=${PORTRAIT_CACHE_VERSION}`, base).href;
  } catch {
    return `./ui/portraits/${file}?v=${PORTRAIT_CACHE_VERSION}`;
  }
}

/**
 * 패널 HTML을 좌초상화·우패널 셸로 감쌉니다.
 * `panelHtml`은 기존 패널 루트(예: `.exgame-bs-panel`)를 그대로 넣습니다.
 */
export function wrapNpcDialogueShell(
  portraitId: NpcPortraitId,
  panelHtml: string,
  altLabel: string,
): string {
  ensureNpcDialogueShellStyle();
  const src = escapeAttr(getNpcPortraitUrl(portraitId));
  return `
    <div class="exgame-npc-shell">
      <div class="exgame-npc-portrait-col">
        <img
          class="exgame-npc-portrait"
          src="${src}"
          alt="${escapeAttr(altLabel)}"
          decoding="async"
          draggable="false"
        />
      </div>
      <div class="exgame-npc-panel-col">
        ${panelHtml}
      </div>
    </div>
  `;
}

/** 셸 공통 CSS를 항상 최신으로 주입하고, head 맨 끝에 둬 우선순위를 확보합니다. */
export function ensureNpcDialogueShellStyle(): void {
  if (typeof document === 'undefined') return;
  let style = document.getElementById(SHELL_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = SHELL_STYLE_ID;
  }
  style.textContent = NPC_DIALOGUE_SHELL_CSS;
  document.head.appendChild(style);
}

/**
 * NPC 오버레이 루트에서 DOM 이벤트가 캔버스로 새지 않게 막습니다.
 * (월드 이동은 hud-layout 모달 플래그로도 차단되지만, WebView 이중 입력을 방지합니다.)
 */
export function guardNpcRootEvents(root: HTMLElement): void {
  const stop = (event: Event): void => {
    event.stopPropagation();
  };
  const types: Array<keyof HTMLElementEventMap> = [
    'mousedown',
    'mouseup',
    'mousemove',
    'click',
    'wheel',
    'touchstart',
    'touchmove',
    'touchend',
    'touchcancel',
    'pointerdown',
    'pointermove',
    'pointerup',
    'pointercancel',
  ];
  for (const type of types) {
    root.addEventListener(type, stop, { passive: true });
  }
}

/**
 * 스크롤 영역에 손가락 드래그 스크롤을 연결합니다.
 * 스크롤바 없이 pan-y만 쓰고, 터치가 월드/핀치로 새지 않게 막습니다.
 */
export function bindNpcTouchScroll(scrollEl: HTMLElement): void {
  scrollEl.classList.add('exgame-npc-scroll');

  let active = false;
  let dragging = false;
  let startY = 0;
  let startScrollTop = 0;
  const dragThresholdPx = 8;

  scrollEl.addEventListener(
    'touchstart',
    (event) => {
      if (event.touches.length !== 1) return;
      active = true;
      dragging = false;
      startY = event.touches[0]!.clientY;
      startScrollTop = scrollEl.scrollTop;
      event.stopPropagation();
    },
    { passive: true },
  );

  scrollEl.addEventListener(
    'touchmove',
    (event) => {
      if (!active || event.touches.length !== 1) return;
      const dy = startY - event.touches[0]!.clientY;
      const maxScroll = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
      if (maxScroll <= 0) {
        event.stopPropagation();
        return;
      }
      if (!dragging && Math.abs(dy) < dragThresholdPx) {
        event.stopPropagation();
        return;
      }
      dragging = true;
      scrollEl.scrollTop = Math.min(maxScroll, Math.max(0, startScrollTop + dy));
      event.preventDefault();
      event.stopPropagation();
    },
    { passive: false },
  );

  const end = (event: TouchEvent): void => {
    active = false;
    dragging = false;
    event.stopPropagation();
  };
  scrollEl.addEventListener('touchend', end, { passive: true });
  scrollEl.addEventListener('touchcancel', end, { passive: true });

  scrollEl.addEventListener(
    'wheel',
    (event) => {
      event.stopPropagation();
    },
    { passive: true },
  );
}

/** 루트 안에서 스크롤 후보를 찾아 터치 스크롤을 연결합니다. */
export function bindNpcTouchScrollInRoot(
  root: HTMLElement,
  selectors: readonly string[],
): void {
  for (const selector of selectors) {
    root.querySelectorAll(selector).forEach((node) => {
      if (node instanceof HTMLElement) {
        bindNpcTouchScroll(node);
      }
    });
  }
}

const fs = (px: number): string => `${+(px * NPC_MOBILE_FONT_SCALE).toFixed(2)}px`;

/** 타이틀(h2)이 패널 내 최대 글자 크기. 그 외는 반드시 더 작음. */
const NPC_TITLE_FS = '22px';
const NPC_SUB_FS = '14px';
const NPC_BODY_FS = '13px';
const NPC_META_FS = '12px';
const NPC_TITLE_FS_MOBILE = fs(26);
const NPC_SUB_FS_MOBILE = fs(14);
const NPC_BODY_FS_MOBILE = fs(12);
const NPC_META_FS_MOBILE = fs(11);

/** 각 NPC UI `ensureStyle`에 공통으로 합칩니다. */
export const NPC_DIALOGUE_SHELL_CSS = `
  .exgame-npc-shell {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
    align-items: stretch;
    gap: 0;
    padding: 0;
    box-sizing: border-box;
    pointer-events: none;
  }
  .exgame-npc-portrait-col {
    min-width: 0;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2vh 1vw 2vh 2vw;
    box-sizing: border-box;
    pointer-events: none;
    overflow: hidden;
  }
  .exgame-npc-portrait {
    display: block !important;
    max-width: 100% !important;
    max-height: 86vh !important;
    width: auto !important;
    height: auto !important;
    object-fit: contain !important;
    object-position: center bottom;
    transform: translateX(${PORTRAIT_SHIFT_DESKTOP_PX}px);
    opacity: 1 !important;
    visibility: visible !important;
    pointer-events: none;
    user-select: none;
    -webkit-user-select: none;
  }
  .exgame-npc-panel-col {
    min-width: 0;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2vh 2vw 2vh 1vw;
    box-sizing: border-box;
    pointer-events: none;
    overflow: hidden;
  }
  .exgame-npc-panel-col > * {
    width: min(100%, 480px);
    max-width: 42vw;
    max-height: min(86vh, 820px);
    transform: translateX(-${PANEL_SHIFT_DESKTOP_PX}px);
    pointer-events: auto;
    box-sizing: border-box;
  }

  .exgame-npc-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    touch-action: pan-y;
    scrollbar-width: none;
  }
  .exgame-npc-scroll::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  @media (max-height: 520px), (max-width: 900px) {
    .exgame-npc-shell {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
    .exgame-npc-portrait-col {
      padding: 1vh 0.5vw 1vh 1vw;
    }
    .exgame-npc-portrait {
      max-height: 78vh !important;
      transform: none !important;
    }
    .exgame-npc-panel-col {
      padding: 1vh 1.5vw 1vh 0.5vw;
      justify-content: flex-end;
    }
    .exgame-npc-panel-col > * {
      width: min(100%, 360px) !important;
      max-width: min(46vw, 380px) !important;
      max-height: min(82vh, 640px) !important;
      transform: none !important;
    }
  }

  body.exgame-mobile .exgame-npc-shell {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  body.exgame-mobile .exgame-npc-portrait-col {
    padding: 1vh 0.5vw;
  }
  body.exgame-mobile .exgame-npc-portrait {
    max-width: 100% !important;
    max-height: 82vh !important;
    transform: none !important;
  }
  body.exgame-mobile .exgame-npc-panel-col {
    padding: 1vh 1.5vw 1vh 0.5vw;
    justify-content: flex-end;
  }
  body.exgame-mobile .exgame-npc-panel-col > * {
    width: min(100%, 360px) !important;
    max-width: min(48vw, 380px) !important;
    max-height: min(88vh, 680px) !important;
    transform: none !important;
  }

  /*
   * 타이포 계층: h2(타이틀) > 소제목/이름 > 본문/버튼 > 메타
   * 어떤 요소도 타이틀보다 크면 안 됨 (WebView button UA 기본값 포함).
   */
  .exgame-mc-panel,
  .exgame-bs-panel,
  .exgame-bk-panel,
  .exgame-tp-panel {
    --npc-title-fs: ${NPC_TITLE_FS};
    --npc-sub-fs: ${NPC_SUB_FS};
    --npc-body-fs: ${NPC_BODY_FS};
    --npc-meta-fs: ${NPC_META_FS};
    font-size: var(--npc-body-fs) !important;
  }
  .exgame-mc-panel h2,
  .exgame-bs-panel h2,
  .exgame-bk-panel h2,
  .exgame-tp-panel h2 {
    font-size: var(--npc-title-fs) !important;
    line-height: 1.25 !important;
  }
  .exgame-mc-panel h3,
  .exgame-bs-panel h3,
  .exgame-bk-panel h3,
  .exgame-tp-panel h3,
  .exgame-mc-name,
  .exgame-bs-card-title,
  .exgame-bk-item-name,
  .exgame-tp-item-name {
    font-size: var(--npc-sub-fs) !important;
  }
  .exgame-mc-panel :where(button, input, select, textarea),
  .exgame-bs-panel :where(button, input, select, textarea),
  .exgame-bk-panel :where(button, input, select, textarea),
  .exgame-tp-panel :where(button, input, select, textarea),
  .exgame-mc-btn,
  .exgame-bs-btn,
  .exgame-bk-btn,
  .exgame-tp-btn,
  .exgame-bs-tab,
  .exgame-bk-tab,
  .exgame-bs-item,
  .exgame-bk-item,
  .exgame-tp-item {
    font-size: var(--npc-body-fs) !important;
  }
  .exgame-mc-hint,
  .exgame-bs-hint,
  .exgame-bk-hint,
  .exgame-bk-sub,
  .exgame-tp-hint,
  .exgame-mc-meta,
  .exgame-bs-item-sub,
  .exgame-bs-card-meta,
  .exgame-bs-card-mats,
  .exgame-bs-card-opts,
  .exgame-bs-affix,
  .exgame-bs-empty,
  .exgame-bk-empty,
  .exgame-tp-empty,
  .exgame-bk-item-coord,
  .exgame-tp-item-coord {
    font-size: var(--npc-meta-fs) !important;
    line-height: 1.35 !important;
  }

  /* 모바일: 타이포·여백을 데스크톱의 약 40%로 축소 (타이틀이 여전히 최대) */
  body.exgame-mobile .exgame-mc-panel,
  body.exgame-mobile .exgame-bs-panel,
  body.exgame-mobile .exgame-bk-panel,
  body.exgame-mobile .exgame-tp-panel {
    --npc-title-fs: ${NPC_TITLE_FS_MOBILE};
    --npc-sub-fs: ${NPC_SUB_FS_MOBILE};
    --npc-body-fs: ${NPC_BODY_FS_MOBILE};
    --npc-meta-fs: ${NPC_META_FS_MOBILE};
    gap: 5px !important;
    padding: 7px 8px 6px !important;
    border-radius: 8px !important;
    border-width: 1px !important;
    font-size: var(--npc-body-fs) !important;
  }
  body.exgame-mobile .exgame-mc-panel h3,
  body.exgame-mobile .exgame-bs-panel h3,
  body.exgame-mobile .exgame-bk-panel h3,
  body.exgame-mobile .exgame-tp-panel h3 {
    margin-bottom: 3px !important;
  }
  body.exgame-mobile .exgame-mc-btn,
  body.exgame-mobile .exgame-bs-btn,
  body.exgame-mobile .exgame-bk-btn,
  body.exgame-mobile .exgame-tp-btn,
  body.exgame-mobile .exgame-bs-tab,
  body.exgame-mobile .exgame-bk-tab,
  body.exgame-mobile .exgame-tp-item,
  body.exgame-mobile .exgame-bk-item,
  body.exgame-mobile .exgame-bs-item {
    padding: 4px 6px !important;
    border-radius: 4px !important;
  }
  body.exgame-mobile .exgame-mc-section,
  body.exgame-mobile .exgame-bs-card,
  body.exgame-mobile .exgame-bs-item,
  body.exgame-mobile .exgame-bs-wp-row,
  body.exgame-mobile .exgame-bk-section,
  body.exgame-mobile .exgame-tp-section {
    padding: 4px 5px !important;
    border-radius: 5px !important;
  }
  body.exgame-mobile .exgame-mc-row,
  body.exgame-mobile .exgame-bs-row,
  body.exgame-mobile .exgame-bk-row,
  body.exgame-mobile .exgame-tp-row {
    gap: 4px !important;
    padding: 3px 4px !important;
  }
  body.exgame-mobile .exgame-bs-row input,
  body.exgame-mobile .exgame-bk-row input,
  body.exgame-mobile .exgame-tp-row input {
    padding: 4px 5px !important;
  }
  body.exgame-mobile .exgame-bs-tabs,
  body.exgame-mobile .exgame-bk-tabs {
    gap: 4px !important;
  }
  body.exgame-mobile .exgame-bs-gear-list,
  body.exgame-mobile .exgame-bk-list,
  body.exgame-mobile .exgame-tp-list {
    max-height: none !important;
  }
`;

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
