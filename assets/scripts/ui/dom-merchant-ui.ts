/**
 * 상인 NPC 상점 UI.
 * 아크 광석으로 물약·철검·가죽갑옷을 구매합니다.
 */

import type { InventoryModel } from '../inventory/inventory-model';
import { getItemDefinition } from '../inventory/item-registry';
import type { PlayerStatsModel } from '../player/player-stats-model';
import {
  MERCHANT_CURRENCY_ITEM_ID,
  MERCHANT_OFFERS,
  MERCHANT_UNLOCK_LEVEL,
  type MerchantOffer,
} from '../npc/merchant-config';
import {
  NPC_DIALOGUE_SHELL_CSS,
  ensureNpcDialogueShellStyle,
  wrapNpcDialogueShell,
} from '../ui/dom-npc-dialogue-shell';
import { setMerchantMenuOpen } from '../ui/hud-layout';

const ROOT_ID = 'exgame-merchant-root';
const STYLE_ID = 'exgame-merchant-style';

export interface MerchantUiContext {
  readonly inventory: InventoryModel;
  readonly playerStats: PlayerStatsModel;
  readonly showMessage: (message: string) => void;
}

export class DomMerchantUi {
  private root: HTMLDivElement | null = null;
  private context: MerchantUiContext | null = null;
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.root) return;
    if (event.key === 'Escape' || event.code === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
  };

  open(context: MerchantUiContext): void {
    this.ensureStyle();
    this.context = context;

    if (context.playerStats.getLevel() <= MERCHANT_UNLOCK_LEVEL) {
      context.showMessage(
        `상인은 영웅 레벨 ${MERCHANT_UNLOCK_LEVEL + 1} 이상부터 이용할 수 있습니다.`,
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
    setMerchantMenuOpen(true);
    window.addEventListener('keydown', this.onKeyDown, true);
    this.render();
  }

  close(): void {
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.root?.remove();
    this.root = null;
    this.context = null;
    setMerchantMenuOpen(false);
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

    const currencyName = getItemDefinition(MERCHANT_CURRENCY_ITEM_ID).displayName;
    const ark = ctx.inventory.getQuantity(MERCHANT_CURRENCY_ITEM_ID);

    root.innerHTML = wrapNpcDialogueShell(
      'merchant',
      `
      <div class="exgame-mc-panel">
        <h2>상인</h2>
        <p class="exgame-mc-hint">
          보유 ${escapeHtml(currencyName)} ${ark}개 · 클릭으로 구매 (ESC 닫기)
        </p>
        <div class="exgame-mc-sections"></div>
        <div class="exgame-mc-actions">
          <button type="button" class="exgame-mc-btn exgame-mc-close">닫기</button>
        </div>
      </div>
      `,
      '상인',
    );

    const sections = root.querySelector('.exgame-mc-sections')!;
    sections.appendChild(this.buildCategory('물약 판매', 'potion', ctx));
    sections.appendChild(this.buildCategory('무기 판매', 'weapon', ctx));
    sections.appendChild(this.buildCategory('방어구 판매', 'armor', ctx));

    root.querySelector('.exgame-mc-close')?.addEventListener('click', () => {
      this.close();
    });
  }

  private buildCategory(
    title: string,
    category: MerchantOffer['category'],
    ctx: MerchantUiContext,
  ): HTMLElement {
    const section = document.createElement('section');
    section.className = 'exgame-mc-section';
    const heading = document.createElement('h3');
    heading.textContent = title;
    section.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'exgame-mc-list';
    for (const offer of MERCHANT_OFFERS.filter((entry) => entry.category === category)) {
      list.appendChild(this.buildOfferRow(offer, ctx));
    }
    section.appendChild(list);
    return section;
  }

  private buildOfferRow(offer: MerchantOffer, ctx: MerchantUiContext): HTMLElement {
    const currencyName = getItemDefinition(MERCHANT_CURRENCY_ITEM_ID).displayName;
    const have = ctx.inventory.getQuantity(offer.itemId);
    const ark = ctx.inventory.getQuantity(MERCHANT_CURRENCY_ITEM_ID);
    const canBuy = ark >= offer.priceArk;

    const row = document.createElement('div');
    row.className = 'exgame-mc-row';
    row.innerHTML = `
      <div class="exgame-mc-info">
        <div class="exgame-mc-name">${escapeHtml(offer.displayName)}</div>
        <div class="exgame-mc-meta">가격 ${offer.priceArk} ${escapeHtml(currencyName)}
          · 보유 ${have}</div>
      </div>
      <button type="button" class="exgame-mc-btn exgame-mc-buy" ${canBuy ? '' : 'disabled'}>
        구매
      </button>
    `;
    row.querySelector('.exgame-mc-buy')?.addEventListener('click', () => {
      this.buy(offer);
    });
    return row;
  }

  private buy(offer: MerchantOffer): void {
    const ctx = this.context;
    if (!ctx) return;
    const currencyName = getItemDefinition(MERCHANT_CURRENCY_ITEM_ID).displayName;
    const ark = ctx.inventory.getQuantity(MERCHANT_CURRENCY_ITEM_ID);
    if (ark < offer.priceArk) {
      ctx.showMessage(
        `${currencyName}이(가) 부족합니다. (필요 ${offer.priceArk}, 보유 ${ark})`,
      );
      return;
    }
    if (!ctx.inventory.remove(MERCHANT_CURRENCY_ITEM_ID, offer.priceArk)) {
      ctx.showMessage('결제에 실패했습니다.');
      return;
    }
    const added = ctx.inventory.add(offer.itemId, 1);
    if (added <= 0) {
      // 스택 한도 등으로 실패 시 환불
      ctx.inventory.add(MERCHANT_CURRENCY_ITEM_ID, offer.priceArk);
      ctx.showMessage(`${offer.displayName}을(를) 더 가질 수 없습니다.`);
      return;
    }
    ctx.showMessage(
      `${offer.displayName} 구매 완료 (−${offer.priceArk} ${currencyName})`,
    );
    this.render();
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
      .exgame-mc-panel {
        width: 100%; max-height: min(820px, 90vh);
        display: flex; flex-direction: column; gap: 12px;
        padding: 18px 20px 14px; border-radius: 16px;
        background: linear-gradient(165deg, #2a2038 0%, #15101c 100%);
        border: 2px solid #d4b06a; color: #f6efe3;
        box-shadow: 0 18px 48px rgba(0,0,0,0.5);
        pointer-events: auto;
      }
      .exgame-mc-panel h2 { margin: 0; font-size: 26px; color: #ffd98a; }
      .exgame-mc-panel h3 {
        margin: 0 0 8px; font-size: 15px; color: #e8c98a;
      }
      .exgame-mc-hint { margin: 0; font-size: 13px; color: #cbb8a0; }
      .exgame-mc-sections {
        overflow-y: auto; display: flex; flex-direction: column; gap: 12px;
      }
      .exgame-mc-section {
        background: rgba(255,255,255,0.04);
        border: 1px solid #5a4860; border-radius: 10px; padding: 10px 12px;
      }
      .exgame-mc-list { display: flex; flex-direction: column; gap: 8px; }
      .exgame-mc-row {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; padding: 8px 10px; border-radius: 8px;
        background: #1c1526; border: 1px solid #4a3a55;
      }
      .exgame-mc-name { font-weight: 700; font-size: 15px; }
      .exgame-mc-meta { font-size: 12px; color: #b9a8c8; margin-top: 2px; }
      .exgame-mc-actions { display: flex; justify-content: flex-end; }
      .exgame-mc-btn {
        padding: 8px 14px; border-radius: 8px; border: 1px solid #a88440;
        background: #6a4e24; color: #fff6e0; cursor: pointer;
      }
      .exgame-mc-btn:hover:not(:disabled) { background: #7e5e2c; }
      .exgame-mc-btn:disabled { opacity: 0.45; cursor: not-allowed; }
      .exgame-mc-close { background: #3a342c; border-color: #6a6258; }
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
