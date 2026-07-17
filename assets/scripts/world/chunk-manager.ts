import type { ChunkDelta } from '../save/save-types';
import type {
  ChunkCoordinate,
  ChunkKey,
  GeneratedChunk,
} from './world-types';

export interface LoadedChunk {
  readonly base: GeneratedChunk;
  readonly delta: ChunkDelta | null;
}

export interface ChunkTransition {
  readonly loaded: ReadonlyArray<ChunkKey>;
  readonly unloaded: ReadonlyArray<ChunkKey>;
  readonly active: ReadonlyArray<ChunkKey>;
}

/**
 * 플레이어 중심 3×3 청크만 관리하는 온디맨드 계약입니다.
 *
 * 구현 불변식:
 * - 접근하지 않은 청크는 생성하지 않습니다.
 * - 활성 청크는 항상 9개 이하입니다.
 * - 청크를 메모리에서 제거하기 전에 변경분 저장을 완료합니다.
 */
export interface ChunkManager {
  syncAround(center: ChunkCoordinate): Promise<ChunkTransition>;
  getLoadedChunk(coordinate: ChunkCoordinate): LoadedChunk | null;
  flushAndUnloadAll(): Promise<void>;
}
