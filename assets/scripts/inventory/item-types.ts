export type ItemId = string;

export interface ItemStack {
  readonly itemId: ItemId;
  readonly quantity: number;
}

export type EquipmentSlot =
  | 'head'
  | 'body'
  | 'mainHand'
  | 'offHand'
  | 'accessory';

export interface EquippedItem {
  readonly slot: EquipmentSlot;
  readonly itemId: ItemId;
}

export interface InventoryState {
  readonly capacity: number;
  readonly stacks: ReadonlyArray<ItemStack>;
  readonly equipment: ReadonlyArray<EquippedItem>;
  readonly quickSlots: ReadonlyArray<ItemId | null>;
}
