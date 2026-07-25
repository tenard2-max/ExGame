import { CHUNK_SIZE_TILES } from '../core/schema';
import type { GameBalanceSettings } from '../core/game-balance-settings';
import { sampleDeterministicUnit } from '../world/deterministic-random';
import type { GenerationContext } from '../world/generation-contracts';
import type {
  TerrainChunkData,
  TileCoordinate,
} from '../world/world-types';
import {
  DUNGEON_TYPE_ID,
  TREASURE_TYPE_ID,
} from './content-registry';
import type {
  ContentChunkData,
  GeneratedContent,
} from './content-types';
import {
  BLACKSMITH_CHUNK_CHANCE,
  BLACKSMITH_FOOTPRINT_H,
  BLACKSMITH_FOOTPRINT_W,
  BLACKSMITH_TYPE_ID,
} from '../npc/blacksmith-config';
import {
  MERCHANT_CHUNK_CHANCE,
  MERCHANT_FOOTPRINT_H,
  MERCHANT_FOOTPRINT_W,
  MERCHANT_TYPE_ID,
} from '../npc/merchant-config';
import {
  BANKER_CHUNK_CHANCE,
  BANKER_FOOTPRINT_H,
  BANKER_FOOTPRINT_W,
  BANKER_TYPE_ID,
} from '../npc/banker-config';
import {
  TELEPORTER_CHUNK_CHANCE,
  TELEPORTER_FOOTPRINT_H,
  TELEPORTER_FOOTPRINT_W,
  TELEPORTER_TYPE_ID,
} from '../npc/teleporter-config';

const DUNGEON_CHUNK_CHANCE = 0.08;
const TREASURE_TILE_CHANCE = 0.004;
/** 광석·보물끼리 이웃(체비쇼프≤1) 금지 → 최소 거리 2. */
const RESOURCE_MIN_SEPARATION_TILES = 2;
/** 광석·보물은 몬스터로부터 최소 이 거리(체비쇼프) 이상 떨어져야 합니다. */
const RESOURCE_MONSTER_SEPARATION_TILES = 5;
const DEFAULT_CHUNKS_PER_MONSTER = 3;

/**
 * Ore → Dungeon → NPC → Treasure → Monster 순서로 생성합니다.
 * 타일당 콘텐츠는 1개이며, 뒤 단계는 이미 점유된 타일을 건너뜁니다.
 */
export class DefaultContentGenerationPipeline {
  constructor(
    private readonly balance: GameBalanceSettings | null = null,
    private readonly getPlayerLevel: () => number = () => 1,
  ) {}

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
    // 마을 주민(npc-villager)은 제거. 대장장이는 빈 청크 중앙에 출현.
    this.generateBlacksmith(
      context,
      walkableTiles.map((b) => b.coordinate),
      entries,
      usedTiles,
    );
    this.generateMerchant(
      context,
      walkableTiles.map((b) => b.coordinate),
      entries,
      usedTiles,
    );
    this.generateBanker(
      context,
      walkableTiles.map((b) => b.coordinate),
      entries,
      usedTiles,
    );
    this.generateTeleporter(
      context,
      walkableTiles.map((b) => b.coordinate),
      entries,
      usedTiles,
    );
    this.generateTreasure(context, walkableTiles.map((b) => b.coordinate), entries, usedTiles);
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
    const radius = RESOURCE_MIN_SEPARATION_TILES - 1;

