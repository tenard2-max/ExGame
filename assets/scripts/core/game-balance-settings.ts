/**
 * 플레이어가 바꿀 수 있는 게임 밸런스입니다.
 * localStorage에 저장되며, 설정 HUD에서 조절합니다.
 * 몬스터 체력(hits)만 수동 조절하고, 경험치·공격·방어는 체력에서 유도합니다.
 */
import {
  MONSTER_BALANCE_CATALOG,
  createDefaultMonsterTunings,
  getMonsterBalanceDef,
  type MonsterTuningValues,
} from './monster-balance-catalog';
import {
  monsterAttackFromHp,
  monsterDefenseFromHp,
  monsterExperienceFromHp,
} from './monster-derived-stats';

export type { MonsterTuningValues };

/** 몬스터를 제외한 공통 밸런스 키입니다. */
export interface CoreGameBalanceSnapshot {
  readonly treeHits: number;
  readonly rockHits: number;
  readonly coalHits: number;
  readonly ironHits: number;
  readonly arkHits: number;
  /** 1레벨 기본 공격력. */
  readonly attackPowerBase: number;
  /** 레벨당 공격력 증가율(%). 20 → 레벨마다 +20%. */
  readonly attackPowerPerLevelPercent: number;
  /** 자연 회복 간격(초). */
  readonly passiveRegenIntervalSec: number;
  /** 1레벨 최대 체력. */
  readonly baseMaxHealth: number;
  /** 레벨당 최대 체력 증가. */
  readonly maxHealthPerLevel: number;
  /** 청크 N개당 몬스터 1마리. */
  readonly chunksPerMonster: number;
  readonly potionBasicHp: number;
  readonly potionMidHp: number;
  readonly potionHighHp: number;
  readonly potionBasicDropPercent: number;
  readonly potionMidDropPercent: number;
  readonly potionHighDropPercent: number;
  readonly moveSpeed: number;
  /** 상호작용 사거리(타일 수). */
  readonly interactionRangeTiles: number;
}

export interface GameBalanceSnapshot extends CoreGameBalanceSnapshot {
  readonly monsters: Readonly<Record<string, MonsterTuningValues>>;
}

export type GameBalanceListener = (settings: GameBalanceSettings) => void;

export type CoreBalanceKey = keyof CoreGameBalanceSnapshot;
export type MonsterTuningField = keyof MonsterTuningValues;

/** 설정 행 키: 코어 키 또는 monster:{typeId}:{field} */
export type GameBalanceKey = string;

export const DEFAULT_CORE_BALANCE: CoreGameBalanceSnapshot = {
  treeHits: 5,
  rockHits: 7,
  coalHits: 5,
  ironHits: 10,
  arkHits: 15,
  attackPowerBase: 1,
  attackPowerPerLevelPercent: 20,
  passiveRegenIntervalSec: 10,
  baseMaxHealth: 10,
  maxHealthPerLevel: 2,
  chunksPerMonster: 3,
  potionBasicHp: 10,
  potionMidHp: 30,
  potionHighHp: 100,
  potionBasicDropPercent: 10,
  potionMidDropPercent: 6,
  potionHighDropPercent: 3,
  moveSpeed: 260,
  interactionRangeTiles: 4,
};

export const DEFAULT_GAME_BALANCE: GameBalanceSnapshot = {
  ...DEFAULT_CORE_BALANCE,
  monsters: createDefaultMonsterTunings(),
};

const STORAGE_KEY = 'exgame:v4:game-balance';
const LEGACY_STORAGE_KEYS = [
  'exgame:v3:game-balance',
  'exgame:v2:game-balance-hits',
] as const;

type Limit = { readonly min: number; readonly max: number; readonly step: number };

