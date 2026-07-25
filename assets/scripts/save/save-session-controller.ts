import { _decorator, Component, Node } from 'cc';

import type { InventoryModel } from '../inventory/inventory-model';
import {
  DEFAULT_CHARACTER_ID,
  getCharacterDefinition,
  type CharacterId,
} from '../player/character-registry';
import type { PlayerStatsModel } from '../player/player-stats-model';
import type { TeleportWaypointStore } from '../npc/teleport-waypoint-store';
import type { GearInstanceStore } from '../npc/gear-instance-store';
import type { BankAccountStore } from '../npc/bank-account-store';
import type { DomCharacterSelectUi } from '../ui/dom-character-select-ui';
import { CHUNK_SIZE_PIXELS } from '../world/chunk-renderer';
import type { RuntimeChunkManager } from '../world/runtime-chunk-manager';
import type { IndexedDbSaveManager } from './indexed-db-save-manager';
import {
  buildPlayerState,
  decodePlayerPosition,
} from './player-state-codec';
import {
  FIXED_SAVE_SLOT_IDS,
  formatSaveUpdatedAt,
  getSaveSlotDisplayName,
  type SaveSlotListRow,
} from './save-slots';
import type { SlotChunkDeltaStore } from './slot-chunk-delta-store';
import type { SaveSlotId } from './save-types';

const { ccclass } = _decorator;

const AUTO_SAVE_INTERVAL_SECONDS = 20;
const NEW_GAME_SPAWN_X = 256;
const NEW_GAME_SPAWN_Y = 256;

export type SaveMessageSink = (message: string) => void;
export type ApplyCharacterHandler = (characterId: CharacterId) => Promise<void>;

/**
 * 수동 저장·자동 저장·불러오기·import/export를 한곳에서 처리합니다.
 * 청크 delta는 변경 직후와 언로드 시 SlotChunkDeltaStore가 저장하고,
 * 이 컨트롤러는 플레이어 상태와 전체 스냅샷을 담당합니다.
 */
@ccclass('SaveSessionController')
export class SaveSessionController extends Component {
  private saveManager: IndexedDbSaveManager | null = null;
  private deltaStore: SlotChunkDeltaStore | null = null;
  private slotId: SaveSlotId = 'slot-1';
  private playerNode: Node | null = null;
  private chunkManager: RuntimeChunkManager | null = null;
  private inventory: InventoryModel | null = null;
  private playerStats: PlayerStatsModel | null = null;
  private showMessage: SaveMessageSink = () => {};
  private autoSaveElapsed = 0;
  private isBusy = false;
  private openLoadMenuHandler: (() => void) | null = null;
  private openSaveMenuHandler: (() => void) | null = null;
  private characterSelectUi: DomCharacterSelectUi | null = null;
  private applyCharacterHandler: ApplyCharacterHandler | null = null;
  private characterId: CharacterId = DEFAULT_CHARACTER_ID;
  private teleportWaypoints: TeleportWaypointStore | null = null;
  private gears: GearInstanceStore | null = null;
  private bankAccount: BankAccountStore | null = null;

  configure(options: {
    readonly saveManager: IndexedDbSaveManager;
    readonly deltaStore: SlotChunkDeltaStore;
    readonly slotId: SaveSlotId;
    readonly playerNode: Node;
    readonly chunkManager: RuntimeChunkManager;
    readonly inventory: InventoryModel;
    readonly playerStats: PlayerStatsModel;
    readonly showMessage: SaveMessageSink;
    readonly characterSelectUi: DomCharacterSelectUi;
    readonly applyCharacter: ApplyCharacterHandler;
    readonly initialCharacterId?: CharacterId;
    readonly teleportWaypoints?: TeleportWaypointStore;
    readonly gears?: GearInstanceStore;
    readonly bankAccount?: BankAccountStore;
  }): void {
    this.saveManager = options.saveManager;
    this.deltaStore = options.deltaStore;
    this.slotId = options.slotId;
    this.playerNode = options.playerNode;
    this.chunkManager = options.chunkManager;
    this.inventory = options.inventory;
    this.playerStats = options.playerStats;
    this.showMessage = options.showMessage;
    this.characterSelectUi = options.characterSelectUi;
    this.applyCharacterHandler = options.applyCharacter;
    this.characterId = getCharacterDefinition(options.initialCharacterId).id;
    this.teleportWaypoints = options.teleportWaypoints ?? null;
    this.gears = options.gears ?? null;
    this.bankAccount = options.bankAccount ?? null;
  }