    for (const block of terrain.blocks) {
      if (block.blockId === 'water' || block.blockId === 'tree') continue;

      const { worldX, worldY } = this.toWorldTile(context, block.coordinate);
      const typeId = this.selectOre(
        sampleDeterministicUnit(context.worldSeed, 'ore', worldX, worldY),
      );
      if (!typeId) continue;
      if (!this.isResourceSpawnPriority(context, worldX, worldY, radius, 'ore')) {
        continue;
      }

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

  private generateTreasure(
    context: GenerationContext,
    walkable: ReadonlyArray<TileCoordinate>,
    entries: GeneratedContent[],
    usedTiles: Set<string>,
  ): void {
    const radius = RESOURCE_MIN_SEPARATION_TILES - 1;

    for (const tile of walkable) {
      if (usedTiles.has(tileKey(tile))) continue;

      const { worldX, worldY } = this.toWorldTile(context, tile);
      const value = sampleDeterministicUnit(
        context.worldSeed,
        'treasure',
        worldX,
        worldY,
      );
      if (value > TREASURE_TILE_CHANCE) continue;
      if (!this.isResourceSpawnPriority(context, worldX, worldY, radius, 'treasure')) {
        continue;
      }

      usedTiles.add(tileKey(tile));
      entries.push({
        id: `${TREASURE_TYPE_ID}:${worldX}:${worldY}`,
        typeId: TREASURE_TYPE_ID,
        coordinate: tile,
        properties: {},
      });
    }
  }

  /**
   * 몬스터가 없는 빈 청크의 중앙에 대장장이(3×6)를 출현비율로 배치합니다.
   */
  private generateBlacksmith(
    context: GenerationContext,
    walkable: ReadonlyArray<TileCoordinate>,
    entries: GeneratedContent[],
    usedTiles: Set<string>,
  ): void {
    if (!this.isNpcEligibleChunk(context)) return;

    const chunkRoll = sampleDeterministicUnit(
      context.worldSeed,
      'blacksmith-chunk',
      context.coordinate.x,
      context.coordinate.y,
    );
    if (chunkRoll > BLACKSMITH_CHUNK_CHANCE) return;

    const centerX = Math.floor((CHUNK_SIZE_TILES - 1) / 2);
    const centerY = Math.floor((CHUNK_SIZE_TILES - 1) / 2);
    const halfW = Math.floor(BLACKSMITH_FOOTPRINT_W / 2);
    const halfH = Math.floor(BLACKSMITH_FOOTPRINT_H / 2);
    const minX = centerX - halfW;
    const maxX = centerX + halfW;
    const minY = centerY - halfH;
    const maxY = minY + BLACKSMITH_FOOTPRINT_H - 1;
    if (minX < 0 || maxX >= CHUNK_SIZE_TILES || minY < 0 || maxY >= CHUNK_SIZE_TILES) {
      return;
    }

    const walkableSet = new Set(walkable.map(tileKey));
    const footprint: TileCoordinate[] = [];
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const tile = { x, y };
        const key = tileKey(tile);
        if (!walkableSet.has(key) || usedTiles.has(key)) return;
        footprint.push(tile);
      }
    }

    for (const tile of footprint) usedTiles.add(tileKey(tile));

