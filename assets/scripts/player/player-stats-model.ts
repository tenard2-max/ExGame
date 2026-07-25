import type { GameBalanceSettings } from '../core/game-balance-settings';
import type { PlayerStats } from './player-types';

export type PlayerStatsListener = (model: PlayerStatsModel) => void;

const FALLBACK_BASE_MAX_HEALTH = 10;
const FALLBACK_MAX_HEALTH_PER_LEVEL = 2;
const FALLBACK_PASSIVE_REGEN_INTERVAL_SEC = 10;

/** 레벨·경험치·체력을 관리하는 성장 모델입니다. */
export class PlayerStatsModel {
  private readonly listeners = new Set<PlayerStatsListener>();
  private level = 1;
  private experience = 0;
  private health = FALLBACK_BASE_MAX_HEALTH;
  /** 포션 등으로 영구 증가한 최대 체력입니다. */
  private bonusMaxHealth = 0;
  private regenAccumulatorSec = 0;
  private balance: GameBalanceSettings | null = null;

  bindBalance(balance: GameBalanceSettings): void {
    this.balance = balance;
    balance.addListener(() => {
      this.health = Math.min(this.health, this.getMaxHealth());
      this.notify();
    });
  }

  addListener(listener: PlayerStatsListener): void {
    this.listeners.add(listener);
    listener(this);
  }

  /** 저장된 PlayerStats로 현재 상태를 덮어씁니다. */
  loadFromStats(stats: PlayerStats): void {
    this.level = stats.level;
    this.experience = stats.experience;
    const derivedMax = this.levelDerivedMaxHealth(this.level);
    this.bonusMaxHealth = Math.max(0, stats.maxHealth - derivedMax);
    this.health = Math.min(stats.health, this.getMaxHealth());
    this.notify();
  }

  /** 레벨 1·경험치 0·보너스 HP 없음으로 초기화합니다. */
  resetForNewGame(): void {
    this.level = 1;
    this.experience = 0;
    this.bonusMaxHealth = 0;
    this.regenAccumulatorSec = 0;
    this.health = this.getMaxHealth();
    this.notify();
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
    return this.levelDerivedMaxHealth(this.level) + this.bonusMaxHealth;
  }

  /**
   * 레벨 기반 공격력입니다.
   * 기본: 1레벨=1, 레벨당 +20% → 6레벨=2 (설정에서 변경 가능).
   */
  getAttackPower(): number {
    if (this.balance) {
      return this.balance.getAttackPowerForLevel(this.level);
    }
    return formatNumber2Parse(1 + 0.2 * (this.level - 1));
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

  /** 포션: 최대 체력과 현재 체력을 함께 올립니다. */
  applyHealthPotion(boost: number): void {
    this.bonusMaxHealth += boost;
    this.health = Math.min(this.health + boost, this.getMaxHealth());
    this.notify();
  }

  restoreFullHealth(): void {
    this.health = this.getMaxHealth();
    this.notify();
  }

  /**
   * 매 프레임 호출합니다. 최대 체력 미만이면 설정 간격마다 현재 체력 +1.
   */
  tickPassiveRegen(deltaTime: number): boolean {
    if (deltaTime <= 0) return false;
    if (this.health >= this.getMaxHealth()) {
      this.regenAccumulatorSec = 0;
      return false;
    }

    const interval = this.balance?.get('passiveRegenIntervalSec')
      ?? FALLBACK_PASSIVE_REGEN_INTERVAL_SEC;
    this.regenAccumulatorSec += deltaTime;
    if (this.regenAccumulatorSec < interval) return false;

    this.regenAccumulatorSec -= interval;
    this.health = Math.min(this.health + 1, this.getMaxHealth());
    this.notify();
    return true;
  }

  toStats(): PlayerStats {
    return {
      level: this.level,
      experience: this.experience,
      health: this.health,
      maxHealth: this.getMaxHealth(),
    };
  }

  private levelDerivedMaxHealth(level: number): number {
    const base = this.balance?.get('baseMaxHealth') ?? FALLBACK_BASE_MAX_HEALTH;
    const perLevel = this.balance?.get('maxHealthPerLevel')
      ?? FALLBACK_MAX_HEALTH_PER_LEVEL;
    return base + (level - 1) * perLevel;
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this);
  }
}

function formatNumber2Parse(value: number): number {
  return Math.round(value * 100) / 100;
}
