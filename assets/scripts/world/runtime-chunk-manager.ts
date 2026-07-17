import { Node, Rect } from 'cc';

import {
  CHUNK_MEMORY_RADIUS,
  CHUNK_SIZE_TILES,
  MAX_LOADED_CHUNKS,
} from '../core/schema';
import type { BlockDelta, ChunkDelta } from '../save/save-types';
import { getGroundBlockId, isSolidBlock } from './block-registry';
import type {
  ChunkManager,
  ChunkTransition,
  LoadedChunk,
} from './chunk-manager';
import {
  CHUNK_SIZE_PIXELS,
  TILE_SIZE_PIXELS,
  type ChunkRenderer,
} from './chunk-renderer';
import type { WorldGenerator } from './generation-contracts';
import type {
  BlockId,
  ChunkCoordinate,
  ChunkKey,
  GeneratedChunk,
  TileCoordinate,
  WorldSeed,
} from './world-types';

export interface ChunkDeltaStore {
  load(coordinate: ChunkCoordinate): Promise<ChunkDelta | null>;
  save(delta: ChunkDelta): Promise<void>;
}

interface RuntimeChunk {
  readonly base: GeneratedChunk;
  delta: ChunkDelta | null;
  node: Node;
}

/** 월드 전체 기준 타일 좌표입니다. */
export interface WorldTileCoordinate {
  readonly x: number;
  readonly y: number;
}

export class RuntimeChunkManager implements ChunkManager {
  private readonly loadedChunks = new Map<ChunkKey, RuntimeChunk>();
  private solidColliders: ReadonlyArray<Rect> = [];

  constructor(
    private readonly worldRoot: Node,
    private readonly worldSeed: WorldSeed,
    private readonly generator: WorldGenerator,
    private readonly renderer: ChunkRenderer,
    private readonly deltaStore: ChunkDeltaStore,
  ) {}

  async syncAround(center: ChunkCoordinate): Promise<ChunkTransition> {
    const desired = this.createDesiredCoordinates(center);
    const desiredKeys = new Set(desired.map(toChunkKey));
    const loaded: ChunkKey[] = [];
    const unloaded: ChunkKey[] = [];

    for (const coordinate of desired) {
      const key = toChunkKey(coordinate);
      if (this.loadedChunks.has(key)) continue;

      const delta = await this.deltaStore.load(coordinate);
      const base = this.generator.generateChunk(
        this.worldSeed,
        coordinate,
      );
      const node = this.renderer.createNode(mergeChunkWithDelta(base, delta));
      this.worldRoot.addChild(node);
      this.loadedChunks.set(key, { base, delta, node });
      loaded.push(key);
    }

    for (const [key, chunk] of this.loadedChunks) {
      if (desiredKeys.has(key)) continue;
      if (chunk.delta) await this.deltaStore.save(chunk.delta);
      chunk.node.destroy();
      this.loadedChunks.delete(key);
      unloaded.push(key);
    }

    if (this.loadedChunks.size > MAX_LOADED_CHUNKS) {
      throw new Error(
        `Chunk memory invariant violated: ${this.loadedChunks.size}`,
      );
    }
    this.rebuildSolidColliders();

    return {
      loaded,
      unloaded,
      active: Array.from(this.loadedChunks.keys()).sort(),
    };
  }

  getLoadedChunk(coordinate: ChunkCoordinate): LoadedChunk | null {
    const chunk = this.loadedChunks.get(toChunkKey(coordinate));
    return chunk ? { base: chunk.base, delta: chunk.delta } : null;
  }

  async flushAndUnloadAll(): Promise<void> {
    for (const chunk of this.loadedChunks.values()) {
      if (chunk.delta) await this.deltaStore.save(chunk.delta);
      chunk.node.destroy();
    }
    this.loadedChunks.clear();
    this.solidColliders = [];
  }

  /** delta를 반영한 현재 블록을 반환합니다. 청크가 없으면 null입니다. */
  getEffectiveBlockId(tile: WorldTileCoordinate): BlockId | null {
    const chunk = this.getRuntimeChunkAt(tile);
    if (!chunk) return null;

    const local = toLocalTile(tile);
    const override = chunk.delta?.blocks.find(
      (block) => block.coordinate.x === local.x
        && block.coordinate.y === local.y,
    );
    if (override) {
      return override.blockId
        ?? getGroundBlockId(chunk.base.terrain.biomeId);
    }
    return findBaseBlockId(chunk.base, local);
  }

