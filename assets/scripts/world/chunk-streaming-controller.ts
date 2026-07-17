import { _decorator, Component, Node } from 'cc';

import { CHUNK_SIZE_PIXELS } from './chunk-renderer';
import type { RuntimeChunkManager } from './runtime-chunk-manager';
import type { ChunkCoordinate } from './world-types';

const { ccclass } = _decorator;

interface ExGameDebugState {
  loadedChunkCount: number;
  activeChunkKeys: ReadonlyArray<string>;
  centerChunk: ChunkCoordinate;
  deterministicMatch?: boolean;
}

type DebugGlobal = typeof globalThis & {
  __EXGAME_DEBUG__?: ExGameDebugState;
};

@ccclass('ChunkStreamingController')
export class ChunkStreamingController extends Component {
  private player: Node | null = null;
  private manager: RuntimeChunkManager | null = null;
  private lastCenter: ChunkCoordinate | null = null;
  private isSyncing = false;

  configure(player: Node, manager: RuntimeChunkManager): void {
    this.player = player;
    this.manager = manager;
    void this.syncIfNeeded();
  }

  protected update(): void {
    void this.syncIfNeeded();
  }

  private async syncIfNeeded(): Promise<void> {
    if (!this.player || !this.manager || this.isSyncing) return;

    const center = {
      x: Math.floor(this.player.position.x / CHUNK_SIZE_PIXELS),
      y: Math.floor(this.player.position.y / CHUNK_SIZE_PIXELS),
    };
    if (
      this.lastCenter
      && this.lastCenter.x === center.x
      && this.lastCenter.y === center.y
    ) {
      return;
    }

    this.isSyncing = true;
    try {
      await this.manager.syncAround(center);
      this.lastCenter = center;
      const debugGlobal = globalThis as DebugGlobal;
      debugGlobal.__EXGAME_DEBUG__ = {
        ...debugGlobal.__EXGAME_DEBUG__,
        loadedChunkCount: this.manager.getLoadedCount(),
        activeChunkKeys: this.manager.getActiveKeys(),
        centerChunk: center,
      };
    } finally {
      this.isSyncing = false;
    }
  }
}
