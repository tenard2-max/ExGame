import { HEALTH_POTIONS } from '../inventory/item-registry';
import type { ItemId } from '../inventory/item-types';

/**
 * 몬스터 콘텐츠 정의입니다.
 * 체력/스폰의 실제 게임 값은 `monster-balance-catalog` + 설정 HUD가 우선합니다.
 * 경험치·공격은 체력에서 유도하며, 여기 숫자는 레거시 폴백입니다.
 */
export interface MonsterDefinition {
  readonly displayName: string;
  readonly tier: number;
  readonly maxHealth: number;
  readonly attackDamage: number;
  readonly experienceReward: number;
  readonly dropItemId: ItemId | null;
}

const MONSTER_DEFINITIONS: Readonly<Record<string, MonsterDefinition>> = {
  'monster-slime': {
    displayName: '슬라임',
    tier: 1,
    maxHealth: 5,
    attackDamage: 1,
    experienceReward: 2,
    dropItemId: null,
  },
  'monster-wolf': {
    displayName: '늑대',
    tier: 2,
    maxHealth: 10,
    attackDamage: 2,
    experienceReward: 5,
    dropItemId: 'coal',
  },
  'monster-golem': {
    displayName: '골렘',
    tier: 3,
    maxHealth: 15,
    attackDamage: 3,
    experienceReward: 12,
    dropItemId: 'iron',
  },
  'monster-orc': {
    displayName: '오크',
    tier: 2,
    maxHealth: 30,
    attackDamage: 3,
    experienceReward: 8,
    dropItemId: 'coal',
  },
  'monster-orc-warrior': {
    displayName: '오크전사',
    tier: 3,
    maxHealth: 50,
    attackDamage: 4,
    experienceReward: 18,
    dropItemId: 'iron',
  },
  'monster-hero-orc': {
    displayName: '영웅오크',
    tier: 4,
    maxHealth: 100,
    attackDamage: 6,
    experienceReward: 40,
    dropItemId: 'ark',
  },
  'monster-werewolf': {
    displayName: '늑대인간',
    tier: 3,
    maxHealth: 80,
    attackDamage: 5,
    experienceReward: 28,
    dropItemId: null,
  },
  'monster-red-wolf': {
    displayName: '붉은늑대',
    tier: 4,
    maxHealth: 120,
    attackDamage: 6,
    experienceReward: 40,
    dropItemId: null,
  },
  'monster-lycanthrope': {
    displayName: '라이칸슬롭',
    tier: 5,
    maxHealth: 200,
    attackDamage: 8,
    experienceReward: 70,
    dropItemId: null,
  },
  'monster-lizardman': {
    displayName: '리자드맨',
    tier: 4,
    maxHealth: 150,
    attackDamage: 7,
    experienceReward: 55,
    dropItemId: null,
  },
  'monster-black-lizardman': {
    displayName: '검은리자드맨',
    tier: 5,
    maxHealth: 200,
    attackDamage: 8,
    experienceReward: 75,
    dropItemId: null,
  },
  'monster-elder-lizardman': {
    displayName: '엘더리자드맨',
    tier: 6,
    maxHealth: 300,
    attackDamage: 10,
    experienceReward: 110,
    dropItemId: null,
  },
};

export function getMonsterDefinition(
  typeId: string,
): MonsterDefinition | null {
  return MONSTER_DEFINITIONS[typeId] ?? null;
}

export const TREASURE_TYPE_ID = 'treasure-chest';
export const NPC_TYPE_ID = 'npc-villager';
export { TELEPORTER_TYPE_ID } from '../npc/teleporter-config';
export { BLACKSMITH_TYPE_ID } from '../npc/blacksmith-config';
export { MERCHANT_TYPE_ID } from '../npc/merchant-config';
export { BANKER_TYPE_ID } from '../npc/banker-config';
export const DUNGEON_TYPE_ID = 'dungeon-entrance';

export interface TreasureLoot {
  readonly itemId: ItemId;
  readonly quantity: number;
}

/** 0~1 결정적 난수 값을 보물 보상으로 바꿉니다. */
export function rollTreasureLoot(value: number): TreasureLoot {
  if (value > 0.95) return { itemId: 'ark', quantity: 1 };
  if (value > 0.8) return { itemId: 'iron', quantity: 2 };
  if (value > 0.6) return { itemId: 'coal', quantity: 3 };
  if (value > 0.3) return { itemId: 'wood', quantity: 5 };
  return { itemId: 'rock', quantity: 5 };
}

/**
 * 포션별 독립 롤입니다.
 * `getDropChance`가 있으면 설정값을, 없으면 HEALTH_POTIONS 기본 확률을 씁니다.
 */
export function rollTreasurePotions(
  rolls: ReadonlyArray<number>,
  getDropChance?: (itemId: string) => number | undefined,
): TreasureLoot[] {
  const drops: TreasureLoot[] = [];
  for (let index = 0; index < HEALTH_POTIONS.length; index += 1) {
    const potion = HEALTH_POTIONS[index];
    const roll = rolls[index] ?? 1;
    const chance = getDropChance?.(potion.itemId) ?? potion.chestDropChance;
    if (roll < chance) {
      drops.push({ itemId: potion.itemId, quantity: 1 });
    }
  }
  return drops;
}

/** 던전 입구는 개봉 시 고정 보상으로 아크를 지급합니다. */
export const DUNGEON_REWARD: TreasureLoot = { itemId: 'ark', quantity: 3 };

const NPC_DIALOGUES: ReadonlyArray<string> = [
  '아크 광맥은 멀리 갈수록 많이 보인다네.',
  '골렘은 단단하니 레벨을 올리고 도전하게.',
  '던전 입구는 주변 몬스터를 정리해야 열 수 있어.',
  '바위를 캐면 벽을 지어 몸을 지킬 수 있지.',
];

/** 같은 NPC는 항상 같은 말을 하도록 결정적으로 선택합니다. */
export function selectNpcDialogue(value: number): string {
  const index = Math.min(
    Math.floor(value * NPC_DIALOGUES.length),
    NPC_DIALOGUES.length - 1,
  );
  return NPC_DIALOGUES[index];
}
