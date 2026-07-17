import { _decorator, Component, Node, Vec2 } from 'cc';

import {
  DUNGEON_REWARD,
  getMonsterDefinition,
  rollTreasureLoot,
  selectNpcDialogue,
} from '../content/content-registry';
import type { GeneratedContent } from '../content/content-types';
import type { UnifiedInput } from '../input/unified-input';
import type { InventoryModel } from '../inventory/inventory-model';
import {
  getItemDefinition,
  getOreDefinition,
} from '../inventory/item-registry';
import { getBlockDefinition } from '../world/block-registry';
import { TILE_SIZE_PIXELS } from '../world/chunk-renderer';
import { sampleDeterministicUnit } from '../world/deterministic-random';
import type {
  RuntimeChunkManager,
  WorldTileCoordinate,
} from '../world/runtime-chunk-manager';
import type { WorldSeed } from '../world/world-types';
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  isUiLocationOverHud,
} from '../ui/hud-layout';
import type { PlayerStatsModel } from './player-stats-model';

const { ccclass } = _decorator;
/** 플레이어 중심에서 상호작용할 수 있는 최대 거리(px)입니다. */
const INTERACTION_RANGE_PIXELS = TILE_SIZE_PIXELS * 3;

export type HudMessageSink = (message: string) => void;
export type PlayerRespawnHandler = () => void;

/**
 * 탭(클릭·터치 공통) 한 번을 상호작용으로 해석합니다.
 * 우선순위: 몬스터 전투 → 보물·던전·NPC → 광맥 채굴 → 블록 채굴 → 설치.
 * 모든 월드 변경은 RuntimeChunkManager를 통해 delta로 기록됩니다.
 */
@ccclass('BlockInteractionController')
export class BlockInteractionController extends Component {
  private readonly tapLocation = new Vec2();
  private readonly damageByTarget = new Map<string, number>();
  /** 몬스터별 남은 체력입니다. 세션 내에서만 유지됩니다. */
  private readonly monsterHealth = new Map<string, number>();

  private inputSource: UnifiedInput | null = null;
  private playerNode: Node | null = null;
  private cameraNode: Node | null = null;
  private chunkManager: RuntimeChunkManager | null = null;
  private inventory: InventoryModel | null = null;
  private playerStats: PlayerStatsModel | null = null;
  private worldSeed: WorldSeed = '';
  private showMessage: HudMessageSink = () => {};
  private onPlayerDefeated: PlayerRespawnHandler = () => {};
  private isApplyingChange = false;

  configure(
    inputSource: UnifiedInput,
    playerNode: Node,
    cameraNode: Node,
    chunkManager: RuntimeChunkManager,
    inventory: InventoryModel,
    playerStats: PlayerStatsModel,
    worldSeed: WorldSeed,
    showMessage: HudMessageSink,
    onPlayerDefeated: PlayerRespawnHandler,
  ): void {
    this.inputSource = inputSource;
    this.playerNode = playerNode;
    this.cameraNode = cameraNode;
    this.chunkManager = chunkManager;
    this.inventory = inventory;
    this.playerStats = playerStats;
    this.worldSeed = worldSeed;
    this.showMessage = showMessage;
    this.onPlayerDefeated = onPlayerDefeated;
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
    // 핫바·세이브 HUD 위의 탭은 월드 상호작용으로 보내지 않습니다.
    if (isUiLocationOverHud(this.tapLocation.x, this.tapLocation.y)) return;

    const tile = this.toWorldTile(this.tapLocation);
    if (!this.isWithinReach(tile)) return;

    void this.interactWithTile(tile);
  }

