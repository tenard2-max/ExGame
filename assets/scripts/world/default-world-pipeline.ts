import type { GenerationContext } from './generation-contracts';
import { buildChunkTerrainBlocks } from './tile-region-field';
import type { TerrainChunkData } from './world-types';

/**
 * Seed → 월드 좌표 타일 영역 → 청크 샘플.
 * 바이옴을 청크 단위로 통째로 뽑지 않습니다. 원칙: docs/TILE_PRINCIPLES.md
 */
export class DefaultWorldGenerationPipeline {
  generateTerrain(context: GenerationContext): TerrainChunkData {
    const { blocks, biomeId } = buildChunkTerrainBlocks(
      context.worldSeed,
      context.coordinate.x,
      context.coordinate.y,
    );

    return {
      coordinate: context.coordinate,
      biomeId,
      blocks,
    };
  }
}
