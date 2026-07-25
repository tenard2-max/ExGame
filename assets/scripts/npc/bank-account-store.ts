/**
 * 은행 계좌·위치 저장소.
 * PlayerState.bankState 와 동기화합니다.
 */

import {
  BANKER_LOAN_DAILY_INTEREST_RATE,
  BANKER_LOAN_DAILY_PER_LEVEL,
  BANKER_LOAN_STEP_ARK,
  BANKER_MAX_WAYPOINTS,
  BANKER_REPAY_FEE_RATE,
} from './banker-config';
import type {
  BankAccountListener,
  BankLoan,
  BankSaveState,
  BankWaypoint,
} from './bank-types';

export function utcDayNumber(ms: number = Date.now()): number {
  return Math.floor(ms / 86_400_000);
}

export function emptyBankSaveState(): BankSaveState {
  const day = utcDayNumber();
  return {
    depositedArk: 0,
    loan: null,
    loanedTodayArk: 0,
    loanDay: day,
    waypoints: [],
  };
}

/**
 * 원금에 대한 하루 이자(정수). 최소 1(원금≥100일 때).
 */
export function dailyInterestForPrincipal(principalArk: number): number {
  if (principalArk <= 0) return 0;
  return Math.max(1, Math.floor(principalArk * BANKER_LOAN_DAILY_INTEREST_RATE));
}

export function repayFeeFor(totalDue: number): number {
  if (totalDue <= 0) return 0;
  return Math.max(1, Math.ceil(totalDue * BANKER_REPAY_FEE_RATE));
}

export class BankAccountStore {
  private depositedArk = 0;
  private loan: BankLoan | null = null;
  private loanedTodayArk = 0;
  private loanDay = utcDayNumber();
  private waypoints: BankWaypoint[] = [];
  private nextWaypointId = 1;
  private readonly listeners = new Set<BankAccountListener>();

  addListener(listener: BankAccountListener): void {
    this.listeners.add(listener);
    listener(this.toState());
  }

  removeListener(listener: BankAccountListener): void {
    this.listeners.delete(listener);
  }

  getDepositedArk(): number {
    this.refreshLoanInterest();
    return this.depositedArk;
  }

  getLoan(): BankLoan | null {
    this.refreshLoanInterest();
    return this.loan ? { ...this.loan } : null;
  }

  getWaypoints(): ReadonlyArray<BankWaypoint> {
    return this.waypoints;
  }

  waypointCount(): number {
    return this.waypoints.length;
  }

  isWaypointFull(): boolean {
    return this.waypoints.length >= BANKER_MAX_WAYPOINTS;
  }

  /** 오늘 남은 대출 한도(레벨 기준). */
  remainingLoanQuota(playerLevel: number): number {
    this.refreshDailyLoanQuota();
    const cap = Math.max(0, playerLevel) * BANKER_LOAN_DAILY_PER_LEVEL;
    return Math.max(0, cap - this.loanedTodayArk);
  }

  loadFromState(state: BankSaveState | undefined): void {
    const next = state ?? emptyBankSaveState();
    this.depositedArk = Math.max(0, Math.trunc(next.depositedArk || 0));
    this.loan = next.loan
      ? {
          principalArk: Math.max(0, Math.trunc(next.loan.principalArk)),
          accruedInterestArk: Math.max(0, Math.trunc(next.loan.accruedInterestArk)),
          lastInterestDay: Math.trunc(next.loan.lastInterestDay) || utcDayNumber(),
        }
      : null;
    this.loanedTodayArk = Math.max(0, Math.trunc(next.loanedTodayArk || 0));
    this.loanDay = Math.trunc(next.loanDay) || utcDayNumber();
    this.waypoints = normalizeWaypoints(next.waypoints ?? []);
    this.nextWaypointId = this.waypoints.reduce(
      (max, entry) => Math.max(max, extractNumericId(entry.id) + 1),
      1,
    );
    this.refreshDailyLoanQuota();
    this.refreshLoanInterest();
    this.notify();
  }

  toState(): BankSaveState {
    this.refreshLoanInterest();
    this.refreshDailyLoanQuota();
    return {
      depositedArk: this.depositedArk,
      loan: this.loan ? { ...this.loan } : null,
      loanedTodayArk: this.loanedTodayArk,
      loanDay: this.loanDay,
      waypoints: this.waypoints.map((entry) => ({ ...entry })),
    };
  }

  clear(): void {
    this.loadFromState(emptyBankSaveState());
  }

  /** 입금(수수료는 호출측에서 차감). */
  deposit(amount: number): boolean {
    const value = Math.trunc(amount);
    if (value <= 0) return false;
    this.depositedArk += value;
    this.notify();
    return true;
  }

