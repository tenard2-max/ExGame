/** 장비 옵션 등급·색상·합산 헬퍼입니다. */

export type AffixGrade = 'rare' | 'unique' | 'legendary' | 'mythic';

export interface AffixSet {
  readonly attack?: number;
  readonly defense?: number;
  readonly maxHealth?: number;
  readonly moveSpeedPercent?: number;
  /** 공격속도 증가(%). 기본 공격 간격에 1/(1+p/100)로 적용. */
  readonly attackSpeedPercent?: number;
}

export const AFFIX_GRADES: ReadonlyArray<AffixGrade> = [
  'rare',
  'unique',
  'legendary',
  'mythic',
];

export const AFFIX_GRADE_LABEL: Readonly<Record<AffixGrade, string>> = {
  rare: '레어',
  unique: '유니크',
  legendary: '레전더리',
  mythic: '신화',
};

/** UI 표시 색 (CSS). 신화는 별도 애니메이션 클래스. */
export const AFFIX_GRADE_COLOR: Readonly<Record<AffixGrade, string>> = {
  rare: '#3ecf5a',
  unique: '#b44dff',
  legendary: '#ff3b3b',
  mythic: '#ffd700',
};

export function describeAffix(affix: AffixSet): string {
  const parts: string[] = [];
  if (affix.attack) parts.push(`추가공격력+${affix.attack}`);
  if (affix.defense) parts.push(`데미지감소+${affix.defense}`);
  if (affix.maxHealth) parts.push(`체력${affix.maxHealth}`);
  if (affix.moveSpeedPercent) parts.push(`이동속도 ${affix.moveSpeedPercent}%`);
  if (affix.attackSpeedPercent) parts.push(`공격속도 ${affix.attackSpeedPercent}%`);
  return parts.join(' · ') || '(없음)';
}

export function sumAffixAttack(
  options: Partial<Record<AffixGrade, AffixSet>>,
): number {
  let total = 0;
  for (const grade of AFFIX_GRADES) {
    total += options[grade]?.attack ?? 0;
  }
  return total;
}

export function sumAffixDefense(
  options: Partial<Record<AffixGrade, AffixSet>>,
): number {
  let total = 0;
  for (const grade of AFFIX_GRADES) {
    total += options[grade]?.defense ?? 0;
  }
  return total;
}

export function sumAffixMaxHealth(
  options: Partial<Record<AffixGrade, AffixSet>>,
): number {
  let total = 0;
  for (const grade of AFFIX_GRADES) {
    total += options[grade]?.maxHealth ?? 0;
  }
  return total;
}

export function sumAffixMoveSpeedPercent(
  options: Partial<Record<AffixGrade, AffixSet>>,
): number {
  let total = 0;
  for (const grade of AFFIX_GRADES) {
    total += options[grade]?.moveSpeedPercent ?? 0;
  }
  return total;
}

export function sumAffixAttackSpeedPercent(
  options: Partial<Record<AffixGrade, AffixSet>>,
): number {
  let total = 0;
  for (const grade of AFFIX_GRADES) {
    total += options[grade]?.attackSpeedPercent ?? 0;
  }
  return total;
}

/** 등급별 독립 롤. 이미 있는 등급은 건너뜁니다. */
export function rollIndependentOptions(
  tables: Readonly<Record<AffixGrade, { chance: number; affix: AffixSet }>>,
  existing: Partial<Record<AffixGrade, AffixSet>>,
  random: () => number = Math.random,
): Partial<Record<AffixGrade, AffixSet>> {
  const next: Partial<Record<AffixGrade, AffixSet>> = { ...existing };
  for (const grade of AFFIX_GRADES) {
    if (next[grade]) continue;
    const table = tables[grade];
    if (random() < table.chance) {
      next[grade] = { ...table.affix };
    }
  }
  return next;
}
