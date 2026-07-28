/**
 * 대장장이 NPC UI.
 * - 레벨 20 이하: 위치 저장만
 * - 레벨 21+: 제조 / 강화 / 위치 저장
 */

import type { InventoryModel } from '../inventory/inventory-model';
import {
  getItemDefinition,
  isEquipableArmor,
  isEquipableWeapon,
} from '../inventory/item-registry';
import type { ItemId } from '../inventory/item-types';
import type { PlayerStatsModel } from '../player/player-stats-model';
import {
  AFFIX_GRADE_COLOR,
  AFFIX_GRADE_LABEL,
  AFFIX_GRADES,
  describeAffix,
} from '../npc/equipment-affix';
import {
  BLACKSMITH_SERVICE_UNLOCK_LEVEL,
  getUpgradeTier,
  type CraftRecipe,
} from '../npc/blacksmith-config';
import type { BlacksmithService } from '../npc/blacksmith-service';
import type { GearInstance, GearInstanceStore } from '../npc/gear-instance-store';
import type { TeleportWaypointStore } from '../npc/teleport-waypoint-store';
import {
  TELEPORTER_COST_ARK,
  TELEPORTER_COST_ITEM_ID,
  TELEPORTER_MAX_WAYPOINTS,
} from '../npc/teleporter-config';
import {
  NPC_DIALOGUE_SHELL_CSS,
  bindNpcTouchScrollInRoot,
  ensureNpcDialogueShellStyle,
  guardNpcRootEvents,
  wrapNpcDialogueShell,
} from '../ui/dom-npc-dialogue-shell';
import { setBlacksmithMenuOpen } from '../ui/hud-layout';

const ROOT_ID = 'exgame-blacksmith-root';
const STYLE_ID = 'exgame-blacksmith-style';

type TabId = 'craft' | 'upgrade' | 'waypoint';

export interface BlacksmithUiContext {
  readonly inventory: InventoryModel;
  readonly playerStats: PlayerStatsModel;
  readonly gears: GearInstanceStore;
  readonly service: BlacksmithService;
  readonly waypoints: TeleportWaypointStore;
  readonly getPlayerWorldTile: () => { x: number; y: number };
  readonly showMessage: (message: string) => void;
  readonly onGearChanged?: () => void;
}