  /** LoadMenuHud가 등록하는 열기 콜백입니다. */
  setOpenLoadMenuHandler(handler: () => void): void {
    this.openLoadMenuHandler = handler;
  }

  /** 저장 슬롯 선택 UI 열기 콜백입니다. */
  setOpenSaveMenuHandler(handler: () => void): void {
    this.openSaveMenuHandler = handler;
  }

  getActiveSlotId(): SaveSlotId {
    return this.slotId;
  }

  getCharacterId(): CharacterId {
    return this.characterId;
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

  /** 불러오기 목록 UI를 엽니다. */
  openLoadMenu(): void {
    this.openLoadMenuHandler?.();
  }

  /** 저장할 슬롯 선택 UI를 엽니다. */
  openSaveMenu(): void {
    this.openSaveMenuHandler?.();
  }

  async listSlotRows(): Promise<ReadonlyArray<SaveSlotListRow>> {
    if (!this.saveManager) return [];
    const summaries = await this.saveManager.listSlots();
    const byId = new Map(summaries.map((entry) => [entry.slotId, entry]));
    return FIXED_SAVE_SLOT_IDS.map((slotId) => ({
      slotId,
      displayName: getSaveSlotDisplayName(slotId),
      summary: byId.get(slotId) ?? null,
      isActive: slotId === this.slotId,
    }));
  }

  async saveNow(showFeedback = true): Promise<void> {
    if (!this.canOperate() || this.isBusy) return;
    this.isBusy = true;
    try {
      await this.persistActivePlayer(showFeedback);
    } catch (error) {
      this.showMessage(`저장 실패: ${formatError(error)}`);
    } finally {
      this.isBusy = false;
    }
  }

  private buildCurrentPlayerState() {
    const player = this.playerNode!;
    return buildPlayerState(
      player.position.x,
      player.position.y,
      this.inventory!,
      this.playerStats!,
      this.characterId,
      this.teleportWaypoints?.toState(),
      this.gears?.toState(),
      this.bankAccount?.toState(),
    );
  }

  private loadTeleportWaypoints(
    entries: ReadonlyArray<{
      readonly id: string;
      readonly name: string;
      readonly worldTileX: number;
      readonly worldTileY: number;
    }> | undefined,
  ): void {
    this.teleportWaypoints?.loadFromState(entries);
  }

  private loadGearState(
    state: {
      readonly gears?: ReadonlyArray<{
        readonly id: string;
        readonly itemId: string;
        readonly upgradeLevel: number;
        readonly bonusAttack: number;
        readonly bonusDefense: number;
        readonly options: Record<string, unknown>;
      }>;
      readonly equippedWeaponGearId?: string | null;
      readonly equippedArmorGearId?: string | null;
    } | undefined,
  ): void {
    this.gears?.loadFromState(state as never);
  }

  private loadBankState(
    state: Parameters<BankAccountStore['loadFromState']>[0],
  ): void {
    this.bankAccount?.loadFromState(state);
  }

  private async persistActivePlayer(showFeedback: boolean): Promise<void> {
    await this.ensureActiveSlotExists();
    await this.saveManager!.savePlayer(
      this.slotId,
      this.buildCurrentPlayerState(),
    );
    if (showFeedback) {
      this.showMessage(
        `저장 완료 (${getSaveSlotDisplayName(this.slotId)} · 레벨 ${this.playerStats!.getLevel()})`,
      );
    }
  }

  /** 지정 슬롯에 현재 진행을 저장하고 활성 슬롯을 바꿉니다. */
  async saveToSlot(slotId: SaveSlotId, showFeedback = true): Promise<void> {
    if (!this.canOperate() || this.isBusy) return;
    this.isBusy = true;
    try {
      await this.chunkManager!.flushAndUnloadAll();
      this.setActiveSlot(slotId);
      await this.ensureActiveSlotExists();
      await this.saveManager!.savePlayer(
        slotId,
        this.buildCurrentPlayerState(),
      );
      await this.resyncChunksAroundPlayer();
      if (showFeedback) {
        this.showMessage(
          `${getSaveSlotDisplayName(slotId)}에 저장했습니다 (레벨 ${this.playerStats!.getLevel()})`,
        );
      }
    } catch (error) {
      this.showMessage(`저장 실패: ${formatError(error)}`);
    } finally {
      this.isBusy = false;
    }
  }

  async loadSlotById(slotId: SaveSlotId): Promise<void> {
    if (!this.canOperate() || this.isBusy) return;
    this.isBusy = true;
    try {
      const saveGame = await this.saveManager!.loadSlot(slotId);
      if (!saveGame) {
        this.showMessage(`${getSaveSlotDisplayName(slotId)}은(는) 비어 있습니다`);
        return;
      }

      await this.chunkManager!.flushAndUnloadAll();
      this.setActiveSlot(slotId);
      this.chunkManager!.setWorldSeed(saveGame.world.seed);
      this.inventory!.loadFromState(saveGame.player.inventory);
      this.playerStats!.loadFromStats(saveGame.player.stats);
      this.loadTeleportWaypoints(saveGame.player.teleportWaypoints);
      this.loadGearState(saveGame.player.gearState);
      this.loadBankState(saveGame.player.bankState);
      await this.applyCharacterFromSave(saveGame.player.characterId);
      const world = decodePlayerPosition(saveGame.player.position);
      this.playerNode!.setPosition(world.x, world.y);
      await this.resyncChunksAroundPlayer();
      this.showMessage(
        `${getSaveSlotDisplayName(slotId)} 불러오기 완료 (레벨 ${this.playerStats!.getLevel()})`,
      );
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
      const level = this.playerStats!.getLevel();
      const suggested = `exgame-${this.slotId}-lv${level}.json`;
      const prompted = globalThis.prompt?.(
        '내보낼 파일 이름을 입력하세요.',
        suggested,
      );
      if (prompted === null) {
        this.showMessage('내보내기를 취소했습니다');
        return;
      }
      const filename = sanitizeExportFilename(prompted, suggested);
      downloadTextFile(filename, json);
      this.showMessage(`세이브 파일을 내보냈습니다 (${filename})`);
    } catch (error) {
      this.showMessage(`내보내기 실패: ${formatError(error)}`);
    } finally {
      this.isBusy = false;
    }
  }

  async importNow(): Promise<void> {
    if (!this.canOperate() || this.isBusy) return;
    const picked = await pickSaveJsonFile();
    if (!picked) {
      this.showMessage('원본 세이브 파일 선택을 취소했습니다');
      return;
    }

    this.isBusy = true;
    try {
      const saveGame = await this.saveManager!.importSlot(this.slotId, picked.text);
      await this.chunkManager!.flushAndUnloadAll();
      this.chunkManager!.setWorldSeed(saveGame.world.seed);
      this.inventory!.loadFromState(saveGame.player.inventory);
      this.playerStats!.loadFromStats(saveGame.player.stats);
      this.loadTeleportWaypoints(saveGame.player.teleportWaypoints);
      this.loadGearState(saveGame.player.gearState);
      this.loadBankState(saveGame.player.bankState);
      await this.applyCharacterFromSave(saveGame.player.characterId);
      const world = decodePlayerPosition(saveGame.player.position);
      this.playerNode!.setPosition(world.x, world.y);
      await this.resyncChunksAroundPlayer();
      this.showMessage(
        `원본 세이브 로드 완료 (${picked.fileName} · 레벨 ${this.playerStats!.getLevel()})`,
      );
    } catch (error) {
      this.showMessage(`원본 세이브 로드 실패: ${formatError(error)}`);
    } finally {
      this.isBusy = false;
    }
  }

  /** 월드·진행을 초기화하기 전 캐릭터 선택 UI를 엽니다. */
  async startNewGame(): Promise<void> {
    if (!this.canOperate()) return;
    if (!this.characterSelectUi) {
      this.showMessage('캐릭터 선택 UI가 없습니다');
      return;
    }
    if (this.characterSelectUi.isOpen()) return;

    // 자동저장(isBusy) 중에도 선택 창은 연다. 확정 시점에 대기한다.
    this.characterSelectUi.open({
      initialId: this.characterId,
      onConfirm: async (characterId) => {
        await this.confirmNewGame(characterId);
      },
    });
  }

  /** 캐릭터 확정 후 실제 새로 시작을 수행합니다. */
  async confirmNewGame(characterId: CharacterId): Promise<void> {
    if (!this.canOperate()) return;

    // 진행 중인 저장이 끝날 때까지 잠시 기다린다.
    for (let attempt = 0; attempt < 40 && this.isBusy; attempt += 1) {
      await waitMs(50);
    }
    if (this.isBusy) {
      this.showMessage('저장 중입니다. 잠시 후 다시 새로 시작해 주세요.');
      return;
    }

    this.isBusy = true;
    try {
      await this.chunkManager!.flushAndUnloadAll();
      const worldSeed = createNewWorldSeed();
      this.chunkManager!.setWorldSeed(worldSeed);
      this.inventory!.resetForNewGame(100);
      this.playerStats!.resetForNewGame();
      this.teleportWaypoints?.clear();
      this.gears?.clear();
      this.bankAccount?.clear();
      // 레벨 1을 보장한다 (이전 세이브 값이 남지 않도록).
      if (this.playerStats!.getLevel() !== 1 || this.playerStats!.getExperience() !== 0) {
        this.playerStats!.resetForNewGame();
      }
      this.playerNode!.setPosition(NEW_GAME_SPAWN_X, NEW_GAME_SPAWN_Y);
      await this.applyCharacterFromSave(characterId);

      const initialPlayer = buildPlayerState(
        NEW_GAME_SPAWN_X,
        NEW_GAME_SPAWN_Y,
        this.inventory!,
        this.playerStats!,
        this.characterId,
        [],
        { gears: [], equippedWeaponGearId: null, equippedArmorGearId: null },
        this.bankAccount?.toState(),
      );
      if (initialPlayer.stats.level !== 1) {
        throw new Error(`새로 시작 레벨이 1이 아닙니다: ${initialPlayer.stats.level}`);
      }

      await this.saveManager!.resetSlotProgress({
        slotId: this.slotId,
        worldSeed,
        initialPlayer,
      });
      await this.resyncChunksAroundPlayer();

      // UI·상태가 확실히 레벨 1을 가리키도록 한 번 더 맞춘다.
      this.playerStats!.resetForNewGame();
      await this.persistActivePlayer(false);

      const name = getCharacterDefinition(this.characterId).displayName;
      this.showMessage(`새로 시작 · ${name} · 레벨 ${this.playerStats!.getLevel()}`);
    } catch (error) {
      this.showMessage(`새로 시작 실패: ${formatError(error)}`);
    } finally {
      this.isBusy = false;
    }
  }

  private async applyCharacterFromSave(
    characterId: string | null | undefined,
  ): Promise<void> {
    const resolved = getCharacterDefinition(characterId).id;
    this.characterId = resolved;
    if (this.applyCharacterHandler) {
      await this.applyCharacterHandler(resolved);
    }
  }

  private setActiveSlot(slotId: SaveSlotId): void {
    this.slotId = slotId;
    this.deltaStore?.setSlotId(slotId);
  }

  private async ensureActiveSlotExists(): Promise<void> {
    const existing = await this.saveManager!.loadSlot(this.slotId);
    if (existing) return;
    await this.saveManager!.createSlot({
      slotId: this.slotId,
      worldSeed: this.chunkManager!.getWorldSeed(),
      initialPlayer: this.buildCurrentPlayerState(),
    });
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
      && this.deltaStore
      && this.playerNode
      && this.chunkManager
      && this.inventory
      && this.playerStats,
    );
  }