    // 기존에 중앙을 점유한 콘텐츠가 있으면 제거(발자국 전체).
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i];
      if (
        entry.coordinate.x >= minX && entry.coordinate.x <= maxX
        && entry.coordinate.y >= minY && entry.coordinate.y <= maxY
      ) {
        entries.splice(i, 1);
      }
    }

    const anchor = { x: centerX, y: centerY };
    const { worldX, worldY } = this.toWorldTile(context, anchor);
    entries.push({
      id: `${BLACKSMITH_TYPE_ID}:${worldX}:${worldY}`,
      typeId: BLACKSMITH_TYPE_ID,
      coordinate: anchor,
      properties: {
        maxHealth: 99999999,
        footprintW: BLACKSMITH_FOOTPRINT_W,
        footprintH: BLACKSMITH_FOOTPRINT_H,
      },
    });
  }

  /**
   * 몬스터 없는 청크에만 상인을 출현비율로 배치합니다(4×5 점유).
   */
  private generateMerchant(
    context: GenerationContext,
    walkable: ReadonlyArray<TileCoordinate>,
    entries: GeneratedContent[],
    usedTiles: Set<string>,
  ): void {
    if (!this.isNpcEligibleChunk(context)) return;

    const chunkRoll = sampleDeterministicUnit(
      context.worldSeed,
      'merchant-chunk',
      context.coordinate.x,
      context.coordinate.y,
    );
    if (chunkRoll > MERCHANT_CHUNK_CHANCE) return;

    const walkableSet = new Set(walkable.map(tileKey));
    const halfW = Math.floor(MERCHANT_FOOTPRINT_W / 2);
    const halfH = Math.floor(MERCHANT_FOOTPRINT_H / 2);
    const candidates = walkable.filter((tile) => {
      const minX = tile.x - halfW;
      const maxX = tile.x + (MERCHANT_FOOTPRINT_W - 1 - halfW);
      const minY = tile.y - halfH;
      const maxY = minY + MERCHANT_FOOTPRINT_H - 1;
      if (minX < 0 || maxX >= CHUNK_SIZE_TILES || minY < 0 || maxY >= CHUNK_SIZE_TILES) {
        return false;
      }
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const key = tileKey({ x, y });
          if (!walkableSet.has(key) || usedTiles.has(key)) return false;
        }
      }
      return true;
    });
    if (candidates.length === 0) return;

    const pickRoll = sampleDeterministicUnit(
      context.worldSeed,
      'merchant-tile',
      context.coordinate.x,
      context.coordinate.y,
    );
    const anchor = candidates[
      Math.min(
        Math.floor(pickRoll * candidates.length),
        candidates.length - 1,
      )
    ];

    const minX = anchor.x - halfW;
    const maxX = anchor.x + (MERCHANT_FOOTPRINT_W - 1 - halfW);
    const minY = anchor.y - halfH;
    const maxY = minY + MERCHANT_FOOTPRINT_H - 1;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        usedTiles.add(tileKey({ x, y }));
      }
    }

    const { worldX, worldY } = this.toWorldTile(context, anchor);
    entries.push({
      id: `${MERCHANT_TYPE_ID}:${worldX}:${worldY}`,
      typeId: MERCHANT_TYPE_ID,
      coordinate: anchor,
      properties: {
        maxHealth: 99999999,
        footprintW: MERCHANT_FOOTPRINT_W,
        footprintH: MERCHANT_FOOTPRINT_H,
      },
    });
  }

  /**
   * 몬스터 없는 청크에만 은행원을 출현비율로 배치합니다(4×5 점유).
   */
  private generateBanker(
    context: GenerationContext,
    walkable: ReadonlyArray<TileCoordinate>,
    entries: GeneratedContent[],
    usedTiles: Set<string>,
  ): void {
    if (!this.isNpcEligibleChunk(context)) return;

    const chunkRoll = sampleDeterministicUnit(
      context.worldSeed,
      'banker-chunk',
      context.coordinate.x,
      context.coordinate.y,
    );
    if (chunkRoll > BANKER_CHUNK_CHANCE) return;

    const walkableSet = new Set(walkable.map(tileKey));
    const halfW = Math.floor(BANKER_FOOTPRINT_W / 2);
    const halfH = Math.floor(BANKER_FOOTPRINT_H / 2);
    const candidates = walkable.filter((tile) => {
      const minX = tile.x - halfW;
      const maxX = tile.x + (BANKER_FOOTPRINT_W - 1 - halfW);
      const minY = tile.y - halfH;
      const maxY = minY + BANKER_FOOTPRINT_H - 1;
      if (minX < 0 || maxX >= CHUNK_SIZE_TILES || minY < 0 || maxY >= CHUNK_SIZE_TILES) {
        return false;
      }
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const key = tileKey({ x, y });
          if (!walkableSet.has(key) || usedTiles.has(key)) return false;
        }
      }
      return true;
    });
    if (candidates.length === 0) return;

    const pickRoll = sampleDeterministicUnit(
      context.worldSeed,
      'banker-tile',
      context.coordinate.x,
      context.coordinate.y,
    );
    const anchor = candidates[
      Math.min(
        Math.floor(pickRoll * candidates.length),
        candidates.length - 1,
      )
    ];

    const minX = anchor.x - halfW;
    const maxX = anchor.x + (BANKER_FOOTPRINT_W - 1 - halfW);
    const minY = anchor.y - halfH;
    const maxY = minY + BANKER_FOOTPRINT_H - 1;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        usedTiles.add(tileKey({ x, y }));
      }
    }

    const { worldX, worldY } = this.toWorldTile(context, anchor);
    entries.push({
      id: `${BANKER_TYPE_ID}:${worldX}:${worldY}`,
      typeId: BANKER_TYPE_ID,
      coordinate: anchor,
      properties: {
        maxHealth: 99999999,
        footprintW: BANKER_FOOTPRINT_W,
        footprintH: BANKER_FOOTPRINT_H,
      },
    });
  }

  /** 몬스터 없는 청크에만 텔레포터를 출현비율로 배치합니다(3×5 점유). */
  private generateTeleporter(
    context: GenerationContext,
    walkable: ReadonlyArray<TileCoordinate>,
    entries: GeneratedContent[],
    usedTiles: Set<string>,
  ): void {
    if (!this.isNpcEligibleChunk(context)) return;

    const chunkRoll = sampleDeterministicUnit(
      context.worldSeed,
      'teleporter-chunk',
      context.coordinate.x,
      context.coordinate.y,
    );
    if (chunkRoll > TELEPORTER_CHUNK_CHANCE) return;

    const walkableSet = new Set(walkable.map(tileKey));
    const halfW = Math.floor(TELEPORTER_FOOTPRINT_W / 2);
    const halfH = Math.floor(TELEPORTER_FOOTPRINT_H / 2);
    const candidates = walkable.filter((tile) => {
      const minX = tile.x - halfW;
      const maxX = tile.x + (TELEPORTER_FOOTPRINT_W - 1 - halfW);
      const minY = tile.y - halfH;
      const maxY = minY + TELEPORTER_FOOTPRINT_H - 1;
      if (minX < 0 || maxX >= CHUNK_SIZE_TILES || minY < 0 || maxY >= CHUNK_SIZE_TILES) {
        return false;
      }
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const key = tileKey({ x, y });
          if (!walkableSet.has(key) || usedTiles.has(key)) return false;
        }
      }
      return true;
    });
    if (candidates.length === 0) return;

    const pickRoll = sampleDeterministicUnit(
      context.worldSeed,
      'teleporter-tile',
      context.coordinate.x,
      context.coordinate.y,
    );
    const anchor = candidates[
      Math.min(
        Math.floor(pickRoll * candidates.length),
        candidates.length - 1,
      )
    ];

    const minX = anchor.x - halfW;
    const maxX = anchor.x + (TELEPORTER_FOOTPRINT_W - 1 - halfW);
    const minY = anchor.y - halfH;
    const maxY = minY + TELEPORTER_FOOTPRINT_H - 1;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        usedTiles.add(tileKey({ x, y }));
      }
    }

    const { worldX, worldY } = this.toWorldTile(context, anchor);
    entries.push({
      id: `${TELEPORTER_TYPE_ID}:${worldX}:${worldY}`,
      typeId: TELEPORTER_TYPE_ID,
      coordinate: anchor,
      properties: {
        maxHealth: 99999,
        footprintW: TELEPORTER_FOOTPRINT_W,
        footprintH: TELEPORTER_FOOTPRINT_H,
      },
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

  /**
   * 청크 중앙 타일에 몬스터 1마리를 둡니다.
   * NPC가 있는 청크에는 두지 않습니다(청크 단위 배타).
   * 중앙이 광석 등으로 점유돼 있으면 그 콘텐츠를 치우고 몬스터를 우선 배치합니다.
   */
  private generateMonsters(
    context: GenerationContext,
    _walkable: ReadonlyArray<TileCoordinate>,
    entries: GeneratedContent[],
    usedTiles: Set<string>,
  ): void {
    if (!this.shouldSpawnMonsterInChunk(context)) return;
    if (this.chunkHasServiceNpc(entries)) return;

    const centerX = Math.floor((CHUNK_SIZE_TILES - 1) / 2);
    const centerY = Math.floor((CHUNK_SIZE_TILES - 1) / 2);
    const tile = { x: centerX, y: centerY };
    const key = tileKey(tile);

    if (usedTiles.has(key)) {
      const index = entries.findIndex(
        (entry) => entry.coordinate.x === centerX
          && entry.coordinate.y === centerY,
      );
      if (index >= 0) entries.splice(index, 1);
      usedTiles.delete(key);
    }

    const { worldX, worldY } = this.toWorldTile(context, tile);
    const roll = sampleDeterministicUnit(
      context.worldSeed,
      'monster-type',
      worldX,
      worldY,
    );
    const typeId = this.balance
      ? this.balance.selectMonsterType(roll, this.getPlayerLevel())
      : this.selectMonsterTypeFallback(roll, this.getPlayerLevel());

    usedTiles.add(key);
    entries.push({
      id: `${typeId}:${worldX}:${worldY}`,
      typeId,
      coordinate: tile,
      properties: {},
    });
  }

  /** 서비스 NPC는 몬스터 청크에 두지 않습니다. */
  private isNpcEligibleChunk(context: GenerationContext): boolean {
    return !this.shouldSpawnMonsterInChunk(context);
  }

  /** 대장장이·상인·은행·텔레포터 중 하나라도 있으면 true. */
  private chunkHasServiceNpc(entries: ReadonlyArray<GeneratedContent>): boolean {
    return entries.some((entry) => (
      entry.typeId === BLACKSMITH_TYPE_ID
      || entry.typeId === MERCHANT_TYPE_ID
      || entry.typeId === BANKER_TYPE_ID
      || entry.typeId === TELEPORTER_TYPE_ID
    ));
  }

  /**
   * 청크를 결정적 ID로 묶고, N개 그룹마다 정확히 한 청크에만 몬스터를 둡니다.
   */
  private shouldSpawnMonsterInChunk(context: GenerationContext): boolean {
    const chunksPerMonster = this.balance?.getChunksPerMonster()
      ?? DEFAULT_CHUNKS_PER_MONSTER;
    const chunkId = chunkUniqueId(
      context.coordinate.x,
      context.coordinate.y,
    );
    const groupId = Math.floor(chunkId / chunksPerMonster);
    const roleInGroup = chunkId % chunksPerMonster;
    const chosenRole = Math.floor(
      sampleDeterministicUnit(
        context.worldSeed,
        'monster-chunk-group',
        groupId,
        0,
      ) * chunksPerMonster,
    ) % chunksPerMonster;
    return roleInGroup === chosenRole;
  }

  /**
   * 레벨 구간에 맞춰 기본 스폰표를 씁니다(밸런스 없을 때).
   */
  private selectMonsterTypeFallback(value: number, playerLevel: number): string {
    if (playerLevel > 60) {
      if (value < 0.22) return 'monster-orc';
      if (value < 0.34) return 'monster-werewolf';
      if (value < 0.46) return 'monster-red-wolf';
      if (value < 0.62) return 'monster-lizardman';
      if (value < 0.74) return 'monster-lycanthrope';
      if (value < 0.88) return 'monster-black-lizardman';
      return 'monster-elder-lizardman';
    }
    if (playerLevel > 50) {
      if (value < 0.24) return 'monster-orc';
      if (value < 0.38) return 'monster-werewolf';
      if (value < 0.52) return 'monster-red-wolf';
      if (value < 0.72) return 'monster-lizardman';
      if (value < 0.84) return 'monster-lycanthrope';
      return 'monster-black-lizardman';
    }
    if (playerLevel > 40) {
      if (value < 0.28) return 'monster-orc';
      if (value < 0.44) return 'monster-werewolf';
      if (value < 0.6) return 'monster-red-wolf';
      return 'monster-lizardman';
    }
    if (playerLevel >= 30) {
      if (playerLevel > 30) {
        if (value < 0.3) return 'monster-orc';
        if (value < 0.46) return 'monster-orc-warrior';
        if (value < 0.62) return 'monster-werewolf';
        if (value < 0.74) return 'monster-hero-orc';
        return 'monster-red-wolf';
      }
      // 정확히 30: 골렘 없이 오크·전사·늑대인간만
      if (value < 0.34) return 'monster-orc';
      if (value < 0.67) return 'monster-orc-warrior';
      return 'monster-werewolf';
    }
    if (playerLevel > 20) {
      if (value < 0.3) return 'monster-orc';
      if (value < 0.45) return 'monster-orc-warrior';
      if (value < 0.6) return 'monster-werewolf';
      return 'monster-golem';
    }
    if (playerLevel > 10) {
      if (value < 0.3) return 'monster-orc';
      if (value < 0.6) return 'monster-wolf';
      return 'monster-golem';
    }
    if (value < 0.5) return 'monster-slime';
    if (value < 0.8) return 'monster-wolf';
    return 'monster-golem';
  }

  /**
   * 광석·보물 후보 중 주변(최소 간격 미만)에서 굴림이 가장 낮은 타일만 남깁니다.
   * 청크 경계에서도 이웃 배치가 나오지 않습니다.
   */
  private isResourceSpawnPriority(
    context: GenerationContext,
    worldX: number,
    worldY: number,
    radius: number,
    kind: 'ore' | 'treasure',
  ): boolean {
    const myRoll = this.resourceRoll(context, worldX, worldY, kind);
    if (myRoll === null) return false;

    for (let oy = -radius; oy <= radius; oy += 1) {
      for (let ox = -radius; ox <= radius; ox += 1) {
        if (ox === 0 && oy === 0) continue;
        const nx = worldX + ox;
        const ny = worldY + oy;
        const oreRoll = this.resourceRoll(context, nx, ny, 'ore');
        const treasureRoll = this.resourceRoll(context, nx, ny, 'treasure');
        const others = [oreRoll, treasureRoll].filter(
          (roll): roll is number => roll !== null,
        );
        for (const otherRoll of others) {
          if (otherRoll < myRoll) return false;
          if (
            otherRoll === myRoll
            && (nx < worldX || (nx === worldX && ny < worldY))
          ) {
            return false;
          }
        }
      }
    }
    return true;
  }

  private resourceRoll(
    context: GenerationContext,
    worldX: number,
    worldY: number,
    kind: 'ore' | 'treasure',
  ): number | null {
    if (kind === 'ore') {
      const value = sampleDeterministicUnit(
        context.worldSeed,
        'ore',
        worldX,
        worldY,
      );
      return this.selectOre(value) ? value : null;
    }
    const value = sampleDeterministicUnit(
      context.worldSeed,
      'treasure',
      worldX,
      worldY,
    );
    return value <= TREASURE_TILE_CHANCE ? value : null;
  }

  private isNearResource(
    context: GenerationContext,
    worldX: number,
    worldY: number,
    radius: number,
  ): boolean {
    for (let oy = -radius; oy <= radius; oy += 1) {
      for (let ox = -radius; ox <= radius; ox += 1) {
        const nx = worldX + ox;
        const ny = worldY + oy;
        if (this.resourceRoll(context, nx, ny, 'ore') !== null) return true;
        if (this.resourceRoll(context, nx, ny, 'treasure') !== null) return true;
      }
    }
    return false;
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

/** 음수 청크 좌표를 포함한 결정적 비음수 ID입니다. */
function chunkUniqueId(chunkX: number, chunkY: number): number {
  const map = (value: number): number => (
    value >= 0 ? value * 2 : (-value * 2) - 1
  );
  const x = map(chunkX);
  const y = map(chunkY);
  return ((x + y) * (x + y + 1)) / 2 + y;
}

function tileKey(tile: TileCoordinate): string {
  return `${tile.x},${tile.y}`;
}
