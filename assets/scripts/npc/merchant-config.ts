/** NPC_상인.xlsx 기준 상수·상점 목록입니다. */

import type { ItemId } from '../inventory/item-types';

export const MERCHANT_TYPE_ID = 'npc-merchant';

/** 영웅 레벨이 이 값을 초과해야 이용 가능합니다. */
export const MERCHANT_UNLOCK_LEVEL = 10;

/** 빈(몬스터 없는) 청크당 상인 1기 출현 확률. */
export const MERCHANT_CHUNK_CHANCE = 0.03;

/** 스프라이트·점유 타일 (가로×세로). */
export const MERCHANT_FOOTPRINT_W = 4;
export const MERCHANT_FOOTPRINT_H = 5;

export const MERCHANT_CURRENCY_ITEM_ID = 'ark' as const;

export interface MerchantOffer {
  readonly id: string;
  readonly itemId: ItemId;
  readonly displayName: string;
  readonly category: 'potion' | 'weapon' | 'armor';
  /** 아크 광석 가격. */
  readonly priceArk: number;
}

/** 엑셀 기능1~3 판매 목록. */
export const MERCHANT_OFFERS: ReadonlyArray<MerchantOffer> = [
  {
    id: 'sell-potion-basic',
    itemId: 'potion-basic',
    displayName: '초급 포션',
    category: 'potion',
    priceArk: 5,
  },
  {
    id: 'sell-potion-mid',
    itemId: 'potion-mid',
    displayName: '중급 포션',
    category: 'potion',
    priceArk: 15,
  },
  {
    id: 'sell-potion-high',
    itemId: 'potion-high',
    displayName: '상급 포션',
    category: 'potion',
    priceArk: 50,
  },
  {
    id: 'sell-iron-sword',
    itemId: 'weapon-iron-sword',
    displayName: '철검',
    category: 'weapon',
    priceArk: 20,
  },
  {
    id: 'sell-leather-armor',
    itemId: 'armor-leather',
    displayName: '가죽갑옷',
    category: 'armor',
    priceArk: 20,
  },
];
