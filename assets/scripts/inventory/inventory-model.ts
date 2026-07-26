import {
  DEFAULT_WEAPON_ITEM_ID,
  EQUIPABLE_WEAPON_IDS,
  getItemDefinition,
  HOTBAR_ITEM_IDS,
  isEquipableArmor,
  isEquipableWeapon,
  isWeaponItem,
  STARTER_GEAR_ITEM_IDS,
} from './item-registry';
import type {
  EquippedItem,
  InventoryState,
  ItemId,
  ItemStack,
} from './item-types';

export type InventoryListener = (model: InventoryModel) => void;

const DEFAULT_CAPACITY = 40;
export const LYCANTHROPE_SWORD_DROP_CHANCE = 0.03;
export const ELDER_LIZARDMAN_SWORD_DROP_CHANCE = 0.03;
/** 중급 하피 드랍 (중급몬스터 셋팅.xlsx). */
export const ELDER_HARPY_MITHRIL_DROP_CHANCE = 0.05;
export const HARPY_SIREN_MITHRIL_DROP_CHANCE = 0.5;
export const HARPY_QUEEN_ORICHALCUM_DROP_CHANCE = 0.1;
/** 중급 트롤 드랍 (트롤1/트롤2.xlsx). */
export const TROLL_MITHRIL_DROP_CHANCE = 0.06;
export const ELDER_TROLL_MITHRIL_DROP_CHANCE = 0.65;
export const HIGH_TROLL_ORICHALCUM_DROP_CHANCE = 0.1;
export const TWINHEAD_TROLL_MITHRIL_DROP_CHANCE = 0.07;
export const BLOOD_TROLL_MITHRIL_DROP_CHANCE = 0.75;
export const TROLL_KING_ORICHALCUM_DROP_CHANCE = 0.12;
/** 중급 오우거 드랍 (오우거1/오우거2.xlsx). */
export const OGRE_MITHRIL_DROP_CHANCE = 0.08;
export const ELDER_OGRE_MITHRIL_DROP_CHANCE = 0.77;
export const TWINHEAD_OGRE_ORICHALCUM_DROP_CHANCE = 0.15;
export const BLOOD_OGRE_MITHRIL_DROP_CHANCE = 0.09;
export const THUNDER_OGRE_MITHRIL_DROP_CHANCE = 0.78;
export const OGRE_KING_ORICHALCUM_DROP_CHANCE = 0.19;
export const STARTER_GEAR_QUANTITY = 10;

/**
 * 스택 기반 소지품 모델입니다.
 * 핫바 1번=장착 무기, 몸통=장착 갑옷(인벤 표시만).
 */
export class InventoryModel {
  private readonly quantities = new Map<ItemId, number>();
  private readonly listeners = new Set<InventoryListener>();
  private selectedHotbarIndex = 0;
  private equippedWeaponId: ItemId = DEFAULT_WEAPON_ITEM_ID;
  private equippedArmorId: ItemId | null = null;

  addListener(listener: InventoryListener): void {
    this.listeners.add(listener);
    listener(this);
  }

  getQuantity(itemId: ItemId): number {
    return this.quantities.get(itemId) ?? 0;
  }

