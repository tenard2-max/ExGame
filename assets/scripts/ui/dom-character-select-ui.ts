/**
 * 새로 시작 시 캐릭터 선택 오버레이(DOM)입니다.
 * 제공 초상화를 그리드로 보여 주고, 확정 시 콜백을 호출합니다.
 */

import {
  DEFAULT_CHARACTER_ID,
  PLAYABLE_CHARACTERS,
  type CharacterId,
  getCharacterDefinition,
} from '../player/character-registry';

const ROOT_ID = 'exgame-character-select';
const STYLE_ID = 'exgame-character-select-style';

export type CharacterSelectConfirm = (characterId: CharacterId) => void | Promise<void>;

export class DomCharacterSelectUi {
  private root: HTMLDivElement | null = null;
  private selectedId: CharacterId = DEFAULT_CHARACTER_ID;
  private onConfirm: CharacterSelectConfirm | null = null;
  private onCancel: (() => void) | null = null;
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.root) return;
    if (event.key === 'Escape' || event.code === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close(false);
    }
  };

  open(options: {
    readonly initialId?: CharacterId;
    readonly onConfirm: CharacterSelectConfirm;
    readonly onCancel?: () => void;
  }): void {
    this.ensureStyle();
    this.onConfirm = options.onConfirm;
    this.onCancel = options.onCancel ?? null;
    this.selectedId = options.initialId
      ? getCharacterDefinition(options.initialId).id
      : DEFAULT_CHARACTER_ID;

    this.root?.remove();
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="exgame-char-panel">
        <h2>캐릭터 선택</h2>
        <p class="exgame-char-hint">캐릭터를 고른 뒤 「이 캐릭터로 시작」을 누르면 레벨 1로 새로 시작합니다. (ESC 취소)</p>
        <div class="exgame-char-grid-wrap">
          <div class="exgame-char-grid"></div>
        </div>
        <div class="exgame-char-actions">
          <button type="button" class="exgame-char-cancel">취소</button>
          <button type="button" class="exgame-char-ok">이 캐릭터로 시작 (레벨 1)</button>
        </div>
      </div>
    `;
    // 게임 캔버스 위에 오도록 body 맨 끝에 붙인다.
    document.body.appendChild(root);
    this.root = root;

    const assetBase = new URL('.', globalThis.location.href);
    const grid = root.querySelector('.exgame-char-grid');
    if (grid) {
      for (const character of PLAYABLE_CHARACTERS) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'exgame-char-card';
        card.dataset.id = character.id;
        const portraitSrc = new URL(character.portraitUrl, assetBase).href;
        card.innerHTML = `
          <img src="${portraitSrc}" alt="${character.displayName}" loading="lazy" decoding="async" />
          <span>${character.displayName}</span>
        `;
        card.addEventListener('click', () => {
          this.selectedId = character.id;
          this.syncSelection();
        });
        card.addEventListener('dblclick', () => {
          this.selectedId = character.id;
          this.syncSelection();
          void this.confirm();
        });
        grid.appendChild(card);
      }
    }

    root.querySelector('.exgame-char-cancel')?.addEventListener('click', () => {
      this.close(false);
    });
    root.querySelector('.exgame-char-ok')?.addEventListener('click', () => {
      void this.confirm();
    });

    window.addEventListener('keydown', this.onKeyDown, true);
    this.syncSelection();
  }

  isOpen(): boolean {
    return Boolean(this.root);
  }

  private async confirm(): Promise<void> {
    const handler = this.onConfirm;
    const id = this.selectedId;
    this.close(true);
    if (handler) await handler(id);
  }

  private close(confirmed: boolean): void {
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.root?.remove();
    this.root = null;
    const cancel = this.onCancel;
    this.onConfirm = null;
    this.onCancel = null;
    if (!confirmed) cancel?.();
  }

  private syncSelection(): void {
    if (!this.root) return;
    this.root.querySelectorAll('.exgame-char-card').forEach((node) => {
      const button = node as HTMLButtonElement;
      button.classList.toggle('is-selected', button.dataset.id === this.selectedId);
    });
  }

  private ensureStyle(): void {
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    // 초상화는 전체 신체가 보이도록 contain + 고정 슬롯(기존 150px → 300px).
    // 목록만 스크롤하고 제목/버튼은 고정합니다.
    style.textContent = `
#${ROOT_ID} {
  position: fixed; inset: 0; z-index: 2147483646;
  display: flex; align-items: center; justify-content: center;
  background: rgba(6, 10, 18, 0.88);
  font-family: "Pretendard", "Noto Sans KR", sans-serif;
  pointer-events: auto;
}
#${ROOT_ID} .exgame-char-panel {
  width: min(1280px, 96vw);
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: linear-gradient(160deg, #1a2436, #121826);
  border: 1px solid #7eb6e8;
  border-radius: 16px;
  padding: 20px 22px 18px;
  color: #eef5ff;
  box-shadow: 0 18px 48px rgba(0,0,0,0.45);
}
#${ROOT_ID} h2 { margin: 0 0 6px; font-size: 28px; font-weight: 700; flex: 0 0 auto; }
#${ROOT_ID} .exgame-char-hint {
  margin: 0 0 14px; color: #a9bdd6; font-size: 14px; flex: 0 0 auto;
}
#${ROOT_ID} .exgame-char-grid-wrap {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 2px 8px 8px 2px;
  margin-right: -4px;
  scrollbar-gutter: stable;
}
#${ROOT_ID} .exgame-char-grid-wrap::-webkit-scrollbar { width: 10px; }
#${ROOT_ID} .exgame-char-grid-wrap::-webkit-scrollbar-thumb {
  background: #5a7394; border-radius: 8px;
}
#${ROOT_ID} .exgame-char-grid-wrap::-webkit-scrollbar-track { background: #182232; border-radius: 8px; }
#${ROOT_ID} .exgame-char-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}
@media (max-width: 1100px) {
  #${ROOT_ID} .exgame-char-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 780px) {
  #${ROOT_ID} .exgame-char-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 480px) {
  #${ROOT_ID} .exgame-char-grid { grid-template-columns: 1fr; }
}
#${ROOT_ID} .exgame-char-card {
  appearance: none; border: 2px solid #3a4d66; background: #0f1622;
  border-radius: 12px; padding: 12px 10px 14px; cursor: pointer;
  color: #e8f1ff; display: flex; flex-direction: column; align-items: center; gap: 10px;
  transition: border-color .15s ease, transform .15s ease;
}
#${ROOT_ID} .exgame-char-card:hover { border-color: #8ec7ff; transform: translateY(-2px); }
#${ROOT_ID} .exgame-char-card.is-selected {
  border-color: #ffc46a; box-shadow: 0 0 0 1px #ffc46a inset;
}
#${ROOT_ID} .exgame-char-card img {
  width: 100%;
  height: 360px;
  object-fit: contain;
  object-position: center center;
  image-rendering: auto;
  -ms-interpolation-mode: bicubic;
  /* 원본 PNG 검정 배경과 맞춥니다. */
  background: #000;
  border-radius: 8px;
}
#${ROOT_ID} .exgame-char-card span { font-size: 15px; font-weight: 600; }
#${ROOT_ID} .exgame-char-actions {
  display: flex; justify-content: flex-end; gap: 10px;
  margin-top: 14px; flex: 0 0 auto;
  padding-top: 12px; border-top: 1px solid #2a3a52;
}
#${ROOT_ID} .exgame-char-actions button {
  appearance: none; border-radius: 10px; border: 1px solid #6f8fb3;
  padding: 10px 16px; font-size: 15px; font-weight: 600; cursor: pointer;
}
#${ROOT_ID} .exgame-char-cancel { background: #243044; color: #d7e4f5; }
#${ROOT_ID} .exgame-char-ok { background: #d9893d; border-color: #f0b46a; color: #1a1008; }
`;
  }
}
