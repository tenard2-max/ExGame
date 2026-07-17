import { _decorator, Component, Node, Vec2 } from 'cc';

import type { UnifiedInput } from '../input/unified-input';
import type { InventoryModel } from '../inventory/inventory-model';
import {
  getItemDefinition,
  getOreDefinition,
} from '../inventory/item-registry';
import { getBlockDefinition } from '../world/block-registry';
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

/**
 * 탭(클릭·터치 공통) 한 번을 채굴 또는 설치로 해석합니다.
 * 우선순위: 광맥 채굴 → 블록 채굴 → 선택한 아이템 설치.
 * 모든 변경은 RuntimeChunkManager를 통해 delta로 기록됩니다.
 */
@ccclass('BlockInteractionController')
export class BlockInteractionController extends Component {
  private readonly tapLocation = new Vec2();
  private readonly damageByTarget = new Map<string, number>();

  private inputSource: UnifiedInput | null = null;
  private playerNode: Node | null = null;
  private cameraNode: Node | null = null;
  private chunkManager: RuntimeChunkManager | null = null;
  private inventory: InventoryModel | null = null;
  private isApplyingChange = false;

  configure(
    inputSource: UnifiedInput,
    playerNode: Node,
    cameraNode: Node,
    chunkManager: RuntimeChunkManager,
    inventory: InventoryModel,
  ): void {
    this.inputSource = inputSource;
    this.playerNode = playerNode;
    this.cameraNode = cameraNode;
    this.chunkManager = chunkManager;
    this.inventory = inventory;
  }

  protected update(): void {
    if (
      !this.inputSource
      || !this.playerNode
      || !this.cameraNode
      || !this.chunkManager
      || !this.inventory
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

    this.isApplyingChange = true;
    try {
      if (await this.tryMineOre(tile)) return;

      const blockId = manager.getEffectiveBlockId(tile);
      if (blockId === null) return;

      const definition = getBlockDefinition(blockId);
      if (definition.hardness !== null) {
        await this.mineBlock(tile, definition.hardness, definition.dropItemId);
      } else if (definition.buildableOn) {
        await this.placeSelectedItem(tile);
      }
    } finally {
      this.isApplyingChange = false;
    }
  }

  /** 타일 위 광맥을 우선 채굴합니다. 광맥이 없으면 false입니다. */
  private async tryMineOre(tile: WorldTileCoordinate): Promise<boolean> {
    const entities = this.chunkManager!.getContentEntitiesAt(tile);
    const ore = entities
      .map((entity) => ({ entity, ore: getOreDefinition(entity.typeId) }))
      .find((candidate) => candidate.ore !== null);
    if (!ore || !ore.ore) return false;

    const damageKey = `entity:${ore.entity.id}`;
    const damage = (this.damageByTarget.get(damageKey) ?? 0) + 1;
    if (damage < ore.ore.hardness) {
      this.damageByTarget.set(damageKey, damage);
      return true;
    }

    this.damageByTarget.delete(damageKey);
    const applied = await this.chunkManager!.applyEntityRemoval(
      tile,
      ore.entity.id,
    );
    if (applied) this.inventory!.add(ore.ore.dropItemId, 1);
    return true;
  }

  private async mineBlock(
    tile: WorldTileCoordinate,
    hardness: number,
    dropItemId: string | null,
  ): Promise<void> {
    const damageKey = `block:${tile.x},${tile.y}`;
    const damage = (this.damageByTarget.get(damageKey) ?? 0) + 1;

    if (damage < hardness) {
      this.damageByTarget.set(damageKey, damage);
      return;
    }

    this.damageByTarget.delete(damageKey);
    const applied = await this.chunkManager?.applyBlockChange(tile, null);
    if (applied && dropItemId) this.inventory!.add(dropItemId, 1);
  }

  /** 핫바에서 선택된 아이템이 설치 가능할 때만 설치합니다. */
  private async placeSelectedItem(tile: WorldTileCoordinate): Promise<void> {
    const inventory = this.inventory!;
    const itemId = inventory.getSelectedItemId();
    if (!itemId) return;

    const blockId = getItemDefinition(itemId).placeableBlockId;
    if (!blockId) return;
    if (inventory.getQuantity(itemId) <= 0) return;
    if (this.isPlayerOnTile(tile)) return;

    const applied = await this.chunkManager?.applyBlockChange(tile, blockId);
    if (applied) inventory.remove(itemId, 1);
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
