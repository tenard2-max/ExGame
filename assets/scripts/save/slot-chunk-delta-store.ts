import type {
  ChunkDeltaStore,
} from '../world/runtime-chunk-manager';
import type { ChunkCoordinate } from '../world/world-types';
import type { SaveManager } from './save-manager';
import type { ChunkDelta, SaveSlotId } from './save-types';

/** SaveManager의 청크 delta API를 ChunkDeltaStore 계약에 맞춥니다. */
export class SlotChunkDeltaStore implements ChunkDeltaStore {
  constructor(
    private readonly saveManager: SaveManager,
    private readonly slotId: SaveSlotId,
  ) {}

  load(coordinate: ChunkCoordinate): Promise<ChunkDelta | null> {
    return this.saveManager.loadChunkDelta(this.slotId, coordinate);
  }

  save(delta: ChunkDelta): Promise<void> {
    return this.saveManager.saveChunkDelta(this.slotId, delta);
  }
}
