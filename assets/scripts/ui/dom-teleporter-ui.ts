/**
 * 텔레포터 NPC 이용 UI (DOM).
 * - 현재 위치 저장 (최대 99, 이름·좌표)
 * - 저장 목록에서 이동 / 좌표 직접 입력 이동
 * - 이용 1회당 아크 광석 차감
 */

import type { InventoryModel } from '../inventory/inventory-model';
import { getItemDefinition } from '../inventory/item-registry';
import type { PlayerStatsModel } from '../player/player-stats-model';
import type { TeleportWaypoint } from '../npc/teleport-types';
import type { TeleportWaypointStore } from '../npc/teleport-waypoint-store';
import {
  TELEPORTER_COST_ARK,
  TELEPORTER_COST_ITEM_ID,
  TELEPORTER_MAX_WAYPOINTS,
  TELEPORTER_UNLOCK_LEVEL,
} from '../npc/teleporter-config';
import {
  NPC_DIALOGUE_SHELL_CSS,
  ensureNpcDialogueShellStyle,
  wrapNpcDialogueShell,
} from '../ui/dom-npc-dialogue-shell';
import { setTeleporterMenuOpen } from '../ui/hud-layout';

const ROOT_ID = 'exgame-teleporter-root';
const STYLE_ID = 'exgame-teleporter-style';

export type TeleporterMessageSink = (message: string) => void;

export interface TeleporterUiContext {
  readonly getPlayerWorldTile: () => { x: number; y: number };
  readonly teleportToWorldTile: (x: number, y: number) => void;
  readonly inventory: InventoryModel;
  readonly playerStats: PlayerStatsModel;
  readonly waypoints: TeleportWaypointStore;
  readonly showMessage: TeleporterMessageSink;
}

