/** NPC_대장장이 셋팅.xlsx 기준 상수·레시피입니다. */

import type { ItemId } from '../inventory/item-types';
import type { AffixGrade, AffixSet } from './equipment-affix';

export const BLACKSMITH_TYPE_ID = 'npc-blacksmith';

/** 영웅 레벨이 이 값을 초과해야 제조·강화 이용 가능. */
export const BLACKSMITH_SERVICE_UNLOCK_LEVEL = 20;

/** 빈(몬스터 없는) 청크 중앙 출현 확률. */
export const BLACKSMITH_CHUNK_CHANCE = 0.03;

/** 스프라이트·점유 타일 (가로×세로). */
export const BLACKSMITH_FOOTPRINT_W = 3;
export const BLACKSMITH_FOOTPRINT_H = 6;

export const BLACKSMITH_MAX_UPGRADE = 99;

export interface CraftMaterial {
  readonly itemId: ItemId;
  readonly amount: number;
}

export interface OptionRollTable {
  readonly chance: number;
  readonly affix: AffixSet;
}

export interface CraftRecipe {
  readonly id: string;
  readonly resultItemId: ItemId;
  readonly displayName: string;
  readonly kind: 'weapon' | 'armor';
  readonly materials: ReadonlyArray<CraftMaterial>;
  /** 영웅 레벨이 이 값을 초과해야 제조 가능. */
  readonly unlockLevel: number;
  readonly successChance: number;
  readonly options: Readonly<Record<AffixGrade, OptionRollTable>>;
}

export interface UpgradeTier {
  readonly level: number;
  readonly materials: ReadonlyArray<CraftMaterial>;
  readonly unlockLevel: number;
  readonly successChance: number;
  /** 무기 성공 시 추가 공격력. */
  readonly successAttack: number;
  /** 갑옷 성공 시 추가 방어. */
  readonly successDefense: number;
  readonly options: Readonly<Record<AffixGrade, OptionRollTable>>;
}

const MAT_T1: ReadonlyArray<CraftMaterial> = [
  { itemId: 'iron', amount: 100 },
  { itemId: 'coal', amount: 100 },
  { itemId: 'rock', amount: 100 },
  { itemId: 'wood', amount: 100 },
];

const MAT_T2: ReadonlyArray<CraftMaterial> = [
  { itemId: 'iron', amount: 500 },
  { itemId: 'coal', amount: 500 },
  { itemId: 'rock', amount: 500 },
  { itemId: 'wood', amount: 500 },
  { itemId: 'ark', amount: 100 },
];

const MAT_T3: ReadonlyArray<CraftMaterial> = [
  { itemId: 'iron', amount: 1500 },
  { itemId: 'coal', amount: 1500 },
  { itemId: 'rock', amount: 1500 },
  { itemId: 'wood', amount: 1500 },
  { itemId: 'ark', amount: 1000 },
];

const WEAPON_OPT_T1: CraftRecipe['options'] = {
  rare: { chance: 0.05, affix: { attack: 1 } },
  unique: { chance: 0.01, affix: { attack: 2, maxHealth: 100 } },
  legendary: { chance: 0.001, affix: { attack: 3, maxHealth: 200, moveSpeedPercent: 50 } },
  mythic: { chance: 0.0001, affix: { attack: 5, maxHealth: 400, moveSpeedPercent: 100 } },
};

const WEAPON_OPT_T2: CraftRecipe['options'] = {
  rare: { chance: 0.05, affix: { attack: 2 } },
  unique: { chance: 0.01, affix: { attack: 3, maxHealth: 200 } },
  legendary: { chance: 0.001, affix: { attack: 4, maxHealth: 400, moveSpeedPercent: 70 } },
  mythic: { chance: 0.0001, affix: { attack: 7, maxHealth: 600, moveSpeedPercent: 120 } },
};

const WEAPON_OPT_T3: CraftRecipe['options'] = {
  rare: { chance: 0.05, affix: { attack: 3 } },
  unique: { chance: 0.01, affix: { attack: 4, maxHealth: 300 } },
  legendary: { chance: 0.001, affix: { attack: 5, maxHealth: 500, moveSpeedPercent: 70 } },
  mythic: { chance: 0.0001, affix: { attack: 9, maxHealth: 800, moveSpeedPercent: 140 } },
};

const ARMOR_OPT_T1: CraftRecipe['options'] = {
  rare: { chance: 0.05, affix: { defense: 1 } },
  unique: { chance: 0.01, affix: { defense: 2, maxHealth: 100 } },
  legendary: { chance: 0.001, affix: { defense: 3, maxHealth: 200 } },
  mythic: { chance: 0.0001, affix: { defense: 5, maxHealth: 400 } },
};

const ARMOR_OPT_T2: CraftRecipe['options'] = {
  rare: { chance: 0.05, affix: { defense: 2 } },
  unique: { chance: 0.01, affix: { defense: 3, maxHealth: 200 } },
  legendary: { chance: 0.001, affix: { defense: 4, maxHealth: 400 } },
  mythic: { chance: 0.0001, affix: { defense: 7, maxHealth: 600 } },
};

const ARMOR_OPT_T3: CraftRecipe['options'] = {
  rare: { chance: 0.05, affix: { defense: 3 } },
  unique: { chance: 0.01, affix: { defense: 4, maxHealth: 200 } },
  legendary: { chance: 0.001, affix: { defense: 5, maxHealth: 400 } },
  mythic: { chance: 0.0001, affix: { defense: 9, maxHealth: 600 } },
};