export class DomBlacksmithUi {
  private root: HTMLDivElement | null = null;
  private context: BlacksmithUiContext | null = null;
  private tab: TabId = 'waypoint';
  private selectedGearId: string | null = null;
  private selectedStackItemId: ItemId | null = null;
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.root) return;
    if (event.key === 'Escape' || event.code === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
  };

  open(context: BlacksmithUiContext): void {
    this.ensureStyle();
    this.context = context;
    this.selectedGearId = null;
    this.selectedStackItemId = null;
    this.tab = context.service.canUseServices() ? 'craft' : 'waypoint';

    this.root?.remove();
    const root = document.createElement('div');
    root.id = ROOT_ID;
    guardNpcRootEvents(root);
    document.body.appendChild(root);
    this.root = root;
    setBlacksmithMenuOpen(true);
    window.addEventListener('keydown', this.onKeyDown, true);
    this.render();
  }

  close(): void {
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.root?.remove();
    this.root = null;
    this.context = null;
    setBlacksmithMenuOpen(false);
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

    const unlocked = ctx.service.canUseServices();
    const level = ctx.playerStats.getLevel();

    root.innerHTML = wrapNpcDialogueShell(
      'blacksmith',
      `
      <div class="exgame-bs-panel">
        <h2>대장장이</h2>
        <p class="exgame-bs-hint">
          영웅 레벨 ${level}
          ${unlocked
            ? ' · 제조·강화 이용 가능'
            : ` · 제조·강화는 레벨 ${BLACKSMITH_SERVICE_UNLOCK_LEVEL + 1}+ (지금은 위치 저장만)`}
        </p>
        <div class="exgame-bs-tabs"></div>
        <div class="exgame-bs-body"></div>
        <div class="exgame-bs-actions">
          <button type="button" class="exgame-bs-btn exgame-bs-close">닫기</button>
        </div>
      </div>
      `,
      '대장장이',
    );

    const tabs = root.querySelector('.exgame-bs-tabs');
    if (tabs) {
      const defs: Array<{ id: TabId; label: string; enabled: boolean }> = [
        { id: 'craft', label: '아이템 제조', enabled: unlocked },
        { id: 'upgrade', label: '아이템 업그레이드', enabled: unlocked },
        { id: 'waypoint', label: '위치 저장', enabled: true },
      ];
      for (const def of defs) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'exgame-bs-tab'
          + (this.tab === def.id ? ' is-active' : '')
          + (def.enabled ? '' : ' is-disabled');
        btn.textContent = def.label;
        btn.disabled = !def.enabled;
        btn.addEventListener('click', () => {
          if (!def.enabled) return;
          this.tab = def.id;
          this.render();
        });
        tabs.appendChild(btn);
      }
    }

    const body = root.querySelector('.exgame-bs-body');
    if (body) {
      if (this.tab === 'craft' && unlocked) this.renderCraft(body as HTMLElement, ctx);
      else if (this.tab === 'upgrade' && unlocked) this.renderUpgrade(body as HTMLElement, ctx);
      else this.renderWaypoint(body as HTMLElement, ctx);
    }

    root.querySelector('.exgame-bs-close')?.addEventListener('click', () => this.close());
    bindNpcTouchScrollInRoot(root, ['.exgame-bs-body', '.exgame-bs-gear-list']);
  }

  private renderCraft(body: HTMLElement, ctx: BlacksmithUiContext): void {
    body.innerHTML = '<div class="exgame-bs-list"></div>';
    const list = body.querySelector('.exgame-bs-list')!;
    for (const recipe of ctx.service.listCraftRecipes()) {
      list.appendChild(this.buildRecipeCard(recipe, ctx));
    }
  }

  private buildRecipeCard(recipe: CraftRecipe, ctx: BlacksmithUiContext): HTMLElement {
    const card = document.createElement('div');
    card.className = 'exgame-bs-card';
    const mats = recipe.materials
      .map((mat) => {
        const have = ctx.inventory.getQuantity(mat.itemId);
        const name = getItemDefinition(mat.itemId).displayName;
        const ok = have >= mat.amount;
        return `<span class="${ok ? 'ok' : 'bad'}">${name} ${have}/${mat.amount}</span>`;
      })
      .join(' · ');
    const locked = ctx.playerStats.getLevel() <= recipe.unlockLevel;
    card.innerHTML = `
      <div class="exgame-bs-card-title">${escapeHtml(recipe.displayName)}</div>
      <div class="exgame-bs-card-meta">성공률 ${(recipe.successChance * 100).toFixed(0)}%
        · 해금 Lv.${recipe.unlockLevel + 1}+</div>
      <div class="exgame-bs-card-mats">${mats}</div>
      <div class="exgame-bs-card-opts">${formatOptionChances(recipe)}</div>
      <button type="button" class="exgame-bs-btn" ${locked ? 'disabled' : ''}>제조</button>
    `;
    card.querySelector('button')?.addEventListener('click', () => {
      const result = ctx.service.craft(recipe.id);
      ctx.showMessage(result.message);
      ctx.onGearChanged?.();
      this.render();
    });
    return card;
  }

  private renderUpgrade(body: HTMLElement, ctx: BlacksmithUiContext): void {
    body.innerHTML = `
      <div class="exgame-bs-columns">
        <div class="exgame-bs-col">
          <h3>강화할 장비</h3>
          <div class="exgame-bs-list exgame-bs-gear-list"></div>
        </div>
        <div class="exgame-bs-col">
          <h3>강화 정보</h3>
          <div class="exgame-bs-upgrade-detail"></div>
        </div>
      </div>
    `;
    const list = body.querySelector('.exgame-bs-gear-list')!;
    const detail = body.querySelector('.exgame-bs-upgrade-detail') as HTMLElement;

    for (const gear of ctx.gears.getAll()) {
      list.appendChild(this.buildGearSelectRow(gear, 'gear', gear.id, ctx, detail));
    }

    for (const stack of ctx.inventory.listOwnedStacks()) {
      if (!isEquipableWeapon(stack.itemId) && !isEquipableArmor(stack.itemId)) continue;
      if (stack.itemId === 'weapon-fist') continue;
      list.appendChild(
        this.buildStackSelectRow(stack.itemId, stack.quantity, ctx, detail),
      );
    }

    if (list.childElementCount === 0) {
      list.innerHTML = '<p class="exgame-bs-empty">강화 가능한 장비가 없습니다. 먼저 제조하거나 인벤 장비를 준비하세요.</p>';
    }
    this.renderUpgradeDetail(detail, ctx);
  }

  private buildGearSelectRow(
    gear: GearInstance,
    kind: 'gear',
    id: string,
    ctx: BlacksmithUiContext,
    detail: HTMLElement,
  ): HTMLElement {
    const def = getItemDefinition(gear.itemId);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'exgame-bs-item'
      + (this.selectedGearId === id ? ' is-selected' : '');
    row.innerHTML = `
      <span>${escapeHtml(def.displayName)} +${gear.upgradeLevel}</span>
      <span class="exgame-bs-item-sub">${formatGearShort(gear)}</span>
      <span class="exgame-bs-equip-row"></span>
    `;
    const equipRow = row.querySelector('.exgame-bs-equip-row')!;
    const equipBtn = document.createElement('button');
    equipBtn.type = 'button';
    equipBtn.className = 'exgame-bs-btn';
    equipBtn.textContent = def.kind === 'armor' ? '갑옷 장착' : '무기 장착';
    equipBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      if (def.kind === 'armor') {
        ctx.gears.equipArmorGear(gear.id);
        ctx.inventory.unequipArmor();
      } else {
        ctx.gears.equipWeaponGear(gear.id);
        ctx.inventory.unequipWeaponToFist();
      }
      ctx.showMessage(`${def.displayName} +${gear.upgradeLevel} 장착`);
      ctx.onGearChanged?.();
    });
    equipRow.appendChild(equipBtn);
    row.addEventListener('click', () => {
      this.selectedGearId = id;
      this.selectedStackItemId = null;
      this.renderUpgradeDetail(detail, ctx);
      this.root?.querySelectorAll('.exgame-bs-item').forEach((node) => {
        node.classList.remove('is-selected');
      });
      row.classList.add('is-selected');
    });
    return row;
  }

  private buildStackSelectRow(
    itemId: ItemId,
    quantity: number,
    ctx: BlacksmithUiContext,
    detail: HTMLElement,
  ): HTMLElement {
    const def = getItemDefinition(itemId);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'exgame-bs-item'
      + (this.selectedStackItemId === itemId ? ' is-selected' : '');
    row.innerHTML = `
      <span>${escapeHtml(def.displayName)} ×${quantity}</span>
      <span class="exgame-bs-item-sub">인벤 기본 장비 (+0으로 등록 후 강화)</span>
    `;
    row.addEventListener('click', () => {
      this.selectedStackItemId = itemId;
      this.selectedGearId = null;
      this.renderUpgradeDetail(detail, ctx);
      this.root?.querySelectorAll('.exgame-bs-item').forEach((node) => {
        node.classList.remove('is-selected');
      });
      row.classList.add('is-selected');
    });
    return row;
  }

  private renderUpgradeDetail(detail: HTMLElement, ctx: BlacksmithUiContext): void {
    let gear = this.selectedGearId
      ? ctx.gears.findById(this.selectedGearId)
      : null;
    const stackId = this.selectedStackItemId;

    if (!gear && !stackId) {
      detail.innerHTML = '<p class="exgame-bs-empty">왼쪽에서 장비를 선택하세요.</p>';
      return;
    }

    const itemId = gear?.itemId ?? stackId!;
    const def = getItemDefinition(itemId);
    const currentLevel = gear?.upgradeLevel ?? 0;
    const nextLevel = currentLevel + 1;
    const tier = getUpgradeTier(nextLevel);
    const isArmor = def.kind === 'armor';
    const mats = tier.materials
      .map((mat) => {
        const have = ctx.inventory.getQuantity(mat.itemId);
        const name = getItemDefinition(mat.itemId).displayName;
        const ok = have >= mat.amount;
        return `<span class="${ok ? 'ok' : 'bad'}">${name} ${have}/${mat.amount}</span>`;
      })
      .join('<br/>');

    detail.innerHTML = `
      <div class="exgame-bs-card-title">${escapeHtml(def.displayName)} → +${nextLevel}</div>
      <div class="exgame-bs-card-meta">성공률 ${(tier.successChance * 100).toFixed(0)}%
        · 해금 Lv.${tier.unlockLevel + 1}+</div>
      <div class="exgame-bs-card-meta">성공 시 ${isArmor ? `방어+${tier.successDefense}` : `공격+${tier.successAttack}`}
        · 실패해도 장비 보존</div>
      <div class="exgame-bs-card-mats">${mats}</div>
      ${gear ? formatGearOptionsHtml(gear) : '<p class="exgame-bs-empty">기본 장비(옵션 없음)</p>'}
      <button type="button" class="exgame-bs-btn exgame-bs-do-upgrade">강화 시도</button>
    `;
    detail.querySelector('.exgame-bs-do-upgrade')?.addEventListener('click', () => {
      const result = ctx.service.upgrade({
        gearId: this.selectedGearId ?? undefined,
        sourceStackItemId: this.selectedStackItemId ?? undefined,
      });
      ctx.showMessage(result.message);
      if (result.ok && result.gear) {
        this.selectedGearId = result.gear.id;
        this.selectedStackItemId = null;
      }
      ctx.onGearChanged?.();
      this.render();
    });
  }

  private renderWaypoint(body: HTMLElement, ctx: BlacksmithUiContext): void {
    const pos = ctx.getPlayerWorldTile();
    const ark = ctx.inventory.getQuantity(TELEPORTER_COST_ITEM_ID);
    const arkName = getItemDefinition(TELEPORTER_COST_ITEM_ID).displayName;
    body.innerHTML = `
      <p class="exgame-bs-hint">현재 타일 (${pos.x}, ${pos.y}) · ${arkName} ${ark}개
        · 저장 1회당 ${TELEPORTER_COST_ARK}개 · ${ctx.waypoints.count()}/${TELEPORTER_MAX_WAYPOINTS}</p>
      <div class="exgame-bs-row">
        <input type="text" class="exgame-bs-name" maxlength="32" placeholder="위치 이름" />
        <button type="button" class="exgame-bs-btn exgame-bs-save-wp">현재 위치 저장</button>
      </div>
      <div class="exgame-bs-list exgame-bs-wp-list"></div>
    `;
    const list = body.querySelector('.exgame-bs-wp-list')!;
    for (const wp of ctx.waypoints.getAll()) {
      const row = document.createElement('div');
      row.className = 'exgame-bs-wp-row';
      row.innerHTML = `
        <span>${escapeHtml(wp.name)} (${wp.worldTileX}, ${wp.worldTileY})</span>
        <button type="button" class="exgame-bs-btn exgame-bs-del" data-id="${wp.id}">삭제</button>
      `;
      list.appendChild(row);
    }
    if (list.childElementCount === 0) {
      list.innerHTML = '<p class="exgame-bs-empty">저장된 위치가 없습니다.</p>';
    }

    body.querySelector('.exgame-bs-save-wp')?.addEventListener('click', () => {
      if (ctx.waypoints.isFull()) {
        ctx.showMessage(`위치는 최대 ${TELEPORTER_MAX_WAYPOINTS}개까지 저장할 수 있습니다.`);
        return;
      }
      if (ctx.inventory.getQuantity(TELEPORTER_COST_ITEM_ID) < TELEPORTER_COST_ARK) {
        ctx.showMessage(`${arkName}이(가) 부족합니다.`);
        return;
      }
      ctx.inventory.remove(TELEPORTER_COST_ITEM_ID, TELEPORTER_COST_ARK);
      const nameInput = body.querySelector('.exgame-bs-name') as HTMLInputElement;
      const created = ctx.waypoints.add(nameInput?.value ?? '', pos.x, pos.y);
      if (!created) {
        ctx.showMessage('위치 저장에 실패했습니다.');
        return;
      }
      ctx.showMessage(`「${created.name}」 위치를 저장했습니다.`);
      this.render();
    });

    list.querySelectorAll('.exgame-bs-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (!id) return;
        ctx.waypoints.remove(id);
        this.render();
      });
    });
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
        position: fixed; inset: 0; z-index: 2147482800;
        display: block;
        background: transparent;
        pointer-events: none;
        font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
      }
      ${NPC_DIALOGUE_SHELL_CSS}
      .exgame-bs-panel {
        width: 100%; max-height: min(900px, 92vh);
        display: flex; flex-direction: column; gap: 10px;
        padding: 18px 20px 14px; border-radius: 16px;
        background: linear-gradient(165deg, #2a2218 0%, #15110c 100%);
        border: 2px solid #c4a574; color: #f3e8d5;
        box-shadow: 0 18px 48px rgba(0,0,0,0.5);
        pointer-events: auto;
        overflow: hidden;
      }
      .exgame-bs-panel h2 { margin: 0; font-size: 26px; color: #ffd59a; }
      .exgame-bs-panel h3 { margin: 0 0 8px; font-size: 15px; color: #e0c9a0; }
      .exgame-bs-hint { margin: 0; font-size: 13px; color: #cbb898; line-height: 1.4; }
      .exgame-bs-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
      .exgame-bs-tab {
        padding: 8px 12px; border-radius: 8px; border: 1px solid #7a6240;
        background: #3a2e20; color: #f3e8d5; cursor: pointer;
      }
      .exgame-bs-tab.is-active { background: #6a4e2a; border-color: #e0b060; }
      .exgame-bs-tab.is-disabled { opacity: 0.4; cursor: not-allowed; }
      .exgame-bs-body { flex: 1; min-height: 0; overflow: auto; }
      .exgame-bs-list { display: flex; flex-direction: column; gap: 8px; }
      .exgame-bs-card, .exgame-bs-item, .exgame-bs-wp-row {
        background: rgba(255,255,255,0.04); border: 1px solid #5a4630;
        border-radius: 10px; padding: 10px 12px;
      }
      .exgame-bs-item {
        width: 100%; text-align: left; color: inherit; cursor: pointer;
        display: flex; flex-direction: column; gap: 4px;
      }
      .exgame-bs-item.is-selected { border-color: #e0b060; background: #3d301c; }
      .exgame-bs-item-sub { font-size: 12px; color: #b9a384; }
      .exgame-bs-card-title { font-weight: 700; font-size: 16px; }
      .exgame-bs-card-meta, .exgame-bs-card-mats, .exgame-bs-card-opts {
        font-size: 12px; margin-top: 4px; color: #d2c0a0;
      }
      .exgame-bs-card-mats .ok { color: #8fdf8f; }
      .exgame-bs-card-mats .bad { color: #ff8f8f; }
      .exgame-bs-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      @media (max-width: 720px) { .exgame-bs-columns { grid-template-columns: 1fr; } }
      .exgame-bs-col { min-height: 0; }
      .exgame-bs-gear-list { max-height: 420px; overflow: auto; }
      .exgame-bs-row { display: flex; gap: 8px; margin-bottom: 10px; }
      .exgame-bs-row input {
        flex: 1; padding: 8px 10px; border-radius: 8px;
        border: 1px solid #7a6240; background: #1a140e; color: #f3e8d5;
      }
      .exgame-bs-wp-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
      .exgame-bs-actions { display: flex; justify-content: flex-end; }
      .exgame-bs-btn {
        padding: 8px 14px; border-radius: 8px; border: 1px solid #8a6a3a;
        background: #5a4024; color: #fff4e0; cursor: pointer; margin-top: 8px;
      }
      .exgame-bs-btn:disabled { opacity: 0.45; cursor: not-allowed; }
      .exgame-bs-btn:hover:not(:disabled) { background: #6e4e2c; }
      .exgame-bs-close { background: #3a342c; border-color: #6a6258; }
      .exgame-bs-empty { color: #a89880; font-size: 13px; }
      .exgame-bs-affix { margin: 2px 0; font-size: 13px; font-weight: 600; }
      .exgame-bs-affix.mythic {
        background: linear-gradient(90deg, #ffe566, #ffb000, #ffe566, #ffd700);
        background-size: 200% auto;
        -webkit-background-clip: text; background-clip: text;
        color: transparent;
        animation: exgame-mythic-shine 2.2s linear infinite;
        filter: drop-shadow(0 0 4px rgba(255, 200, 50, 0.65));
      }
      @keyframes exgame-mythic-shine {
        0% { background-position: 0% center; }
        100% { background-position: 200% center; }
      }
    `;
    ensureNpcDialogueShellStyle();
  }
}

function formatOptionChances(recipe: CraftRecipe): string {
  return AFFIX_GRADES.map((grade) => {
    const table = recipe.options[grade];
    const pct = table.chance >= 0.01
      ? `${(table.chance * 100).toFixed(0)}%`
      : `${(table.chance * 100).toFixed(2)}%`;
    return `<span class="exgame-bs-affix ${grade}" style="color:${AFFIX_GRADE_COLOR[grade]}">${AFFIX_GRADE_LABEL[grade]} ${pct}</span>`;
  }).join(' ');
}

function formatGearShort(gear: GearInstance): string {
  const parts = [`ATK+${gear.bonusAttack}`, `DEF+${gear.bonusDefense}`];
  const opt = AFFIX_GRADES.filter((g) => gear.options[g]).length;
  if (opt > 0) parts.push(`옵션 ${opt}`);
  return parts.join(' · ');
}

function formatGearOptionsHtml(gear: GearInstance): string {
  const lines = AFFIX_GRADES
    .filter((grade) => gear.options[grade])
    .map((grade) => {
      const affix = gear.options[grade]!;
      const cls = grade === 'mythic' ? 'exgame-bs-affix mythic' : 'exgame-bs-affix';
      const color = grade === 'mythic' ? '' : `style="color:${AFFIX_GRADE_COLOR[grade]}"`;
      return `<div class="${cls}" ${color}>[${AFFIX_GRADE_LABEL[grade]}] ${escapeHtml(describeAffix(affix))}</div>`;
    });
  if (lines.length === 0) return '<p class="exgame-bs-empty">옵션 없음</p>';
  return lines.join('');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