export class DomTeleporterUi {
  private root: HTMLDivElement | null = null;
  private context: TeleporterUiContext | null = null;
  private selectedId: string | null = null;
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.root) return;
    if (event.key === 'Escape' || event.code === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
  };

  open(context: TeleporterUiContext): void {
    this.ensureStyle();
    this.context = context;
    this.selectedId = null;

    if (context.playerStats.getLevel() <= TELEPORTER_UNLOCK_LEVEL) {
      context.showMessage(
        `텔레포터는 영웅 레벨 ${TELEPORTER_UNLOCK_LEVEL + 1} 이상부터 이용할 수 있습니다.`,
      );
      return;
    }

    this.root?.remove();
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.addEventListener('mousedown', (event) => event.stopPropagation());
    root.addEventListener('click', (event) => event.stopPropagation());
    root.addEventListener('wheel', (event) => event.stopPropagation());
    document.body.appendChild(root);
    this.root = root;
    setTeleporterMenuOpen(true);
    window.addEventListener('keydown', this.onKeyDown, true);
    this.render();
  }

  close(): void {
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.root?.remove();
    this.root = null;
    this.context = null;
    this.selectedId = null;
    setTeleporterMenuOpen(false);
  }

  isOpen(): boolean {
    return this.root !== null;
  }

  destroy(): void {
    this.close();
    document.getElementById(STYLE_ID)?.remove();
  }

  private render(): void {
    const root = this.root;
    const ctx = this.context;
    if (!root || !ctx) return;

    const pos = ctx.getPlayerWorldTile();
    const arkName = getItemDefinition(TELEPORTER_COST_ITEM_ID).displayName;
    const arkQty = ctx.inventory.getQuantity(TELEPORTER_COST_ITEM_ID);
    const waypoints = ctx.waypoints.getAll();

    root.innerHTML = wrapNpcDialogueShell(
      'teleporter',
      `
      <div class="exgame-tp-panel">
        <h2>텔레포터</h2>
        <p class="exgame-tp-hint">
          현재 위치: 타일 (${pos.x}, ${pos.y}) ·
          ${arkName} ${arkQty}개 ·
          이용 1회당 ${TELEPORTER_COST_ARK}개 ·
          저장 ${waypoints.length}/${TELEPORTER_MAX_WAYPOINTS}
        </p>
        <div class="exgame-tp-tabs">
          <section class="exgame-tp-section">
            <h3>위치 저장</h3>
            <div class="exgame-tp-row">
              <input type="text" class="exgame-tp-name" maxlength="32"
                placeholder="위치 이름" />
              <button type="button" class="exgame-tp-btn exgame-tp-save">저장</button>
            </div>
          </section>
          <section class="exgame-tp-section">
            <h3>좌표로 이동</h3>
            <div class="exgame-tp-row">
              <input type="number" class="exgame-tp-coord-x" placeholder="X" />
              <input type="number" class="exgame-tp-coord-y" placeholder="Y" />
              <button type="button" class="exgame-tp-btn exgame-tp-goto-coord">이동</button>
            </div>
          </section>
        </div>
        <section class="exgame-tp-section exgame-tp-list-section">
          <h3>저장된 위치</h3>
          <div class="exgame-tp-list"></div>
        </section>
        <div class="exgame-tp-actions">
          <button type="button" class="exgame-tp-btn exgame-tp-travel" disabled>선택 위치로 이동</button>
          <button type="button" class="exgame-tp-btn exgame-tp-rename" disabled>이름 변경</button>
          <button type="button" class="exgame-tp-btn exgame-tp-delete" disabled>삭제</button>
          <button type="button" class="exgame-tp-btn exgame-tp-close">닫기</button>
        </div>
      </div>
      `,
      '텔레포터',
    );

    const list = root.querySelector('.exgame-tp-list');
    if (list) {
      if (waypoints.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'exgame-tp-empty';
        empty.textContent = '저장된 위치가 없습니다.';
        list.appendChild(empty);
      } else {
        for (const waypoint of waypoints) {
          list.appendChild(this.buildWaypointRow(waypoint));
        }
      }
    }

    root.querySelector('.exgame-tp-close')?.addEventListener('click', () => {
      this.close();
    });
    root.querySelector('.exgame-tp-save')?.addEventListener('click', () => {
      this.handleSave();
    });
    root.querySelector('.exgame-tp-goto-coord')?.addEventListener('click', () => {
      this.handleGotoCoord();
    });
    root.querySelector('.exgame-tp-travel')?.addEventListener('click', () => {
      this.handleTravelSelected();
    });
    root.querySelector('.exgame-tp-rename')?.addEventListener('click', () => {
      this.handleRename();
    });
    root.querySelector('.exgame-tp-delete')?.addEventListener('click', () => {
      this.handleDelete();
    });
    this.syncSelectionButtons();
  }

  private buildWaypointRow(waypoint: TeleportWaypoint): HTMLButtonElement {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'exgame-tp-item';
    if (waypoint.id === this.selectedId) row.classList.add('is-selected');
    row.dataset.id = waypoint.id;
    row.innerHTML = `
      <span class="exgame-tp-item-name">${escapeHtml(waypoint.name)}</span>
      <span class="exgame-tp-item-coord">(${waypoint.worldTileX}, ${waypoint.worldTileY})</span>
    `;
    row.addEventListener('click', () => {
      this.selectedId = waypoint.id;
      this.root?.querySelectorAll('.exgame-tp-item').forEach((node) => {
        node.classList.toggle(
          'is-selected',
          (node as HTMLElement).dataset.id === waypoint.id,
        );
      });
      this.syncSelectionButtons();
    });
    return row;
  }

  private syncSelectionButtons(): void {
    const has = !!this.selectedId;
    const travel = this.root?.querySelector('.exgame-tp-travel') as HTMLButtonElement | null;
    const rename = this.root?.querySelector('.exgame-tp-rename') as HTMLButtonElement | null;
    const del = this.root?.querySelector('.exgame-tp-delete') as HTMLButtonElement | null;
    if (travel) travel.disabled = !has;
    if (rename) rename.disabled = !has;
    if (del) del.disabled = !has;
  }

  private handleSave(): void {
    const ctx = this.context;
    if (!ctx) return;
    if (!this.tryPayCost()) return;
    if (ctx.waypoints.isFull()) {
      ctx.showMessage(`위치는 최대 ${TELEPORTER_MAX_WAYPOINTS}개까지 저장할 수 있습니다.`);
      return;
    }
    const input = this.root?.querySelector('.exgame-tp-name') as HTMLInputElement | null;
    const name = input?.value ?? '';
    const pos = ctx.getPlayerWorldTile();
    const created = ctx.waypoints.add(name, pos.x, pos.y);
    if (!created) {
      ctx.showMessage('위치 저장에 실패했습니다.');
      return;
    }
    ctx.showMessage(`「${created.name}」 위치를 저장했습니다. (${TELEPORTER_COST_ARK} 아크 소모)`);
    this.render();
  }

  private handleGotoCoord(): void {
    const ctx = this.context;
    if (!ctx) return;
    const xInput = this.root?.querySelector('.exgame-tp-coord-x') as HTMLInputElement | null;
    const yInput = this.root?.querySelector('.exgame-tp-coord-y') as HTMLInputElement | null;
    const x = Number(xInput?.value);
    const y = Number(yInput?.value);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      ctx.showMessage('이동할 좌표(X, Y)를 숫자로 입력하세요.');
      return;
    }
    if (!this.tryPayCost()) return;
    ctx.teleportToWorldTile(Math.trunc(x), Math.trunc(y));
    ctx.showMessage(
      `타일 (${Math.trunc(x)}, ${Math.trunc(y)})로 이동했습니다. (${TELEPORTER_COST_ARK} 아크 소모)`,
    );
    this.close();
  }

  private handleTravelSelected(): void {
    const ctx = this.context;
    if (!ctx || !this.selectedId) return;
    const waypoint = ctx.waypoints.findById(this.selectedId);
    if (!waypoint) return;
    if (!this.tryPayCost()) return;
    ctx.teleportToWorldTile(waypoint.worldTileX, waypoint.worldTileY);
    ctx.showMessage(
      `「${waypoint.name}」로 이동했습니다. (${TELEPORTER_COST_ARK} 아크 소모)`,
    );
    this.close();
  }

  private handleRename(): void {
    const ctx = this.context;
    if (!ctx || !this.selectedId) return;
    const waypoint = ctx.waypoints.findById(this.selectedId);
    if (!waypoint) return;
    const next = window.prompt('새 이름', waypoint.name);
    if (next === null) return;
    if (!ctx.waypoints.rename(this.selectedId, next)) {
      ctx.showMessage('이름을 비울 수 없습니다.');
      return;
    }
    this.render();
  }

  private handleDelete(): void {
    const ctx = this.context;
    if (!ctx || !this.selectedId) return;
    const waypoint = ctx.waypoints.findById(this.selectedId);
    if (!waypoint) return;
    if (!window.confirm(`「${waypoint.name}」 위치를 삭제할까요?`)) return;
    ctx.waypoints.remove(this.selectedId);
    this.selectedId = null;
    this.render();
  }

  private tryPayCost(): boolean {
    const ctx = this.context;
    if (!ctx) return false;
    const have = ctx.inventory.getQuantity(TELEPORTER_COST_ITEM_ID);
    if (have < TELEPORTER_COST_ARK) {
      const name = getItemDefinition(TELEPORTER_COST_ITEM_ID).displayName;
      ctx.showMessage(
        `${name}이(가) 부족합니다. (필요 ${TELEPORTER_COST_ARK}, 보유 ${have})`,
      );
      return false;
    }
    ctx.inventory.remove(TELEPORTER_COST_ITEM_ID, TELEPORTER_COST_ARK);
    return true;
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
        position: fixed;
        inset: 0;
        z-index: 2147482800;
        display: block;
        background: transparent;
        pointer-events: none;
        font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
      }
      ${NPC_DIALOGUE_SHELL_CSS}
      .exgame-tp-panel {
        width: 100%;
        max-height: min(860px, 90vh);
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 20px 22px 16px;
        border-radius: 16px;
        background: linear-gradient(165deg, #1a2740 0%, #121a2a 100%);
        border: 2px solid #6aa0d8;
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
        color: #e8f1ff;
        pointer-events: auto;
      }
      .exgame-tp-panel h2 {
        margin: 0;
        font-size: 26px;
        font-weight: 700;
        color: #9fd0ff;
      }
      .exgame-tp-panel h3 {
        margin: 0 0 8px;
        font-size: 15px;
        color: #b8d4f0;
      }
      .exgame-tp-hint {
        margin: 0;
        font-size: 13px;
        line-height: 1.45;
        color: #a8bdd8;
      }
      .exgame-tp-tabs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      @media (max-width: 640px) {
        .exgame-tp-tabs { grid-template-columns: 1fr; }
      }
      .exgame-tp-section {
        background: rgba(255,255,255,0.04);
        border-radius: 10px;
        padding: 10px 12px;
      }
      .exgame-tp-list-section {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
      }
      .exgame-tp-row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .exgame-tp-row input {
        flex: 1;
        min-width: 80px;
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid #3d5a7a;
        background: #0d1522;
        color: #e8f1ff;
        font-size: 14px;
      }
      .exgame-tp-list {
        overflow-y: auto;
        max-height: 340px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-right: 4px;
      }
      .exgame-tp-empty {
        margin: 8px 0;
        color: #8899aa;
        font-size: 13px;
      }
      .exgame-tp-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid #35506e;
        background: #152033;
        color: #e8f1ff;
        cursor: pointer;
        text-align: left;
        font-size: 14px;
      }
      .exgame-tp-item:hover { border-color: #6aa0d8; }
      .exgame-tp-item.is-selected {
        border-color: #8ec5ff;
        background: #1d3555;
      }
      .exgame-tp-item-name { font-weight: 600; }
      .exgame-tp-item-coord { color: #9bb4d0; font-variant-numeric: tabular-nums; }
      .exgame-tp-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: flex-end;
      }
      .exgame-tp-btn {
        padding: 9px 14px;
        border-radius: 8px;
        border: 1px solid #4a6f98;
        background: #2a4668;
        color: #f0f6ff;
        font-size: 14px;
        cursor: pointer;
      }
      .exgame-tp-btn:hover:not(:disabled) { background: #355a84; }
      .exgame-tp-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .exgame-tp-close {
        background: #3a4458;
        border-color: #5a6678;
      }
    `;
    ensureNpcDialogueShellStyle();
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
