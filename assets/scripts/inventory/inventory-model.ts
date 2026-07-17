import { getItemDefinition, HOTBAR_ITEM_IDS } from './item-registry';
import type { InventoryState, ItemId, ItemStack } from './item-types';

export type InventoryListener = (model: InventoryModel) => void;

const DEFAULT_CAPACITY = 20;

/**
 * 스택 기반 소지품 모델입니다.
 * 핫바 슬롯은 아이템 종류에 고정 배정되고, 선택된 슬롯이 설치 재료가 됩니다.
 */
export class InventoryModel {
  private readonly quantities = new Map<ItemId, number>();
  private readonly listeners = new Set<InventoryListener>();
  private selectedHotbarIndex = 0;

  addListener(listener: InventoryListener): void {
    this.listeners.add(listener);
    listener(this);
  }

  getQuantity(itemId: ItemId): number {
    return this.quantities.get(itemId) ?? 0;
  }

  /** 스택 상한까지만 추가하고 실제 추가된 수량을 반환합니다. */
  add(itemId: ItemId, amount: number): number {
    const maxStack = getItemDefinition(itemId).maxStack;
    const current = this.getQuantity(itemId);
    const added = Math.min(amount, maxStack - current);
    if (added <= 0) return 0;

    this.quantities.set(itemId, current + added);
    this.notify();
    return added;
  }

  /** 보유량이 충분할 때만 제거하고 성공 여부를 반환합니다. */
  remove(itemId: ItemId, amount: number): boolean {
    const current = this.getQuantity(itemId);
    if (current < amount) return false;

    this.quantities.set(itemId, current - amount);
    this.notify();
    return true;
  }

  getSelectedHotbarIndex(): number {
    return this.selectedHotbarIndex;
  }

  getSelectedItemId(): ItemId | null {
    return HOTBAR_ITEM_IDS[this.selectedHotbarIndex] ?? null;
  }

  selectHotbarIndex(index: number): void {
    if (index < 0 || index >= HOTBAR_ITEM_IDS.length) return;
    if (index === this.selectedHotbarIndex) return;
    this.selectedHotbarIndex = index;
    this.notify();
  }

  /** 저장 스키마(`InventoryState`)와 동일한 불변 스냅샷입니다. */
  toState(): InventoryState {
    const stacks: ItemStack[] = [];
    for (const [itemId, quantity] of this.quantities) {
      if (quantity > 0) stacks.push({ itemId, quantity });
    }
    return {
      capacity: DEFAULT_CAPACITY,
      stacks,
      equipment: [],
      quickSlots: [...HOTBAR_ITEM_IDS],
    };
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this);
  }
}
