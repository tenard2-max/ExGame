/**
 * 은행 NPC UI.
 * - 위치 저장(최대 99) · 입금/출금 · 대출/상환
 * 좌측 고화질 초상화 + 우측 패널.
 */

import type { InventoryModel } from '../inventory/inventory-model';
import {
  formatExactQuantity,
  getItemDefinition,
} from '../inventory/item-registry';
import type { PlayerStatsModel } from '../player/player-stats-model';
import type { BankAccountStore } from '../npc/bank-account-store';
import { repayFeeFor } from '../npc/bank-account-store';
import type { BankService } from '../npc/bank-service';
import type { BankWaypoint } from '../npc/bank-types';
import {
  BANKER_CURRENCY_ITEM_ID,
  BANKER_DEPOSIT_FEE_AMOUNT,
  BANKER_DEPOSIT_FEE_ITEM_ID,
  BANKER_LOAN_STEP_ARK,
  BANKER_MAX_WAYPOINTS,
  BANKER_UNLOCK_LEVEL,
  BANKER_WITHDRAW_FEE_ARK,
} from '../npc/banker-config';
import {
  NPC_DIALOGUE_SHELL_CSS,
  bindNpcTouchScrollInRoot,
  ensureNpcDialogueShellStyle,
  guardNpcRootEvents,
  wrapNpcDialogueShell,
} from '../ui/dom-npc-dialogue-shell';
import { setBankerMenuOpen } from '../ui/hud-layout';

const ROOT_ID = 'exgame-banker-root';
const STYLE_ID = 'exgame-banker-style';

type TabId = 'waypoint' | 'vault' | 'loan';

export interface BankerUiContext {
  readonly inventory: InventoryModel;
  readonly playerStats: PlayerStatsModel;
  readonly account: BankAccountStore;
  readonly service: BankService;
  readonly getPlayerWorldTile: () => { x: number; y: number };
  readonly teleportToWorldTile: (x: number, y: number) => void;
  readonly showMessage: (message: string) => void;
}

