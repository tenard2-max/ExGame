/**
 * 몬스터 밸런스 단일 정의입니다.
 * 새 몬스터를 추가할 때 여기만 등록하면 설정·스폰·체력/데미지/경험치에 반영됩니다.
 */

export type MonsterSpawnKind =
  | 'base-slime'
  | 'base-wolf'
  | 'base-golem'
  | 'base-orc'
  | 'base-orc-warrior'
  | 'base-werewolf'
  | 'base-hero-orc'
  | 'inject';

export interface MonsterBalanceDef {
  readonly typeId: string;
  readonly displayName: string;
  readonly defaultHits: number;
  readonly hitsMax: number;
  readonly defaultDamage: number;
  readonly damageMax: number;
  readonly defaultExperience: number;
  readonly experienceMax: number;
  readonly defaultSpawnPercent: number;
  readonly spawnKind: MonsterSpawnKind;
  /** inject 전용: 이 레벨을 초과하면 스폰표에 주입합니다. */
  readonly injectMinLevel?: number;
  readonly injectGolemFraction?: number;
}

export const MONSTER_BALANCE_CATALOG: ReadonlyArray<MonsterBalanceDef> = [
  {
    typeId: 'monster-slime',
    displayName: '슬라임',
    defaultHits: 5,
    hitsMax: 200,
    defaultDamage: 1,
    damageMax: 50,
    defaultExperience: 2,
    experienceMax: 500,
    defaultSpawnPercent: 50,
    spawnKind: 'base-slime',
  },
  {
    typeId: 'monster-wolf',
    displayName: '늑대',
    defaultHits: 10,
    hitsMax: 200,
    defaultDamage: 2,
    damageMax: 50,
    defaultExperience: 5,
    experienceMax: 500,
    defaultSpawnPercent: 30,
    spawnKind: 'base-wolf',
  },
  {
    typeId: 'monster-golem',
    displayName: '골렘',
    defaultHits: 15,
    hitsMax: 200,
    defaultDamage: 3,
    damageMax: 50,
    defaultExperience: 12,
    experienceMax: 500,
    defaultSpawnPercent: 20,
    spawnKind: 'base-golem',
  },
  {
    typeId: 'monster-orc',
    displayName: '오크',
    defaultHits: 30,
    hitsMax: 500,
    defaultDamage: 3,
    damageMax: 50,
    defaultExperience: 8,
    experienceMax: 500,
    defaultSpawnPercent: 30,
    spawnKind: 'base-orc',
  },
  {
    typeId: 'monster-orc-warrior',
    displayName: '오크전사',
    defaultHits: 50,
    hitsMax: 500,
    defaultDamage: 4,
    damageMax: 50,
    defaultExperience: 18,
    experienceMax: 500,
    defaultSpawnPercent: 15,
    spawnKind: 'base-orc-warrior',
  },
  {
    typeId: 'monster-werewolf',
    displayName: '늑대인간',
    defaultHits: 80,
    hitsMax: 1000,
    defaultDamage: 5,
    damageMax: 50,
    defaultExperience: 28,
    experienceMax: 1000,
    defaultSpawnPercent: 15,
    spawnKind: 'base-werewolf',
  },
  {
    typeId: 'monster-hero-orc',
    displayName: '영웅오크',
    defaultHits: 100,
    hitsMax: 1000,
    defaultDamage: 6,
    damageMax: 50,
    defaultExperience: 40,
    experienceMax: 1000,
    defaultSpawnPercent: 10,
    spawnKind: 'base-hero-orc',
  },
  {
    typeId: 'monster-red-wolf',
    displayName: '붉은늑대',
    defaultHits: 120,
    hitsMax: 1000,
    defaultDamage: 6,
    damageMax: 50,
    defaultExperience: 40,
    experienceMax: 1000,
    defaultSpawnPercent: 20,
    spawnKind: 'inject',
    injectMinLevel: 30,
    injectGolemFraction: 0.7,
  },
  {
    typeId: 'monster-lizardman',
    displayName: '리자드맨',
    defaultHits: 150,
    hitsMax: 2000,
    defaultDamage: 7,
    damageMax: 50,
    defaultExperience: 55,
    experienceMax: 2000,
    defaultSpawnPercent: 30,
    spawnKind: 'inject',
    injectMinLevel: 40,
    injectGolemFraction: 0.7,
  },
  {
    typeId: 'monster-lycanthrope',
    displayName: '라이칸슬롭',
    defaultHits: 200,
    hitsMax: 2000,
    defaultDamage: 8,
    damageMax: 50,
    defaultExperience: 70,
    experienceMax: 2000,
    defaultSpawnPercent: 10,
    spawnKind: 'inject',
    injectMinLevel: 50,
    injectGolemFraction: 0.7,
  },
  {
    typeId: 'monster-black-lizardman',
    displayName: '검은리자드맨',
    defaultHits: 200,
    hitsMax: 2000,
    defaultDamage: 8,
    damageMax: 50,
    defaultExperience: 75,
    experienceMax: 2000,
    defaultSpawnPercent: 20,
    spawnKind: 'inject',
    injectMinLevel: 50,
    injectGolemFraction: 0.7,
  },
  {
    typeId: 'monster-elder-lizardman',
    displayName: '엘더리자드맨',
    defaultHits: 300,
    hitsMax: 3000,
    defaultDamage: 10,
    damageMax: 50,
    defaultExperience: 110,
    experienceMax: 3000,
    defaultSpawnPercent: 10,
    spawnKind: 'inject',
    injectMinLevel: 60,
    injectGolemFraction: 0.7,
  },
];

export function getMonsterBalanceDef(
  typeId: string,
): MonsterBalanceDef | null {
  return MONSTER_BALANCE_CATALOG.find((entry) => entry.typeId === typeId) ?? null;
}

export function createDefaultMonsterTunings(): Record<string, MonsterTuningValues> {
  const result: Record<string, MonsterTuningValues> = {};
  for (const entry of MONSTER_BALANCE_CATALOG) {
    result[entry.typeId] = {
      hits: entry.defaultHits,
      damage: entry.defaultDamage,
      spawnPercent: entry.defaultSpawnPercent,
      experience: entry.defaultExperience,
    };
  }
  return result;
}

export interface MonsterTuningValues {
  hits: number;
  damage: number;
  spawnPercent: number;
  experience: number;
}
