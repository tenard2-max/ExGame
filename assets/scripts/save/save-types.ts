import type { SaveSchemaVersion } from '../core/schema';
import type { GeneratedContent } from '../content/content-types';
import type { PlayerState } from '../player/player-types';
import type {
  BlockId,
  ChunkCoordinate,
  ChunkKey,
  EntityId,
  TileCoordinate,
  WorldSeed,
} from '../world/world-types';

export type SaveSlotId = string;

export interface BlockDelta {
  readonly coordinate: TileCoordinate;
  /** null이면 Seed로 생성된 원본 블록을 제거한 상태입니다. */
  readonly blockId: BlockId | null;
}

/**
 * 원본 청크 전체가 아니라 플레이어가 바꾼 부분만 보관합니다.
 * revision은 같은 청크를 여러 번 저장할 때 충돌을 감지하는 값입니다.
 */
export interface ChunkDelta {
  readonly coordinate: ChunkCoordinate;
  readonly revision: number;
  readonly blocks: ReadonlyArray<BlockDelta>;
  readonly removedGeneratedEntityIds: ReadonlyArray<EntityId>;
  readonly placedEntities: ReadonlyArray<GeneratedContent>;
}

export interface WorldSaveState {
  readonly seed: WorldSeed;
}

export interface SaveMetadata {
  readonly slotId: SaveSlotId;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
}

export interface SaveGame {
  readonly schemaVersion: SaveSchemaVersion;
  readonly metadata: SaveMetadata;
  readonly world: WorldSaveState;
  readonly player: PlayerState;
  /**
   * 미방문·미변경 청크는 존재하지 않습니다.
   * 키 형식은 `${chunkX},${chunkY}`입니다.
   */
  readonly chunkDeltas: Readonly<Partial<Record<ChunkKey, ChunkDelta>>>;
}

export interface SaveSlotSummary {
  readonly slotId: SaveSlotId;
  readonly updatedAtIso: string;
  readonly worldSeed: WorldSeed;
  readonly playerLevel: number;
}
