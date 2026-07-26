/**
 * 몬스터 전투 스탯을 체력(hits)에서 유도합니다.
 * - 경험치: floor(체력 / 2)
 * - 공격력: ceil(체력 / 5)
 * - 방어력: ceil(체력 / 10)
 */

/** 처치 경험치. 소수점은 버림(체력/2). */
export function monsterExperienceFromHp(maxHealth: number): number {
  const hp = Math.max(0, maxHealth);
  return Math.floor(hp / 2);
}

/** 몬스터 공격력. 소수점은 무조건 올림. */
export function monsterAttackFromHp(maxHealth: number): number {
  const hp = Math.max(0, maxHealth);
  return Math.ceil(hp / 5);
}

/** 몬스터 방어력. 소수점은 무조건 올림. */
export function monsterDefenseFromHp(maxHealth: number): number {
  const hp = Math.max(0, maxHealth);
  return Math.ceil(hp / 10);
}
