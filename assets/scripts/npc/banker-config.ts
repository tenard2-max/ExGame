/** NPC_은행.xlsx 기준 상수입니다. */

export const BANKER_TYPE_ID = 'npc-banker';

/** 영웅 레벨이 이 값을 초과해야 이용 가능합니다. */
export const BANKER_UNLOCK_LEVEL = 40;

/** 빈(몬스터 없는) 청크당 은행원 1기 출현 확률. */
export const BANKER_CHUNK_CHANCE = 0.02;

/** 스프라이트·점유 타일 (상인과 동일 4×5). */
export const BANKER_FOOTPRINT_W = 4;
export const BANKER_FOOTPRINT_H = 5;

export const BANKER_MAX_WAYPOINTS = 99;

export const BANKER_CURRENCY_ITEM_ID = 'ark' as const;
export const BANKER_DEPOSIT_FEE_ITEM_ID = 'wood' as const;
export const BANKER_DEPOSIT_FEE_AMOUNT = 1;
export const BANKER_WITHDRAW_FEE_ARK = 1;

/** 대출은 이 단위로만 가능합니다. */
export const BANKER_LOAN_STEP_ARK = 100;
/** 일일 대출 한도 = 영웅 레벨 × 이 값. */
export const BANKER_LOAN_DAILY_PER_LEVEL = 100;
/** 일일 이자율 (원금 대비). */
export const BANKER_LOAN_DAILY_INTEREST_RATE = 0.01;
/** 상환 시 (원금+이자)에 붙는 수수료율. */
export const BANKER_REPAY_FEE_RATE = 0.03;
