import { CHUNK_SIZE_TILES } from '../core/schema';
import type { InventoryModel } from '../inventory/inventory-model';
import type { PlayerStatsModel } from '../player/player-stats-model';
import type {
  PlayerPosition,
  PlayerState,
} from '../player/player-types';
import { TILE_SIZE_PIXELS } from '../world/chunk-renderer';

/** 월드 픽셀 좌표를 저장용 PlayerPosition으로 변환합니다. */
export function encodePlayerPosition(
  worldX: number,
  worldY: number,
): PlayerPosition {
  const worldTileX = Math.floor(worldX / TILE_SIZE_PIXELS);
  const worldTileY = Math.floor(worldY / TILE_SIZE_PIXELS);
  const chunkX = Math.floor(worldTileX / CHUNK_SIZE_TILES);
  const chunkY = Math.floor(worldTileY / CHUNK_SIZE_TILES);

  return {
    chunk: { x: chunkX, y: chunkY },
    tile: {
      x: ((worldTileX % CHUNK_SIZE_TILES) + CHUNK_SIZE_TILES) % CHUNK_SIZE_TILES,
      y: ((worldTileY % CHUNK_SIZE_TILES) + CHUNK_SIZE_TILES) % CHUNK_SIZE_TILES,
    },
  };
}

/** 저장용 PlayerPosition을 월드 픽셀 좌표로 되돌립니다. */
export function decodePlayerPosition(
  position: PlayerPosition,
): { x: number; y: number } {
  return {
    x: (position.chunk.x * CHUNK_SIZE_TILES + position.tile.x)
      * TILE_SIZE_PIXELS
      + TILE_SIZE_PIXELS / 2,
    y: (position.chunk.y * CHUNK_SIZE_TILES + position.tile.y)
      * TILE_SIZE_PIXELS
      + TILE_SIZE_PIXELS / 2,
  };
}

export function buildPlayerState(
  worldX: number,
  worldY: number,
  inventory: InventoryModel,
  stats: PlayerStatsModel,
): PlayerState {
  return {
    position: encodePlayerPosition(worldX, worldY),
    stats: stats.toStats(),
    inventory: inventory.toState(),
  };
}
