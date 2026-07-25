import {
  _decorator,
  Color,
  Component,
  Graphics,
  Label,
  Layers,
  Node,
  UITransform,
  Vec2,
} from 'cc';

import type { GameBalanceSettings } from '../core/game-balance-settings';
import { formatNumber2 } from '../core/game-balance-settings';
import type { SfxPlayer } from '../audio/sfx-player';
import {
  DUNGEON_REWARD,
  DUNGEON_TYPE_ID,
  getMonsterDefinition,
  NPC_TYPE_ID,
  rollTreasureLoot,
  rollTreasurePotions,
  selectNpcDialogue,
  BLACKSMITH_TYPE_ID,
  MERCHANT_TYPE_ID,
  BANKER_TYPE_ID,
  TELEPORTER_TYPE_ID,
  TREASURE_TYPE_ID,
} from '../content/content-registry';
import type { GeneratedContent } from '../content/content-types';
import type { UnifiedInput } from '../input/unified-input';
import {
  ELDER_LIZARDMAN_SWORD_DROP_CHANCE,
  LYCANTHROPE_SWORD_DROP_CHANCE,
  type InventoryModel,
} from '../inventory/inventory-model';
import {
  DEFAULT_WEAPON_ITEM_ID,
  getItemDefinition,
  getOreDefinition,
  HEALTH_POTIONS,
  isWeaponItem,
} from '../inventory/item-registry';
import type { GearInstanceStore } from '../npc/gear-instance-store';
import { getBlockDefinition } from '../world/block-registry';
import type { MonsterAtlas } from '../world/monster-atlas';
import { TILE_SIZE_PIXELS } from '../world/chunk-renderer';
import { sampleDeterministicUnit } from '../world/deterministic-random';
import type {
  RuntimeChunkManager,
  WorldTileCoordinate,
} from '../world/runtime-chunk-manager';
import type { WorldSeed } from '../world/world-types';
import {
  isUiLocationOverHud,
  uiLocationToWorldLocal,
} from '../ui/hud-layout';
import type { TooltipHud } from '../ui/tooltip-hud';
import type { PlayerStatsModel } from './player-stats-model';
import { PlayerVisualMotion } from './player-visual-motion';

const { ccclass } = _decorator;

/** 플레이어 중심에서 상호작용할 수 있는 기본 최대 거리(타일→px). */
const DEFAULT_INTERACTION_RANGE_TILES = 4;
/** 기본 몬스터 공격 간격(초). 공격속도%로 단축됩니다. */
const BASE_ATTACK_INTERVAL_SECONDS = 0.4;
const PROGRESS_BAR_WIDTH = 52;
const PROGRESS_BAR_HEIGHT = 8;
const HP_LABEL_OFFSET_Y = 22;

/** 아틀라스 미로드 시 몬스터 스프라이트 발자국(표시 스케일 반영). */
const FALLBACK_MONSTER_DISPLAY_SIZE: Readonly<
  Record<string, { width: number; height: number }>
> = {
  'monster-slime': { width: 84, height: 47 },
  'monster-wolf': { width: 122, height: 103 },
  'monster-golem': { width: 122, height: 110 },
  'monster-orc': { width: 103, height: 91 },
  'monster-orc-warrior': { width: 122, height: 95 },
  'monster-hero-orc': { width: 142, height: 113 },
  'monster-werewolf': { width: 122, height: 122 },
  'monster-red-wolf': { width: 122, height: 121 },
  'monster-lycanthrope': { width: 142, height: 130 },
  'monster-lizardman': { width: 122, height: 102 },
  'monster-black-lizardman': { width: 122, height: 96 },
  'monster-elder-lizardman': { width: 142, height: 124 },
};

export type HudMessageSink = (message: string) => void;
export type PlayerRespawnHandler = () => void;

interface HarvestTarget {
  readonly key: string;
  readonly tile: WorldTileCoordinate;
  readonly maxHp: number;
  readonly displayName: string;
  readonly dropItemId: string;
  readonly entityId: string | null;
}

/**
 * 포인터 입력을 월드 상호작용으로 해석합니다.
 * - 탭: 광석·나무·돌 채굴 / 몬스터 전투 (탭당 1 피해, 타일 위 체력바)
 * - 탭: 보물·던전·NPC → 블록 설치
 */
