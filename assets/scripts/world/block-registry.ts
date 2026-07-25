import type { BiomeId, BlockId } from './world-types';

export interface BlockDefinition {
  /** 툴팁에 표시되는 이름입니다. */
  readonly displayName: string;
  /** 툴팁에 표시되는 설명입니다. */
  readonly description: string;
  /** 이동을 막는 블록인지 여부입니다. */
  readonly solid: boolean;
  /** 채집(탭)에 필요한 횟수입니다. null이면 채집할 수 없습니다. */
  readonly requiredHits: number | null;
  /** @deprecated 탭 채굴로 대체. 호환용으로 남겨 둡니다. */
  readonly gatherDurationMs: number | null;
  /** 채집 완료 시 지급되는 아이템입니다. */
  readonly dropItemId: string | null;
  /** 이 블록 위에 새 블록을 설치할 수 있는지 여부입니다. */
  readonly buildableOn: boolean;
}

const DEFAULT_DEFINITION: BlockDefinition = {
  displayName: '알 수 없음',
  description: '',
  solid: false,
  requiredHits: null,
  gatherDurationMs: null,
  dropItemId: null,
  buildableOn: false,
};

const BLOCK_DEFINITIONS: Readonly<Record<string, BlockDefinition>> = {
  grass: {
    displayName: '풀밭',
    description: '탭으로 선택한 블록을 설치할 수 있다',
    solid: false,
    requiredHits: null,
    gatherDurationMs: null,
    dropItemId: null,
    buildableOn: true,
  },
  mud: {
    displayName: '진흙',
    description: '탭으로 선택한 블록을 설치할 수 있다',
    solid: false,
    requiredHits: null,
    gatherDurationMs: null,
    dropItemId: null,
    buildableOn: true,
  },
  water: {
    displayName: '물',
    description: '설치할 수 없다',
    solid: false,
    requiredHits: null,
    gatherDurationMs: null,
    dropItemId: null,
    buildableOn: false,
  },
  rock: {
    displayName: '바위',
    description: '탭 7회로 채굴 · 돌 획득',
    solid: true,
    requiredHits: 7,
    gatherDurationMs: null,
    dropItemId: 'rock',
    buildableOn: false,
  },
  tree: {
    displayName: '나무',
    description: '탭 5회로 채굴 · 나무 획득',
    solid: true,
    requiredHits: 5,
    gatherDurationMs: null,
    dropItemId: 'wood',
    buildableOn: false,
  },
};

/** 플레이어가 설치할 수 있는 기본 블록입니다. */
export const PLACEABLE_BLOCK_ID: BlockId = 'rock';

export function getBlockDefinition(blockId: BlockId): BlockDefinition {
  return BLOCK_DEFINITIONS[blockId] ?? DEFAULT_DEFINITION;
}

export function isSolidBlock(blockId: BlockId): boolean {
  return getBlockDefinition(blockId).solid;
}

/** 원본 블록이 제거된 자리에 드러나는 바이옴 바닥 블록입니다. */
export function getGroundBlockId(biomeId: BiomeId): BlockId {
  return biomeId === 'wetland' ? 'mud' : 'grass';
}
