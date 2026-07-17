import type { PlayerState } from '../player/player-types';
import type { ChunkCoordinate, WorldSeed } from '../world/world-types';
import type {
  ChunkDelta,
  SaveGame,
  SaveSlotId,
  SaveSlotSummary,
} from './save-types';

export interface CreateSaveSlotInput {
  readonly slotId: SaveSlotId;
  readonly worldSeed: WorldSeed;
  readonly initialPlayer: PlayerState;
}

/**
 * IndexedDB 등 구체 저장 기술과 게임 도메인을 분리하는 계약입니다.
 * 구현은 생성된 원본 청크를 저장해서는 안 됩니다.
 */
export interface SaveManager {
  createSlot(input: CreateSaveSlotInput): Promise<SaveGame>;
  listSlots(): Promise<ReadonlyArray<SaveSlotSummary>>;
  loadSlot(slotId: SaveSlotId): Promise<SaveGame | null>;
  savePlayer(slotId: SaveSlotId, player: PlayerState): Promise<void>;
  loadChunkDelta(
    slotId: SaveSlotId,
    coordinate: ChunkCoordinate,
  ): Promise<ChunkDelta | null>;
  saveChunkDelta(slotId: SaveSlotId, delta: ChunkDelta): Promise<void>;
  flush(): Promise<void>;
}

export interface SaveMigration {
  readonly fromVersion: number;
  readonly toVersion: number;
  migrate(payload: unknown): unknown;
}

/**
 * 저장 데이터를 현재 SaveGame으로 올립니다.
 * 버전이 연속되지 않거나 검증에 실패하면 명시적으로 오류를 반환해야 합니다.
 */
export interface SaveMigrationRegistry {
  register(migration: SaveMigration): void;
  migrateToCurrent(payload: unknown): SaveGame;
}