@ccclass('BlockInteractionController')
export class BlockInteractionController extends Component {
  private readonly tapLocation = new Vec2();
  private readonly hoverLocation = new Vec2();
  /** 몬스터·채굴 대상별 남은 체력입니다. 세션 내에서만 유지됩니다. */
  private readonly targetHealth = new Map<string, number>();

  private inputSource: UnifiedInput | null = null;
  private playerNode: Node | null = null;
  private cameraNode: Node | null = null;
  private worldNode: Node | null = null;
  private chunkManager: RuntimeChunkManager | null = null;
  private inventory: InventoryModel | null = null;
  private playerStats: PlayerStatsModel | null = null;
  private balance: GameBalanceSettings | null = null;
  private tooltip: TooltipHud | null = null;
  private monsterAtlas: MonsterAtlas | null = null;
  private progressBar: Graphics | null = null;
  private hpLabel: Label | null = null;
  private worldSeed: WorldSeed = '';
  private showMessage: HudMessageSink = () => {};
  private onPlayerDefeated: PlayerRespawnHandler = () => {};
  private sfx: SfxPlayer | null = null;
  private playerMotion: PlayerVisualMotion | null = null;
  private isApplyingChange = false;
  private pendingLootMessage = '';
  private openTeleporterHandler: (() => void) | null = null;
  private openBlacksmithHandler: (() => void) | null = null;
  private openMerchantHandler: (() => void) | null = null;
  private openBankerHandler: (() => void) | null = null;
  private gears: GearInstanceStore | null = null;
  /** 몬스터 타격 후 남은 공격 쿨타임(초). */
  private attackCooldownRemaining = 0;

  configure(
    inputSource: UnifiedInput,
    playerNode: Node,
    cameraNode: Node,
    chunkManager: RuntimeChunkManager,
    inventory: InventoryModel,
    playerStats: PlayerStatsModel,
    balance: GameBalanceSettings,
    worldSeed: WorldSeed,
    tooltip: TooltipHud,
    monsterAtlas: MonsterAtlas | null,
    showMessage: HudMessageSink,
    onPlayerDefeated: PlayerRespawnHandler,
    sfx: SfxPlayer | null = null,
    openTeleporter?: () => void,
    openBlacksmith?: () => void,
    gears?: GearInstanceStore | null,
    openMerchant?: () => void,
    openBanker?: () => void,
    worldNode?: Node | null,
  ): void {
    this.inputSource = inputSource;
    this.playerNode = playerNode;
    this.cameraNode = cameraNode;
    this.worldNode = worldNode ?? playerNode.parent;
    this.chunkManager = chunkManager;
    this.inventory = inventory;
    this.playerStats = playerStats;
    this.balance = balance;
    this.worldSeed = worldSeed;
    this.tooltip = tooltip;
    this.monsterAtlas = monsterAtlas;
    this.showMessage = showMessage;
    this.onPlayerDefeated = onPlayerDefeated;
    this.sfx = sfx;
    this.openTeleporterHandler = openTeleporter ?? null;
    this.openBlacksmithHandler = openBlacksmith ?? null;
    this.openMerchantHandler = openMerchant ?? null;
    this.openBankerHandler = openBanker ?? null;
    this.gears = gears ?? null;
    this.playerMotion = playerNode.getComponent(PlayerVisualMotion);
    this.createHpHud(playerNode.parent ?? playerNode);
  }

  protected update(_deltaTime: number): void {
    if (
      !this.inputSource
      || !this.playerNode
      || !this.cameraNode
      || !this.chunkManager
      || !this.inventory
    ) {
      return;
    }

    this.playerStats?.tickPassiveRegen(_deltaTime);
    if (this.attackCooldownRemaining > 0) {
      this.attackCooldownRemaining = Math.max(
        0,
        this.attackCooldownRemaining - _deltaTime,
      );
    }
    this.updateTooltip();
    if (this.isApplyingChange) return;
    this.handleTap();
  }

  // ── 체력바 HUD ───────────────────────────────────────────────