const CORE_LIMITS: Record<CoreBalanceKey, Limit> = {
  treeHits: { min: 1, max: 50, step: 1 },
  rockHits: { min: 1, max: 50, step: 1 },
  coalHits: { min: 1, max: 50, step: 1 },
  ironHits: { min: 1, max: 50, step: 1 },
  arkHits: { min: 1, max: 50, step: 1 },
  attackPowerBase: { min: 0.1, max: 20, step: 0.1 },
  attackPowerPerLevelPercent: { min: 0, max: 100, step: 1 },
  passiveRegenIntervalSec: { min: 1, max: 120, step: 1 },
  baseMaxHealth: { min: 1, max: 200, step: 1 },
  maxHealthPerLevel: { min: 0, max: 50, step: 1 },
  chunksPerMonster: { min: 1, max: 20, step: 1 },
  potionBasicHp: { min: 1, max: 500, step: 1 },
  potionMidHp: { min: 1, max: 500, step: 1 },
  potionHighHp: { min: 1, max: 1000, step: 5 },
  potionBasicDropPercent: { min: 0, max: 100, step: 1 },
  potionMidDropPercent: { min: 0, max: 100, step: 1 },
  potionHighDropPercent: { min: 0, max: 100, step: 1 },
  moveSpeed: { min: 50, max: 800, step: 10 },
  interactionRangeTiles: { min: 1, max: 12, step: 1 },
};

export interface GameBalanceRow {
  readonly key: GameBalanceKey;
  readonly label: string;
  readonly unit: string;
}

const CORE_BALANCE_ROWS: ReadonlyArray<GameBalanceRow> = [
  { key: 'coalHits', label: '석탄 채굴', unit: '회' },
  { key: 'ironHits', label: '철광석 채굴', unit: '회' },
  { key: 'arkHits', label: '아크광석 채굴', unit: '회' },
  { key: 'treeHits', label: '나무 채굴', unit: '회' },
  { key: 'rockHits', label: '돌 채굴', unit: '회' },
  { key: 'attackPowerBase', label: '1랩 공격력', unit: '' },
  { key: 'attackPowerPerLevelPercent', label: '랩당 공격력+', unit: '%' },
  { key: 'passiveRegenIntervalSec', label: '자연회복 간격', unit: '초' },
  { key: 'baseMaxHealth', label: '1랩 최대HP', unit: '' },
  { key: 'maxHealthPerLevel', label: '랩당 최대HP+', unit: '' },
  { key: 'chunksPerMonster', label: '청크당 몬스터', unit: '청크/1' },
  { key: 'potionBasicHp', label: '초급포션 HP', unit: '' },
  { key: 'potionMidHp', label: '중급포션 HP', unit: '' },
  { key: 'potionHighHp', label: '고급포션 HP', unit: '' },
  { key: 'potionBasicDropPercent', label: '초급포션 드롭', unit: '%' },
  { key: 'potionMidDropPercent', label: '중급포션 드롭', unit: '%' },
  { key: 'potionHighDropPercent', label: '고급포션 드롭', unit: '%' },
  { key: 'moveSpeed', label: '이동 속도', unit: '' },
  { key: 'interactionRangeTiles', label: '상호작용 거리', unit: '타일' },
];

const MONSTER_FIELD_META: ReadonlyArray<{
  field: MonsterTuningField;
  labelSuffix: string;
  unit: string;
}> = [
  { field: 'hits', labelSuffix: '체력', unit: '회' },
  // 데미지·경험치는 체력에서 자동 계산 — 설정에서는 체력·스폰만 조절
  { field: 'spawnPercent', labelSuffix: '스폰', unit: '%' },
];

function monsterRowKey(typeId: string, field: MonsterTuningField): string {
  return `monster:${typeId}:${field}`;
}

function parseMonsterRowKey(
  key: string,
): { typeId: string; field: MonsterTuningField } | null {
  if (!key.startsWith('monster:')) return null;
  const parts = key.split(':');
  if (parts.length !== 3) return null;
  const typeId = parts[1]!;
  const field = parts[2] as MonsterTuningField;
  if (field !== 'hits' && field !== 'spawnPercent') {
    return null;
  }
  return { typeId, field };
}

