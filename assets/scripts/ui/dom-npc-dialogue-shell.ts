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
    width: min(100%, 340px) !important;
    max-width: min(44vw, 360px) !important;
    max-height: min(84vh, 620px) !important;
    transform: none !important;
  }
`;

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
