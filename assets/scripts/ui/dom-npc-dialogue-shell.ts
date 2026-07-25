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
const PORTRAIT_CACHE_VERSION = '5';

const SHELL_STYLE_ID = 'exgame-npc-dialogue-shell-style';

/** 월드 타일 1칸(px). 대화 UI 오프셋에 사용합니다. */
const TILE_PX = 32;
/** 좌측 초상화 → 캐릭터(화면 중앙) 쪽 이동량. */
const PORTRAIT_SHIFT_TOWARD_CHARACTER_PX = 6 * TILE_PX;
/** 우측 UI 패널 → 캐릭터(화면 중앙) 쪽 이동량. */
const PANEL_SHIFT_TOWARD_CHARACTER_PX = 3 * TILE_PX;

/** 빌드 산출물 `/ui/portraits/*.png` 경로(쿼리 무시, 오리진 기준). */
export function getNpcPortraitUrl(portraitId: NpcPortraitId): string {
  const file = PORTRAIT_FILES[portraitId];
  const origin = globalThis.location?.origin ?? '';
  return `${origin}/ui/portraits/${file}?v=${PORTRAIT_CACHE_VERSION}`;
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
  // 인라인 스타일로 시트 충돌·max-height % 붕괴를 막습니다.
  const imgStyle = [
    'display:block',
    'max-width:min(100%,46vw)',
    'max-height:88vh',
    'width:auto',
    'height:auto',
    'object-fit:contain',
    'object-position:center center',
    `transform:translateX(${PORTRAIT_SHIFT_TOWARD_CHARACTER_PX}px)`,
    'pointer-events:none',
    'user-select:none',
    '-webkit-user-select:none',
  ].join(';');
  return `
    <div class="exgame-npc-shell">
      <div class="exgame-npc-portrait-col">
        <img
          class="exgame-npc-portrait"
          src="${src}"
          alt="${escapeAttr(altLabel)}"
          style="${imgStyle}"
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
    grid-template-columns: 1fr 1fr;
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
    padding: 3vh 2vw;
    box-sizing: border-box;
    pointer-events: none;
  }
  .exgame-npc-portrait {
    display: block !important;
    max-width: min(100%, 46vw) !important;
    max-height: 88vh !important;
    width: auto !important;
    height: auto !important;
    object-fit: contain !important;
    object-position: center center;
    transform: translateX(${PORTRAIT_SHIFT_TOWARD_CHARACTER_PX}px) !important;
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
    padding: 3vh 2vw;
    box-sizing: border-box;
    pointer-events: none;
  }
  .exgame-npc-panel-col > * {
    width: min(100%, 640px);
    max-height: min(88vh, 900px);
    transform: translateX(-${PANEL_SHIFT_TOWARD_CHARACTER_PX}px);
    pointer-events: auto;
  }
  @media (max-width: 820px) {
    .exgame-npc-shell {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(0, 38vh) minmax(0, 1fr);
    }
    .exgame-npc-portrait-col {
      padding: 1.5vh 3vw 0;
    }
    .exgame-npc-portrait {
      max-width: 90vw !important;
      max-height: 34vh !important;
      transform: none !important;
    }
    .exgame-npc-panel-col {
      padding: 1vh 3vw 2vh;
      align-items: center;
    }
    .exgame-npc-panel-col > * {
      width: min(100%, 96vw);
      max-height: min(56vh, 900px);
      transform: none;
    }
  }
`;

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
