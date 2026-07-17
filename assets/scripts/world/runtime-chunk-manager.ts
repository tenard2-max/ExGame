import { Node, Rect } from 'cc';

import { CHUNK_MEMORY_RADIUS, MAX_LOADED_CHUNKS } from '../core/schema';
import type { ChunkDelta } from '../save/save-types';
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
  ChunkCoordinate,
  ChunkKey,
  WorldSeed,
} from './world-types';

export interface ChunkDeltaStore {
  load(coordinate: ChunkCoordinate): Promise<ChunkDelta | null>;
  save(delta: ChunkDelta): Promise<void>;
}

export class EmptyChunkDeltaStore implements ChunkDeltaStore {
  async load(): Promise<null> {
    return null;
  }

  async save(): Promise<void> {
    // 플레이어 변경이 없는 5단계에서는 저장할 delta가 없습니다.
  }
}

interface RuntimeChunk {
  readonly data: LoadedChunk;
  readonly node: Node;
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
      const node = this.renderer.createNode(base);
      this.worldRoot.addChild(node);
      this.loadedChunks.set(key, {
        data: { base, delta },
        node,
      });
      loaded.push(key);
    }

    for (const [key, chunk] of this.loadedChunks) {
      if (desiredKeys.has(key)) continue;
      if (chunk.data.delta) await this.deltaStore.save(chunk.data.delta);
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
    return this.loadedChunks.get(toChunkKey(coordinate))?.data ?? null;
  }

  async flushAndUnloadAll(): Promise<void> {
    for (const chunk of this.loadedChunks.values()) {
      if (chunk.data.delta) await this.deltaStore.save(chunk.data.delta);
      chunk.node.destroy();
    }
    this.loadedChunks.clear();
    this.solidColliders = [];
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

  private rebuildSolidColliders(): void {
    const colliders: Rect[] = [];
    for (const chunk of this.loadedChunks.values()) {
      const chunkOriginX = chunk.data.base.coordinate.x * CHUNK_SIZE_PIXELS;
      const chunkOriginY = chunk.data.base.coordinate.y * CHUNK_SIZE_PIXELS;
      for (const block of chunk.data.base.terrain.blocks) {
        if (block.blockId !== 'rock' && block.blockId !== 'tree') continue;
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
