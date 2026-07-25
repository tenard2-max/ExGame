import type { BlockId } from '../world/world-types';
import type { ItemId } from './item-types';

/** 아이템 스택 상한 (9999M). */
export const MAX_ITEM_STACK = 9_999_000_000;

export interface ItemDefinition {
  readonly displayName: string;
  /** 자원 등급입니다. 높을수록 희귀합니다. */
  readonly tier: number;
  readonly maxStack: number;
  /** 설치 시 생성되는 블록입니다. null이면 설치할 수 없습니다. */
  readonly placeableBlockId: BlockId | null;
  /** 무기면 전투 기본 피해에 사용합니다. */
  readonly kind?: 'resource' | 'weapon' | 'consumable' | 'armor';
  readonly attackPower?: number;
  /** 갑옷: 몬스터 반격 시 받는 피해 감소량. */
  readonly defensePower?: number;
}

const ITEM_DEFINITIONS: Readonly<Record<string, ItemDefinition>> = {
  'weapon-fist': {
    displayName: '주먹',
    tier: 0,
    maxStack: 1,
    placeableBlockId: null,
    kind: 'weapon',
    attackPower: 1,
  },
  'weapon-iron-sword': {
    displayName: '철검',
    tier: 2,
    maxStack: MAX_ITEM_STACK,
    placeableBlockId: null,
    kind: 'weapon',
    attackPower: 2,
  },
  'weapon-mithril-sword': {
    displayName: '미스릴검',
    tier: 3,
    maxStack: MAX_ITEM_STACK,
    placeableBlockId: null,
    kind: 'weapon',
    attackPower: 3,
  },
  'weapon-orichalcum-sword': {
    displayName: '오리하르콘검',
    tier: 4,
    maxStack: MAX_ITEM_STACK,
    placeableBlockId: null,
    kind: 'weapon',
    attackPower: 4,
  },
  'armor-leather': {
    displayName: '가죽갑옷',
    tier: 2,
    maxStack: MAX_ITEM_STACK,
    placeableBlockId: null,
    kind: 'armor',
    defensePower: 1,
  },
  'armor-chain': {
    displayName: '사슬갑옷',
    tier: 3,
    maxStack: MAX_ITEM_STACK,
    placeableBlockId: null,
    kind: 'armor',
    defensePower: 2,
  },
  'armor-plate': {
    displayName: '판금갑옷',
    tier: 4,
    maxStack: MAX_ITEM_STACK,
    placeableBlockId: null,
    kind: 'armor',
    defensePower: 3,
  },
  rock: {
    displayName: '돌',
    tier: 1,
    maxStack: MAX_ITEM_STACK,
    placeableBlockId: 'rock',
  },
  wood: {
    displayName: '나무',
    tier: 1,
    maxStack: MAX_ITEM_STACK,
    placeableBlockId: null,
  },
  coal: {
    displayName: '석탄',
    tier: 1,
    maxStack: MAX_ITEM_STACK,
    placeableBlockId: null,
  },
  iron: {
    displayName: '철',
    tier: 2,
    maxStack: MAX_ITEM_STACK,
    placeableBlockId: null,
  },
  ark: {
    displayName: '아크',
    tier: 3,
    maxStack: MAX_ITEM_STACK,
    placeableBlockId: null,
  },
  'potion-basic': {
    displayName: '초급 포션',
    tier: 1,
    maxStack: MAX_ITEM_STACK,
    placeableBlockId: null,
    kind: 'consumable',
  },
  'potion-mid': {
    displayName: '중급 포션',
    tier: 2,
    maxStack: MAX_ITEM_STACK,
    placeableBlockId: null,
    kind: 'consumable',
  },
  'potion-high': {
    displayName: '고급 포션',
    tier: 3,
    maxStack: MAX_ITEM_STACK,
    placeableBlockId: null,
    kind: 'consumable',
  },
};

/** 보물 상자·E키 메뉴에서 쓰는 체력 포션 정의입니다. */
export interface HealthPotionDefinition {
  readonly itemId: ItemId;
  readonly displayName: string;
  /** 최대 체력·현재 체력을 함께 올리는 양입니다. */
  readonly healthBoost: number;
  /** 상자 개봉 시 독립 드롭 확률(0~1)입니다. */
  readonly chestDropChance: number;
}