  private createHpHud(parent: Node): void {
    const barNode = new Node('TargetHpBar');
    barNode.layer = Layers.Enum.UI_2D;
    parent.addChild(barNode);
    this.progressBar = barNode.addComponent(Graphics);

    const labelNode = new Node('TargetHpLabel');
    labelNode.layer = Layers.Enum.UI_2D;
    parent.addChild(labelNode);
    labelNode.addComponent(UITransform).setContentSize(80, 20);
    const label = labelNode.addComponent(Label);
    label.fontSize = 14;
    label.lineHeight = 16;
    label.color = new Color(255, 255, 255, 255);
    label.string = '';
    label.overflow = Label.Overflow.NONE;
    this.hpLabel = label;
  }

  private showHpBar(
    tile: WorldTileCoordinate,
    current: number,
    max: number,
  ): void {
    const bar = this.progressBar;
    const label = this.hpLabel;
    if (!bar || !label) return;

    const centerX = (tile.x + 0.5) * TILE_SIZE_PIXELS;
    const topY = (tile.y + 1) * TILE_SIZE_PIXELS + 6;
    const left = centerX - PROGRESS_BAR_WIDTH / 2;
    const ratio = max > 0 ? Math.min(Math.max(current / max, 0), 1) : 0;

    bar.clear();
    bar.fillColor = new Color(20, 28, 40, 230);
    bar.rect(left, topY, PROGRESS_BAR_WIDTH, PROGRESS_BAR_HEIGHT);
    bar.fill();
    bar.fillColor = current > max * 0.35
      ? new Color(80, 210, 120, 255)
      : new Color(255, 120, 90, 255);
    bar.rect(left, topY, PROGRESS_BAR_WIDTH * ratio, PROGRESS_BAR_HEIGHT);
    bar.fill();

    label.string = `${formatNumber2(current)}/${formatNumber2(max)}`;
    label.node.setPosition(centerX, topY + HP_LABEL_OFFSET_Y, 0);
  }

  private clearHpBar(): void {
    this.progressBar?.clear();
    if (this.hpLabel) this.hpLabel.string = '';
  }

  // ── 툴팁 ────────────────────────────────────────────────────

  private updateTooltip(): void {
    const tooltip = this.tooltip;
    if (!tooltip) return;

    if (
      !this.inputSource!.getHoverLocation(this.hoverLocation)
      || isUiLocationOverHud(this.hoverLocation.x, this.hoverLocation.y)
    ) {
      tooltip.hide();
      return;
    }

    const monsterHit = this.findMonsterAtUi(this.hoverLocation);
    const text = monsterHit
      ? this.describeMonster(monsterHit.entity, monsterHit.tile)
      : this.describeTile(this.resolveInteractionTile(this.hoverLocation));
    if (!text) {
      tooltip.hide();
      return;
    }
    tooltip.show(text, this.hoverLocation);
  }

  private describeMonster(
    entity: GeneratedContent,
    tile: WorldTileCoordinate,
  ): string | null {
    const monster = getMonsterDefinition(entity.typeId);
    if (!monster) return null;
    const suffix = this.isWithinReach(tile) ? '' : ' (거리 밖)';
    const maxHp = this.balance?.getMonsterMaxHealth(entity.typeId)
      ?? monster.maxHealth;
    const health = this.targetHealth.get(entity.id) ?? maxHp;
    return `${monster.displayName} — 탭으로 공격 `
      + `(체력 ${formatNumber2(health)}/${formatNumber2(maxHp)})${suffix}`;
  }

