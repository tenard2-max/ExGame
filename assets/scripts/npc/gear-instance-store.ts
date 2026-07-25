import type { ItemId } from '../inventory/item-types';
import {
  AFFIX_GRADES,
  sumAffixAttack,
  sumAffixDefense,
  sumAffixMaxHealth,
  sumAffixMoveSpeedPercent,
  sumAffixAttackSpeedPercent,
  type AffixGrade,
  type AffixSet,
} from './equipment-affix';
import { BLACKSMITH_MAX_UPGRADE } from './blacksmith-config';

export interface GearInstance {
  readonly id: string;
  readonly itemId: ItemId;
  readonly upgradeLevel: number;
  readonly bonusAttack: number;
  readonly bonusDefense: number;
  readonly options: Partial<Record<AffixGrade, AffixSet>>;
}

export type GearListener = (gears: ReadonlyArray<GearInstance>) => void;

/**
 * 대장장이 제작·강화로 생긴 고유 장비 인스턴스 저장소입니다.
 */
export class GearInstanceStore {
  private gears: GearInstance[] = [];
  private equippedWeaponGearId: string | null = null;
  private equippedArmorGearId: string | null = null;
  private nextId = 1;
  private readonly listeners = new Set<GearListener>();

  addListener(listener: GearListener): void {
    this.listeners.add(listener);
    listener(this.getAll());
  }

  getAll(): ReadonlyArray<GearInstance> {
    return this.gears;
  }

  findById(id: string): GearInstance | null {
    return this.gears.find((entry) => entry.id === id) ?? null;
  }

  getEquippedWeaponGearId(): string | null {
    return this.equippedWeaponGearId;
  }

  getEquippedArmorGearId(): string | null {
    return this.equippedArmorGearId;
  }

  getEquippedWeapon(): GearInstance | null {
    return this.equippedWeaponGearId
      ? this.findById(this.equippedWeaponGearId)
      : null;
  }

  getEquippedArmor(): GearInstance | null {
    return this.equippedArmorGearId
      ? this.findById(this.equippedArmorGearId)
      : null;
  }

  loadFromState(state: {
    readonly gears?: ReadonlyArray<GearInstance>;
    readonly equippedWeaponGearId?: string | null;
    readonly equippedArmorGearId?: string | null;
  } | undefined): void {
    this.gears = normalizeGears(state?.gears ?? []);
    this.nextId = this.gears.reduce(
      (max, gear) => Math.max(max, extractNumericId(gear.id) + 1),
      1,
    );
    this.equippedWeaponGearId = state?.equippedWeaponGearId
      && this.findById(state.equippedWeaponGearId)
      ? state.equippedWeaponGearId
      : null;
    this.equippedArmorGearId = state?.equippedArmorGearId
      && this.findById(state.equippedArmorGearId)
      ? state.equippedArmorGearId
      : null;
    this.notify();
  }

  toState(): {
    readonly gears: ReadonlyArray<GearInstance>;
    readonly equippedWeaponGearId: string | null;
    readonly equippedArmorGearId: string | null;
  } {
    return {
      gears: this.gears.map((gear) => cloneGear(gear)),
      equippedWeaponGearId: this.equippedWeaponGearId,
      equippedArmorGearId: this.equippedArmorGearId,
    };
  }

  clear(): void {
    this.gears = [];
    this.equippedWeaponGearId = null;
    this.equippedArmorGearId = null;
    this.nextId = 1;
    this.notify();
  }

  add(gear: Omit<GearInstance, 'id'>): GearInstance {
    const created: GearInstance = {
      ...gear,
      id: `gear-${this.nextId}`,
      options: { ...gear.options },
    };
    this.nextId += 1;
    this.gears = [...this.gears, created];
    this.notify();
    return created;
  }

  replace(gear: GearInstance): void {
    const index = this.gears.findIndex((entry) => entry.id === gear.id);
    if (index < 0) return;
    const next = [...this.gears];
    next[index] = cloneGear(gear);
    this.gears = next;
    this.notify();
  }

  remove(id: string): boolean {
    const next = this.gears.filter((entry) => entry.id !== id);
    if (next.length === this.gears.length) return false;
    this.gears = next;
    if (this.equippedWeaponGearId === id) this.equippedWeaponGearId = null;
    if (this.equippedArmorGearId === id) this.equippedArmorGearId = null;
    this.notify();
    return true;
  }