  /**
   * 블록 변경을 delta에 기록하고 즉시 저장·재렌더링합니다.
   * blockId가 null이면 원본 블록을 제거한 상태입니다.
   */
  async applyBlockChange(
    tile: WorldTileCoordinate,
    blockId: BlockId | null,
  ): Promise<boolean> {
    const chunk = this.getRuntimeChunkAt(tile);
    if (!chunk) return false;

    const local = toLocalTile(tile);
    const baseBlockId = findBaseBlockId(chunk.base, local);
    const otherBlocks = (chunk.delta?.blocks ?? []).filter(
      (block) => block.coordinate.x !== local.x
        || block.coordinate.y !== local.y,
    );
    // 원본과 같은 값으로 되돌리면 delta 항목을 제거합니다.
    const blocks: BlockDelta[] = blockId === baseBlockId
      ? otherBlocks
      : [...otherBlocks, { coordinate: local, blockId }];

    chunk.delta = {
      coordinate: chunk.base.coordinate,
      revision: (chunk.delta?.revision ?? 0) + 1,
      blocks,
      removedGeneratedEntityIds: chunk.delta?.removedGeneratedEntityIds ?? [],
      placedEntities: chunk.delta?.placedEntities ?? [],
    };
    await this.deltaStore.save(chunk.delta);

    const parent = chunk.node.parent ?? this.worldRoot;
    chunk.node.destroy();
    chunk.node = this.renderer.createNode(
      mergeChunkWithDelta(chunk.base, chunk.delta),
    );
    parent.addChild(chunk.node);
    this.rebuildSolidColliders();
    return true;
  }

  getLoadedCount(): number {
    return this.loadedChunks.size;
  }

  getActiveKeys(): ReadonlyArray<ChunkKey> {
    return Array.from(this.loadedChunks.keys()).sort();
  }

  getSolidColliders(): ReadonlyArray<Rect> {
    return this.solidColliders;
  }

  private createDesiredCoordinates(
    center: ChunkCoordinate,
  ): ChunkCoordinate[] {
    const coordinates: ChunkCoordinate[] = [];
    for (
      let y = center.y - CHUNK_MEMORY_RADIUS;
      y <= center.y + CHUNK_MEMORY_RADIUS;
      y += 1
    ) {
      for (
        let x = center.x - CHUNK_MEMORY_RADIUS;
        x <= center.x + CHUNK_MEMORY_RADIUS;
        x += 1
      ) {
        coordinates.push({ x, y });
      }
    }
    return coordinates;
  }

  private getRuntimeChunkAt(tile: WorldTileCoordinate): RuntimeChunk | null {
    const coordinate = {
      x: Math.floor(tile.x / CHUNK_SIZE_TILES),
      y: Math.floor(tile.y / CHUNK_SIZE_TILES),
    };
    return this.loadedChunks.get(toChunkKey(coordinate)) ?? null;
  }

  private rebuildSolidColliders(): void {
    const colliders: Rect[] = [];
    for (const chunk of this.loadedChunks.values()) {
      const effective = mergeChunkWithDelta(chunk.base, chunk.delta);
      const chunkOriginX = chunk.base.coordinate.x * CHUNK_SIZE_PIXELS;
      const chunkOriginY = chunk.base.coordinate.y * CHUNK_SIZE_PIXELS;
      for (const block of effective.terrain.blocks) {
        if (!isSolidBlock(block.blockId)) continue;
        colliders.push(new Rect(
          chunkOriginX + block.coordinate.x * TILE_SIZE_PIXELS,
          chunkOriginY + block.coordinate.y * TILE_SIZE_PIXELS,
          TILE_SIZE_PIXELS,
          TILE_SIZE_PIXELS,
        ));
      }
    }
    this.solidColliders = colliders;
  }
}

export function toChunkKey(coordinate: ChunkCoordinate): ChunkKey {
  return `${coordinate.x},${coordinate.y}`;
}

function toLocalTile(tile: WorldTileCoordinate): TileCoordinate {
  return {
    x: ((tile.x % CHUNK_SIZE_TILES) + CHUNK_SIZE_TILES) % CHUNK_SIZE_TILES,
    y: ((tile.y % CHUNK_SIZE_TILES) + CHUNK_SIZE_TILES) % CHUNK_SIZE_TILES,
  };
}

function findBaseBlockId(
  base: GeneratedChunk,
  local: TileCoordinate,
): BlockId | null {
  return base.terrain.blocks.find(
    (block) => block.coordinate.x === local.x
      && block.coordinate.y === local.y,
  )?.blockId ?? null;
}

/** Seed 원본 청크에 플레이어 delta를 겹쳐 현재 상태 청크를 만듭니다. */
export function mergeChunkWithDelta(
  base: GeneratedChunk,
  delta: ChunkDelta | null,
): GeneratedChunk {
  if (!delta || (
    delta.blocks.length === 0
    && delta.removedGeneratedEntityIds.length === 0
    && delta.placedEntities.length === 0
  )) {
    return base;
  }

  const overrides = new Map(
    delta.blocks.map((block) => [
      `${block.coordinate.x},${block.coordinate.y}`,
      block.blockId,
    ]),
  );
  const groundBlockId = getGroundBlockId(base.terrain.biomeId);
  const blocks = base.terrain.blocks.map((block) => {
    const key = `${block.coordinate.x},${block.coordinate.y}`;
    if (!overrides.has(key)) return block;
    return {
      coordinate: block.coordinate,
      blockId: overrides.get(key) ?? groundBlockId,
    };
  });

  const removedIds = new Set(delta.removedGeneratedEntityIds);
  const entries = [
    ...base.content.entries.filter((entry) => !removedIds.has(entry.id)),
    ...delta.placedEntities,
  ];

  return {
    coordinate: base.coordinate,
    terrain: { ...base.terrain, blocks },
    content: { ...base.content, entries },
  };
}