function buildMonsterBalanceRows(): GameBalanceRow[] {
  const rows: GameBalanceRow[] = [];
  for (const monster of MONSTER_BALANCE_CATALOG) {
    for (const meta of MONSTER_FIELD_META) {
      rows.push({
        key: monsterRowKey(monster.typeId, meta.field),
        label: `${monster.displayName} ${meta.labelSuffix}`,
        unit: meta.unit,
      });
    }
  }
  return rows;
}

/** 설정 패널에 표시할 행 정의입니다. */
export const GAME_BALANCE_ROWS: ReadonlyArray<GameBalanceRow> = [
  ...CORE_BALANCE_ROWS.slice(0, 5),
  ...buildMonsterBalanceRows(),
  ...CORE_BALANCE_ROWS.slice(5),
];

function getMonsterFieldLimit(
  typeId: string,
  field: MonsterTuningField,
): Limit {
  const def = getMonsterBalanceDef(typeId);
  switch (field) {
    case 'hits':
      return { min: 1, max: def?.hitsMax ?? 500, step: 1 };
    case 'damage':
      return { min: 0, max: def?.damageMax ?? 50, step: 1 };
    case 'spawnPercent':
      return { min: 0, max: 100, step: 5 };
    case 'experience':
      return { min: 0, max: def?.experienceMax ?? 500, step: 1 };
    default:
      return { min: 0, max: 100, step: 1 };
  }
}

function cloneMonsters(
  source: Readonly<Record<string, MonsterTuningValues>>,
): Record<string, MonsterTuningValues> {
  const next: Record<string, MonsterTuningValues> = {};
  for (const [typeId, tuning] of Object.entries(source)) {
    next[typeId] = { ...tuning };
  }
  return next;
}

function ensureMonsterTunings(
  partial?: Partial<Record<string, Partial<MonsterTuningValues>>> | null,
): Record<string, MonsterTuningValues> {
  const defaults = createDefaultMonsterTunings();
  const next = cloneMonsters(defaults);
  if (!partial) return next;
  for (const def of MONSTER_BALANCE_CATALOG) {
    const incoming = partial[def.typeId];
    if (!incoming) continue;
    next[def.typeId] = {
      hits: clampNumber(
        incoming.hits,
        def.defaultHits,
        getMonsterFieldLimit(def.typeId, 'hits'),
      ),
      spawnPercent: clampNumber(
        incoming.spawnPercent,
        def.defaultSpawnPercent,
        getMonsterFieldLimit(def.typeId, 'spawnPercent'),
      ),
      // 저장 호환용 — 전투 계산은 체력 유도값을 씁니다.
      damage: 0,
      experience: 0,
    };
    const hits = next[def.typeId]!.hits;
    next[def.typeId]!.damage = monsterAttackFromHp(hits);
    next[def.typeId]!.experience = monsterExperienceFromHp(hits);
  }
  return next;
}

function spawnOf(
  monsters: Readonly<Record<string, MonsterTuningValues>>,
  typeId: string,
): number {
  return Math.max(0, monsters[typeId]?.spawnPercent ?? 0);
}

export class GameBalanceSettings {
  private readonly listeners = new Set<GameBalanceListener>();
  private values: GameBalanceSnapshot = {
    ...DEFAULT_CORE_BALANCE,
    monsters: createDefaultMonsterTunings(),
  };

  constructor() {
    this.load();
  }

  addListener(listener: GameBalanceListener): void {
    this.listeners.add(listener);
    listener(this);
  }

  getSnapshot(): GameBalanceSnapshot {
    return {
      ...this.values,
      monsters: cloneMonsters(this.values.monsters),
    };
  }

  get(key: CoreBalanceKey): number {
    return this.values[key];
  }