  private readonly handleBeforeUnload = (): void => {
    void this.saveNow(false);
  };
}

export function describeSlotRow(row: SaveSlotListRow): string {
  if (!row.summary) {
    return `${row.displayName}  ·  빈 슬롯`;
  }
  const active = row.isActive ? '  ·  사용중' : '';
  return `${row.displayName}  ·  레벨 ${row.summary.playerLevel}`
    + `  ·  ${formatSaveUpdatedAt(row.summary.updatedAtIso)}${active}`;
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

function sanitizeExportFilename(raw: string, fallback: string): string {
  const trimmed = raw.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
  const base = trimmed.length > 0 ? trimmed : fallback;
  return /\.json$/i.test(base) ? base : `${base}.json`;
}

function createNewWorldSeed(): string {
  const randomPart = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0');
  return `${Date.now().toString(36)}-${randomPart}`;
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

/** 원본 세이브 JSON 파일을 파일 선택 대화상자로 고릅니다. */
function pickSaveJsonFile(): Promise<{ text: string; fileName: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json,text/json';
    input.style.display = 'none';

    let settled = false;
    const finish = (value: { text: string; fileName: string } | null): void => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        finish(null);
        return;
      }
      void file.text()
        .then((text) => finish({ text, fileName: file.name }))
        .catch(() => finish(null));
    });
    input.addEventListener('cancel', () => finish(null));

    document.body.appendChild(input);
    input.click();

    // 일부 브라우저는 취소 시 change/cancel이 안 올 수 있어 포커스 복귀로 보완합니다.
    const onFocus = (): void => {
      globalThis.setTimeout(() => {
        if (!settled && (!input.files || input.files.length === 0)) {
          finish(null);
        }
      }, 400);
      window.removeEventListener('focus', onFocus);
    };
    window.addEventListener('focus', onFocus);
  });
}