export class DomBankerUi {
  private root: HTMLDivElement | null = null;
  private context: BankerUiContext | null = null;
  private tab: TabId = 'vault';
  private selectedId: string | null = null;
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.root) return;
    if (event.key === 'Escape' || event.code === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
  };

  open(context: BankerUiContext): void {
    this.ensureStyle();
    this.context = context;
    this.selectedId = null;
    this.tab = 'vault';

    if (context.playerStats.getLevel() <= BANKER_UNLOCK_LEVEL) {
      context.showMessage(
        `은행은 영웅 레벨 ${BANKER_UNLOCK_LEVEL + 1} 이상부터 이용할 수 있습니다.`,
      );
      return;
    }

    this.root?.remove();
    const root = document.createElement('div');
    root.id = ROOT_ID;
    guardNpcRootEvents(root);
    document.body.appendChild(root);
    this.root = root;
    setBankerMenuOpen(true);
    window.addEventListener('keydown', this.onKeyDown, true);
    this.render();
  }

  close(): void {
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.root?.remove();
    this.root = null;
    this.context = null;
    this.selectedId = null;
    setBankerMenuOpen(false);
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

    const arkName = getItemDefinition(BANKER_CURRENCY_ITEM_ID).displayName;
    const woodName = getItemDefinition(BANKER_DEPOSIT_FEE_ITEM_ID).displayName;
    const ark = ctx.inventory.getQuantity(BANKER_CURRENCY_ITEM_ID);
    const wood = ctx.inventory.getQuantity(BANKER_DEPOSIT_FEE_ITEM_ID);
    const deposited = ctx.account.getDepositedArk();
    const level = ctx.playerStats.getLevel();

    root.innerHTML = wrapNpcDialogueShell(
      'banker',
      `
      <div class="exgame-bk-panel">
        <h2>은행</h2>
        <p class="exgame-bk-hint">
          예금 ${formatExactQuantity(deposited)} · 보유 ${arkName} ${formatExactQuantity(ark)}
          · ${woodName} ${formatExactQuantity(wood)}
          · 입금수수료 ${woodName}${formatExactQuantity(BANKER_DEPOSIT_FEE_AMOUNT)}
          · 출금수수료 ${arkName}${formatExactQuantity(BANKER_WITHDRAW_FEE_ARK)}
        </p>
        <div class="exgame-bk-tabs"></div>
        <div class="exgame-bk-body"></div>
        <div class="exgame-bk-actions">
          <button type="button" class="exgame-bk-btn exgame-bk-close">닫기</button>
        </div>
      </div>
      `,
      '은행원',
    );

    const tabs = root.querySelector('.exgame-bk-tabs');
    if (tabs) {
      const defs: Array<{ id: TabId; label: string }> = [
        { id: 'vault', label: '입금·출금' },
        { id: 'loan', label: '대출·상환' },
        { id: 'waypoint', label: '위치 저장' },
      ];
      for (const def of defs) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'exgame-bk-tab' + (this.tab === def.id ? ' is-active' : '');
        btn.textContent = def.label;
        btn.addEventListener('click', () => {
          this.tab = def.id;
          this.render();
        });
        tabs.appendChild(btn);
      }
    }

    const body = root.querySelector('.exgame-bk-body');
    if (body) {
      if (this.tab === 'vault') this.renderVault(body as HTMLElement, ctx);
      else if (this.tab === 'loan') this.renderLoan(body as HTMLElement, ctx, level);
      else this.renderWaypoints(body as HTMLElement, ctx);
    }

    root.querySelector('.exgame-bk-close')?.addEventListener('click', () => {
      this.close();
    });
    bindNpcTouchScrollInRoot(root, ['.exgame-bk-body', '.exgame-bk-list']);
  }

  private renderVault(body: HTMLElement, ctx: BankerUiContext): void {
    const woodName = getItemDefinition(BANKER_DEPOSIT_FEE_ITEM_ID).displayName;
    body.innerHTML = `
      <section class="exgame-bk-section">
        <h3>입금</h3>
        <p class="exgame-bk-sub">수수료: ${escapeHtml(woodName)} ${formatExactQuantity(BANKER_DEPOSIT_FEE_AMOUNT)}개</p>
        <div class="exgame-bk-row">
          <input type="number" class="exgame-bk-deposit-amt" min="1" step="1" placeholder="수량" />
          <button type="button" class="exgame-bk-btn exgame-bk-deposit">입금</button>
        </div>
      </section>
      <section class="exgame-bk-section">
        <h3>출금</h3>
        <p class="exgame-bk-sub">수수료: 아크 ${formatExactQuantity(BANKER_WITHDRAW_FEE_ARK)}개 (출금 후 차감)</p>
        <div class="exgame-bk-row">
          <input type="number" class="exgame-bk-withdraw-amt" min="1" step="1" placeholder="수량" />
          <button type="button" class="exgame-bk-btn exgame-bk-withdraw">출금</button>
        </div>
      </section>
    `;
    body.querySelector('.exgame-bk-deposit')?.addEventListener('click', () => {
      const input = body.querySelector('.exgame-bk-deposit-amt') as HTMLInputElement;
      const amount = Number(input.value);
      const result = ctx.service.deposit(amount);
      if (!result.ok) {
        ctx.showMessage(result.message);
        return;
      }
      ctx.showMessage(`아크 ${formatExactQuantity(amount)}개 입금 완료`);
      this.render();
    });
    body.querySelector('.exgame-bk-withdraw')?.addEventListener('click', () => {
      const input = body.querySelector('.exgame-bk-withdraw-amt') as HTMLInputElement;
      const amount = Number(input.value);
      const result = ctx.service.withdraw(amount);
      if (!result.ok) {
        ctx.showMessage(result.message);
        return;
      }
      ctx.showMessage(
        `아크 ${formatExactQuantity(amount)}개 출금 완료 (−수수료 ${formatExactQuantity(BANKER_WITHDRAW_FEE_ARK)})`,
      );
      this.render();
    });
  }

  private renderLoan(
    body: HTMLElement,
    ctx: BankerUiContext,
    level: number,
  ): void {
    const loan = ctx.account.getLoan();
    const preview = ctx.service.describeLoanPreview(level);
    const due = loan ? loan.principalArk + loan.accruedInterestArk : 0;
    const fee = loan ? repayFeeFor(due) : 0;
    body.innerHTML = `
      <section class="exgame-bk-section">
        <h3>대출 현황</h3>
        <p class="exgame-bk-sub">${escapeHtml(preview)}</p>
      </section>
      <section class="exgame-bk-section">
        <h3>대출</h3>
        <p class="exgame-bk-sub">${formatExactQuantity(BANKER_LOAN_STEP_ARK)}개 단위 · 일일 한도 레벨×${formatExactQuantity(BANKER_LOAN_STEP_ARK)}</p>
        <div class="exgame-bk-row">
          <input type="number" class="exgame-bk-loan-amt" min="${BANKER_LOAN_STEP_ARK}"
            step="${BANKER_LOAN_STEP_ARK}" placeholder="${BANKER_LOAN_STEP_ARK}" />
          <button type="button" class="exgame-bk-btn exgame-bk-loan">대출</button>
        </div>
      </section>
      <section class="exgame-bk-section">
        <h3>상환</h3>
        <p class="exgame-bk-sub">
          ${loan
            ? `필요 아크 ${formatExactQuantity(due + fee)} (원금+이자 ${formatExactQuantity(due)} + 수수료 3% ${formatExactQuantity(fee)})`
            : '상환할 대출이 없습니다.'}
        </p>
        <button type="button" class="exgame-bk-btn exgame-bk-repay" ${loan ? '' : 'disabled'}>전액 상환</button>
      </section>
    `;
    body.querySelector('.exgame-bk-loan')?.addEventListener('click', () => {
      const input = body.querySelector('.exgame-bk-loan-amt') as HTMLInputElement;
      const amount = Number(input.value);
      const result = ctx.service.takeLoan(amount);
      if (!result.ok) {
        ctx.showMessage(result.message);
        return;
      }
      ctx.showMessage(`아크 ${formatExactQuantity(amount)}개 대출 완료`);
      this.render();
    });
    body.querySelector('.exgame-bk-repay')?.addEventListener('click', () => {
      const result = ctx.service.repay();
      if (!result.ok) {
        ctx.showMessage(result.message);
        return;
      }
      ctx.showMessage(`상환 완료 (−아크 ${formatExactQuantity(result.paid)})`);
      this.render();
    });
  }

  private renderWaypoints(body: HTMLElement, ctx: BankerUiContext): void {
    const waypoints = ctx.account.getWaypoints();
    const pos = ctx.getPlayerWorldTile();
    body.innerHTML = `
      <section class="exgame-bk-section">
        <h3>현재 위치 저장</h3>
        <p class="exgame-bk-sub">타일 (${pos.x}, ${pos.y}) · ${waypoints.length}/${BANKER_MAX_WAYPOINTS}</p>
        <div class="exgame-bk-row">
          <input type="text" class="exgame-bk-wp-name" maxlength="32" placeholder="위치 이름" />
          <button type="button" class="exgame-bk-btn exgame-bk-wp-save">저장</button>
        </div>
      </section>
      <section class="exgame-bk-section exgame-bk-list-section">
        <h3>저장된 위치</h3>
        <div class="exgame-bk-list"></div>
        <div class="exgame-bk-row" style="margin-top:8px">
          <button type="button" class="exgame-bk-btn exgame-bk-wp-go" disabled>선택 위치로 이동</button>
          <button type="button" class="exgame-bk-btn exgame-bk-wp-rename" disabled>이름 변경</button>
          <button type="button" class="exgame-bk-btn exgame-bk-wp-del" disabled>삭제</button>
        </div>
      </section>
    `;
    const list = body.querySelector('.exgame-bk-list')!;
    if (waypoints.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'exgame-bk-empty';
      empty.textContent = '저장된 위치가 없습니다.';
      list.appendChild(empty);
    } else {
      for (const wp of waypoints) {
        list.appendChild(this.buildWaypointRow(wp));
      }
    }

    body.querySelector('.exgame-bk-wp-save')?.addEventListener('click', () => {
      const input = body.querySelector('.exgame-bk-wp-name') as HTMLInputElement;
      const created = ctx.account.addWaypoint(input.value, pos.x, pos.y);
      if (!created) {
        ctx.showMessage('위치 저장 한도에 도달했습니다.');
        return;
      }
      ctx.showMessage(`「${created.name}」 저장`);
      this.render();
    });

    const syncButtons = (): void => {
      const enabled = !!this.selectedId;
      for (const cls of ['.exgame-bk-wp-go', '.exgame-bk-wp-rename', '.exgame-bk-wp-del']) {
        const btn = body.querySelector(cls) as HTMLButtonElement | null;
        if (btn) btn.disabled = !enabled;
      }
    };
    syncButtons();

    body.querySelector('.exgame-bk-wp-go')?.addEventListener('click', () => {
      const wp = waypoints.find((entry) => entry.id === this.selectedId);
      if (!wp) return;
      ctx.teleportToWorldTile(wp.worldTileX, wp.worldTileY);
      ctx.showMessage(`「${wp.name}」로 이동`);
      this.close();
    });
    body.querySelector('.exgame-bk-wp-rename')?.addEventListener('click', () => {
      if (!this.selectedId) return;
      const name = window.prompt('새 이름');
      if (name == null) return;
      if (!ctx.account.renameWaypoint(this.selectedId, name)) {
        ctx.showMessage('이름 변경에 실패했습니다.');
        return;
      }
      this.render();
    });
    body.querySelector('.exgame-bk-wp-del')?.addEventListener('click', () => {
      if (!this.selectedId) return;
      const wp = waypoints.find((entry) => entry.id === this.selectedId);
      if (!wp) return;
      if (!window.confirm(`「${wp.name}」을(를) 삭제할까요?`)) return;
      ctx.account.removeWaypoint(this.selectedId);
      this.selectedId = null;
      this.render();
    });
  }

  private buildWaypointRow(waypoint: BankWaypoint): HTMLButtonElement {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'exgame-bk-item';
    if (waypoint.id === this.selectedId) row.classList.add('is-selected');
    row.innerHTML = `
      <span class="exgame-bk-item-name">${escapeHtml(waypoint.name)}</span>
      <span class="exgame-bk-item-coord">(${waypoint.worldTileX}, ${waypoint.worldTileY})</span>
    `;
    row.addEventListener('click', () => {
      this.selectedId = waypoint.id;
      this.root?.querySelectorAll('.exgame-bk-item').forEach((node) => {
        node.classList.toggle(
          'is-selected',
          (node as HTMLElement) === row,
        );
      });
      const body = this.root?.querySelector('.exgame-bk-body');
      if (!body) return;
      for (const cls of ['.exgame-bk-wp-go', '.exgame-bk-wp-rename', '.exgame-bk-wp-del']) {
        const btn = body.querySelector(cls) as HTMLButtonElement | null;
        if (btn) btn.disabled = false;
      }
    });
    return row;
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
        display: block; background: transparent; pointer-events: none;
        font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
      }
      ${NPC_DIALOGUE_SHELL_CSS}
      .exgame-bk-panel {
        width: 100%; max-height: min(860px, 90vh);
        display: flex; flex-direction: column; gap: 10px;
        padding: 18px 20px 14px; border-radius: 16px;
        background: linear-gradient(165deg, #1a2840 0%, #101820 100%);
        border: 2px solid #6ab0d8; color: #e8f4ff;
        box-shadow: 0 18px 48px rgba(0,0,0,0.5);
        pointer-events: auto;
        overflow: hidden;
      }
      .exgame-bk-panel h2 { margin: 0; font-size: 26px; color: #9fd4ff; }
      .exgame-bk-panel h3 { margin: 0 0 6px; font-size: 15px; color: #b8d8f0; }
      .exgame-bk-hint, .exgame-bk-sub { margin: 0; font-size: 13px; color: #9bb4c8; line-height: 1.4; }
      .exgame-bk-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
      .exgame-bk-tab {
        padding: 8px 12px; border-radius: 8px; border: 1px solid #3d5a7a;
        background: #1e3048; color: #e8f4ff; cursor: pointer;
      }
      .exgame-bk-tab.is-active { background: #2a5078; border-color: #7ec0f0; }
      .exgame-bk-body { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 10px; }
      .exgame-bk-section {
        background: rgba(255,255,255,0.04); border: 1px solid #35506e;
        border-radius: 10px; padding: 10px 12px;
      }
      .exgame-bk-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
      .exgame-bk-row input {
        flex: 1; min-width: 100px; padding: 8px 10px; border-radius: 8px;
        border: 1px solid #3d5a7a; background: #0d1522; color: #e8f1ff;
      }
      .exgame-bk-list { max-height: 280px; overflow: auto; display: flex; flex-direction: column; gap: 6px; }
      .exgame-bk-item {
        display: flex; justify-content: space-between; gap: 10px; width: 100%;
        padding: 10px 12px; border-radius: 8px; border: 1px solid #35506e;
        background: #152033; color: #e8f1ff; cursor: pointer; text-align: left;
      }
      .exgame-bk-item.is-selected { border-color: #8ec5ff; background: #1d3555; }
      .exgame-bk-item-name { font-weight: 600; }
      .exgame-bk-item-coord { color: #9bb4d0; }
      .exgame-bk-empty { color: #8899aa; font-size: 13px; }
      .exgame-bk-actions { display: flex; justify-content: flex-end; }
      .exgame-bk-btn {
        padding: 8px 14px; border-radius: 8px; border: 1px solid #4a6f98;
        background: #2a4668; color: #f0f6ff; cursor: pointer;
      }
      .exgame-bk-btn:hover:not(:disabled) { background: #355a84; }
      .exgame-bk-btn:disabled { opacity: 0.45; cursor: not-allowed; }
      .exgame-bk-close { background: #3a4458; border-color: #5a6678; }
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