  getBlockHits(blockId: string): number {
    if (blockId === 'tree') return this.values.treeHits;
    if (blockId === 'rock') return this.values.rockHits;
    return 1;
  }

  getOreHits(typeId: string): number {
    switch (typeId) {
      case 'ore-coal':
        return this.values.coalHits;
      case 'ore-iron':
        return this.values.ironHits;
      case 'ore-ark':
        return this.values.arkHits;
      default:
        return 5;
    }
  }

  getMonsterTuning(typeId: string): MonsterTuningValues | null {
    return this.values.monsters[typeId] ?? null;
  }

  getMonsterMaxHealth(typeId: string): number {
    const tuning = this.values.monsters[typeId];
    if (tuning) return tuning.hits;
    return getMonsterBalanceDef(typeId)?.defaultHits ?? 5;
  }

  getMonsterDamage(typeId: string): number {
    return monsterAttackFromHp(this.getMonsterMaxHealth(typeId));
  }

  getMonsterExperience(typeId: string): number {
    return monsterExperienceFromHp(this.getMonsterMaxHealth(typeId));
  }

  getMonsterDefense(typeId: string): number {
    return monsterDefenseFromHp(this.getMonsterMaxHealth(typeId));
  }

  /** 레벨 기반 공격력: base × (1 + pct/100 × (level-1)). */
  getAttackPowerForLevel(level: number): number {
    const scale = 1
      + (this.values.attackPowerPerLevelPercent / 100) * Math.max(0, level - 1);
    return round2(this.values.attackPowerBase * scale);
  }

  getChunksPerMonster(): number {
    return Math.max(1, Math.round(this.values.chunksPerMonster));
  }

  /**
   * 0~1 값과 플레이어 레벨로 몬스터 종류를 고릅니다.
   * 스폰 비율은 설정(몬스터별 spawnPercent)을 사용합니다.
   */
  selectMonsterType(unitValue: number, playerLevel = 1): string {
    const table = this.buildMonsterSpawnTable(playerLevel);
    const total = table.reduce((sum, entry) => sum + entry.weight, 0);
    if (total <= 0) return table[0]?.typeId ?? 'monster-slime';
    let cursor = clamp(unitValue, 0, 0.999999) * total;
    for (const entry of table) {
      if (cursor < entry.weight) return entry.typeId;
      cursor -= entry.weight;
    }
    return table[table.length - 1]!.typeId;
  }

  private buildMonsterSpawnTable(
    playerLevel: number,
  ): ReadonlyArray<{ readonly typeId: string; readonly weight: number }> {
    const m = this.values.monsters;
    const slime = spawnOf(m, 'monster-slime');
    const wolf = spawnOf(m, 'monster-wolf');
    const golem = spawnOf(m, 'monster-golem');
    const orc = spawnOf(m, 'monster-orc');
    const warrior = spawnOf(m, 'monster-orc-warrior');
    const werewolf = spawnOf(m, 'monster-werewolf');
    const hero = spawnOf(m, 'monster-hero-orc');

    if (playerLevel <= 10) {
      return [
        { typeId: 'monster-slime', weight: slime },
        { typeId: 'monster-wolf', weight: wolf },
        { typeId: 'monster-golem', weight: golem },
      ];
    }

    if (playerLevel <= 20) {
      return [
        { typeId: 'monster-orc', weight: orc },
        { typeId: 'monster-wolf', weight: wolf },
        { typeId: 'monster-golem', weight: Math.max(0, 100 - orc - wolf) },
      ];
    }

    // >20: 오크 / 오크전사 / 늑대인간 / 나머지 골렘
    let table: Array<{ typeId: string; weight: number }> = [
      { typeId: 'monster-orc', weight: orc },
      { typeId: 'monster-orc-warrior', weight: warrior },
      { typeId: 'monster-werewolf', weight: werewolf },
      {
        typeId: 'monster-golem',
        weight: Math.max(0, 100 - orc - warrior - werewolf),
      },
    ];

    if (playerLevel > 30) {
      const golemEntry = table.find((entry) => entry.typeId === 'monster-golem');
      if (golemEntry) {
        const take = Math.min(golemEntry.weight, hero);
        golemEntry.weight -= take;
      }
      table.push({ typeId: 'monster-hero-orc', weight: hero });
    }

    for (const def of MONSTER_BALANCE_CATALOG) {
      if (def.spawnKind !== 'inject') continue;
      const minLevel = def.injectMinLevel ?? 0;
      if (playerLevel <= minLevel) continue;
      table = injectSpawnWithGolemBias(
        table,
        def.typeId,
        spawnOf(m, def.typeId),
        def.injectGolemFraction ?? 0.7,
      );
    }

    // 30레벨부터 골렘은 나오지 않고, 남은 비중은 다른 몬스터에 나눠 줍니다.
    if (playerLevel >= 30) {
      table = redistributeGolemWeight(table);
    }

    return table;
  }

