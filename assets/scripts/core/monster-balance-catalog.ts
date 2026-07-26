import {
  monsterAttackFromHp,
  monsterExperienceFromHp,
} from './monster-derived-stats';

/**
 * 몬스터 밸런스 단일 정의입니다.
 * 새 몬스터를 추가할 때 여기만 등록하면 설정·스폰·체력에 반영됩니다.
 * 경험치·공격·방어는 체력(hits)에서 유도합니다
 * (XP=floor(HP/2), ATK=ceil(HP/5), DEF=ceil(HP/10)).
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
  // 중급: 하피 계열 (엑셀 순서)
  {
    typeId: 'monster-harpy',
    displayName: '하피',
    defaultHits: 280,
    hitsMax: 3000,
    defaultDamage: 56,
    damageMax: 200,
    defaultExperience: 140,
    experienceMax: 3000,
    defaultSpawnPercent: 30,
    spawnKind: 'inject',
    injectMinLevel: 50,
    injectGolemFraction: 0.7,
  },
  {
    typeId: 'monster-blood-harpy',
    displayName: '블러드 하피',
    defaultHits: 330,
    hitsMax: 3000,
    defaultDamage: 66,
    damageMax: 200,
    defaultExperience: 165,
    experienceMax: 3000,
    defaultSpawnPercent: 20,
    spawnKind: 'inject',
    injectMinLevel: 50,
    injectGolemFraction: 0.7,
  },
  {
    typeId: 'monster-elder-harpy',
    displayName: '엘더 하피',
    defaultHits: 400,
    hitsMax: 4000,
    defaultDamage: 80,
    damageMax: 200,
    defaultExperience: 200,
    experienceMax: 4000,
    defaultSpawnPercent: 10,
    spawnKind: 'inject',
    injectMinLevel: 60,
    injectGolemFraction: 0.7,
  },
  {
    typeId: 'monster-harpy-siren',
    displayName: '하피 세이렌',
    defaultHits: 500,
    hitsMax: 5000,
    defaultDamage: 100,
    damageMax: 250,
    defaultExperience: 250,
    experienceMax: 5000,
    defaultSpawnPercent: 10,
    spawnKind: 'inject',
    injectMinLevel: 70,
    injectGolemFraction: 0.7,
  },
  {
    typeId: 'monster-harpy-queen',
    displayName: '하피 퀸',
    defaultHits: 700,
    hitsMax: 7000,
    defaultDamage: 140,
    damageMax: 300,
    defaultExperience: 350,
    experienceMax: 7000,
    defaultSpawnPercent: 10,
    spawnKind: 'inject',
    injectMinLevel: 80,
    injectGolemFraction: 0.7,
  },
  // 중급: 트롤1.xlsx
  {
    typeId: 'monster-troll',
    displayName: '트롤',
    defaultHits: 600,
    hitsMax: 6000,
    defaultDamage: 120,
    damageMax: 300,
    defaultExperience: 300,
    experienceMax: 6000,
    defaultSpawnPercent: 30,
    spawnKind: 'inject',
    injectMinLevel: 70,
    injectGolemFraction: 0.7,
  },
  {
    typeId: 'monster-elder-troll',
    displayName: '엘더 트롤',
    defaultHits: 900,
    hitsMax: 9000,
    defaultDamage: 180,
    damageMax: 400,
    defaultExperience: 450,
    experienceMax: 9000,
    defaultSpawnPercent: 10,
    spawnKind: 'inject',
    injectMinLevel: 80,
    injectGolemFraction: 0.7,
  },
  {
    typeId: 'monster-high-troll',
    displayName: '하이 트롤',
    defaultHits: 1200,
    hitsMax: 12000,
    defaultDamage: 240,
    damageMax: 500,
    defaultExperience: 600,
    experienceMax: 12000,
    defaultSpawnPercent: 10,
    spawnKind: 'inject',
    injectMinLevel: 90,
    injectGolemFraction: 0.7,
  },
  // 중급: 트롤2.xlsx
  {
    typeId: 'monster-twinhead-troll',
    displayName: '트윈헤드 트롤',
    defaultHits: 1500,
    hitsMax: 15000,
    defaultDamage: 300,
    damageMax: 600,
    defaultExperience: 750,
    experienceMax: 15000,
    defaultSpawnPercent: 30,
    spawnKind: 'inject',
    injectMinLevel: 100,
    injectGolemFraction: 0.7,
  },
  {
    typeId: 'monster-blood-troll',
    displayName: '블러드 트롤',
    defaultHits: 1800,
    hitsMax: 18000,
    defaultDamage: 360,
    damageMax: 700,
    defaultExperience: 900,
    experienceMax: 18000,
    defaultSpawnPercent: 10,
    spawnKind: 'inject',
    injectMinLevel: 110,
    injectGolemFraction: 0.7,
  },
  {
    typeId: 'monster-troll-king',
    displayName: '트롤 킹',
    defaultHits: 2400,
    hitsMax: 24000,
    defaultDamage: 480,
    damageMax: 800,
    defaultExperience: 1200,
    experienceMax: 24000,
    defaultSpawnPercent: 10,
    spawnKind: 'inject',
    injectMinLevel: 120,
    injectGolemFraction: 0.7,
  },
  // 중급: 오우거1.xlsx
  {
    typeId: 'monster-ogre',
    displayName: '오우거',
    defaultHits: 2000,
    hitsMax: 20000,
    defaultDamage: 400,
    damageMax: 800,
    defaultExperience: 1000,
    experienceMax: 20000,
    defaultSpawnPercent: 30,
    spawnKind: 'inject',
    injectMinLevel: 130,
    injectGolemFraction: 0.7,
  },
  {
    typeId: 'monster-elder-ogre',
    displayName: '엘더 오우거',
    defaultHits: 2500,
    hitsMax: 25000,
    defaultDamage: 500,
    damageMax: 900,
    defaultExperience: 1250,
    experienceMax: 25000,
    defaultSpawnPercent: 10,
    spawnKind: 'inject',
    injectMinLevel: 140,
    injectGolemFraction: 0.7,
  },
  {
    typeId: 'monster-twinhead-ogre',
    displayName: '트윈헤드 오우거',
    defaultHits: 3000,
    hitsMax: 30000,
    defaultDamage: 600,
    damageMax: 1000,
    defaultExperience: 1500,
    experienceMax: 30000,
    defaultSpawnPercent: 10,
    spawnKind: 'inject',
    injectMinLevel: 150,
    injectGolemFraction: 0.7,
  },
  // 중급: 오우거2.xlsx
  {
    typeId: 'monster-blood-ogre',
    displayName: '블러드 오우거',
    defaultHits: 2800,
    hitsMax: 28000,
    defaultDamage: 560,
    damageMax: 1000,
    defaultExperience: 1400,
    experienceMax: 28000,
    defaultSpawnPercent: 30,
    spawnKind: 'inject',
    injectMinLevel: 160,
    injectGolemFraction: 0.7,
  },
  {
    typeId: 'monster-thunder-ogre',
    displayName: '뇌전 오우거',
    defaultHits: 3100,
    hitsMax: 31000,
    defaultDamage: 620,
    damageMax: 1100,
    defaultExperience: 1550,
    experienceMax: 31000,
    defaultSpawnPercent: 10,
    spawnKind: 'inject',
    injectMinLevel: 170,
    injectGolemFraction: 0.7,
  },
  {
    typeId: 'monster-ogre-king',
    displayName: '오우거 킹',
    defaultHits: 3500,
    hitsMax: 35000,
    defaultDamage: 700,
    damageMax: 1200,
    defaultExperience: 1750,
    experienceMax: 35000,
    defaultSpawnPercent: 10,
    spawnKind: 'inject',
    injectMinLevel: 180,
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
    const hits = entry.defaultHits;
    result[entry.typeId] = {
      hits,
      damage: monsterAttackFromHp(hits),
      spawnPercent: entry.defaultSpawnPercent,
      experience: monsterExperienceFromHp(hits),
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