  private describeTile(tile: WorldTileCoordinate): string | null {
    const manager = this.chunkManager!;
    const suffix = this.isWithinReach(tile) ? '' : ' (거리 밖)';
    const entities = manager.getContentEntitiesAt(tile);

    for (const entity of entities) {
      const monsterText = this.describeMonster(entity, tile);
      if (monsterText) return monsterText;
    }

    for (const entity of entities) {
      if (entity.typeId === TREASURE_TYPE_ID) {
        return `보물 상자 — 탭으로 개봉${suffix}`;
      }
      if (entity.typeId === DUNGEON_TYPE_ID) {
        return `던전 입구 — 탭으로 정복${suffix}`;
      }
      if (entity.typeId === NPC_TYPE_ID) {
        return `주민 — 탭으로 대화${suffix}`;
      }
      if (entity.typeId === TELEPORTER_TYPE_ID) {
        return `텔레포터 — 탭으로 이용${suffix}`;
      }
      if (entity.typeId === BLACKSMITH_TYPE_ID) {
        return `대장장이 — 탭으로 이용${suffix}`;
      }
      if (entity.typeId === MERCHANT_TYPE_ID) {
        return `상인 — 탭으로 상점${suffix}`;
      }
      if (entity.typeId === BANKER_TYPE_ID) {
        return `은행 — 탭으로 이용${suffix}`;
      }
      const ore = getOreDefinition(entity.typeId);
      if (ore) {
        const maxHp = this.balance?.getOreHits(entity.typeId) ?? ore.requiredHits;
        const health = this.targetHealth.get(entity.id) ?? maxHp;
        return `${ore.displayName} — 탭으로 채굴 `
          + `(${health}/${maxHp})${suffix}`;
      }
    }

    const blockId = manager.getEffectiveBlockId(tile);
    if (blockId === null) return null;

    const definition = getBlockDefinition(blockId);
    if (definition.requiredHits !== null && definition.dropItemId) {
      const maxHp = this.balance?.getBlockHits(blockId)
        ?? definition.requiredHits;
      const key = `block:${tile.x},${tile.y}:${blockId}`;
      const health = this.targetHealth.get(key) ?? maxHp;
      return `${definition.displayName} — 탭으로 채굴 `
        + `(${health}/${maxHp})${suffix}`;
    }
    return `${definition.displayName} — ${definition.description}`;
  }

  // ── 탭 ─────────────────────────────────────────────────────

  private handleTap(): void {
    if (!this.inputSource!.consumeTap(this.tapLocation)) return;
    if (isUiLocationOverHud(this.tapLocation.x, this.tapLocation.y)) return;

    const tile = this.resolveInteractionTile(this.tapLocation);
    if (!this.isWithinReach(tile)) return;

    void this.interactWithTile(tile);
  }