  getPotionHealthBoost(itemId: string): number {
    if (itemId === 'potion-basic') return this.values.potionBasicHp;
    if (itemId === 'potion-mid') return this.values.potionMidHp;
    if (itemId === 'potion-high') return this.values.potionHighHp;
    return 0;
  }

  getPotionDropChance(itemId: string): number {
    if (itemId === 'potion-basic') {
      return this.values.potionBasicDropPercent / 100;
    }
    if (itemId === 'potion-mid') {
      return this.values.potionMidDropPercent / 100;
    }
    if (itemId === 'potion-high') {
      return this.values.potionHighDropPercent / 100;
    }
    return 0;
  }

  adjust(key: GameBalanceKey, direction: 1 | -1): void {
    const monsterKey = parseMonsterRowKey(key);
    if (monsterKey) {
      const { typeId, field } = monsterKey;
      const current = this.values.monsters[typeId]
        ?? createDefaultMonsterTunings()[typeId];
      if (!current) return;
      const limit = getMonsterFieldLimit(typeId, field);
      const nextValue = clamp(
        current[field] + direction * limit.step,
        limit.min,
        limit.max,
      );
      const rounded = limit.step < 1 ? round2(nextValue) : Math.round(nextValue);
      const monsters = cloneMonsters(this.values.monsters);
      if (field === 'hits') {
        monsters[typeId] = {
          ...current,
          hits: rounded,
          damage: monsterAttackFromHp(rounded),
          experience: monsterExperienceFromHp(rounded),
        };
      } else {
        monsters[typeId] = { ...current, [field]: rounded };
      }
      this.values = { ...this.values, monsters };
      this.persist();
      this.notify();
      return;
    }

    if (!(key in CORE_LIMITS)) return;
    const coreKey = key as CoreBalanceKey;
    const limit = CORE_LIMITS[coreKey];
    const next = clamp(
      this.values[coreKey] + direction * limit.step,
      limit.min,
      limit.max,
    );
    const rounded = limit.step < 1 ? round2(next) : Math.round(next);
    this.values = { ...this.values, [coreKey]: rounded };
    this.persist();
    this.notify();
  }

  resetToDefaults(): void {
    this.values = {
      ...DEFAULT_CORE_BALANCE,
      monsters: createDefaultMonsterTunings(),
    };
    this.persist();
    this.notify();
  }

