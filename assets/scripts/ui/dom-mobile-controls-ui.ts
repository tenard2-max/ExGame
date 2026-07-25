/**
 * 모바일 전용: 아이템/물약 버튼 + 우측 십자 이동 패드입니다.
 */
import type { UnifiedInput } from '../input/unified-input';
import { isMobileShell } from './mobile-shell';

const ROOT_ID = 'exgame-mobile-controls';
const STYLE_ID = 'exgame-mobile-controls-style';

export class DomMobileControlsUi {
  private root: HTMLDivElement | null = null;
  private input: UnifiedInput | null = null;
  private onToggleInventory: (() => void) | null = null;
  private onTogglePotion: (() => void) | null = null;
  private activeDirs = new Set<'up' | 'down' | 'left' | 'right'>();

  mount(
    input: UnifiedInput,
    onToggleInventory: () => void,
    onTogglePotion: () => void,
  ): void {
    this.destroy();
    if (!isMobileShell()) return;
    this.input = input;
    this.onToggleInventory = onToggleInventory;
    this.onTogglePotion = onTogglePotion;
    this.ensureStyle();
    this.build();
  }

  destroy(): void {
    this.clearDirection();
    this.root?.remove();
    this.root = null;
    document.getElementById(ROOT_ID)?.remove();
    this.input = null;
    this.onToggleInventory = null;
    this.onTogglePotion = null;
  }

  private build(): void {
    document.getElementById(ROOT_ID)?.remove();
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.className = 'exgame-mobile-controls';

    const actions = document.createElement('div');
    actions.className = 'exgame-mobile-actions';

    const itemBtn = document.createElement('button');
    itemBtn.type = 'button';
    itemBtn.className = 'exgame-mobile-action';
    itemBtn.textContent = '아이템';
    itemBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onToggleInventory?.();
    });

    const potionBtn = document.createElement('button');
    potionBtn.type = 'button';
    potionBtn.className = 'exgame-mobile-action';
    potionBtn.textContent = '물약';
    potionBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onTogglePotion?.();
    });

    actions.appendChild(itemBtn);
    actions.appendChild(potionBtn);

    const pad = document.createElement('div');
    pad.className = 'exgame-dpad';
    pad.setAttribute('aria-label', '이동');

    const dirs: Array<{
      dir: 'up' | 'down' | 'left' | 'right';
      label: string;
      cls: string;
    }> = [
      { dir: 'up', label: '▲', cls: 'exgame-dpad-up' },
      { dir: 'left', label: '◀', cls: 'exgame-dpad-left' },
      { dir: 'right', label: '▶', cls: 'exgame-dpad-right' },
      { dir: 'down', label: '▼', cls: 'exgame-dpad-down' },
    ];

    for (const entry of dirs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `exgame-dpad-btn ${entry.cls}`;
      btn.textContent = entry.label;
      btn.setAttribute('aria-label', entry.dir);
      this.bindDirectionButton(btn, entry.dir);
      pad.appendChild(btn);
    }

    root.appendChild(actions);
    root.appendChild(pad);
    document.body.appendChild(root);
    this.root = root;
  }

  private bindDirectionButton(
    btn: HTMLButtonElement,
    dir: 'up' | 'down' | 'left' | 'right',
  ): void {
    const press = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
      this.activeDirs.add(dir);
      this.syncVirtualDirection();
    };
    const release = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
      this.activeDirs.delete(dir);
      this.syncVirtualDirection();
    };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  private syncVirtualDirection(): void {
    const x = Number(this.activeDirs.has('right')) - Number(this.activeDirs.has('left'));
    const y = Number(this.activeDirs.has('up')) - Number(this.activeDirs.has('down'));
    this.input?.setVirtualDirection(x, y);
  }

  private clearDirection(): void {
    this.activeDirs.clear();
    this.input?.setVirtualDirection(0, 0);
  }

  private ensureStyle(): void {
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `
#${ROOT_ID}.exgame-mobile-controls {
  position: fixed !important;
  right: max(12px, env(safe-area-inset-right, 0px)) !important;
  bottom: max(16px, env(safe-area-inset-bottom, 0px)) !important;
  z-index: 2147482800 !important;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  pointer-events: none !important;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
#${ROOT_ID} .exgame-mobile-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  pointer-events: none;
}
#${ROOT_ID} .exgame-mobile-action {
  pointer-events: auto !important;
  width: 72px;
  height: 36px;
  border: 2px solid #9ec8ff;
  border-radius: 10px;
  background: rgba(28, 38, 52, 0.92);
  color: #ebf5ff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  font-family: "Pretendard", "Noto Sans KR", "Segoe UI", sans-serif;
  box-shadow: 0 3px 10px rgba(0,0,0,0.35);
}
#${ROOT_ID} .exgame-dpad {
  pointer-events: none;
  display: grid;
  grid-template-columns: 44px 44px 44px;
  grid-template-rows: 44px 44px 44px;
  gap: 4px;
  width: 140px;
  height: 140px;
}
#${ROOT_ID} .exgame-dpad-btn {
  pointer-events: auto !important;
  width: 44px;
  height: 44px;
  border: 2px solid #7896b4;
  border-radius: 10px;
  background: rgba(28, 38, 52, 0.9);
  color: #ebf5ff;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  touch-action: none;
  box-shadow: 0 3px 10px rgba(0,0,0,0.35);
}
#${ROOT_ID} .exgame-dpad-btn:active {
  background: rgba(60, 90, 130, 0.95);
  border-color: #a8d0ff;
}
#${ROOT_ID} .exgame-dpad-up { grid-column: 2; grid-row: 1; }
#${ROOT_ID} .exgame-dpad-left { grid-column: 1; grid-row: 2; }
#${ROOT_ID} .exgame-dpad-right { grid-column: 3; grid-row: 2; }
#${ROOT_ID} .exgame-dpad-down { grid-column: 2; grid-row: 3; }
`;
  }
}
