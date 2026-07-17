import { SAVE_SCHEMA_VERSION } from '../core/schema';
import type { ChunkDeltaStore } from '../world/runtime-chunk-manager';
import type { ChunkCoordinate, WorldSeed } from '../world/world-types';
import type { ChunkDelta } from './save-types';

/**
 * 청크 변경분(delta)만 localStorage에 보관합니다.
 * 원본 지형은 저장하지 않고 항상 Seed로 재계산합니다.
 * 9단계에서 IndexedDB 세이브 슬롯으로 이전할 임시 저장소입니다.
 */
export class LocalStorageChunkDeltaStore implements ChunkDeltaStore {
  constructor(private readonly worldSeed: WorldSeed) {}

  async load(coordinate: ChunkCoordinate): Promise<ChunkDelta | null> {
    const raw = localStorage.getItem(this.createKey(coordinate));
    if (!raw) return null;

    try {
      return JSON.parse(raw) as ChunkDelta;
    } catch {
      // 손상된 항목은 무시하고 Seed 원본으로 되돌립니다.
      localStorage.removeItem(this.createKey(coordinate));
      return null;
    }
  }

  async save(delta: ChunkDelta): Promise<void> {
    const key = this.createKey(delta.coordinate);
    const isEmpty = delta.blocks.length === 0
      && delta.removedGeneratedEntityIds.length === 0
      && delta.placedEntities.length === 0;

    if (isEmpty) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify(delta));
  }

  private createKey(coordinate: ChunkCoordinate): string {
    return `exgame:v${SAVE_SCHEMA_VERSION}:delta:${this.worldSeed}:`
      + `${coordinate.x},${coordinate.y}`;
  }
}
