import type { InventoryState } from '../inventory/item-types';
import type { TeleportWaypoint } from '../npc/teleport-types';
import type { BankSaveState } from '../npc/bank-types';
import type { GearInstance } from '../npc/gear-instance-store';
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

export interface GearSaveState {
  readonly gears: ReadonlyArray<GearInstance>;
  readonly equippedWeaponGearId: string | null;
  readonly equippedArmorGearId: string | null;
}

export interface PlayerState {
  readonly position: PlayerPosition;
  readonly stats: PlayerStats;
  readonly inventory: InventoryState;
  /** 선택한 플레이어 캐릭터. 없으면 기본 캐릭터. */
  readonly characterId?: string;
  /** 텔레포터에 저장한 위치 목록(최대 99). */
  readonly teleportWaypoints?: ReadonlyArray<TeleportWaypoint>;
  /** 대장장이 제작·강화 장비 인스턴스. */
  readonly gearState?: GearSaveState;
  /** 은행 예금·대출·은행 위치 저장. */
  readonly bankState?: BankSaveState;
}
