import type { ItemId } from '../inventory/item-types';

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
    maxHealth: 3,
    attackDamage: 1,
    experienceReward: 2,
    dropItemId: null,
  },
  'monster-wolf': {
    displayName: '늑대',
    tier: 2,
    maxHealth: 6,
    attackDamage: 2,
    experienceReward: 5,
    dropItemId: 'coal',
  },
  'monster-golem': {
    displayName: '골렘',
    tier: 3,
    maxHealth: 12,
    attackDamage: 3,
    experienceReward: 12,
    dropItemId: 'iron',
  },
};

export function getMonsterDefinition(
  typeId: string,
): MonsterDefinition | null {
  return MONSTER_DEFINITIONS[typeId] ?? null;
}

export const TREASURE_TYPE_ID = 'treasure-chest';
export const NPC_TYPE_ID = 'npc-villager';
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
