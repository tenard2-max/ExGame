import type { InventoryState } from '../inventory/item-types';
import type { ChunkCoordinate, TileCoordinate } from '../world/world-types';

export interface PlayerPosition {
  readonly chunk: ChunkCoordinate;
  readonly tile: TileCoordinate;
}

export interface PlayerStats {
  readonly level: number;
  readonly experience: number;
  readonly health: number;
  readonly maxHealth: number;
}

export interface PlayerState {
  readonly position: PlayerPosition;
  readonly stats: PlayerStats;
  readonly inventory: InventoryState;
}
