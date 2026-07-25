import { CHUNK_SIZE_TILES } from '../core/schema';
import type { InventoryModel } from '../inventory/inventory-model';
import type { TeleportWaypoint } from '../npc/teleport-types';
import type { BankSaveState } from '../npc/bank-types';
import type { GearSaveState } from '../player/player-types';
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
  characterId?: string,
  teleportWaypoints?: ReadonlyArray<TeleportWaypoint>,
  gearState?: GearSaveState,
  bankState?: BankSaveState,
): PlayerState {
  return {
    position: encodePlayerPosition(worldX, worldY),
    stats: stats.toStats(),
    inventory: inventory.toState(),
    characterId,
    teleportWaypoints: teleportWaypoints
      ? teleportWaypoints.map((entry) => ({ ...entry }))
      : undefined,
    // gearState는 항상 기록합니다. 생략 후 로드하면 강화 장비가 통째로 비워집니다.
    gearState: {
      gears: (gearState?.gears ?? []).map((gear) => ({
        ...gear,
        options: { ...gear.options },
      })),
      equippedWeaponGearId: gearState?.equippedWeaponGearId ?? null,
      equippedArmorGearId: gearState?.equippedArmorGearId ?? null,
    },
    bankState: bankState
      ? {
          depositedArk: bankState.depositedArk,
          loan: bankState.loan ? { ...bankState.loan } : null,
          loanedTodayArk: bankState.loanedTodayArk,
          loanDay: bankState.loanDay,
          waypoints: bankState.waypoints.map((entry) => ({ ...entry })),
        }
      : undefined,
  };
}
