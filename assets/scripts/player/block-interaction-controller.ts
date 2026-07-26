import {
  _decorator,
  Camera,
  Color,
  Component,
  Graphics,
  Label,
  Layers,
  Node,
  UITransform,
  Vec2,
  Vec3,
} from 'cc';

import type { GameBalanceSettings } from '../core/game-balance-settings';
import { formatNumber2 } from '../core/game-balance-settings';
import {
  monsterAttackFromHp,
  monsterDefenseFromHp,
  monsterExperienceFromHp,
} from '../core/monster-derived-stats';
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
  BLOOD_OGRE_MITHRIL_DROP_CHANCE,
  BLOOD_TROLL_MITHRIL_DROP_CHANCE,
  ELDER_HARPY_MITHRIL_DROP_CHANCE,
  ELDER_LIZARDMAN_SWORD_DROP_CHANCE,
  ELDER_OGRE_MITHRIL_DROP_CHANCE,
  ELDER_TROLL_MITHRIL_DROP_CHANCE,
  HARPY_QUEEN_ORICHALCUM_DROP_CHANCE,
  HARPY_SIREN_MITHRIL_DROP_CHANCE,
  HIGH_TROLL_ORICHALCUM_DROP_CHANCE,
  LYCANTHROPE_SWORD_DROP_CHANCE,
  OGRE_KING_ORICHALCUM_DROP_CHANCE,
  OGRE_MITHRIL_DROP_CHANCE,
  THUNDER_OGRE_MITHRIL_DROP_CHANCE,
  TROLL_KING_ORICHALCUM_DROP_CHANCE,
  TROLL_MITHRIL_DROP_CHANCE,
  TWINHEAD_OGRE_ORICHALCUM_DROP_CHANCE,
  TWINHEAD_TROLL_MITHRIL_DROP_CHANCE,
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
} from '../ui/hud-layout';
import type { WorldHitDebugOverlay } from '../ui/world-hit-debug-overlay';
import {
  screenToWorldPoint,
  type UiBounds,
} from '../world/world-ui-hit';
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
  'monster-harpy': { width: 98, height: 112 },
  'monster-blood-harpy': { width: 98, height: 112 },
  'monster-elder-harpy': { width: 98, height: 112 },
  'monster-harpy-siren': { width: 98, height: 112 },
  'monster-harpy-queen': { width: 98, height: 112 },
  'monster-troll': { width: 168, height: 168 },
  'monster-elder-troll': { width: 168, height: 168 },
  'monster-high-troll': { width: 168, height: 168 },
  'monster-twinhead-troll': { width: 168, height: 168 },
  'monster-blood-troll': { width: 168, height: 168 },
  'monster-troll-king': { width: 168, height: 168 },
  // 오우거 폴백: 기본 대비 70% 크게 (112*1.7≈190)
  'monster-ogre': { width: 190, height: 190 },
  'monster-elder-ogre': { width: 190, height: 190 },
  'monster-twinhead-ogre': { width: 190, height: 190 },
  'monster-blood-ogre': { width: 190, height: 190 },
  'monster-thunder-ogre': { width: 190, height: 190 },
  'monster-ogre-king': { width: 190, height: 190 },
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
  private readonly tapScreen = new Vec2();
  private readonly hoverLocation = new Vec2();
  private readonly hoverScreen = new Vec2();
  private readonly worldHitPoint = new Vec2();
  private readonly worldHitTmp = new Vec3();
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
  private hitDebug: WorldHitDebugOverlay | null = null;

  setHitDebugOverlay(overlay: WorldHitDebugOverlay | null): void {
    this.hitDebug = overlay;
  }

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
      !this.inputSource!.getHoverLocation(this.hoverLocation, this.hoverScreen)
      || isUiLocationOverHud(this.hoverLocation.x, this.hoverLocation.y)
    ) {
      tooltip.hide();
      this.flushHitDebug(null);
      return;
    }

    this.debugBoundsBuffer = [];
    const worldPoint = this.screenToWorldHit(this.hoverScreen);
    const monsterHit = worldPoint
      ? this.findMonsterAtUi(worldPoint)
      : null;
    const text = monsterHit
      ? this.describeMonster(monsterHit.entity, monsterHit.tile)
      : worldPoint
        ? this.describeTile(this.resolveInteractionTile(worldPoint))
        : null;
    this.flushHitDebug(worldPoint);
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
    if (!this.inputSource!.consumeTap(this.tapLocation, this.tapScreen)) return;
    if (isUiLocationOverHud(this.tapLocation.x, this.tapLocation.y)) return;

    this.debugBoundsBuffer = [];
    const worldPoint = this.screenToWorldHit(this.tapScreen);
    // eslint-disable-next-line no-console
    console.info('[ExGame:hitTrace] TAP', {
      path: 'BlockInteractionController.handleTap → screenToWorld → world bounds',
      touchUI: { x: this.tapLocation.x, y: this.tapLocation.y },
      touchScreen: { x: this.tapScreen.x, y: this.tapScreen.y },
      touchWorld: worldPoint
        ? { x: worldPoint.x, y: worldPoint.y }
        : null,
      hitDebugOverlayAttached: !!this.hitDebug,
    });
    if (!worldPoint) return;
    const tile = this.resolveInteractionTile(worldPoint);
    this.flushHitDebug(worldPoint);
    if (!this.isWithinReach(tile)) return;

    void this.interactWithTile(tile);
  }

  /** 스크린(getLocation) → 렌더 카메라 월드. HUD UI 좌표와 분리. */
  private screenToWorldHit(screen: Vec2): Vec2 | null {
    const camera = this.getCamera();
    if (!camera) return null;
    screenToWorldPoint(camera, screen.x, screen.y, this.worldHitTmp);
    this.worldHitPoint.set(this.worldHitTmp.x, this.worldHitTmp.y);
    return this.worldHitPoint;
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
    const monsterDefense = this.balance?.getMonsterDefense(monster.typeId)
      ?? monsterDefenseFromHp(maxHp);
    const rawDamage = this.getPlayerAttackDamage();
    // 최소 1 — 방어가 높아도 전투가 멈추지 않게 합니다.
    const damage = Math.max(1, rawDamage - monsterDefense);
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
        ?? monsterAttackFromHp(maxHp);
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
      ?? monsterExperienceFromHp(maxHp);
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

  /** 기본 드롭 + 특수 몬스터 추가 드랍(포션·검·아크 등). */
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

    if (monster.typeId === 'monster-blood-harpy') {
      // 보물상자 포션 비율 ×3
      const potionRolls = HEALTH_POTIONS.map((potion) => sampleDeterministicUnit(
        this.worldSeed,
        `blood-harpy-${potion.itemId}`,
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
          return Math.min(1, base * 3);
        },
      );
      for (const potion of potions) {
        this.inventory.add(potion.itemId, potion.quantity);
        notes.push(`${getItemDefinition(potion.itemId).displayName}+${potion.quantity}`);
      }
    }

    if (monster.typeId === 'monster-elder-harpy') {
      const roll = sampleDeterministicUnit(
        this.worldSeed,
        'elder-harpy-mithril',
        tile.x,
        tile.y,
      );
      if (roll < ELDER_HARPY_MITHRIL_DROP_CHANCE) {
        this.inventory.add('weapon-mithril-sword', 1);
        notes.push('미스릴검 획득!');
      }
    }

    if (monster.typeId === 'monster-harpy-siren') {
      const swordRoll = sampleDeterministicUnit(
        this.worldSeed,
        'harpy-siren-mithril',
        tile.x,
        tile.y,
      );
      if (swordRoll < HARPY_SIREN_MITHRIL_DROP_CHANCE) {
        this.inventory.add('weapon-mithril-sword', 1);
        notes.push('미스릴검 획득!');
      }
      const oreRoll = sampleDeterministicUnit(
        this.worldSeed,
        'harpy-siren-ark',
        tile.x,
        tile.y,
      );
      const oreQty = 1 + Math.floor(oreRoll * 3); // 1~3
      this.inventory.add('ark', oreQty);
      notes.push(`아크광석+${oreQty}`);
    }

    if (monster.typeId === 'monster-harpy-queen') {
      const swordRoll = sampleDeterministicUnit(
        this.worldSeed,
        'harpy-queen-orichalcum',
        tile.x,
        tile.y,
      );
      if (swordRoll < HARPY_QUEEN_ORICHALCUM_DROP_CHANCE) {
        this.inventory.add('weapon-orichalcum-sword', 1);
        notes.push('오리하르콘검 획득!');
      }
      const oreRoll = sampleDeterministicUnit(
        this.worldSeed,
        'harpy-queen-ark',
        tile.x,
        tile.y,
      );
      const oreQty = 2 + Math.floor(oreRoll * 4); // 2~5
      this.inventory.add('ark', oreQty);
      notes.push(`아크광석+${oreQty}`);
    }

    if (monster.typeId === 'monster-troll') {
      const roll = sampleDeterministicUnit(
        this.worldSeed,
        'troll-mithril',
        tile.x,
        tile.y,
      );
      if (roll < TROLL_MITHRIL_DROP_CHANCE) {
        this.inventory.add('weapon-mithril-sword', 1);
        notes.push('미스릴검 획득!');
      }
    }

    if (monster.typeId === 'monster-elder-troll') {
      const roll = sampleDeterministicUnit(
        this.worldSeed,
        'elder-troll-mithril',
        tile.x,
        tile.y,
      );
      if (roll < ELDER_TROLL_MITHRIL_DROP_CHANCE) {
        this.inventory.add('weapon-mithril-sword', 1);
        notes.push('미스릴검 획득!');
      }
      const oreRoll = sampleDeterministicUnit(
        this.worldSeed,
        'elder-troll-ark',
        tile.x,
        tile.y,
      );
      const oreQty = 1 + Math.floor(oreRoll * 4); // 1~4
      this.inventory.add('ark', oreQty);
      notes.push(`아크광석+${oreQty}`);
    }

    if (monster.typeId === 'monster-high-troll') {
      const roll = sampleDeterministicUnit(
        this.worldSeed,
        'high-troll-orichalcum',
        tile.x,
        tile.y,
      );
      if (roll < HIGH_TROLL_ORICHALCUM_DROP_CHANCE) {
        this.inventory.add('weapon-orichalcum-sword', 1);
        notes.push('오리하르콘검 획득!');
      }
      const oreRoll = sampleDeterministicUnit(
        this.worldSeed,
        'high-troll-ark',
        tile.x,
        tile.y,
      );
      const oreQty = 2 + Math.floor(oreRoll * 5); // 2~6
      this.inventory.add('ark', oreQty);
      notes.push(`아크광석+${oreQty}`);
    }

    if (monster.typeId === 'monster-twinhead-troll') {
      const roll = sampleDeterministicUnit(
        this.worldSeed,
        'twinhead-troll-mithril',
        tile.x,
        tile.y,
      );
      if (roll < TWINHEAD_TROLL_MITHRIL_DROP_CHANCE) {
        this.inventory.add('weapon-mithril-sword', 1);
        notes.push('미스릴검 획득!');
      }
    }

    if (monster.typeId === 'monster-blood-troll') {
      const roll = sampleDeterministicUnit(
        this.worldSeed,
        'blood-troll-mithril',
        tile.x,
        tile.y,
      );
      if (roll < BLOOD_TROLL_MITHRIL_DROP_CHANCE) {
        this.inventory.add('weapon-mithril-sword', 1);
        notes.push('미스릴검 획득!');
      }
      const oreRoll = sampleDeterministicUnit(
        this.worldSeed,
        'blood-troll-ark',
        tile.x,
        tile.y,
      );
      const oreQty = 1 + Math.floor(oreRoll * 5); // 1~5
      this.inventory.add('ark', oreQty);
      notes.push(`아크광석+${oreQty}`);
    }

    if (monster.typeId === 'monster-troll-king') {
      const roll = sampleDeterministicUnit(
        this.worldSeed,
        'troll-king-orichalcum',
        tile.x,
        tile.y,
      );
      if (roll < TROLL_KING_ORICHALCUM_DROP_CHANCE) {
        this.inventory.add('weapon-orichalcum-sword', 1);
        notes.push('오리하르콘검 획득!');
      }
      const oreRoll = sampleDeterministicUnit(
        this.worldSeed,
        'troll-king-ark',
        tile.x,
        tile.y,
      );
      const oreQty = 2 + Math.floor(oreRoll * 6); // 2~7
      this.inventory.add('ark', oreQty);
      notes.push(`아크광석+${oreQty}`);
    }

    if (monster.typeId === 'monster-ogre') {
      const roll = sampleDeterministicUnit(
        this.worldSeed,
        'ogre-mithril',
        tile.x,
        tile.y,
      );
      if (roll < OGRE_MITHRIL_DROP_CHANCE) {
        this.inventory.add('weapon-mithril-sword', 1);
        notes.push('미스릴검 획득!');
      }
    }

    if (monster.typeId === 'monster-elder-ogre') {
      const roll = sampleDeterministicUnit(
        this.worldSeed,
        'elder-ogre-mithril',
        tile.x,
        tile.y,
      );
      if (roll < ELDER_OGRE_MITHRIL_DROP_CHANCE) {
        this.inventory.add('weapon-mithril-sword', 1);
        notes.push('미스릴검 획득!');
      }
      const oreRoll = sampleDeterministicUnit(
        this.worldSeed,
        'elder-ogre-ark',
        tile.x,
        tile.y,
      );
      const oreQty = 1 + Math.floor(oreRoll * 6); // 1~6
      this.inventory.add('ark', oreQty);
      notes.push(`아크광석+${oreQty}`);
    }

    if (monster.typeId === 'monster-twinhead-ogre') {
      const roll = sampleDeterministicUnit(
        this.worldSeed,
        'twinhead-ogre-orichalcum',
        tile.x,
        tile.y,
      );
      if (roll < TWINHEAD_OGRE_ORICHALCUM_DROP_CHANCE) {
        this.inventory.add('weapon-orichalcum-sword', 1);
        notes.push('오리하르콘검 획득!');
      }
      const oreRoll = sampleDeterministicUnit(
        this.worldSeed,
        'twinhead-ogre-ark',
        tile.x,
        tile.y,
      );
      const oreQty = 2 + Math.floor(oreRoll * 7); // 2~8
      this.inventory.add('ark', oreQty);
      notes.push(`아크광석+${oreQty}`);
    }

    if (monster.typeId === 'monster-blood-ogre') {
      const roll = sampleDeterministicUnit(
        this.worldSeed,
        'blood-ogre-mithril',
        tile.x,
        tile.y,
      );
      if (roll < BLOOD_OGRE_MITHRIL_DROP_CHANCE) {
        this.inventory.add('weapon-mithril-sword', 1);
        notes.push('미스릴검 획득!');
      }
    }

    if (monster.typeId === 'monster-thunder-ogre') {
      const roll = sampleDeterministicUnit(
        this.worldSeed,
        'thunder-ogre-mithril',
        tile.x,
        tile.y,
      );
      if (roll < THUNDER_OGRE_MITHRIL_DROP_CHANCE) {
        this.inventory.add('weapon-mithril-sword', 1);
        notes.push('미스릴검 획득!');
      }
      const oreRoll = sampleDeterministicUnit(
        this.worldSeed,
        'thunder-ogre-ark',
        tile.x,
        tile.y,
      );
      const oreQty = 1 + Math.floor(oreRoll * 7); // 1~7
      this.inventory.add('ark', oreQty);
      notes.push(`아크광석+${oreQty}`);
    }

    if (monster.typeId === 'monster-ogre-king') {
      const roll = sampleDeterministicUnit(
        this.worldSeed,
        'ogre-king-orichalcum',
        tile.x,
        tile.y,
      );
      if (roll < OGRE_KING_ORICHALCUM_DROP_CHANCE) {
        this.inventory.add('weapon-orichalcum-sword', 1);
        notes.push('오리하르콘검 획득!');
      }
      const oreRoll = sampleDeterministicUnit(
        this.worldSeed,
        'ogre-king-ark',
        tile.x,
        tile.y,
      );
      const oreQty = 2 + Math.floor(oreRoll * 8); // 2~9
      this.inventory.add('ark', oreQty);
      notes.push(`아크광석+${oreQty}`);
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

  private getCamera(): Camera | null {
    return this.cameraNode?.getComponent(Camera) ?? null;
  }

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

    const harvest = this.findHarvestAtUi(uiLocation);
    if (harvest) return harvest.tile;

    return this.toWorldTile(uiLocation);
  }

  private findBlacksmithAtUi(
    uiLocation: Vec2,
  ): { entity: GeneratedContent; tile: WorldTileCoordinate } | null {
    const camera = this.getCamera();
    if (!this.chunkManager || !camera) return null;
    const hit = this.chunkManager.findBlacksmithAtUiLocation(
      { x: uiLocation.x, y: uiLocation.y },
      camera,
    );
    if (hit) this.pushDebugBounds(hit.bounds);
    return hit;
  }

  private findTeleporterAtUi(
    uiLocation: Vec2,
  ): { entity: GeneratedContent; tile: WorldTileCoordinate } | null {
    const camera = this.getCamera();
    if (!this.chunkManager || !camera) return null;
    const hit = this.chunkManager.findTeleporterAtUiLocation(
      { x: uiLocation.x, y: uiLocation.y },
      camera,
    );
    if (hit) this.pushDebugBounds(hit.bounds);
    return hit;
  }

  private findMerchantAtUi(
    uiLocation: Vec2,
  ): { entity: GeneratedContent; tile: WorldTileCoordinate } | null {
    const camera = this.getCamera();
    if (!this.chunkManager || !camera) return null;
    const hit = this.chunkManager.findMerchantAtUiLocation(
      { x: uiLocation.x, y: uiLocation.y },
      camera,
    );
    if (hit) this.pushDebugBounds(hit.bounds);
    return hit;
  }

  private findBankerAtUi(
    uiLocation: Vec2,
  ): { entity: GeneratedContent; tile: WorldTileCoordinate } | null {
    const camera = this.getCamera();
    if (!this.chunkManager || !camera) return null;
    const hit = this.chunkManager.findBankerAtUiLocation(
      { x: uiLocation.x, y: uiLocation.y },
      camera,
    );
    if (hit) this.pushDebugBounds(hit.bounds);
    return hit;
  }

  private findMonsterAtUi(
    uiLocation: Vec2,
  ): { entity: GeneratedContent; tile: WorldTileCoordinate } | null {
    const camera = this.getCamera();
    if (!this.chunkManager || !camera) return null;
    const hit = this.chunkManager.findMonsterAtUiLocation(
      { x: uiLocation.x, y: uiLocation.y },
      camera,
    );
    if (hit) this.pushDebugBounds(hit.bounds);
    return hit;
  }

  private findHarvestAtUi(
    uiLocation: Vec2,
  ): { tile: WorldTileCoordinate } | null {
    const camera = this.getCamera();
    if (!this.chunkManager || !camera || !this.playerNode) return null;
    const hit = this.chunkManager.findHarvestableTileAtUiLocation(
      { x: uiLocation.x, y: uiLocation.y },
      camera,
      this.playerNode.position.x,
      this.playerNode.position.y,
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
    if (hit) this.pushDebugBounds(hit.bounds);
    return hit;
  }

  private debugBoundsBuffer: UiBounds[] = [];

  private pushDebugBounds(bounds: UiBounds): void {
    if (!this.hitDebug) return;
    this.debugBoundsBuffer.push(bounds);
  }

  private flushHitDebug(uiLocation: Vec2 | null): void {
    if (!this.hitDebug) return;
    const camera = this.getCamera();
    const hitBounds = [...this.debugBoundsBuffer];
    const nearby: UiBounds[] = [];
    if (camera && this.chunkManager) {
      // sprite 와 AABB 겹침 검증용 — 로드된 엔티티 UI bounds
      for (const bounds of this.chunkManager.collectEntityUiBounds(camera)) {
        nearby.push(bounds);
      }
    }
    const touch = uiLocation
      ? { x: uiLocation.x, y: uiLocation.y }
      : null;
    this.hitDebug.setFrame({
      touch,
      bounds: nearby,
      hits: hitBounds.map((bounds) => ({
        bounds,
        success: !!touch
          && touch.x >= bounds.minX - 2
          && touch.x <= bounds.maxX + 2
          && touch.y >= bounds.minY - 2
          && touch.y <= bounds.maxY + 2,
      })),
    });
    this.debugBoundsBuffer = [];
  }

  /**
   * @deprecated 월드 히트는 visualNode UI AABB (`world-ui-hit`) 사용.
   * 레거시 WorldPixel 발자국용 — 호출처 없음, 임시 보관.
   */
  private getMonsterDisplaySize(
    typeId: string,
  ): { width: number; height: number } | null {
    const fromAtlas = this.monsterAtlas?.isReady()
      ? this.monsterAtlas.getDisplaySize(typeId)
      : null;
    if (fromAtlas) return fromAtlas;
    return FALLBACK_MONSTER_DISPLAY_SIZE[typeId] ?? null;
  }

  /**
   * 빈 바닥 타일용 — 청크 렌더 transform 으로 UI AABB 검색.
   */
  private toWorldTile(uiLocation: Vec2): WorldTileCoordinate {
    const camera = this.getCamera();
    const player = this.playerNode;
    if (!this.chunkManager || !camera || !player) {
      return { x: 0, y: 0 };
    }
    const hit = this.chunkManager.findTileAtUiLocation(
      { x: uiLocation.x, y: uiLocation.y },
      camera,
      player.position.x,
      player.position.y,
    );
    if (hit) {
      this.pushDebugBounds(hit.bounds);
      return hit.tile;
    }
    return {
      x: Math.floor(player.position.x / TILE_SIZE_PIXELS),
      y: Math.floor(player.position.y / TILE_SIZE_PIXELS),
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