  formatValue(key: GameBalanceKey): string {
    const row = GAME_BALANCE_ROWS.find((entry) => entry.key === key);
    const unit = row?.unit ?? '';
    const monsterKey = parseMonsterRowKey(key);
    let value: number;
    let step = 1;
    if (monsterKey) {
      const tuning = this.values.monsters[monsterKey.typeId];
      value = tuning?.[monsterKey.field]
        ?? getMonsterBalanceDef(monsterKey.typeId)?.[
          monsterKey.field === 'hits'
            ? 'defaultHits'
            : monsterKey.field === 'damage'
              ? 'defaultDamage'
              : monsterKey.field === 'spawnPercent'
                ? 'defaultSpawnPercent'
                : 'defaultExperience'
        ]
        ?? 0;
      step = getMonsterFieldLimit(monsterKey.typeId, monsterKey.field).step;
    } else if (key in CORE_LIMITS) {
      value = this.values[key as CoreBalanceKey];
      step = CORE_LIMITS[key as CoreBalanceKey].step;
    } else {
      return '';
    }
    const text = step < 1 ? formatNumber2(value) : String(value);
    return unit ? `${text}${unit}` : text;
  }

  private load(): void {
    try {
      const raw = this.readRawStorage();
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      this.values = normalizeLoadedSnapshot(parsed);
    } catch {
      this.values = {
        ...DEFAULT_CORE_BALANCE,
        monsters: createDefaultMonsterTunings(),
      };
    }
  }

  private readRawStorage(): string | null {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) return current;
    for (const key of LEGACY_STORAGE_KEYS) {
      const legacy = localStorage.getItem(key);
      if (legacy) return legacy;
    }
    return null;
  }

  private persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this);
  }
}

/**
 * v4(nested monsters)와 v3(flat keys) 저장 형식을 모두 읽습니다.
 */
function normalizeLoadedSnapshot(
  parsed: Record<string, unknown>,
): GameBalanceSnapshot {
  const core: Record<CoreBalanceKey, number> = { ...DEFAULT_CORE_BALANCE };
  (Object.keys(DEFAULT_CORE_BALANCE) as CoreBalanceKey[]).forEach((key) => {
    core[key] = clampNumber(
      typeof parsed[key] === 'number' ? parsed[key] as number : undefined,
      DEFAULT_CORE_BALANCE[key],
      CORE_LIMITS[key],
    );
  });

  let monsters: Record<string, MonsterTuningValues>;
  if (parsed.monsters && typeof parsed.monsters === 'object') {
    monsters = ensureMonsterTunings(
      parsed.monsters as Partial<Record<string, Partial<MonsterTuningValues>>>,
    );
  } else {
    monsters = migrateLegacyFlatMonsters(parsed);
  }

  return { ...core, monsters };
}

