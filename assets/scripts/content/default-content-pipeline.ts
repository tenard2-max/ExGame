import { CHUNK_SIZE_TILES } from '../core/schema';
import { sampleDeterministicUnit } from '../world/deterministic-random';
import type { GenerationContext } from '../world/generation-contracts';
import type {
  TerrainChunkData,
  TileCoordinate,
} from '../world/world-types';
import {
  DUNGEON_TYPE_ID,
  NPC_TYPE_ID,
  TREASURE_TYPE_ID,
} from './content-registry';
import type {
  ContentChunkData,
  GeneratedContent,
} from './content-types';

const DUNGEON_CHUNK_CHANCE = 0.08;
const TREASURE_TILE_CHANCE = 0.004;
const NPC_TILE_CHANCE = 0.003;
const MONSTER_TILE_CHANCE = 0.02;
/** 이 청크 거리에서 최고 티어 몬스터 확률이 최대가 됩니다. */
const MONSTER_TIER_MAX_DISTANCE = 5;

/**
 * Ore → Dungeon → NPC → Treasure → Monster 순서로 생성합니다.
 * 타일당 콘텐츠는 1개이며, 뒤 단계는 이미 점유된 타일을 건너뜁니다.
 */
export class DefaultContentGenerationPipeline {
  generateContent(
    context: GenerationContext,
    terrain: TerrainChunkData,
  ): ContentChunkData {
    const entries: GeneratedContent[] = [];
    const usedTiles = new Set<string>();
    const walkableTiles = terrain.blocks.filter(
      (block) => block.blockId === 'grass' || block.blockId === 'mud',
    );

    this.generateOres(context, terrain, entries, usedTiles);
    this.generateDungeon(context, walkableTiles.map((b) => b.coordinate), entries, usedTiles);
    this.generateSparse(
      context, walkableTiles.map((b) => b.coordinate), entries, usedTiles,
      'npc', NPC_TILE_CHANCE, () => NPC_TYPE_ID, () => ({}),
    );
    this.generateSparse(
      context, walkableTiles.map((b) => b.coordinate), entries, usedTiles,
      'treasure', TREASURE_TILE_CHANCE, () => TREASURE_TYPE_ID, () => ({}),
    );
    this.generateMonsters(context, walkableTiles.map((b) => b.coordinate), entries, usedTiles);

    return {
      coordinate: context.coordinate,
      entries,
    };
  }

  private generateOres(
    context: GenerationContext,
    terrain: TerrainChunkData,
    entries: GeneratedContent[],
    usedTiles: Set<string>,
  ): void {
    for (const block of terrain.blocks) {
      if (block.blockId === 'water' || block.blockId === 'tree') continue;

      const { worldX, worldY } = this.toWorldTile(context, block.coordinate);
      const value = sampleDeterministicUnit(
        context.worldSeed,
        'ore',
        worldX,
        worldY,
      );
      const typeId = this.selectOre(value);
      if (!typeId) continue;

      usedTiles.add(tileKey(block.coordinate));
      entries.push({
        id: `${typeId}:${worldX}:${worldY}`,
        typeId,
        coordinate: block.coordinate,
        properties: { tier: typeId === 'ore-ark' ? 3 : 1 },
      });
    }
  }

  /** 청크당 최대 1개의 던전 입구를 결정적 위치에 배치합니다. */
  private generateDungeon(
    context: GenerationContext,
    walkable: ReadonlyArray<TileCoordinate>,
    entries: GeneratedContent[],
    usedTiles: Set<string>,
  ): void {
    const chunkRoll = sampleDeterministicUnit(
      context.worldSeed,
      'dungeon-chunk',
      context.coordinate.x,
      context.coordinate.y,
    );
    if (chunkRoll > DUNGEON_CHUNK_CHANCE) return;

    const candidates = walkable.filter(
      (tile) => !usedTiles.has(tileKey(tile)),
    );
    if (candidates.length === 0) return;

    const pickRoll = sampleDeterministicUnit(
      context.worldSeed,
      'dungeon-tile',
      context.coordinate.x,
      context.coordinate.y,
    );
    const tile = candidates[
      Math.min(
        Math.floor(pickRoll * candidates.length),
        candidates.length - 1,
      )
    ];
    const { worldX, worldY } = this.toWorldTile(context, tile);

    usedTiles.add(tileKey(tile));
    entries.push({
      id: `${DUNGEON_TYPE_ID}:${worldX}:${worldY}`,
      typeId: DUNGEON_TYPE_ID,
      coordinate: tile,
      properties: {},
    });
  }

  private generateSparse(
    context: GenerationContext,
    walkable: ReadonlyArray<TileCoordinate>,
    entries: GeneratedContent[],
    usedTiles: Set<string>,
    namespace: string,
    chance: number,
    selectTypeId: (value: number) => string,
    createProperties: (value: number) => Record<string, string | number | boolean>,
  ): void {
    for (const tile of walkable) {
      if (usedTiles.has(tileKey(tile))) continue;

      const { worldX, worldY } = this.toWorldTile(context, tile);
      const value = sampleDeterministicUnit(
        context.worldSeed,
        namespace,
        worldX,
        worldY,
      );
      if (value > chance) continue;

      const typeId = selectTypeId(value);
      usedTiles.add(tileKey(tile));
      entries.push({
        id: `${typeId}:${worldX}:${worldY}`,
        typeId,
        coordinate: tile,
        properties: createProperties(value),
      });
    }
  }

  /** 원점에서 먼 청크일수록 높은 티어 몬스터가 자주 나옵니다. */
  private generateMonsters(
    context: GenerationContext,
    walkable: ReadonlyArray<TileCoordinate>,
    entries: GeneratedContent[],
    usedTiles: Set<string>,
  ): void {
    const chunkDistance = Math.max(
      Math.abs(context.coordinate.x),
      Math.abs(context.coordinate.y),
    );
    const dangerLevel = Math.min(chunkDistance / MONSTER_TIER_MAX_DISTANCE, 1);

    for (const tile of walkable) {
      if (usedTiles.has(tileKey(tile))) continue;

      const { worldX, worldY } = this.toWorldTile(context, tile);
      const spawnRoll = sampleDeterministicUnit(
        context.worldSeed,
        'monster',
        worldX,
        worldY,
      );
      if (spawnRoll > MONSTER_TILE_CHANCE) continue;

      const tierRoll = sampleDeterministicUnit(
        context.worldSeed,
        'monster-tier',
        worldX,
        worldY,
      ) * (0.4 + 0.6 * dangerLevel);
      const typeId = tierRoll > 0.45
        ? 'monster-golem'
        : tierRoll > 0.22
          ? 'monster-wolf'
          : 'monster-slime';

      usedTiles.add(tileKey(tile));
      entries.push({
        id: `${typeId}:${worldX}:${worldY}`,
        typeId,
        coordinate: tile,
        properties: { chunkDistance },
      });
    }
  }

  private toWorldTile(
    context: GenerationContext,
    tile: TileCoordinate,
  ): { worldX: number; worldY: number } {
    return {
      worldX: context.coordinate.x * CHUNK_SIZE_TILES + tile.x,
      worldY: context.coordinate.y * CHUNK_SIZE_TILES + tile.y,
    };
  }

  private selectOre(value: number): string | null {
    if (value > 0.998) return 'ore-ark';
    if (value > 0.985) return 'ore-iron';
    if (value > 0.96) return 'ore-coal';
    return null;
  }
}

function tileKey(tile: TileCoordinate): string {
  return `${tile.x},${tile.y}`;
}
