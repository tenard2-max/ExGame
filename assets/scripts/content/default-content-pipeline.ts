import { CHUNK_SIZE_TILES } from '../core/schema';
import { sampleDeterministicUnit } from '../world/deterministic-random';
import type { GenerationContext } from '../world/generation-contracts';
import type { TerrainChunkData } from '../world/world-types';
import type {
  ContentChunkData,
  GeneratedContent,
} from './content-types';

export class DefaultContentGenerationPipeline {
  generateContent(
    context: GenerationContext,
    terrain: TerrainChunkData,
  ): ContentChunkData {
    const entries: GeneratedContent[] = [];

    for (const block of terrain.blocks) {
      if (block.blockId === 'water' || block.blockId === 'tree') continue;

      const worldX = context.coordinate.x * CHUNK_SIZE_TILES
        + block.coordinate.x;
      const worldY = context.coordinate.y * CHUNK_SIZE_TILES
        + block.coordinate.y;
      const value = sampleDeterministicUnit(
        context.worldSeed,
        'ore',
        worldX,
        worldY,
      );
      const typeId = this.selectOre(value);
      if (!typeId) continue;

      entries.push({
        id: `${typeId}:${worldX}:${worldY}`,
        typeId,
        coordinate: block.coordinate,
        properties: { tier: typeId === 'ore-ark' ? 3 : 1 },
      });
    }

    return {
      coordinate: context.coordinate,
      entries,
    };
  }

  private selectOre(value: number): string | null {
    if (value > 0.998) return 'ore-ark';
    if (value > 0.985) return 'ore-iron';
    if (value > 0.96) return 'ore-coal';
    return null;
  }
}