  private async interactWithTile(tile: WorldTileCoordinate): Promise<void> {
    const manager = this.chunkManager;
    if (!manager) return;

    this.isApplyingChange = true;
    try {
      if (await this.tryInteractWithEntities(tile)) return;
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

  /** 몬스터·보물·던전·NPC를 우선 처리합니다. 처리했으면 true입니다. */
  private async tryInteractWithEntities(
    tile: WorldTileCoordinate,
  ): Promise<boolean> {
    const entities = this.chunkManager!.getContentEntitiesAt(tile);

    const monster = entities.find(
      (entity) => getMonsterDefinition(entity.typeId) !== null,
    );
    if (monster) {
      await this.fightMonster(tile, monster);
      return true;
    }

    const treasure = entities.find(
      (entity) => entity.typeId === 'treasure-chest',
    );
    if (treasure) {
      await this.openTreasure(tile, treasure);
      return true;
    }

    const dungeon = entities.find(
      (entity) => entity.typeId === 'dungeon-entrance',
    );
    if (dungeon) {
      await this.clearDungeon(tile, dungeon);
      return true;
    }

    const npc = entities.find((entity) => entity.typeId === 'npc-villager');
    if (npc) {
      this.talkToNpc(tile);
      return true;
    }
    return false;
  }

  private async fightMonster(
    tile: WorldTileCoordinate,
    monster: GeneratedContent,
  ): Promise<void> {
    const definition = getMonsterDefinition(monster.typeId);
    if (!definition) return;

    const stats = this.playerStats!;
    const remaining = (this.monsterHealth.get(monster.id) ?? definition.maxHealth)
      - stats.getAttackPower();

    if (remaining > 0) {
      this.monsterHealth.set(monster.id, remaining);
      const defeated = stats.applyDamage(definition.attackDamage);
      this.showMessage(
        `${definition.displayName}에게 ${stats.getAttackPower()} 피해! `
        + `(남은 체력 ${remaining}/${definition.maxHealth})`,
      );
      if (defeated) this.handlePlayerDefeat();
      return;
    }

    this.monsterHealth.delete(monster.id);
    const applied = await this.chunkManager!.applyEntityRemoval(
      tile,
      monster.id,
    );
    if (!applied) return;

    if (definition.dropItemId) this.inventory!.add(definition.dropItemId, 1);
    const levelUps = stats.addExperience(definition.experienceReward);
    this.showMessage(
      levelUps > 0
        ? `${definition.displayName} 처치! 레벨 ${stats.getLevel()} 달성!`
        : `${definition.displayName} 처치! 경험치 +${definition.experienceReward}`,
    );
  }

  private async openTreasure(
    tile: WorldTileCoordinate,
    treasure: GeneratedContent,
  ): Promise<void> {
    const applied = await this.chunkManager!.applyEntityRemoval(
      tile,
      treasure.id,
    );
    if (!applied) return;

    const lootRoll = sampleDeterministicUnit(
      this.worldSeed,
      'treasure-loot',
      tile.x,
      tile.y,
    );
    const loot = rollTreasureLoot(lootRoll);
    this.inventory!.add(loot.itemId, loot.quantity);
    this.showMessage(
      `보물 상자 개봉! ${getItemDefinition(loot.itemId).displayName} `
      + `+${loot.quantity}`,
    );
  }

  private async clearDungeon(
    tile: WorldTileCoordinate,
    dungeon: GeneratedContent,
  ): Promise<void> {
    const applied = await this.chunkManager!.applyEntityRemoval(
      tile,
      dungeon.id,
    );
    if (!applied) return;

    this.inventory!.add(DUNGEON_REWARD.itemId, DUNGEON_REWARD.quantity);
    this.showMessage(
      `던전 정복! ${getItemDefinition(DUNGEON_REWARD.itemId).displayName} `
      + `+${DUNGEON_REWARD.quantity}`,
    );
  }

  private talkToNpc(tile: WorldTileCoordinate): void {
    const dialogueRoll = sampleDeterministicUnit(
      this.worldSeed,
      'npc-dialogue',
      tile.x,
      tile.y,
    );
    this.showMessage(`주민: "${selectNpcDialogue(dialogueRoll)}"`);
  }

  private handlePlayerDefeat(): void {
    this.showMessage('쓰러졌다... 시작 지점에서 다시 일어난다.');
    this.playerStats!.restoreFullHealth();
    this.onPlayerDefeated();
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