  equipWeaponGear(id: string | null): void {
    if (id && !this.findById(id)) return;
    this.equippedWeaponGearId = id;
    this.notify();
  }

  equipArmorGear(id: string | null): void {
    if (id && !this.findById(id)) return;
    this.equippedArmorGearId = id;
    this.notify();
  }

  /** 장착 무기 추가 공격력(강화·옵션). */
  getEquippedAttackBonus(): number {
    const gear = this.getEquippedWeapon();
    if (!gear) return 0;
    return gear.bonusAttack + sumAffixAttack(gear.options);
  }

  /** 장착 갑옷 추가 방어(강화·옵션). */
  getEquippedDefenseBonus(): number {
    const gear = this.getEquippedArmor();
    if (!gear) return 0;
    return gear.bonusDefense + sumAffixDefense(gear.options);
  }

  getEquippedMaxHealthBonus(): number {
    let total = 0;
    const weapon = this.getEquippedWeapon();
    const armor = this.getEquippedArmor();
    if (weapon) total += sumAffixMaxHealth(weapon.options);
    if (armor) total += sumAffixMaxHealth(armor.options);
    return total;
  }

  getEquippedMoveSpeedPercentBonus(): number {
    let total = 0;
    const weapon = this.getEquippedWeapon();
    const armor = this.getEquippedArmor();
    if (weapon) total += sumAffixMoveSpeedPercent(weapon.options);
    if (armor) total += sumAffixMoveSpeedPercent(armor.options);
    return total;
  }

  getEquippedAttackSpeedPercentBonus(): number {
    let total = 0;
    const weapon = this.getEquippedWeapon();
    const armor = this.getEquippedArmor();
    if (weapon) total += sumAffixAttackSpeedPercent(weapon.options);
    if (armor) total += sumAffixAttackSpeedPercent(armor.options);
    return total;
  }

  private notify(): void {
    const snapshot = this.getAll();
    for (const listener of this.listeners) listener(snapshot);
  }
}

function extractNumericId(id: string): number {
  const match = /^gear-(\d+)$/.exec(id);
  return match ? Number(match[1]) : 0;
}

function cloneGear(gear: GearInstance): GearInstance {
  const options: Partial<Record<AffixGrade, AffixSet>> = {};
  for (const grade of AFFIX_GRADES) {
    const affix = gear.options[grade];
    if (affix) options[grade] = { ...affix };
  }
  return {
    id: gear.id,
    itemId: gear.itemId,
    upgradeLevel: gear.upgradeLevel,
    bonusAttack: gear.bonusAttack,
    bonusDefense: gear.bonusDefense,
    options,
  };
}

function normalizeGears(
  entries: ReadonlyArray<GearInstance>,
): GearInstance[] {
  const result: GearInstance[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    if (typeof entry.id !== 'string' || !entry.id) continue;
    if (seen.has(entry.id)) continue;
    if (typeof entry.itemId !== 'string') continue;
    seen.add(entry.id);
    result.push({
      id: entry.id,
      itemId: entry.itemId,
      upgradeLevel: clampInt(entry.upgradeLevel, 0, BLACKSMITH_MAX_UPGRADE),
      bonusAttack: Math.max(0, Math.trunc(entry.bonusAttack ?? 0)),
      bonusDefense: Math.max(0, Math.trunc(entry.bonusDefense ?? 0)),
      options: normalizeOptions(entry.options),
    });
  }
  return result;
}

function normalizeOptions(
  options: Partial<Record<AffixGrade, AffixSet>> | undefined,
): Partial<Record<AffixGrade, AffixSet>> {
  const result: Partial<Record<AffixGrade, AffixSet>> = {};
  if (!options) return result;
  for (const grade of AFFIX_GRADES) {
    const affix = options[grade];
    if (!affix || typeof affix !== 'object') continue;
    result[grade] = {
      attack: affix.attack,
      defense: affix.defense,
      maxHealth: affix.maxHealth,
      moveSpeedPercent: affix.moveSpeedPercent,
      attackSpeedPercent: affix.attackSpeedPercent,
    };
  }
  return result;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