/** v3 flat 키 → 몬스터 튜닝으로 변환합니다. */
function migrateLegacyFlatMonsters(
  parsed: Record<string, unknown>,
): Record<string, MonsterTuningValues> {
  const monsters = createDefaultMonsterTunings();
  const hitsMap: Record<string, string> = {
    'monster-slime': 'slimeHits',
    'monster-wolf': 'wolfHits',
    'monster-golem': 'golemHits',
    'monster-orc': 'orcHits',
    'monster-orc-warrior': 'orcWarriorHits',
    'monster-hero-orc': 'heroOrcHits',
    'monster-werewolf': 'werewolfHits',
    'monster-red-wolf': 'redWolfHits',
    'monster-lycanthrope': 'lycanthropeHits',
    'monster-lizardman': 'lizardmanHits',
    'monster-black-lizardman': 'blackLizardmanHits',
    'monster-elder-lizardman': 'elderLizardmanHits',
  };
  const spawnMap: Record<string, string> = {
    'monster-slime': 'slimeSpawnPercent',
    'monster-wolf': 'wolfSpawnPercent',
    'monster-golem': 'golemSpawnPercent',
    'monster-orc': 'orcSpawnPercent',
    'monster-orc-warrior': 'orcWarriorSpawnPercent',
    'monster-hero-orc': 'heroOrcSpawnPercent',
  };

  for (const [typeId, flatKey] of Object.entries(hitsMap)) {
    const raw = parsed[flatKey];
    if (typeof raw !== 'number') continue;
    const current = monsters[typeId]!;
    monsters[typeId] = {
      ...current,
      hits: clampNumber(
        raw,
        current.hits,
        getMonsterFieldLimit(typeId, 'hits'),
      ),
    };
  }

  for (const [typeId, flatKey] of Object.entries(spawnMap)) {
    const raw = parsed[flatKey];
    if (typeof raw !== 'number') continue;
    const current = monsters[typeId]!;
    // 예전 orcWarriorSpawnPercent는 전사+늑대인간 합산(1:1)이었습니다.
    if (typeId === 'monster-orc-warrior') {
      const half = clampNumber(
        raw / 2,
        current.spawnPercent,
        getMonsterFieldLimit(typeId, 'spawnPercent'),
      );
      monsters[typeId] = { ...current, spawnPercent: half };
      const werewolf = monsters['monster-werewolf']!;
      monsters['monster-werewolf'] = {
        ...werewolf,
        spawnPercent: clampNumber(
          raw / 2,
          werewolf.spawnPercent,
          getMonsterFieldLimit('monster-werewolf', 'spawnPercent'),
        ),
      };
      continue;
    }
    monsters[typeId] = {
      ...current,
      spawnPercent: clampNumber(
        raw,
        current.spawnPercent,
        getMonsterFieldLimit(typeId, 'spawnPercent'),
      ),
    };
  }

  return monsters;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type SpawnEntry = { typeId: string; weight: number };

/**
 * 골렘 비중을 제거하고, 그 가중치를 다른 몬스터에게 비율대로 나눠 줍니다.
 */
function redistributeGolemWeight(
  table: ReadonlyArray<SpawnEntry>,
): SpawnEntry[] {
  const next = table.map((entry) => ({ ...entry }));
  const golemIndex = next.findIndex((entry) => entry.typeId === 'monster-golem');
  if (golemIndex < 0) return next.filter((entry) => entry.weight > 0.0001);

  const golemWeight = Math.max(0, next[golemIndex]!.weight);
  next.splice(golemIndex, 1);

  if (golemWeight <= 0) {
    return next.filter((entry) => entry.weight > 0.0001);
  }

  const others = next.filter((entry) => entry.weight > 0);
  const othersTotal = others.reduce((sum, entry) => sum + entry.weight, 0);
  if (othersTotal <= 0) {
    next.push({ typeId: 'monster-orc', weight: golemWeight });
    return next;
  }

  for (const entry of others) {
    entry.weight += golemWeight * (entry.weight / othersTotal);
  }
  return next.filter((entry) => entry.weight > 0.0001);
}

/**
 * 새 몬스터 비율을 넣되, 요청분의 golemFraction(기본 70%)은 골렘에서
 * 차출하고 나머지는 전체 가중치를 비율대로 줄여 맞춥니다.
 */
function injectSpawnWithGolemBias(
  table: ReadonlyArray<SpawnEntry>,
  typeId: string,
  percent: number,
  golemFraction: number,
): SpawnEntry[] {
  if (percent <= 0) return table.map((entry) => ({ ...entry }));
  const next = table.map((entry) => ({ ...entry }));
  const fromGolem = percent * golemFraction;
  const fromRest = percent - fromGolem;
  const golem = next.find((entry) => entry.typeId === 'monster-golem');
  if (golem) {
    const take = Math.min(golem.weight, fromGolem);
    golem.weight -= take;
  }
  const total = next.reduce((sum, entry) => sum + entry.weight, 0);
  if (total > 0 && fromRest > 0) {
    const scale = Math.max(0, total - fromRest) / total;
    for (const entry of next) {
      entry.weight *= scale;
    }
  }
  next.push({ typeId, weight: percent });
  return next;
}

function clampNumber(
  value: number | undefined,
  fallback: number,
  limit: Limit,
): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  const clamped = clamp(value, limit.min, limit.max);
  return limit.step < 1 ? round2(clamped) : Math.round(clamped);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 소수 최대 2자리 표시. */
export function formatNumber2(value: number): string {
  const rounded = round2(value);
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2);
}