  /** 저장된 InventoryState로 현재 소지품을 덮어씁니다. */
  loadFromState(state: InventoryState): void {
    this.quantities.clear();
    for (const stack of state.stacks) {
      this.quantities.set(stack.itemId, stack.quantity);
    }
    const mainHand = state.equipment.find((entry) => entry.slot === 'mainHand');
    this.equippedWeaponId = mainHand && isWeaponItem(mainHand.itemId)
      ? mainHand.itemId
      : DEFAULT_WEAPON_ITEM_ID;
    if (
      this.equippedWeaponId !== DEFAULT_WEAPON_ITEM_ID
      && this.getQuantity(this.equippedWeaponId) <= 0
    ) {
      this.equippedWeaponId = DEFAULT_WEAPON_ITEM_ID;
    }

    const body = state.equipment.find((entry) => entry.slot === 'body');
    this.equippedArmorId = body && isEquipableArmor(body.itemId)
      ? body.itemId
      : null;
    if (this.equippedArmorId && this.getQuantity(this.equippedArmorId) <= 0) {
      this.equippedArmorId = null;
    }

    this.selectedHotbarIndex = 0;
    this.notify();
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

  /** 목표 수량까지 부족한 만큼만 채웁니다. */
  ensureQuantity(itemId: ItemId, target: number): void {
    const need = target - this.getQuantity(itemId);
    if (need > 0) this.add(itemId, need);
  }

  /** 초급 포션 등 스타터 아이템을 목표 수량으로 맞춥니다. */
  ensureStarterGear(quantity = STARTER_GEAR_QUANTITY): void {
    for (const itemId of STARTER_GEAR_ITEM_IDS) {
      this.ensureQuantity(itemId, quantity);
    }
  }

  /** 소지품·장착을 비우고 스타터(초급 포션)만 지급합니다. */
  resetForNewGame(starterQuantity = STARTER_GEAR_QUANTITY): void {
    this.quantities.clear();
    this.equippedWeaponId = DEFAULT_WEAPON_ITEM_ID;
    this.equippedArmorId = null;
    this.selectedHotbarIndex = 0;
    this.ensureStarterGear(starterQuantity);
  }

  /** 보유량이 충분할 때만 제거하고 성공 여부를 반환합니다. */
  remove(itemId: ItemId, amount: number): boolean {
    const current = this.getQuantity(itemId);
    if (current < amount) return false;

    const next = current - amount;
    this.quantities.set(itemId, next);
    if (
      next <= 0
      && this.equippedWeaponId === itemId
      && itemId !== DEFAULT_WEAPON_ITEM_ID
    ) {
      this.equippedWeaponId = DEFAULT_WEAPON_ITEM_ID;
    }
    if (next <= 0 && this.equippedArmorId === itemId) {
      this.equippedArmorId = null;
    }
    this.notify();
    return true;
  }

  getSelectedHotbarIndex(): number {
    return this.selectedHotbarIndex;
  }

  /** 핫바 인덱스에 표시·선택되는 아이템(1번은 장착 무기). */
  getHotbarItemId(index: number): ItemId | null {
    if (index === 0) return this.equippedWeaponId;
    return HOTBAR_ITEM_IDS[index] ?? null;
  }

  getSelectedItemId(): ItemId | null {
    return this.getHotbarItemId(this.selectedHotbarIndex);
  }

  getEquippedWeaponId(): ItemId {
    return this.equippedWeaponId;
  }

  getEquippedArmorId(): ItemId | null {
    return this.equippedArmorId;
  }

  /** 장착 갑옷의 피해 감소량(없으면 0). */
  getEquippedDefense(): number {
    if (!this.equippedArmorId) return 0;
    return getItemDefinition(this.equippedArmorId).defensePower ?? 0;
  }

  selectHotbarIndex(index: number): void {
    if (index < 0 || index >= HOTBAR_ITEM_IDS.length) return;
    if (index === this.selectedHotbarIndex) return;
    this.selectedHotbarIndex = index;
    this.notify();
  }

  /**
   * 검을 1번 슬롯에 장착합니다. 무기는 동시에 1개만 장착됩니다.
   * 같은 검을 다시 누르면 주먹으로 해제합니다.
   */
  equipWeapon(itemId: ItemId): boolean {
    if (itemId === DEFAULT_WEAPON_ITEM_ID) {
      if (this.equippedWeaponId === DEFAULT_WEAPON_ITEM_ID) return false;
      this.equippedWeaponId = DEFAULT_WEAPON_ITEM_ID;
      this.notify();
      return true;
    }
    if (!isEquipableWeapon(itemId)) return false;
    if (this.getQuantity(itemId) <= 0) return false;
    // 이미 장착 중이면 해제
    if (this.equippedWeaponId === itemId) {
      this.equippedWeaponId = DEFAULT_WEAPON_ITEM_ID;
      this.notify();
      return true;
    }
    // 다른 무기로 교체(기존 무기는 자동 해제, 슬롯은 1개)
    this.equippedWeaponId = itemId;
    this.notify();
    return true;
  }

  /** 토글 없이 무기를 강제 장착합니다(강화 장비 → 일반 검 전환용). */
  setEquippedWeapon(itemId: ItemId): boolean {
    if (itemId === DEFAULT_WEAPON_ITEM_ID) {
      if (this.equippedWeaponId === DEFAULT_WEAPON_ITEM_ID) return false;
      this.equippedWeaponId = DEFAULT_WEAPON_ITEM_ID;
      this.notify();
      return true;
    }
    if (!isEquipableWeapon(itemId)) return false;
    if (this.getQuantity(itemId) <= 0) return false;
    if (this.equippedWeaponId === itemId) return true;
    this.equippedWeaponId = itemId;
    this.notify();
    return true;
  }

  /** 무기 슬롯을 주먹으로 되돌립니다. */
  unequipWeaponToFist(): void {
    if (this.equippedWeaponId === DEFAULT_WEAPON_ITEM_ID) return;
    this.equippedWeaponId = DEFAULT_WEAPON_ITEM_ID;
    this.notify();
  }

  /**
   * 갑옷을 몸통에 장착합니다. 갑옷은 동시에 1개만 장착됩니다.
   * 같은 갑옷을 다시 누르면 해제합니다. (캐릭터 외형 변경 없음)
   */
  equipArmor(itemId: ItemId): boolean {
    if (!isEquipableArmor(itemId)) return false;
    if (this.getQuantity(itemId) <= 0) return false;
    if (this.equippedArmorId === itemId) {
      this.equippedArmorId = null;
      this.notify();
      return true;
    }
    // 다른 갑옷으로 교체(기존 갑옷 자동 해제)
    this.equippedArmorId = itemId;
    this.notify();
    return true;
  }

  /** 토글 없이 갑옷을 강제 장착합니다. */
  setEquippedArmor(itemId: ItemId): boolean {
    if (!isEquipableArmor(itemId)) return false;
    if (this.getQuantity(itemId) <= 0) return false;
    if (this.equippedArmorId === itemId) return true;
    this.equippedArmorId = itemId;
    this.notify();
    return true;
  }

  unequipArmor(): void {
    if (!this.equippedArmorId) return;
    this.equippedArmorId = null;
    this.notify();
  }

  /** 소지 중인 장착 가능 무기 목록입니다. */
  listOwnedEquipableWeapons(): ReadonlyArray<ItemId> {
    return EQUIPABLE_WEAPON_IDS.filter((id) => this.getQuantity(id) > 0);
  }

  /** 인벤토리 패널에 보여줄 스택(수량 > 0). */
  listOwnedStacks(): ReadonlyArray<ItemStack> {
    const stacks: ItemStack[] = [];
    for (const [itemId, quantity] of this.quantities) {
      if (quantity > 0) stacks.push({ itemId, quantity });
    }
    stacks.sort((a, b) => {
      const tierA = getItemDefinition(a.itemId).tier;
      const tierB = getItemDefinition(b.itemId).tier;
      if (tierA !== tierB) return tierA - tierB;
      return a.itemId.localeCompare(b.itemId);
    });
    return stacks;
  }

  /** 저장 스키마(`InventoryState`)와 동일한 불변 스냅샷입니다. */
  toState(): InventoryState {
    const stacks: ItemStack[] = [];
    for (const [itemId, quantity] of this.quantities) {
      if (quantity > 0) stacks.push({ itemId, quantity });
    }
    const equipment: EquippedItem[] = [];
    if (this.equippedWeaponId !== DEFAULT_WEAPON_ITEM_ID) {
      equipment.push({ slot: 'mainHand', itemId: this.equippedWeaponId });
    }
    if (this.equippedArmorId) {
      equipment.push({ slot: 'body', itemId: this.equippedArmorId });
    }
    const quickSlots: Array<ItemId | null> = [...HOTBAR_ITEM_IDS];
    quickSlots[0] = this.equippedWeaponId;
    return {
      capacity: DEFAULT_CAPACITY,
      stacks,
      equipment,
      quickSlots,
    };
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this);
  }
}