  private async interactWithTile(tile: WorldTileCoordinate): Promise<void> {
    this.isApplyingChange = true;
    try {
      if (await this.tryInteractWithEntities(tile)) return;
      if (await this.tryHarvest(tile)) return;

      const blockId = this.chunkManager!.getEffectiveBlockId(tile);
      if (blockId === null) return;
      if (getBlockDefinition(blockId).buildableOn) {
        await this.placeSelectedItem(tile);
      }
    } finally {
      this.isApplyingChange = false;
    }
  }

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
      (entity) => entity.typeId === TREASURE_TYPE_ID,
    );
    if (treasure) {
      await this.openTreasure(tile, treasure);
      return true;
    }

    const dungeon = entities.find(
      (entity) => entity.typeId === DUNGEON_TYPE_ID,
    );
    if (dungeon) {
      await this.clearDungeon(tile, dungeon);
      return true;
    }

    const blacksmith = entities.find(
      (entity) => entity.typeId === BLACKSMITH_TYPE_ID,
    );
    if (blacksmith) {
      this.openBlacksmith();
      return true;
    }

    const merchant = entities.find(
      (entity) => entity.typeId === MERCHANT_TYPE_ID,
    );
    if (merchant) {
      this.openMerchant();
      return true;
    }

    const banker = entities.find(
      (entity) => entity.typeId === BANKER_TYPE_ID,
    );
    if (banker) {
      this.openBanker();
      return true;
    }

    const teleporter = entities.find(
      (entity) => entity.typeId === TELEPORTER_TYPE_ID,
    );
    if (teleporter) {
      this.openTeleporter();
      return true;
    }

    const npc = entities.find((entity) => entity.typeId === NPC_TYPE_ID);
    if (npc) {
      this.talkToNpc(tile);
      return true;
    }
    return false;
  }

  private resolveHarvestTarget(tile: WorldTileCoordinate): HarvestTarget | null {
    const manager = this.chunkManager!;

    const ore = manager.getContentEntitiesAt(tile)
      .map((entity) => ({ entity, ore: getOreDefinition(entity.typeId) }))
      .find((candidate) => candidate.ore !== null);
    if (ore?.ore) {
      const maxHp = this.balance?.getOreHits(ore.entity.typeId)
        ?? ore.ore.requiredHits;
      return {
        key: ore.entity.id,
        tile,
        maxHp,
        displayName: ore.ore.displayName,
        dropItemId: ore.ore.dropItemId,
        entityId: ore.entity.id,
      };
    }

    const blockId = manager.getEffectiveBlockId(tile);
    if (blockId === null) return null;
    const definition = getBlockDefinition(blockId);
    if (definition.requiredHits === null || !definition.dropItemId) {
      return null;
    }
    const maxHp = this.balance?.getBlockHits(blockId) ?? definition.requiredHits;
    return {
      key: `block:${tile.x},${tile.y}:${blockId}`,
      tile,
      maxHp,
      displayName: definition.displayName,
      dropItemId: definition.dropItemId,
      entityId: null,
    };
  }

  private async tryHarvest(tile: WorldTileCoordinate): Promise<boolean> {
    const target = this.resolveHarvestTarget(tile);
    if (!target) return false;

    this.playHarvestSfx(target);
    this.playerMotion?.playHitImpulse();
    const remaining = (this.targetHealth.get(target.key) ?? target.maxHp) - 1;
    if (remaining > 0) {
      this.targetHealth.set(target.key, remaining);
      this.showHpBar(tile, remaining, target.maxHp);
      this.playHarvestShake(target);
      return true;
    }

    this.targetHealth.delete(target.key);
    this.clearHpBar();

    const applied = target.entityId !== null
      ? await this.chunkManager!.applyEntityRemoval(tile, target.entityId)
      : await this.chunkManager!.applyBlockChange(tile, null);
    if (!applied) return true;

    this.inventory!.add(target.dropItemId, 1);
    this.showMessage(
      `${target.displayName} 채굴 완료! `
      + `${getItemDefinition(target.dropItemId).displayName} +1`,
    );
    return true;
  }

  private playHarvestSfx(target: HarvestTarget): void {
    if (!this.sfx) return;
    this.sfx.unlock();
    if (target.entityId) {
      this.sfx.play('hit-ore');
      return;
    }
    if (target.key.includes(':tree')) {
      this.sfx.play('hit-tree');
      return;
    }
    // 돌 등 기타 블록도 광석계 타격음
    this.sfx.play('hit-ore');
  }

  private playHarvestShake(target: HarvestTarget): void {
    if (target.entityId) {
      if (this.chunkManager!.shakeEntityVisual(target.entityId)) return;
    }
    this.chunkManager!.shakeWorldTile(target.tile);
  }

  private async fightMonster(
    tile: WorldTileCoordinate,
    monster: GeneratedContent,
  ): Promise<void> {
    if (this.attackCooldownRemaining > 0) return;

    const definition = getMonsterDefinition(monster.typeId);
    if (!definition) return;

    const stats = this.playerStats!;
    const maxHp = this.balance?.getMonsterMaxHealth(monster.typeId)
      ?? definition.maxHealth;
    const damage = this.getPlayerAttackDamage();
    this.sfx?.unlock();
    this.sfx?.play('hit-monster');
    this.playerMotion?.playHitImpulse();
    this.attackCooldownRemaining = this.getAttackIntervalSeconds();
    const remaining = Math.round(
      ((this.targetHealth.get(monster.id) ?? maxHp) - damage) * 100,
    ) / 100;

    if (remaining > 0) {
      this.targetHealth.set(monster.id, remaining);
      this.showHpBar(tile, remaining, maxHp);
      this.chunkManager!.shakeEntityVisual(monster.id);
      const monsterDamage = this.balance?.getMonsterDamage(monster.typeId)
        ?? definition.attackDamage;
      const incoming = Math.max(
        0,
        monsterDamage - (this.inventory?.getEquippedDefense() ?? 0)
          - (this.gears?.getEquippedDefenseBonus() ?? 0),
      );
      const defeated = stats.applyDamage(incoming);
      if (defeated) this.handlePlayerDefeat();
      return;
    }

    this.targetHealth.delete(monster.id);
    this.clearHpBar();
    const applied = await this.chunkManager!.applyEntityRemoval(
      tile,
      monster.id,
    );
    if (!applied) return;

    this.grantMonsterRewards(monster, tile);
    const experience = this.balance?.getMonsterExperience(monster.typeId)
      ?? definition.experienceReward;
    const levelUps = stats.addExperience(experience);
    const bonus = this.consumePendingLootMessage();
    this.showMessage(
      levelUps > 0
        ? `${definition.displayName} 처치! 레벨 ${stats.getLevel()} 달성!${bonus}`
        : `${definition.displayName} 처치! 경험치 +${experience}${bonus}`,
    );
  }

  private consumePendingLootMessage(): string {
    const text = this.pendingLootMessage;
    this.pendingLootMessage = '';
    return text ? ` ${text}` : '';
  }

  /** 기본 드롭 + 붉은늑대 포션 / 라이칸슬롭 철검(3%). */
  private grantMonsterRewards(
    monster: GeneratedContent,
    tile: WorldTileCoordinate,
  ): void {
    const definition = getMonsterDefinition(monster.typeId);
    if (!definition || !this.inventory) return;
    const notes: string[] = [];

    if (definition.dropItemId) {
      this.inventory.add(definition.dropItemId, 1);
    }

    if (monster.typeId === 'monster-red-wolf') {
      const potionRolls = HEALTH_POTIONS.map((potion) => sampleDeterministicUnit(
        this.worldSeed,
        `red-wolf-${potion.itemId}`,
        tile.x,
        tile.y,
      ));
      const potions = rollTreasurePotions(
        potionRolls,
        (itemId) => this.balance?.getPotionDropChance(itemId),
      );
      for (const potion of potions) {
        this.inventory.add(potion.itemId, potion.quantity);
        notes.push(`${getItemDefinition(potion.itemId).displayName}+${potion.quantity}`);
      }
    }

    if (monster.typeId === 'monster-black-lizardman') {
      // 보물상자 포션 비율 ×2
      const potionRolls = HEALTH_POTIONS.map((potion) => sampleDeterministicUnit(
        this.worldSeed,
        `black-lizard-${potion.itemId}`,
        tile.x,
        tile.y,
      ));
      const potions = rollTreasurePotions(
        potionRolls,
        (itemId) => {
          const potion = HEALTH_POTIONS.find((entry) => entry.itemId === itemId);
          const base = this.balance?.getPotionDropChance(itemId)
            ?? potion?.chestDropChance
            ?? 0;
          return Math.min(1, base * 2);
        },
      );
      for (const potion of potions) {
        this.inventory.add(potion.itemId, potion.quantity);
        notes.push(`${getItemDefinition(potion.itemId).displayName}+${potion.quantity}`);
      }
    }

    if (monster.typeId === 'monster-lycanthrope') {
      const roll = sampleDeterministicUnit(
        this.worldSeed,
        'lycanthrope-sword',
        tile.x,
        tile.y,
      );
      if (roll < LYCANTHROPE_SWORD_DROP_CHANCE) {
        this.inventory.add('weapon-iron-sword', 1);
        notes.push('철검 획득!');
      }
    }

    if (monster.typeId === 'monster-elder-lizardman') {
      const roll = sampleDeterministicUnit(
        this.worldSeed,
        'elder-lizardman-sword',
        tile.x,
        tile.y,
      );
      if (roll < ELDER_LIZARDMAN_SWORD_DROP_CHANCE) {
        this.inventory.add('weapon-mithril-sword', 1);
        notes.push('미스릴검 획득!');
      }
    }

    if (notes.length > 0) {
      this.pendingLootMessage = `(${notes.join(', ')})`;
    }
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

    const potionRolls = HEALTH_POTIONS.map((potion) => sampleDeterministicUnit(
      this.worldSeed,
      `treasure-${potion.itemId}`,
      tile.x,
      tile.y,
    ));
    const potions = rollTreasurePotions(
      potionRolls,
      (itemId) => this.balance?.getPotionDropChance(itemId),
    );
    for (const potion of potions) {
      this.inventory!.add(potion.itemId, potion.quantity);
    }

    const parts = [
      `${getItemDefinition(loot.itemId).displayName} +${loot.quantity}`,
      ...potions.map(
        (entry) => `${getItemDefinition(entry.itemId).displayName} +${entry.quantity}`,
      ),
    ];
    this.showMessage(`보물 상자 개봉! ${parts.join(', ')}`);
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

  private openTeleporter(): void {
    if (!this.openTeleporterHandler) {
      this.showMessage('텔레포터를 이용할 수 없습니다.');
      return;
    }
    this.openTeleporterHandler();
  }

  private openBlacksmith(): void {
    if (!this.openBlacksmithHandler) {
      this.showMessage('대장장이를 이용할 수 없습니다.');
      return;
    }
    this.openBlacksmithHandler();
  }

  private openMerchant(): void {
    if (!this.openMerchantHandler) {
      this.showMessage('상인을 이용할 수 없습니다.');
      return;
    }
    this.openMerchantHandler();
  }

  private openBanker(): void {
    if (!this.openBankerHandler) {
      this.showMessage('은행을 이용할 수 없습니다.');
      return;
    }
    this.openBankerHandler();
  }

  private handlePlayerDefeat(): void {
    this.showMessage('쓰러졌다... 시작 지점에서 다시 일어난다.');
    this.playerStats!.restoreFullHealth();
    this.onPlayerDefeated();
  }

  /** 장착 무기 기본 공격력 × 레벨 배율 + 기어 보너스. */
  private getPlayerAttackDamage(): number {
    const gearWeapon = this.gears?.getEquippedWeapon();
    const weaponId = gearWeapon?.itemId
      ?? this.inventory?.getEquippedWeaponId()
      ?? DEFAULT_WEAPON_ITEM_ID;
    const weaponBase = getItemDefinition(weaponId).attackPower ?? 1;
    const levelScale = this.playerStats?.getAttackPower() ?? 1;
    const gearBonus = this.gears?.getEquippedAttackBonus() ?? 0;
    return weaponBase * levelScale + gearBonus;
  }

  /** 기본 간격 / (1 + 공격속도%/100). */
  private getAttackIntervalSeconds(): number {
    const bonusPct = this.gears?.getEquippedAttackSpeedPercentBonus() ?? 0;
    return BASE_ATTACK_INTERVAL_SECONDS / (1 + Math.max(0, bonusPct) / 100);
  }

  private async placeSelectedItem(tile: WorldTileCoordinate): Promise<void> {
    const inventory = this.inventory!;
    const itemId = inventory.getSelectedItemId();
    if (!itemId) return;
    if (isWeaponItem(itemId)) return;

    const blockId = getItemDefinition(itemId).placeableBlockId;
    if (!blockId) return;
    if (inventory.getQuantity(itemId) <= 0) return;
    if (this.isPlayerOnTile(tile)) return;

    const applied = await this.chunkManager?.applyBlockChange(tile, blockId);
    if (applied) inventory.remove(itemId, 1);
  }

  // ── 좌표·거리 ────────────────────────────────────────────────

  private resolveInteractionTile(uiLocation: Vec2): WorldTileCoordinate {
    const hit = this.findMonsterAtUi(uiLocation);
    if (hit) return hit.tile;

    const blacksmith = this.findBlacksmithAtUi(uiLocation);
    if (blacksmith) return blacksmith.tile;

    const teleporter = this.findTeleporterAtUi(uiLocation);
    if (teleporter) return teleporter.tile;

    const merchant = this.findMerchantAtUi(uiLocation);
    if (merchant) return merchant.tile;

    const banker = this.findBankerAtUi(uiLocation);
    if (banker) return banker.tile;

    const pixel = this.toWorldPixel(uiLocation);
    const harvestTile = this.chunkManager!.findHarvestableTileAtWorldPixel(
      pixel.x,
      pixel.y,
      (blockId) => {
        const definition = getBlockDefinition(blockId);
        return definition.requiredHits !== null && !!definition.dropItemId;
      },
      (typeId) => (
        getOreDefinition(typeId) !== null
        || typeId === TREASURE_TYPE_ID
        || typeId === DUNGEON_TYPE_ID
        || typeId === NPC_TYPE_ID
        || typeId === TELEPORTER_TYPE_ID
        || typeId === BLACKSMITH_TYPE_ID
        || typeId === MERCHANT_TYPE_ID
        || typeId === BANKER_TYPE_ID
      ),
    );
    if (harvestTile) return harvestTile;
    return this.toWorldTile(uiLocation);
  }

  private findBlacksmithAtUi(
    uiLocation: Vec2,
  ): { entity: GeneratedContent; tile: WorldTileCoordinate } | null {
    if (!this.chunkManager) return null;
    const pixel = this.toWorldPixel(uiLocation);
    return this.chunkManager.findBlacksmithAtWorldPixel(pixel.x, pixel.y);
  }

  private findTeleporterAtUi(
    uiLocation: Vec2,
  ): { entity: GeneratedContent; tile: WorldTileCoordinate } | null {
    if (!this.chunkManager) return null;
    const pixel = this.toWorldPixel(uiLocation);
    return this.chunkManager.findTeleporterAtWorldPixel(pixel.x, pixel.y);
  }

  private findMerchantAtUi(
    uiLocation: Vec2,
  ): { entity: GeneratedContent; tile: WorldTileCoordinate } | null {
    if (!this.chunkManager) return null;
    const pixel = this.toWorldPixel(uiLocation);
    return this.chunkManager.findMerchantAtWorldPixel(pixel.x, pixel.y);
  }

  private findBankerAtUi(
    uiLocation: Vec2,
  ): { entity: GeneratedContent; tile: WorldTileCoordinate } | null {
    if (!this.chunkManager) return null;
    const pixel = this.toWorldPixel(uiLocation);
    return this.chunkManager.findBankerAtWorldPixel(pixel.x, pixel.y);
  }

  private findMonsterAtUi(
    uiLocation: Vec2,
  ): { entity: GeneratedContent; tile: WorldTileCoordinate } | null {
    if (!this.chunkManager) return null;
    const pixel = this.toWorldPixel(uiLocation);
    return this.chunkManager.findMonsterAtWorldPixel(
      pixel.x,
      pixel.y,
      (typeId) => this.getMonsterDisplaySize(typeId),
    );
  }

  private getMonsterDisplaySize(
    typeId: string,
  ): { width: number; height: number } | null {
    const fromAtlas = this.monsterAtlas?.isReady()
      ? this.monsterAtlas.getDisplaySize(typeId)
      : null;
    if (fromAtlas) return fromAtlas;
    return FALLBACK_MONSTER_DISPLAY_SIZE[typeId] ?? null;
  }

  private toWorldPixel(uiLocation: Vec2): { x: number; y: number } {
    const world = this.worldNode ?? this.playerNode?.parent;
    if (!world) {
      return { x: 0, y: 0 };
    }
    return uiLocationToWorldLocal(
      uiLocation.x,
      uiLocation.y,
      this.cameraNode!,
      world,
    );
  }

  private toWorldTile(uiLocation: Vec2): WorldTileCoordinate {
    const pixel = this.toWorldPixel(uiLocation);
    return {
      x: Math.floor(pixel.x / TILE_SIZE_PIXELS),
      y: Math.floor(pixel.y / TILE_SIZE_PIXELS),
    };
  }

  private isWithinReach(tile: WorldTileCoordinate): boolean {
    const player = this.playerNode!.position;
    const tileCenterX = (tile.x + 0.5) * TILE_SIZE_PIXELS;
    const tileCenterY = (tile.y + 0.5) * TILE_SIZE_PIXELS;
    const distanceX = tileCenterX - player.x;
    const distanceY = tileCenterY - player.y;
    const tiles = this.balance?.get('interactionRangeTiles')
      ?? DEFAULT_INTERACTION_RANGE_TILES;
    const range = TILE_SIZE_PIXELS * tiles;
    return (distanceX * distanceX + distanceY * distanceY) <= range * range;
  }

  private isPlayerOnTile(tile: WorldTileCoordinate): boolean {
    const player = this.playerNode!.position;
    return Math.floor(player.x / TILE_SIZE_PIXELS) === tile.x
      && Math.floor(player.y / TILE_SIZE_PIXELS) === tile.y;
  }
}
