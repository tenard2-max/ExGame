import type { ContentChunkData } from '../content/content-types';

/**
 * 큰 정수 Seed의 정밀도 손실을 막기 위해 직렬화 가능한 문자열로 보관합니다.
 * 생성기 구현은 이 값을 임의로 Number로 변환하면 안 됩니다.
 */
export type WorldSeed = string;

export interface ChunkCoordinate {
  readonly x: number;
  readonly y: number;
}

export type ChunkKey = `${number},${number}`;

export interface TileCoordinate {
  readonly x: number;
  readonly y: number;
}

export type BiomeId = string;
export type BlockId = string;
export type EntityId = string;

export interface GeneratedBlock {
  readonly coordinate: TileCoordinate;
  readonly blockId: BlockId;
}

/** Seed → Biome → Terrain → River → Forest 결과입니다. */
export interface TerrainChunkData {
  readonly coordinate: ChunkCoordinate;
  readonly biomeId: BiomeId;
  readonly blocks: ReadonlyArray<GeneratedBlock>;
}

/** Seed로 다시 계산할 수 있는 완성 청크이며 영속 저장 대상이 아닙니다. */
export interface GeneratedChunk {
  readonly coordinate: ChunkCoordinate;
  readonly terrain: TerrainChunkData;
  readonly content: ContentChunkData;
}
