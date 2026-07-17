import type { PlayerStats } from './player-types';

export type PlayerStatsListener = (model: PlayerStatsModel) => void;

const BASE_MAX_HEALTH = 10;
const MAX_HEALTH_PER_LEVEL = 2;

/** 레벨·경험치·체력을 관리하는 성장 모델입니다. */
export class PlayerStatsModel {
  private readonly listeners = new Set<PlayerStatsListener>();
  private level = 1;
  private experience = 0;
  private health = BASE_MAX_HEALTH;

  addListener(listener: PlayerStatsListener): void {
    this.listeners.add(listener);
    listener(this);
  }

  getLevel(): number {
    return this.level;
  }

  getExperience(): number {
    return this.experience;
  }

  /** 다음 레벨까지 필요한 총 경험치입니다. */
  getExperienceToNextLevel(): number {
    return this.level * 10;
  }

  getHealth(): number {
    return this.health;
  }

  getMaxHealth(): number {
    return BASE_MAX_HEALTH + (this.level - 1) * MAX_HEALTH_PER_LEVEL;
  }

  /** 탭 1회당 몬스터에게 주는 피해입니다. */
  getAttackPower(): number {
    return 1 + Math.floor(this.level / 2);
  }

  /** 경험치를 더하고 레벨업 횟수를 반환합니다. 레벨업 시 체력을 회복합니다. */
  addExperience(amount: number): number {
    this.experience += amount;
    let levelUps = 0;
    while (this.experience >= this.getExperienceToNextLevel()) {
      this.experience -= this.getExperienceToNextLevel();
      this.level += 1;
      levelUps += 1;
    }
    if (levelUps > 0) this.health = this.getMaxHealth();
    this.notify();
    return levelUps;
  }

  /** 피해를 적용하고 사망 여부를 반환합니다. */
  applyDamage(amount: number): boolean {
    this.health = Math.max(0, this.health - amount);
    this.notify();
    return this.health <= 0;
  }

  restoreFullHealth(): void {
    this.health = this.getMaxHealth();
    this.notify();
  }

  toStats(): PlayerStats {
    return {
      level: this.level,
      experience: this.experience,
      health: this.health,
      maxHealth: this.getMaxHealth(),
    };
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this);
  }
}
