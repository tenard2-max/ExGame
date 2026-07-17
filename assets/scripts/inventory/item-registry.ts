import type { BlockId } from '../world/world-types';
import type { ItemId } from './item-types';

export interface ItemDefinition {
  readonly displayName: string;
  /** 자원 등급입니다. 높을수록 희귀합니다. */
  readonly tier: number;
  readonly maxStack: number;
  /** 설치 시 생성되는 블록입니다. null이면 설치할 수 없습니다. */
  readonly placeableBlockId: BlockId | null;
}

const ITEM_DEFINITIONS: Readonly<Record<string, ItemDefinition>> = {
  rock: {
    displayName: '돌',
    tier: 1,
    maxStack: 99,
    placeableBlockId: 'rock',
  },
  wood: {
    displayName: '나무',
    tier: 1,
    maxStack: 99,
    placeableBlockId: null,
  },
  coal: {
    displayName: '석탄',
    tier: 1,
    maxStack: 99,
    placeableBlockId: null,
  },
  iron: {
    displayName: '철',
    tier: 2,
    maxStack: 99,
    placeableBlockId: null,
  },
  ark: {
    displayName: '아크',
    tier: 3,
    maxStack: 30,
    placeableBlockId: null,
  },
};

const UNKNOWN_ITEM: ItemDefinition = {
  displayName: '?',
  tier: 0,
  maxStack: 99,
  placeableBlockId: null,
};

/** 핫바에 고정 배치되는 아이템 순서입니다. */
export const HOTBAR_ITEM_IDS: ReadonlyArray<ItemId> = [
  'rock',
  'wood',
  'coal',
  'iron',
  'ark',
];

export function getItemDefinition(itemId: ItemId): ItemDefinition {
  return ITEM_DEFINITIONS[itemId] ?? UNKNOWN_ITEM;
}

export interface OreDefinition {
  /** 파괴에 필요한 타격 횟수입니다. */
  readonly hardness: number;
  readonly dropItemId: ItemId;
}

/**
 * 광맥 콘텐츠(typeId) → 채굴 규칙입니다.
 * 아크는 채굴이 유일한 공급원입니다.
 */
const ORE_DEFINITIONS: Readonly<Record<string, OreDefinition>> = {
  'ore-coal': { hardness: 1, dropItemId: 'coal' },
  'ore-iron': { hardness: 2, dropItemId: 'iron' },
  'ore-ark': { hardness: 3, dropItemId: 'ark' },
};

export function getOreDefinition(typeId: string): OreDefinition | null {
  return ORE_DEFINITIONS[typeId] ?? null;
}