export const BLACKSMITH_CRAFT_RECIPES: ReadonlyArray<CraftRecipe> = [
  {
    id: 'craft-iron-sword',
    resultItemId: 'weapon-iron-sword',
    displayName: '철검',
    kind: 'weapon',
    materials: MAT_T1,
    unlockLevel: 10,
    successChance: 0.9,
    options: WEAPON_OPT_T1,
  },
  {
    id: 'craft-mithril-sword',
    resultItemId: 'weapon-mithril-sword',
    displayName: '미스릴검',
    kind: 'weapon',
    materials: MAT_T2,
    unlockLevel: 20,
    successChance: 0.5,
    options: WEAPON_OPT_T2,
  },
  {
    id: 'craft-orichalcum-sword',
    resultItemId: 'weapon-orichalcum-sword',
    displayName: '오리하르콘검',
    kind: 'weapon',
    materials: MAT_T3,
    unlockLevel: 50,
    successChance: 0.3,
    options: WEAPON_OPT_T3,
  },
  {
    id: 'craft-leather-armor',
    resultItemId: 'armor-leather',
    displayName: '가죽갑옷',
    kind: 'armor',
    materials: MAT_T1,
    unlockLevel: 10,
    successChance: 0.9,
    options: ARMOR_OPT_T1,
  },
  {
    id: 'craft-chain-armor',
    resultItemId: 'armor-chain',
    displayName: '사슬갑옷',
    kind: 'armor',
    materials: MAT_T2,
    unlockLevel: 20,
    successChance: 0.5,
    options: ARMOR_OPT_T2,
  },
  {
    id: 'craft-plate-armor',
    resultItemId: 'armor-plate',
    displayName: '판금갑옷',
    kind: 'armor',
    materials: MAT_T3,
    unlockLevel: 50,
    successChance: 0.3,
    options: ARMOR_OPT_T3,
  },
];

const UPGRADE_OPT_T1 = WEAPON_OPT_T1;
const UPGRADE_OPT_T2 = WEAPON_OPT_T2;
const UPGRADE_OPT_T3 = WEAPON_OPT_T3;

/** 4~6차: 3차와 동일 옵션(공격속도 없음). */
const UPGRADE_OPT_T4_TO_T6: UpgradeTier['options'] = {
  rare: { chance: 0.05, affix: { attack: 3 } },
  unique: { chance: 0.01, affix: { attack: 4, maxHealth: 300 } },
  legendary: { chance: 0.001, affix: { attack: 5, maxHealth: 500, moveSpeedPercent: 70 } },
  mythic: { chance: 0.0001, affix: { attack: 9, maxHealth: 800, moveSpeedPercent: 140 } },
};

/** 7차: 유니크~신화에 공격속도 추가(엑셀 기준). */
const UPGRADE_OPT_T7: UpgradeTier['options'] = {
  rare: { chance: 0.05, affix: { attack: 3 } },
  unique: {
    chance: 0.01,
    affix: { attack: 4, maxHealth: 300, attackSpeedPercent: 50 },
  },
  legendary: {
    chance: 0.001,
    affix: {
      attack: 5,
      maxHealth: 500,
      moveSpeedPercent: 70,
      attackSpeedPercent: 100,
    },
  },
  mythic: {
    chance: 0.0001,
    affix: {
      attack: 9,
      maxHealth: 800,
      moveSpeedPercent: 140,
      attackSpeedPercent: 90,
    },
  },
};

/** 8차 이상(99차 포함). */
const UPGRADE_OPT_T8_PLUS: UpgradeTier['options'] = {
  rare: { chance: 0.05, affix: { attack: 3 } },
  unique: {
    chance: 0.01,
    affix: { attack: 4, maxHealth: 300, attackSpeedPercent: 50 },
  },
  legendary: {
    chance: 0.001,
    affix: {
      attack: 5,
      maxHealth: 500,
      moveSpeedPercent: 70,
      attackSpeedPercent: 70,
    },
  },
  mythic: {
    chance: 0.0001,
    affix: {
      attack: 9,
      maxHealth: 800,
      moveSpeedPercent: 140,
      attackSpeedPercent: 90,
    },
  },
};

/** 1~3차 정의. */
const UPGRADE_TIERS_BASE: ReadonlyArray<UpgradeTier> = [
  {
    level: 1,
    materials: MAT_T1,
    unlockLevel: 10,
    successChance: 0.9,
    successAttack: 1,
    successDefense: 1,
    options: UPGRADE_OPT_T1,
  },
  {
    level: 2,
    materials: MAT_T2,
    unlockLevel: 20,
    successChance: 0.5,
    successAttack: 1,
    successDefense: 1,
    options: UPGRADE_OPT_T2,
  },
  {
    level: 3,
    materials: MAT_T3,
    unlockLevel: 50,
    successChance: 0.3,
    successAttack: 1,
    successDefense: 1,
    options: UPGRADE_OPT_T3,
  },
];

/** targetUpgradeLevel(1~99)에 해당하는 티어 규칙을 반환합니다. */
export function getUpgradeTier(targetUpgradeLevel: number): UpgradeTier {
  const level = Math.max(1, Math.min(BLACKSMITH_MAX_UPGRADE, targetUpgradeLevel));
  if (level <= 3) return UPGRADE_TIERS_BASE[level - 1];

  const options = level === 7
    ? UPGRADE_OPT_T7
    : level >= 8
      ? UPGRADE_OPT_T8_PLUS
      : UPGRADE_OPT_T4_TO_T6;

  return {
    level,
    materials: MAT_T3,
    unlockLevel: 100,
    successChance: 0.1,
    successAttack: 1,
    successDefense: 1,
    options,
  };
}