  /** 출금. 잔액 부족 시 false. */
  withdraw(amount: number): boolean {
    const value = Math.trunc(amount);
    if (value <= 0 || value > this.depositedArk) return false;
    this.depositedArk -= value;
    this.notify();
    return true;
  }

  /**
   * 대출 추가. 기존 대출이 있으면 원금에 합산하고 이자는 유지 후 갱신.
   * amount는 100 단위, 일일 한도 내여야 합니다.
   */
  takeLoan(amount: number, playerLevel: number): boolean {
    this.refreshLoanInterest();
    this.refreshDailyLoanQuota();
    const value = Math.trunc(amount);
    if (value <= 0 || value % BANKER_LOAN_STEP_ARK !== 0) return false;
    if (value > this.remainingLoanQuota(playerLevel)) return false;

    const day = utcDayNumber();
    if (this.loan) {
      this.loan = {
        principalArk: this.loan.principalArk + value,
        accruedInterestArk: this.loan.accruedInterestArk,
        lastInterestDay: day,
      };
    } else {
      this.loan = {
        principalArk: value,
        accruedInterestArk: 0,
        lastInterestDay: day,
      };
    }
    this.loanedTodayArk += value;
    this.notify();
    return true;
  }

  /**
   * 전액 상환. 성공 시 대출 제거.
   * 호출측에서 (원금+이자+수수료) 아크를 차감합니다.
   */
  clearLoanAfterRepay(): boolean {
    this.refreshLoanInterest();
    if (!this.loan) return false;
    this.loan = null;
    this.notify();
    return true;
  }

  addWaypoint(
    name: string,
    worldTileX: number,
    worldTileY: number,
  ): BankWaypoint | null {
    if (this.isWaypointFull()) return null;
    const trimmed = name.trim() || `위치 ${this.waypoints.length + 1}`;
    const waypoint: BankWaypoint = {
      id: `bwp-${this.nextWaypointId}`,
      name: trimmed.slice(0, 32),
      worldTileX: Math.trunc(worldTileX),
      worldTileY: Math.trunc(worldTileY),
    };
    this.nextWaypointId += 1;
    this.waypoints = [...this.waypoints, waypoint];
    this.notify();
    return waypoint;
  }

  renameWaypoint(id: string, name: string): boolean {
    const index = this.waypoints.findIndex((entry) => entry.id === id);
    if (index < 0) return false;
    const trimmed = name.trim();
    if (!trimmed) return false;
    const next = [...this.waypoints];
    next[index] = { ...next[index], name: trimmed.slice(0, 32) };
    this.waypoints = next;
    this.notify();
    return true;
  }

  removeWaypoint(id: string): boolean {
    const next = this.waypoints.filter((entry) => entry.id !== id);
    if (next.length === this.waypoints.length) return false;
    this.waypoints = next;
    this.notify();
    return true;
  }

  /** 미상환 원금+이자. */
  getLoanTotalDue(): number {
    this.refreshLoanInterest();
    if (!this.loan) return 0;
    return this.loan.principalArk + this.loan.accruedInterestArk;
  }

  private refreshDailyLoanQuota(): void {
    const day = utcDayNumber();
    if (this.loanDay !== day) {
      this.loanDay = day;
      this.loanedTodayArk = 0;
    }
  }

  private refreshLoanInterest(): void {
    if (!this.loan || this.loan.principalArk <= 0) {
      if (this.loan && this.loan.principalArk <= 0) this.loan = null;
      return;
    }
    const day = utcDayNumber();
    const elapsed = day - this.loan.lastInterestDay;
    if (elapsed <= 0) return;
    const perDay = dailyInterestForPrincipal(this.loan.principalArk);
    this.loan = {
      principalArk: this.loan.principalArk,
      accruedInterestArk: this.loan.accruedInterestArk + perDay * elapsed,
      lastInterestDay: day,
    };
  }

  private notify(): void {
    const snapshot = this.toState();
    for (const listener of this.listeners) listener(snapshot);
  }
}

function normalizeWaypoints(
  entries: ReadonlyArray<BankWaypoint>,
): BankWaypoint[] {
  return entries
    .filter((entry) => entry && typeof entry.id === 'string')
    .slice(0, BANKER_MAX_WAYPOINTS)
    .map((entry) => ({
      id: entry.id,
      name: String(entry.name ?? '').slice(0, 32) || '위치',
      worldTileX: Math.trunc(entry.worldTileX),
      worldTileY: Math.trunc(entry.worldTileY),
    }));
}

function extractNumericId(id: string): number {
  const match = /(\d+)$/.exec(id);
  return match ? Number(match[1]) : 0;
}
