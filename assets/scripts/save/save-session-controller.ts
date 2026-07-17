import { _decorator, Component, Node } from 'cc';

import type { InventoryModel } from '../inventory/inventory-model';
import type { PlayerStatsModel } from '../player/player-stats-model';
import { CHUNK_SIZE_PIXELS } from '../world/chunk-renderer';
import type { RuntimeChunkManager } from '../world/runtime-chunk-manager';
import type { IndexedDbSaveManager } from './indexed-db-save-manager';
import {
  buildPlayerState,
  decodePlayerPosition,
} from './player-state-codec';
import type { SaveSlotId } from './save-types';

const { ccclass } = _decorator;

const AUTO_SAVE_INTERVAL_SECONDS = 20;

export type SaveMessageSink = (message: string) => void;

/**
 * 수동 저장·자동 저장·불러오기·import/export를 한곳에서 처리합니다.
 * 청크 delta는 변경 직후와 언로드 시 SlotChunkDeltaStore가 저장하고,
 * 이 컨트롤러는 플레이어 상태와 전체 스냅샷을 담당합니다.
 */
@ccclass('SaveSessionController')
export class SaveSessionController extends Component {
  private saveManager: IndexedDbSaveManager | null = null;
  private slotId: SaveSlotId = 'slot-1';
  private playerNode: Node | null = null;
  private chunkManager: RuntimeChunkManager | null = null;
  private inventory: InventoryModel | null = null;
  private playerStats: PlayerStatsModel | null = null;
  private showMessage: SaveMessageSink = () => {};
  private autoSaveElapsed = 0;
  private isBusy = false;

  configure(options: {
    readonly saveManager: IndexedDbSaveManager;
    readonly slotId: SaveSlotId;
    readonly playerNode: Node;
    readonly chunkManager: RuntimeChunkManager;
    readonly inventory: InventoryModel;
    readonly playerStats: PlayerStatsModel;
    readonly showMessage: SaveMessageSink;
  }): void {
    this.saveManager = options.saveManager;
    this.slotId = options.slotId;
    this.playerNode = options.playerNode;
    this.chunkManager = options.chunkManager;
    this.inventory = options.inventory;
    this.playerStats = options.playerStats;
    this.showMessage = options.showMessage;
  }

  protected update(deltaTime: number): void {
    this.autoSaveElapsed += deltaTime;
    if (this.autoSaveElapsed < AUTO_SAVE_INTERVAL_SECONDS) return;
    this.autoSaveElapsed = 0;
    void this.saveNow(false);
  }

  protected onEnable(): void {
    globalThis.addEventListener('beforeunload', this.handleBeforeUnload);
  }

  protected onDisable(): void {
    globalThis.removeEventListener('beforeunload', this.handleBeforeUnload);
  }

  async saveNow(showFeedback = true): Promise<void> {
    if (!this.canOperate() || this.isBusy) return;
    this.isBusy = true;
    try {
      const player = this.playerNode!;
      await this.saveManager!.savePlayer(
        this.slotId,
        buildPlayerState(
          player.position.x,
          player.position.y,
          this.inventory!,
          this.playerStats!,
        ),
      );
      if (showFeedback) this.showMessage('저장 완료');
    } catch (error) {
      this.showMessage(`저장 실패: ${formatError(error)}`);
    } finally {
      this.isBusy = false;
    }
  }

  async loadNow(): Promise<void> {
    if (!this.canOperate() || this.isBusy) return;
    this.isBusy = true;
    try {
      const saveGame = await this.saveManager!.loadSlot(this.slotId);
      if (!saveGame) {
        this.showMessage('불러올 세이브가 없습니다');
        return;
      }

      await this.chunkManager!.flushAndUnloadAll();
      this.inventory!.loadFromState(saveGame.player.inventory);
      this.playerStats!.loadFromStats(saveGame.player.stats);
      const world = decodePlayerPosition(saveGame.player.position);
      this.playerNode!.setPosition(world.x, world.y);
      await this.resyncChunksAroundPlayer();
      this.showMessage('불러오기 완료');
    } catch (error) {
      this.showMessage(`불러오기 실패: ${formatError(error)}`);
    } finally {
      this.isBusy = false;
    }
  }

  async exportNow(): Promise<void> {
    if (!this.canOperate() || this.isBusy) return;
    this.isBusy = true;
    try {
      await this.saveNow(false);
      const json = await this.saveManager!.exportSlot(this.slotId);
      downloadTextFile(`exgame-${this.slotId}.json`, json);
      this.showMessage('세이브 파일을 내보냈습니다');
    } catch (error) {
      this.showMessage(`내보내기 실패: ${formatError(error)}`);
    } finally {
      this.isBusy = false;
    }
  }

  async importNow(): Promise<void> {
    if (!this.canOperate() || this.isBusy) return;
    const json = globalThis.prompt?.(
      '가져올 세이브 JSON을 붙여넣으세요.',
      '',
    );
    if (!json) return;

    this.isBusy = true;
    try {
      const saveGame = await this.saveManager!.importSlot(this.slotId, json);
      await this.chunkManager!.flushAndUnloadAll();
      this.inventory!.loadFromState(saveGame.player.inventory);
      this.playerStats!.loadFromStats(saveGame.player.stats);
      const world = decodePlayerPosition(saveGame.player.position);
      this.playerNode!.setPosition(world.x, world.y);
      await this.resyncChunksAroundPlayer();
      this.showMessage('가져오기 완료');
    } catch (error) {
      this.showMessage(`가져오기 실패: ${formatError(error)}`);
    } finally {
      this.isBusy = false;
    }
  }

  private async resyncChunksAroundPlayer(): Promise<void> {
    const player = this.playerNode!;
    await this.chunkManager!.syncAround({
      x: Math.floor(player.position.x / CHUNK_SIZE_PIXELS),
      y: Math.floor(player.position.y / CHUNK_SIZE_PIXELS),
    });
  }

  private canOperate(): boolean {
    return Boolean(
      this.saveManager
      && this.playerNode
      && this.chunkManager
      && this.inventory
      && this.playerStats,
    );
  }

  private readonly handleBeforeUnload = (): void => {
    // beforeunload에서는 비동기 완료를 보장할 수 없어 최선의 시도를 합니다.
    void this.saveNow(false);
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function downloadTextFile(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
