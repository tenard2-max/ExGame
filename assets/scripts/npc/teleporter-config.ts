/** NPC_텔레포터.xlsx 기준 상수입니다. */

export const TELEPORTER_TYPE_ID = 'npc-teleporter';

/** 영웅 레벨이 이 값을 초과해야 이용 가능합니다. */
export const TELEPORTER_UNLOCK_LEVEL = 30;

/** 빈(몬스터 없는) 청크당 텔레포터 1기 출현 확률. */
export const TELEPORTER_CHUNK_CHANCE = 0.03;

/** 스프라이트·점유 타일 (가로×세로). */
export const TELEPORTER_FOOTPRINT_W = 3;
export const TELEPORTER_FOOTPRINT_H = 5;

/** 위치 저장 최대 개수. */
export const TELEPORTER_MAX_WAYPOINTS = 99;

/** 이용(저장·이동) 1회당 차감 아크 광석. */
export const TELEPORTER_COST_ARK = 5;

export const TELEPORTER_COST_ITEM_ID = 'ark' as const;
