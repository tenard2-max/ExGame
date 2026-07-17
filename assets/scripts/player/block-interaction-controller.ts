import { _decorator, Component, Node, Vec2 } from 'cc';

import type { UnifiedInput } from '../input/unified-input';
import {
  getBlockDefinition,
  PLACEABLE_BLOCK_ID,
} from '../world/block-registry';
import { TILE_SIZE_PIXELS } from '../world/chunk-renderer';
import type {
  RuntimeChunkManager,
  WorldTileCoordinate,
} from '../world/runtime-chunk-manager';

const { ccclass } = _decorator;

const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;
/** 플레이어 중심에서 상호작용할 수 있는 최대 거리(px)입니다. */
const INTERACTION_RANGE_PIXELS = TILE_SIZE_PIXELS * 3;

export type InventoryChangeListener = (
  inventory: ReadonlyMap<string, number>,
) => void;

/**
 * 탭(클릭·터치 공통) 한 번을 채굴 또는 설치로 해석합니다.
 * - 단단한 블록: 내구도만큼 타격하면 파괴되고 아이템을 드롭합니다.
 * - 빈 바닥: 보유한 돌이 있으면 설치합니다.
 * 변경은 RuntimeChunkManager를 통해 delta로 기록됩니다.
 */
@ccclass('BlockInteractionController')
export class BlockInteractionController extends Component {
  private readonly tapLocation = new Vec2();
  private readonly inventory = new Map<string, number>();
  private readonly blockDamage = new Map<string, number>();

  private inputSource: UnifiedInput | null = null;
  private playerNode: Node | null = null;
  private cameraNode: Node | null = null;
  private chunkManager: RuntimeChunkManager | null = null;
  private onInventoryChanged: InventoryChangeListener | null = null;
  private isApplyingChange = false;

  configure(
    inputSource: UnifiedInput,
    playerNode: Node,
    cameraNode: Node,
    chunkManager: RuntimeChunkManager,
    onInventoryChanged: InventoryChangeListener,
  ): void {
    this.inputSource = inputSource;
    this.playerNode = playerNode;
    this.cameraNode = cameraNode;
    this.chunkManager = chunkManager;
    this.onInventoryChanged = onInventoryChanged;
    onInventoryChanged(this.inventory);
  }

  getItemCount(itemId: string): number {
    return this.inventory.get(itemId) ?? 0;
  }

  protected update(): void {
    if (
      !this.inputSource
      || !this.playerNode
      || !this.cameraNode
      || !this.chunkManager
      || this.isApplyingChange
    ) {
      return;
    }
    if (!this.inputSource.consumeTap(this.tapLocation)) return;

    const tile = this.toWorldTile(this.tapLocation);
    if (!this.isWithinReach(tile)) return;

    void this.interactWithTile(tile);
  }

  private async interactWithTile(tile: WorldTileCoordinate): Promise<void> {
    const manager = this.chunkManager;
    if (!manager) return;

    const blockId = manager.getEffectiveBlockId(tile);
    if (blockId === null) return;

    const definition = getBlockDefinition(blockId);
    this.isApplyingChange = true;
    try {
      if (definition.hardness !== null) {
        await this.mineBlock(tile, definition.hardness, definition.dropItemId);
      } else if (definition.buildableOn) {
        await this.placeBlock(tile);
      }
    } finally {
      this.isApplyingChange = false;
    }
  }

  private async mineBlock(
    tile: WorldTileCoordinate,
    hardness: number,
    dropItemId: string | null,
  ): Promise<void> {
    const damageKey = `${tile.x},${tile.y}`;
    const damage = (this.blockDamage.get(damageKey) ?? 0) + 1;

    if (damage < hardness) {
      this.blockDamage.set(damageKey, damage);
      return;
    }

    this.blockDamage.delete(damageKey);
    const applied = await this.chunkManager?.applyBlockChange(tile, null);
    if (applied && dropItemId) this.addItem(dropItemId, 1);
  }

  private async placeBlock(tile: WorldTileCoordinate): Promise<void> {
    if (this.getItemCount(PLACEABLE_BLOCK_ID) <= 0) return;
    if (this.isPlayerOnTile(tile)) return;

    const applied = await this.chunkManager?.applyBlockChange(
      tile,
      PLACEABLE_BLOCK_ID,
    );
    if (applied) this.addItem(PLACEABLE_BLOCK_ID, -1);
  }

  private addItem(itemId: string, amount: number): void {
    const next = Math.max(0, (this.inventory.get(itemId) ?? 0) + amount);
    this.inventory.set(itemId, next);
    this.onInventoryChanged?.(this.inventory);
  }

  /** 카메라가 화면 중앙이라는 사실을 이용해 UI 좌표를 월드 타일로 바꿉니다. */
  private toWorldTile(uiLocation: Vec2): WorldTileCoordinate {
    const camera = this.cameraNode!.position;
    const worldX = camera.x + uiLocation.x - DESIGN_WIDTH / 2;
    const worldY = camera.y + uiLocation.y - DESIGN_HEIGHT / 2;
    return {
      x: Math.floor(worldX / TILE_SIZE_PIXELS),
      y: Math.floor(worldY / TILE_SIZE_PIXELS),
    };
  }

  private isWithinReach(tile: WorldTileCoordinate): boolean {
    const player = this.playerNode!.position;
    const tileCenterX = (tile.x + 0.5) * TILE_SIZE_PIXELS;
    const tileCenterY = (tile.y + 0.5) * TILE_SIZE_PIXELS;
    const distanceX = tileCenterX - player.x;
    const distanceY = tileCenterY - player.y;
    return (distanceX * distanceX + distanceY * distanceY)
      <= INTERACTION_RANGE_PIXELS * INTERACTION_RANGE_PIXELS;
  }

  private isPlayerOnTile(tile: WorldTileCoordinate): boolean {
    const player = this.playerNode!.position;
    return Math.floor(player.x / TILE_SIZE_PIXELS) === tile.x
      && Math.floor(player.y / TILE_SIZE_PIXELS) === tile.y;
  }
}
