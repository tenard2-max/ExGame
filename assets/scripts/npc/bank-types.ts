/** 은행 세이브·런타임 타입. */

export interface BankWaypoint {
  readonly id: string;
  readonly name: string;
  readonly worldTileX: number;
  readonly worldTileY: number;
}

export interface BankLoan {
  /** 원금(아크). 100 단위. */
  readonly principalArk: number;
  /** 누적 이자(아크). */
  readonly accruedInterestArk: number;
  /** 마지막 이자 적용 UTC day number. */
  readonly lastInterestDay: number;
}

export interface BankSaveState {
  readonly depositedArk: number;
  readonly loan: BankLoan | null;
  /** 오늘(UTC day) 이미 대출한 양. */
  readonly loanedTodayArk: number;
  readonly loanDay: number;
  readonly waypoints: ReadonlyArray<BankWaypoint>;
}

export type BankAccountListener = (state: BankSaveState) => void;