export const HEALTH_POTIONS: ReadonlyArray<HealthPotionDefinition> = [
  {
    itemId: 'potion-basic',
    displayName: '초급 포션',
    healthBoost: 10,
    chestDropChance: 0.1,
  },
  {
    itemId: 'potion-mid',
    displayName: '중급 포션',
    healthBoost: 30,
    chestDropChance: 0.06,
  },
  {
    itemId: 'potion-high',
    displayName: '고급 포션',
    healthBoost: 100,
    chestDropChance: 0.03,
  },
];

export function getHealthPotionDefinition(
  itemId: ItemId,
): HealthPotionDefinition | null {
  return HEALTH_POTIONS.find((entry) => entry.itemId === itemId) ?? null;
}

const UNKNOWN_ITEM: ItemDefinition = {
  displayName: '?',
  tier: 0,
  maxStack: MAX_ITEM_STACK,
  placeableBlockId: null,
};

/**
 * 핫바 순서: 1 주먹(기본 무기) · 2~6 자원.
 */
export const HOTBAR_ITEM_IDS: ReadonlyArray<ItemId> = [
  'weapon-fist',
  'rock',
  'wood',
  'coal',
  'iron',
  'ark',
];

export const DEFAULT_WEAPON_ITEM_ID: ItemId = 'weapon-fist';

/** 인벤토리에서 1번 슬롯에 장착 가능한 검입니다. */
export const EQUIPABLE_WEAPON_IDS: ReadonlyArray<ItemId> = [
  'weapon-iron-sword',
  'weapon-mithril-sword',
  'weapon-orichalcum-sword',
];

export const EQUIPABLE_ARMOR_IDS: ReadonlyArray<ItemId> = [
  'armor-leather',
  'armor-chain',
  'armor-plate',
];

/** 신규 캐릭터/테스트용 지급 아이템. */
export const STARTER_GEAR_ITEM_IDS: ReadonlyArray<ItemId> = [
  ...EQUIPABLE_WEAPON_IDS,
  ...EQUIPABLE_ARMOR_IDS,
];

export function isEquipableWeapon(itemId: ItemId): boolean {
  return EQUIPABLE_WEAPON_IDS.includes(itemId);
}

export function isEquipableArmor(itemId: ItemId): boolean {
  return EQUIPABLE_ARMOR_IDS.includes(itemId);
}

export function isArmorItem(itemId: ItemId): boolean {
  return getItemDefinition(itemId).kind === 'armor';
}

export function getItemDefinition(itemId: ItemId): ItemDefinition {
  return ITEM_DEFINITIONS[itemId] ?? UNKNOWN_ITEM;
}

export function isWeaponItem(itemId: ItemId): boolean {
  return getItemDefinition(itemId).kind === 'weapon';
}

/** 1000→K, 100만→M 축약. 호버 전에는 이 표기를 씁니다. */
export function formatCompactQuantity(quantity: number): string {
  if (quantity >= 1_000_000) {
    const millions = quantity / 1_000_000;
    return `${trimTrailingZero(millions)}M`;
  }
  if (quantity >= 1000) {
    const thousands = quantity / 1000;
    return `${trimTrailingZero(thousands)}K`;
  }
  return String(Math.floor(quantity));
}

/** 호버 시 보여줄 정확한 수량(천 단위 구분). */
export function formatExactQuantity(quantity: number): string {
  return Math.floor(quantity).toLocaleString('en-US');
}

function trimTrailingZero(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/0$/, '').replace(/\.$/, '');
}

export interface OreDefinition {
  /** 툴팁에 표시되는 이름입니다. */
  readonly displayName: string;
  /** 채굴에 필요한 탭 횟수입니다. */
  readonly requiredHits: number;
  readonly dropItemId: ItemId;
}

/**
 * 광맥 콘텐츠(typeId) → 채집 규칙입니다.
 * 아크는 채집이 유일한 공급원입니다.
 */
const ORE_DEFINITIONS: Readonly<Record<string, OreDefinition>> = {
  'ore-coal': {
    displayName: '석탄 광석',
    requiredHits: 5,
    dropItemId: 'coal',
  },
  'ore-iron': {
    displayName: '철 광석',
    requiredHits: 10,
    dropItemId: 'iron',
  },
  'ore-ark': {
    displayName: '아크 광맥',
    requiredHits: 15,
    dropItemId: 'ark',
  },
};

export function getOreDefinition(typeId: string): OreDefinition | null {
  return ORE_DEFINITIONS[typeId] ?? null;
}
