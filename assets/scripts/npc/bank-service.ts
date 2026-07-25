/**
 * 은행 입출금·대출·상환 비즈니스 로직.
 * 인벤토리 수수료 차감과 계좌 반영을 한곳에서 처리합니다.
 */

import type { InventoryModel } from '../inventory/inventory-model';
import {
  formatExactQuantity,
  getItemDefinition,
} from '../inventory/item-registry';
import type { PlayerStatsModel } from '../player/player-stats-model';
import {
  BANKER_CURRENCY_ITEM_ID,
  BANKER_DEPOSIT_FEE_AMOUNT,
  BANKER_DEPOSIT_FEE_ITEM_ID,
  BANKER_LOAN_DAILY_INTEREST_RATE,
  BANKER_LOAN_DAILY_PER_LEVEL,
  BANKER_LOAN_STEP_ARK,
  BANKER_WITHDRAW_FEE_ARK,
} from './banker-config';
import {
  BankAccountStore,
  dailyInterestForPrincipal,
  repayFeeFor,
} from './bank-account-store';

export class BankService {
  constructor(
    private readonly inventory: InventoryModel,
    private readonly playerStats: PlayerStatsModel,
    private readonly account: BankAccountStore,
  ) {}

  deposit(amount: number): { ok: true } | { ok: false; message: string } {
    const value = Math.trunc(amount);
    if (value <= 0) return { ok: false, message: '입금 수량을 입력하세요.' };
    const ark = this.inventory.getQuantity(BANKER_CURRENCY_ITEM_ID);
    if (ark < value) {
      return {
        ok: false,
        message: `아크 광석이 부족합니다. (보유 ${formatExactQuantity(ark)})`,
      };
    }
    const wood = this.inventory.getQuantity(BANKER_DEPOSIT_FEE_ITEM_ID);
    if (wood < BANKER_DEPOSIT_FEE_AMOUNT) {
      const name = getItemDefinition(BANKER_DEPOSIT_FEE_ITEM_ID).displayName;
      return {
        ok: false,
        message: `입금 수수료로 ${name} ${formatExactQuantity(BANKER_DEPOSIT_FEE_AMOUNT)}개가 필요합니다.`,
      };
    }
    if (!this.inventory.remove(BANKER_CURRENCY_ITEM_ID, value)) {
      return { ok: false, message: '입금에 실패했습니다.' };
    }
    if (!this.inventory.remove(BANKER_DEPOSIT_FEE_ITEM_ID, BANKER_DEPOSIT_FEE_AMOUNT)) {
      this.inventory.add(BANKER_CURRENCY_ITEM_ID, value);
      return { ok: false, message: '수수료 차감에 실패했습니다.' };
    }
    this.account.deposit(value);
    return { ok: true };
  }

  withdraw(amount: number): { ok: true } | { ok: false; message: string } {
    const value = Math.trunc(amount);
    if (value <= 0) return { ok: false, message: '출금 수량을 입력하세요.' };
    const balance = this.account.getDepositedArk();
    if (value > balance) {
      return {
        ok: false,
        message: `예금 잔액이 부족합니다. (잔액 ${formatExactQuantity(balance)})`,
      };
    }
    if (!this.account.withdraw(value)) {
      return { ok: false, message: '출금에 실패했습니다.' };
    }
    this.inventory.add(BANKER_CURRENCY_ITEM_ID, value);
    if (!this.inventory.remove(BANKER_CURRENCY_ITEM_ID, BANKER_WITHDRAW_FEE_ARK)) {
      // 수수료 부족: 출금 취소
      this.inventory.remove(BANKER_CURRENCY_ITEM_ID, value);
      this.account.deposit(value);
      return {
        ok: false,
        message: `출금 수수료로 아크 광석 ${formatExactQuantity(BANKER_WITHDRAW_FEE_ARK)}개가 필요합니다.`,
      };
    }
    return { ok: true };
  }

  takeLoan(amount: number): { ok: true } | { ok: false; message: string } {
    const value = Math.trunc(amount);
    if (value <= 0) return { ok: false, message: '대출 수량을 입력하세요.' };
    if (value % BANKER_LOAN_STEP_ARK !== 0) {
      return {
        ok: false,
        message: `대출은 ${formatExactQuantity(BANKER_LOAN_STEP_ARK)}개 단위만 가능합니다.`,
      };
    }
    const level = this.playerStats.getLevel();
    const remain = this.account.remainingLoanQuota(level);
    if (value > remain) {
      return {
        ok: false,
        message: `오늘 대출 한도가 부족합니다. (남은 한도 ${formatExactQuantity(remain)})`,
      };
    }
    if (!this.account.takeLoan(value, level)) {
      return { ok: false, message: '대출에 실패했습니다.' };
    }
    this.inventory.add(BANKER_CURRENCY_ITEM_ID, value);
    return { ok: true };
  }

  repay(): { ok: true; paid: number } | { ok: false; message: string } {
    const loan = this.account.getLoan();
    if (!loan) return { ok: false, message: '상환할 대출이 없습니다.' };
    const due = loan.principalArk + loan.accruedInterestArk;
    const fee = repayFeeFor(due);
    const total = due + fee;
    const have = this.inventory.getQuantity(BANKER_CURRENCY_ITEM_ID);
    if (have < total) {
      return {
        ok: false,
        message: `상환에 아크 ${formatExactQuantity(total)}개가 필요합니다. `
          + `(원금+이자 ${formatExactQuantity(due)} + 수수료 ${formatExactQuantity(fee)}, `
          + `보유 ${formatExactQuantity(have)})`,
      };
    }
    if (!this.inventory.remove(BANKER_CURRENCY_ITEM_ID, total)) {
      return { ok: false, message: '상환 결제에 실패했습니다.' };
    }
    this.account.clearLoanAfterRepay();
    return { ok: true, paid: total };
  }

  describeLoanPreview(playerLevel: number): string {
    const loan = this.account.getLoan();
    const remain = this.account.remainingLoanQuota(playerLevel);
    const dailyCap = playerLevel * BANKER_LOAN_DAILY_PER_LEVEL;
    if (!loan) {
      return `대출 없음 · 오늘 한도 남은 ${formatExactQuantity(remain)}/${formatExactQuantity(dailyCap)}`
        + ` · 이자 ${BANKER_LOAN_DAILY_INTEREST_RATE * 100}%/일`;
    }
    const due = loan.principalArk + loan.accruedInterestArk;
    const fee = repayFeeFor(due);
    const perDay = dailyInterestForPrincipal(loan.principalArk);
    return `원금 ${formatExactQuantity(loan.principalArk)}`
      + ` · 이자 ${formatExactQuantity(loan.accruedInterestArk)}(+${formatExactQuantity(perDay)}/일)`
      + ` · 상환 시 ${formatExactQuantity(due)}+수수료 ${formatExactQuantity(fee)}=${formatExactQuantity(due + fee)}`
      + ` · 오늘 한도 ${formatExactQuantity(remain)}/${formatExactQuantity(dailyCap)}`;
  }
}