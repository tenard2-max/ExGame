import type {
  GeneratedChunk,
  TerrainChunkData,
  WorldSeed,
  ChunkCoordinate,
} from './world-types';

/** 구현 시 Math.random 대신 주입해야 하는 결정적 난수 계약입니다. */
export interface DeterministicRandom {
  nextFloat(): number;
  nextInteger(minInclusive: number, maxExclusive: number): number;
  fork(namespace: string): DeterministicRandom;
}

export interface SeedDeriver {
  createRandom(
    worldSeed: WorldSeed,
    coordinate: ChunkCoordinate,
    namespace: string,
  ): DeterministicRandom;
}

export interface GenerationContext {
  readonly worldSeed: WorldSeed;
  readonly coordinate: ChunkCoordinate;
  readonly random: DeterministicRandom;
}

/** 첫 번째 생성 단계: Seed → 월드좌표 타일 영역 → Terrain. */
export interface WorldGenerationPipeline {
  generateTerrain(context: GenerationContext): TerrainChunkData;
}

/**
 * 월드를 배열로 소유하지 않고 (Seed, Chunk 좌표)를 청크로 계산합니다.
 * 같은 입력은 실행 시점과 기기에 관계없이 같은 결과를 반환해야 합니다.
 */
export interface WorldGenerator {
  generateChunk(
    worldSeed: WorldSeed,
    coordinate: ChunkCoordinate,
  ): GeneratedChunk;
}
