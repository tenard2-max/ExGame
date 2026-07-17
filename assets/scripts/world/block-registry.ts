import type { BiomeId, BlockId } from './world-types';

export interface BlockDefinition {
  /** 이동을 막는 블록인지 여부입니다. */
  readonly solid: boolean;
  /** 파괴에 필요한 타격 횟수입니다. null이면 채굴할 수 없습니다. */
  readonly hardness: number | null;
  /** 파괴 시 지급되는 아이템입니다. */
  readonly dropItemId: string | null;
  /** 이 블록 위에 새 블록을 설치할 수 있는지 여부입니다. */
  readonly buildableOn: boolean;
}

const DEFAULT_DEFINITION: BlockDefinition = {
  solid: false,
  hardness: null,
  dropItemId: null,
  buildableOn: false,
};

const BLOCK_DEFINITIONS: Readonly<Record<string, BlockDefinition>> = {
  grass: { solid: false, hardness: null, dropItemId: null, buildableOn: true },
  mud: { solid: false, hardness: null, dropItemId: null, buildableOn: true },
  water: { solid: false, hardness: null, dropItemId: null, buildableOn: false },
  rock: { solid: true, hardness: 2, dropItemId: 'rock', buildableOn: false },
  tree: { solid: true, hardness: 1, dropItemId: 'wood', buildableOn: false },
};

/** 플레이어가 설치할 수 있는 블록입니다. 설치 재료는 같은 아이템을 소비합니다. */
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
