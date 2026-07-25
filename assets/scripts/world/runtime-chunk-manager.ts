import { Color, Graphics, Layers, Node, Rect, UITransform } from 'cc';

import {
  CHUNK_MEMORY_RADIUS,
  CHUNK_SIZE_TILES,
  MAX_LOADED_CHUNKS,
} from '../core/schema';
import type { GeneratedContent } from '../content/content-types';
import type { BlockDelta, ChunkDelta } from '../save/save-types';
import { isSolidBlock } from './block-registry';
import {
  CHUNK_SIZE_PIXELS,
  TILE_SIZE_PIXELS,
  type ChunkRenderer,
} from './chunk-renderer';
import {
  BLACKSMITH_FOOTPRINT_H,
  BLACKSMITH_FOOTPRINT_W,
  BLACKSMITH_TYPE_ID,
} from '../npc/blacksmith-config';
import {
  MERCHANT_FOOTPRINT_H,
  MERCHANT_FOOTPRINT_W,
  MERCHANT_TYPE_ID,
} from '../npc/merchant-config';
import {
  BANKER_FOOTPRINT_H,
  BANKER_FOOTPRINT_W,
  BANKER_TYPE_ID,
} from '../npc/banker-config';
import {
  TELEPORTER_FOOTPRINT_H,
  TELEPORTER_FOOTPRINT_W,
  TELEPORTER_TYPE_ID,
} from '../npc/teleporter-config';
import {
  entityVisualNodeName,
  playNodeHitShake,
} from './hit-shake';
import { worldLocalAabbContainsUi } from '../ui/hud-layout';
import { sampleGroundBlockAt } from './tile-region-field';
import type {
  ChunkManager,
  ChunkTransition,
  LoadedChunk,
} from './chunk-manager';
import type { WorldGenerator } from './generation-contracts';
import type {
  BlockId,
  ChunkCoordinate,
  ChunkKey,
  EntityId,
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
  private worldSeed: WorldSeed;

  constructor(
    private readonly worldRoot: Node,
    worldSeed: WorldSeed,
    private readonly generator: WorldGenerator,
    private readonly renderer: ChunkRenderer,
    private readonly deltaStore: ChunkDeltaStore,
  ) {
    this.worldSeed = worldSeed;
  }

  getWorldSeed(): WorldSeed {
    return this.worldSeed;
  }

  /** 새로 시작 시 월드 시드를 바꿉니다. 호출 전에 청크를 모두 언로드하세요. */
  setWorldSeed(worldSeed: WorldSeed): void {
    this.worldSeed = worldSeed;
  }

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
      const node = this.renderer.createNode(
        mergeChunkWithDelta(base, delta, this.worldSeed),
      );
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
        ?? sampleGroundBlockAt(this.worldSeed, tile.x, tile.y);
    }
    return findBaseBlockId(chunk.base, local);
  }

  /** delta를 반영해 해당 타일에 남아 있는 콘텐츠 엔티티를 반환합니다. */
  getContentEntitiesAt(
    tile: WorldTileCoordinate,
  ): ReadonlyArray<GeneratedContent> {
    const chunk = this.getRuntimeChunkAt(tile);
    if (!chunk) return [];

    const local = toLocalTile(tile);
    const effective = mergeChunkWithDelta(
      chunk.base,
      chunk.delta,
      this.worldSeed,
    );
    return effective.content.entries.filter(
      (entry) => entry.coordinate.x === local.x
        && entry.coordinate.y === local.y,
    );
  }

  /** 엔티티 스프라이트 노드를 찾아 흔들립니다. 없으면 false. */
  shakeEntityVisual(entityId: EntityId): boolean {
    for (const chunk of this.loadedChunks.values()) {
      const visual = chunk.node.getChildByName(entityVisualNodeName(entityId));
      if (!visual) continue;
      const tagged = visual as Node & {
        __hitRest?: { x: number; y: number };
      };
      if (!tagged.__hitRest) {
        tagged.__hitRest = { x: visual.position.x, y: visual.position.y };
      }
      playNodeHitShake(visual, tagged.__hitRest.x, tagged.__hitRest.y);
      return true;
    }
    return false;
  }

  /**
   * 타일(나무·돌 등 베이크된 지형) 히트 피드백입니다.
   * 전용 스프라이트가 없으면 짧은 하이라이트 노드를 만들어 흔듭니다.
   */
  shakeWorldTile(tile: WorldTileCoordinate): void {
    const chunk = this.getRuntimeChunkAt(tile);
    if (!chunk) return;

    const local = toLocalTile(tile);
    const restX = (local.x + 0.5) * TILE_SIZE_PIXELS;
    const restY = (local.y + 0.5) * TILE_SIZE_PIXELS;
    const feedbackName = `hit-fx:${local.x},${local.y}`;
    let feedback = chunk.node.getChildByName(feedbackName);
    if (!feedback) {
      feedback = new Node(feedbackName);
      feedback.layer = Layers.Enum.UI_2D;
      chunk.node.addChild(feedback);
      feedback.addComponent(UITransform).setContentSize(
        TILE_SIZE_PIXELS,
        TILE_SIZE_PIXELS,
      );
      const graphics = feedback.addComponent(Graphics);
      graphics.fillColor = new Color(255, 255, 255, 90);
      graphics.rect(
        -TILE_SIZE_PIXELS / 2,
        -TILE_SIZE_PIXELS / 2,
        TILE_SIZE_PIXELS,
        TILE_SIZE_PIXELS,
      );
      graphics.fill();
    }
    feedback.setPosition(restX, restY, 0);
    playNodeHitShake(feedback, restX, restY);
  }

  /**
   * UI 클릭이 몬스터 스프라이트 AABB(렌더와 동일 World→UI) 안이면 반환합니다.
   * 줌과 무관하게 화면상의 위치와 일치합니다.
   */
  findMonsterAtUiLocation(
    uiX: number,
    uiY: number,
    cameraNode: Node,
    worldNode: Node,
    getDisplaySize: (
      typeId: string,
    ) => { width: number; height: number } | null,
  ): { entity: GeneratedContent; tile: WorldTileCoordinate } | null {
    let best: {
      entity: GeneratedContent;
      tile: WorldTileCoordinate;
      area: number;
    } | null = null;

    for (const chunk of this.loadedChunks.values()) {
      const effective = mergeChunkWithDelta(
        chunk.base,
        chunk.delta,
        this.worldSeed,
      );
      const originTileX = chunk.base.coordinate.x * CHUNK_SIZE_TILES;
      const originTileY = chunk.base.coordinate.y * CHUNK_SIZE_TILES;

      for (const entry of effective.content.entries) {
        if (!entry.typeId.startsWith('monster-')) continue;
        const size = getDisplaySize(entry.typeId);
        if (!size) continue;

        const centerX = (originTileX + entry.coordinate.x + 0.5)
          * TILE_SIZE_PIXELS;
        const centerY = (originTileY + entry.coordinate.y + 0.5)
          * TILE_SIZE_PIXELS;
        const halfW = size.width / 2;
        const halfH = size.height / 2;
        if (
          !worldLocalAabbContainsUi(
            uiX,
            uiY,
            centerX,
            centerY,
            halfW,
            halfH,
            cameraNode,
            worldNode,
            4,
          )
        ) {
          continue;
        }

        const area = size.width * size.height;
        if (!best || area < best.area) {
          best = {
            entity: entry,
            tile: {
              x: originTileX + entry.coordinate.x,
              y: originTileY + entry.coordinate.y,
            },
            area,
          };
        }
      }
    }

    return best
      ? { entity: best.entity, tile: best.tile }
      : null;
  }

  /**
   * 월드 픽셀이 몬스터 스프라이트 발자국(AABB) 안에 있으면 그 몬스터를 반환합니다.
   * 시각적으로 큰 몬스터를 타일 1칸이 아닌 이미지 영역으로 인식하기 위함입니다.
   */
  findMonsterAtWorldPixel(
    worldPixelX: number,
    worldPixelY: number,
    getDisplaySize: (
      typeId: string,
    ) => { width: number; height: number } | null,
  ): { entity: GeneratedContent; tile: WorldTileCoordinate } | null {
    let best: {
      entity: GeneratedContent;
      tile: WorldTileCoordinate;
      area: number;
    } | null = null;

    for (const chunk of this.loadedChunks.values()) {
      const effective = mergeChunkWithDelta(
        chunk.base,
        chunk.delta,
        this.worldSeed,
      );
      const originTileX = chunk.base.coordinate.x * CHUNK_SIZE_TILES;
      const originTileY = chunk.base.coordinate.y * CHUNK_SIZE_TILES;

      for (const entry of effective.content.entries) {
        if (!entry.typeId.startsWith('monster-')) continue;
        const size = getDisplaySize(entry.typeId);
        if (!size) continue;

        const centerX = (originTileX + entry.coordinate.x + 0.5)
          * TILE_SIZE_PIXELS;
        const centerY = (originTileY + entry.coordinate.y + 0.5)
          * TILE_SIZE_PIXELS;
        // 스프라이트와 동일한 AABB (+4px 여유) — 커서 아래 바닥 타일보다 우선합니다.
        const pad = 4;
        const halfW = size.width / 2 + pad;
        const halfH = size.height / 2 + pad;
        if (
          worldPixelX < centerX - halfW
          || worldPixelX > centerX + halfW
          || worldPixelY < centerY - halfH
          || worldPixelY > centerY + halfH
        ) {
          continue;
        }

        const area = size.width * size.height;
        if (!best || area < best.area) {
          best = {
            entity: entry,
            tile: {
              x: originTileX + entry.coordinate.x,
              y: originTileY + entry.coordinate.y,
            },
            area,
          };
        }
      }
    }

    return best
      ? { entity: best.entity, tile: best.tile }
      : null;
  }

  /**
   * UI 클릭으로 대형 NPC 스프라이트를 집습니다.
   */
  findNpcAtUiLocation(
    uiX: number,
    uiY: number,
    cameraNode: Node,
    worldNode: Node,
    typeId: string,
    footprintW: number,
    footprintH: number,
  ): { entity: GeneratedContent; tile: WorldTileCoordinate } | null {
    const halfW = (footprintW * TILE_SIZE_PIXELS) / 2;
    const halfH = (footprintH * TILE_SIZE_PIXELS) / 2;

    for (const chunk of this.loadedChunks.values()) {
      const effective = mergeChunkWithDelta(
        chunk.base,
        chunk.delta,
        this.worldSeed,
      );
      const originTileX = chunk.base.coordinate.x * CHUNK_SIZE_TILES;
      const originTileY = chunk.base.coordinate.y * CHUNK_SIZE_TILES;

      for (const entry of effective.content.entries) {
        if (entry.typeId !== typeId) continue;
        const centerX = (originTileX + entry.coordinate.x + 0.5)
          * TILE_SIZE_PIXELS;
        const centerY = (originTileY + entry.coordinate.y + 0.5)
          * TILE_SIZE_PIXELS;
        if (
          !worldLocalAabbContainsUi(
            uiX,
            uiY,
            centerX,
            centerY,
            halfW,
            halfH,
            cameraNode,
            worldNode,
            4,
          )
        ) {
          continue;
        }
        return {
          entity: entry,
          tile: {
            x: originTileX + entry.coordinate.x,
            y: originTileY + entry.coordinate.y,
          },
        };
      }
    }
    return null;
  }

  /**
   * 대장장이·텔레포터 등 대형 NPC 스프라이트 AABB 히트 테스트입니다.
   */
  findNpcAtWorldPixel(
    worldPixelX: number,
    worldPixelY: number,
    typeId: string,
    footprintW: number,
    footprintH: number,
  ): { entity: GeneratedContent; tile: WorldTileCoordinate } | null {
    const halfW = (footprintW * TILE_SIZE_PIXELS) / 2 + 4;
    const halfH = (footprintH * TILE_SIZE_PIXELS) / 2 + 4;

    for (const chunk of this.loadedChunks.values()) {
      const effective = mergeChunkWithDelta(
        chunk.base,
        chunk.delta,
        this.worldSeed,
      );
      const originTileX = chunk.base.coordinate.x * CHUNK_SIZE_TILES;
      const originTileY = chunk.base.coordinate.y * CHUNK_SIZE_TILES;

      for (const entry of effective.content.entries) {
        if (entry.typeId !== typeId) continue;
        const centerX = (originTileX + entry.coordinate.x + 0.5)
          * TILE_SIZE_PIXELS;
        const centerY = (originTileY + entry.coordinate.y + 0.5)
          * TILE_SIZE_PIXELS;
        if (
          worldPixelX < centerX - halfW
          || worldPixelX > centerX + halfW
          || worldPixelY < centerY - halfH
          || worldPixelY > centerY + halfH
        ) {
          continue;
        }
        return {
          entity: entry,
          tile: {
            x: originTileX + entry.coordinate.x,
            y: originTileY + entry.coordinate.y,
          },
        };
      }
    }
    return null;
  }

  findBlacksmithAtWorldPixel(
    worldPixelX: number,
    worldPixelY: number,
  ): { entity: GeneratedContent; tile: WorldTileCoordinate } | null {
    return this.findNpcAtWorldPixel(
      worldPixelX,
      worldPixelY,
      BLACKSMITH_TYPE_ID,
      BLACKSMITH_FOOTPRINT_W,
      BLACKSMITH_FOOTPRINT_H,
    );
  }

  findBlacksmithAtUiLocation(
    uiX: number,
    uiY: number,
    cameraNode: Node,
    worldNode: Node,
  ): { entity: GeneratedContent; tile: WorldTileCoordinate } | null {
    return this.findNpcAtUiLocation(
      uiX,
      uiY,
      cameraNode,
      worldNode,
      BLACKSMITH_TYPE_ID,
      BLACKSMITH_FOOTPRINT_W,
      BLACKSMITH_FOOTPRINT_H,
    );
  }

  findTeleporterAtWorldPixel(
    worldPixelX: number,
    worldPixelY: number,
  ): { entity: GeneratedContent; tile: WorldTileCoordinate } | null {
    return this.findNpcAtWorldPixel(
      worldPixelX,
      worldPixelY,
      TELEPORTER_TYPE_ID,
      TELEPORTER_FOOTPRINT_W,
      TELEPORTER_FOOTPRINT_H,
    );
  }

  findTeleporterAtUiLocation(
    uiX: number,
    uiY: number,
    cameraNode: Node,
    worldNode: Node,
  ): { entity: GeneratedContent; tile: WorldTileCoordinate } | null {
    return this.findNpcAtUiLocation(
      uiX,
      uiY,
      cameraNode,
      worldNode,
      TELEPORTER_TYPE_ID,
      TELEPORTER_FOOTPRINT_W,
      TELEPORTER_FOOTPRINT_H,
    );
  }

  findMerchantAtWorldPixel(
    worldPixelX: number,
    worldPixelY: number,
  ): { entity: GeneratedContent; tile: WorldTileCoordinate } | null {
    return this.findNpcAtWorldPixel(
      worldPixelX,
      worldPixelY,
      MERCHANT_TYPE_ID,
      MERCHANT_FOOTPRINT_W,
      MERCHANT_FOOTPRINT_H,
    );
  }

  findMerchantAtUiLocation(
    uiX: number,
    uiY: number,
    cameraNode: Node,
    worldNode: Node,
  ): { entity: GeneratedContent; tile: WorldTileCoordinate } | null {
    return this.findNpcAtUiLocation(
      uiX,
      uiY,
      cameraNode,
      worldNode,
      MERCHANT_TYPE_ID,
      MERCHANT_FOOTPRINT_W,
      MERCHANT_FOOTPRINT_H,
    );
  }

  findBankerAtWorldPixel(
    worldPixelX: number,
    worldPixelY: number,
  ): { entity: GeneratedContent; tile: WorldTileCoordinate } | null {
    return this.findNpcAtWorldPixel(
      worldPixelX,
      worldPixelY,
      BANKER_TYPE_ID,
      BANKER_FOOTPRINT_W,
      BANKER_FOOTPRINT_H,
    );
  }

  findBankerAtUiLocation(
    uiX: number,
    uiY: number,
    cameraNode: Node,
    worldNode: Node,
  ): { entity: GeneratedContent; tile: WorldTileCoordinate } | null {
    return this.findNpcAtUiLocation(
      uiX,
      uiY,
      cameraNode,
      worldNode,
      BANKER_TYPE_ID,
      BANKER_FOOTPRINT_W,
      BANKER_FOOTPRINT_H,
    );
  }

  /**
   * UI 클릭으로 광석·나무 등 채집 타일을 집습니다.
   * 플레이어 주변 타일을 World→UI AABB로 검사합니다.
   */
  findHarvestableTileAtUiLocation(
    uiX: number,
    uiY: number,
    cameraNode: Node,
    worldNode: Node,
    playerWorldX: number,
    playerWorldY: number,
    isHarvestableBlock: (blockId: string) => boolean,
    isHarvestableContent: (typeId: string) => boolean,
  ): WorldTileCoordinate | null {
    const baseTileX = Math.floor(playerWorldX / TILE_SIZE_PIXELS);
    const baseTileY = Math.floor(playerWorldY / TILE_SIZE_PIXELS);
    let best: { tile: WorldTileCoordinate; distSq: number } | null = null;
    const searchRadius = 6;
    const half = TILE_SIZE_PIXELS / 2;

    for (let oy = -searchRadius; oy <= searchRadius; oy += 1) {
      for (let ox = -searchRadius; ox <= searchRadius; ox += 1) {
        const tile = { x: baseTileX + ox, y: baseTileY + oy };
        if (!this.isTileHarvestable(tile, isHarvestableBlock, isHarvestableContent)) {
          continue;
        }
        const centerX = (tile.x + 0.5) * TILE_SIZE_PIXELS;
        const centerY = (tile.y + 0.5) * TILE_SIZE_PIXELS;
        if (
          !worldLocalAabbContainsUi(
            uiX,
            uiY,
            centerX,
            centerY,
            half,
            half,
            cameraNode,
            worldNode,
            half,
          )
        ) {
          continue;
        }
        const dx = centerX - playerWorldX;
        const dy = centerY - playerWorldY;
        const distSq = dx * dx + dy * dy;
        if (!best || distSq < best.distSq) {
          best = { tile, distSq };
        }
      }
    }
    return best?.tile ?? null;
  }

  /**
   * 광석·나무·돌 등 채집 대상을 타일 전체 AABB로 집습니다.
   * 포인터 Y가 타일 상단에서 어긋나도 잡히도록 주변 타일을 검사하고
   * 클릭에 가장 가까운 타일 중심을 고릅니다.
   */
  findHarvestableTileAtWorldPixel(
    worldPixelX: number,
    worldPixelY: number,
    isHarvestableBlock: (blockId: string) => boolean,
    isHarvestableContent: (typeId: string) => boolean,
  ): WorldTileCoordinate | null {
    const baseTileX = Math.floor(worldPixelX / TILE_SIZE_PIXELS);
    const baseTileY = Math.floor(worldPixelY / TILE_SIZE_PIXELS);
    let best: { tile: WorldTileCoordinate; distSq: number } | null = null;
    // 타일 상·하단 클릭 시 floor 오차를 흡수할 여유
    const searchRadius = 2;
    const half = TILE_SIZE_PIXELS / 2 + TILE_SIZE_PIXELS / 2;

    for (let oy = -searchRadius; oy <= searchRadius; oy += 1) {
      for (let ox = -searchRadius; ox <= searchRadius; ox += 1) {
        const tile = { x: baseTileX + ox, y: baseTileY + oy };
        if (!this.isTileHarvestable(tile, isHarvestableBlock, isHarvestableContent)) {
          continue;
        }
        const centerX = (tile.x + 0.5) * TILE_SIZE_PIXELS;
        const centerY = (tile.y + 0.5) * TILE_SIZE_PIXELS;
        if (
          worldPixelX < centerX - half
          || worldPixelX > centerX + half
          || worldPixelY < centerY - half
          || worldPixelY > centerY + half
        ) {
          continue;
        }
        const dx = worldPixelX - centerX;
        const dy = worldPixelY - centerY;
        const distSq = dx * dx + dy * dy;
        if (!best || distSq < best.distSq) {
          best = { tile, distSq };
        }
      }
    }
    return best?.tile ?? null;
  }

  private isTileHarvestable(
    tile: WorldTileCoordinate,
    isHarvestableBlock: (blockId: string) => boolean,
    isHarvestableContent: (typeId: string) => boolean,
  ): boolean {
    for (const entity of this.getContentEntitiesAt(tile)) {
      if (isHarvestableContent(entity.typeId)) return true;
    }
    const blockId = this.getEffectiveBlockId(tile);
    return blockId !== null && isHarvestableBlock(blockId);
  }

  /** 생성된 엔티티(광맥 등) 제거를 delta에 기록하고 저장·재렌더링합니다. */
  async applyEntityRemoval(
    tile: WorldTileCoordinate,
    entityId: EntityId,
  ): Promise<boolean> {
    const chunk = this.getRuntimeChunkAt(tile);
    if (!chunk) return false;

    const removedIds = chunk.delta?.removedGeneratedEntityIds ?? [];
    if (removedIds.includes(entityId)) return false;

    chunk.delta = {
      coordinate: chunk.base.coordinate,
      revision: (chunk.delta?.revision ?? 0) + 1,
      blocks: chunk.delta?.blocks ?? [],
      removedGeneratedEntityIds: [...removedIds, entityId],
      placedEntities: chunk.delta?.placedEntities ?? [],
    };
    await this.deltaStore.save(chunk.delta);
    this.rerenderChunk(chunk);
    return true;
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
    this.rerenderChunk(chunk);
    return true;
  }

  private rerenderChunk(chunk: RuntimeChunk): void {
    const parent = chunk.node.parent ?? this.worldRoot;
    chunk.node.destroy();
    chunk.node = this.renderer.createNode(
      mergeChunkWithDelta(chunk.base, chunk.delta, this.worldSeed),
    );
    parent.addChild(chunk.node);
    this.rebuildSolidColliders();
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
      const effective = mergeChunkWithDelta(
        chunk.base,
        chunk.delta,
        this.worldSeed,
      );
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
  worldSeed: WorldSeed,
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
  const chunkOriginX = base.coordinate.x * CHUNK_SIZE_TILES;
  const chunkOriginY = base.coordinate.y * CHUNK_SIZE_TILES;
  const blocks = base.terrain.blocks.map((block) => {
    const key = `${block.coordinate.x},${block.coordinate.y}`;
    if (!overrides.has(key)) return block;
    const override = overrides.get(key);
    const groundBlockId = sampleGroundBlockAt(
      worldSeed,
      chunkOriginX + block.coordinate.x,
      chunkOriginY + block.coordinate.y,
    );
    return {
      coordinate: block.coordinate,
      blockId: override ?? groundBlockId,
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
