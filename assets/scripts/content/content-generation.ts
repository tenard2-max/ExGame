import type { GenerationContext } from '../world/generation-contracts';
import type { TerrainChunkData } from '../world/world-types';
import type { ContentChunkData } from './content-types';

/**
 * 두 번째 생성 단계입니다.
 * 지형 생성과 독립적으로 Ore → Dungeon → NPC → Treasure → Monster를 계산합니다.
 */
export interface ContentGenerationPipeline {
  generateContent(
    context: GenerationContext,
    terrain: TerrainChunkData,
  ): ContentChunkData;
}
