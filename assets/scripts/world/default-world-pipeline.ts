import { CHUNK_SIZE_TILES } from '../core/schema';
import type { GenerationContext } from './generation-contracts';
import { sampleDeterministicUnit } from './deterministic-random';
import type {
  BiomeId,
  BlockId,
  GeneratedBlock,
  TerrainChunkData,
} from './world-types';

const BIOMES: ReadonlyArray<BiomeId> = [
  'meadow',
  'forest',
  'rocky',
  'wetland',
];

export class DefaultWorldGenerationPipeline {
  generateTerrain(context: GenerationContext): TerrainChunkData {
    const biomeId = this.selectBiome(context);
    const blocks: GeneratedBlock[] = [];

    for (let localY = 0; localY < CHUNK_SIZE_TILES; localY += 1) {
      for (let localX = 0; localX < CHUNK_SIZE_TILES; localX += 1) {
        const worldX = context.coordinate.x * CHUNK_SIZE_TILES + localX;
        const worldY = context.coordinate.y * CHUNK_SIZE_TILES + localY;
        blocks.push({
          coordinate: { x: localX, y: localY },
          blockId: this.selectBlock(context, biomeId, worldX, worldY),
        });
      }
    }

    return {
      coordinate: context.coordinate,
      biomeId,
      blocks,
    };
  }

  private selectBiome(context: GenerationContext): BiomeId {
    const value = sampleDeterministicUnit(
      context.worldSeed,
      'biome',
      context.coordinate.x,
      context.coordinate.y,
    );
    return BIOMES[Math.floor(value * BIOMES.length)] ?? 'meadow';
  }

  private selectBlock(
    context: GenerationContext,
    biomeId: BiomeId,
    worldX: number,
    worldY: number,
  ): BlockId {
    if (this.isRiver(context, worldX, worldY)) return 'water';

    const terrain = sampleDeterministicUnit(
      context.worldSeed,
      'terrain',
      worldX,
      worldY,
    );
    const forest = sampleDeterministicUnit(
      context.worldSeed,
      'forest',
      worldX,
      worldY,
    );

    if (biomeId === 'rocky' && terrain > 0.62) return 'rock';
    if (biomeId === 'wetland' && terrain < 0.18) return 'water';
    if (biomeId === 'forest' && forest > 0.72) return 'tree';
    if (biomeId === 'meadow' && forest > 0.94) return 'tree';
    return biomeId === 'wetland' ? 'mud' : 'grass';
  }

  private isRiver(
    context: GenerationContext,
    worldX: number,
    worldY: number,
  ): boolean {
    const horizontalOffset = sampleDeterministicUnit(
      context.worldSeed,
      'river-offset-x',
      0,
      0,
    ) * 120;
    const verticalOffset = (
      sampleDeterministicUnit(
        context.worldSeed,
        'river-offset-y',
        0,
        0,
      ) - 0.5
    ) * 28;
    const center = Math.sin((worldX + horizontalOffset) / 24) * 3
      + verticalOffset;
    return Math.abs(worldY - center) < 1.4;
  }
}
