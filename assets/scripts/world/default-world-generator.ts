import type { ContentGenerationPipeline } from '../content/content-generation';
import type {
  GenerationContext,
  SeedDeriver,
  WorldGenerationPipeline,
  WorldGenerator,
} from './generation-contracts';
import type {
  ChunkCoordinate,
  GeneratedChunk,
  WorldSeed,
} from './world-types';

export class DefaultWorldGenerator implements WorldGenerator {
  constructor(
    private readonly seedDeriver: SeedDeriver,
    private readonly worldPipeline: WorldGenerationPipeline,
    private readonly contentPipeline: ContentGenerationPipeline,
  ) {}

  generateChunk(
    worldSeed: WorldSeed,
    coordinate: ChunkCoordinate,
  ): GeneratedChunk {
    const terrainContext: GenerationContext = {
      worldSeed,
      coordinate,
      random: this.seedDeriver.createRandom(
        worldSeed,
        coordinate,
        'world',
      ),
    };
    const terrain = this.worldPipeline.generateTerrain(terrainContext);

    const contentContext: GenerationContext = {
      worldSeed,
      coordinate,
      random: this.seedDeriver.createRandom(
        worldSeed,
        coordinate,
        'content',
      ),
    };
    const content = this.contentPipeline.generateContent(
      contentContext,
      terrain,
    );

    return {
      coordinate,
      terrain,
      content,
    };
  }
}
