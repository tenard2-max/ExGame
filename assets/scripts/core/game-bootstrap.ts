import {
  _decorator,
  Camera,
  Color,
  Component,
  game,
  Graphics,
  Layers,
  Node,
  ResolutionPolicy,
  UITransform,
  view,
} from 'cc';

import { BgmPlaylistPlayer } from '../audio/bgm-playlist-player';
import { SfxPlayer } from '../audio/sfx-player';
import { DefaultContentGenerationPipeline } from '../content/default-content-pipeline';
import { GameBalanceSettings } from '../core/game-balance-settings';
import { UnifiedInput } from '../input/unified-input';
import { InventoryModel } from '../inventory/inventory-model';
import { BlockInteractionController } from '../player/block-interaction-controller';
import { CameraFollow } from '../player/camera-follow';
import { WorldPinchZoom } from '../player/world-pinch-zoom';
import { PlayerController } from '../player/player-controller';
import {
  PLAYER_COLLISION_HALF,
  PlayerSprite,
} from '../player/player-sprite';
import {
  getCharacterDefinition,
} from '../player/character-registry';
import { PlayerLowHealthFeedback } from '../player/player-low-health-feedback';
import { PlayerVisualMotion } from '../player/player-visual-motion';
import { PlayerStatsModel } from '../player/player-stats-model';
import type { PlayerState } from '../player/player-types';
import { IndexedDbSaveManager } from '../save/indexed-db-save-manager';
import {
  buildPlayerState,
  decodePlayerPosition,
} from '../save/player-state-codec';
import { DefaultSaveMigrationRegistry } from '../save/save-migration';
import { SaveSessionController } from '../save/save-session-controller';
import { SlotChunkDeltaStore } from '../save/slot-chunk-delta-store';
import type { SaveSlotId } from '../save/save-types';
import { DomCharacterSelectUi } from '../ui/dom-character-select-ui';
import { DomMobileControlsUi } from '../ui/dom-mobile-controls-ui';
import {
  DomSplashUi,
  SPLASH_MIN_DURATION_MS,
} from '../ui/dom-splash-ui';
import { DomTeleporterUi } from '../ui/dom-teleporter-ui';
import {
  isWorldHitDebugEnabled,
  WorldHitDebugOverlay,
} from '../ui/world-hit-debug-overlay';
import { isHitTraceEnabled } from '../world/world-ui-hit';
import { probeOreVisual } from '../world/hit-coord-probe';
import { DomBlacksmithUi } from '../ui/dom-blacksmith-ui';
import { DomMerchantUi } from '../ui/dom-merchant-ui';
import { initShellUi } from '../ui/mobile-shell';
import { DomBankerUi } from '../ui/dom-banker-ui';
import { HotbarHud } from '../ui/hotbar-hud';
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
} from '../ui/hud-layout';
import { InventoryHud } from '../ui/inventory-hud';
import { ItemAtlas } from '../ui/item-atlas';
import { LoadMenuHud } from '../ui/load-menu-hud';
import { PotionAtlas } from '../ui/potion-atlas';
import { PotionHud } from '../ui/potion-hud';
import { SaveHud } from '../ui/save-hud';
import { SettingsHud } from '../ui/settings-hud';
import { StatusHud } from '../ui/status-hud';
import { TooltipHud } from '../ui/tooltip-hud';
import { TeleportWaypointStore } from '../npc/teleport-waypoint-store';
import { GearInstanceStore } from '../npc/gear-instance-store';
import { BlacksmithService } from '../npc/blacksmith-service';
import { BankAccountStore } from '../npc/bank-account-store';
import { BankService } from '../npc/bank-service';
import { ChunkRenderer, CHUNK_SIZE_PIXELS, TILE_SIZE_PIXELS } from '../world/chunk-renderer';
import { NpcSpriteAtlas } from '../world/npc-sprite-atlas';
import { ChunkStreamingController } from '../world/chunk-streaming-controller';
import { DefaultWorldGenerator } from '../world/default-world-generator';
import { DefaultWorldGenerationPipeline } from '../world/default-world-pipeline';
import { DefaultSeedDeriver } from '../world/deterministic-random';
import { RuntimeChunkManager } from '../world/runtime-chunk-manager';
import { ContentAtlas } from '../world/content-atlas';
import { MonsterAtlas } from '../world/monster-atlas';
import { TileAtlas } from '../world/tile-atlas';

const { ccclass } = _decorator;

const DEFAULT_WORLD_SEED = '851294';
const DEFAULT_SLOT_ID: SaveSlotId = 'slot-1';
const PLAYER_SPAWN_X = 256;
const PLAYER_SPAWN_Y = 256;
/** 목표 프레임레이트 상한 (모니터 Hz·성능에 따라 실제 FPS는 더 낮을 수 있음). */
const TARGET_FRAME_RATE = 144;

@ccclass('GameBootstrap')
export class GameBootstrap extends Component {
  protected start(): void {
    initShellUi();
    game.frameRate = TARGET_FRAME_RATE;
    view.setDesignResolutionSize(
      DESIGN_WIDTH,
      DESIGN_HEIGHT,
      ResolutionPolicy.SHOW_ALL,
    );
    // 타이틀 스플래시를 먼저 올려 부트 중에도 의무적으로 보이게 합니다.
    const splash = new DomSplashUi();
    splash.show();
    void this.bootstrap(splash).catch((error) => {
      console.error('[ExGame] bootstrap failed', error);
      void splash.waitMinimumThenHide(SPLASH_MIN_DURATION_MS);
    });
    // 부트 이후에 맞춰도 HUD는 lateUpdate로 카메라에 붙습니다.
    this.fitGameFrameToWindow();
    this.setupFullscreenMode();
  }

  /**
   * 빌드 산출물이 GameDiv를 2560×1440 고정 픽셀로 두어
   * 좁은 창에서는 스크롤해야 HUD(톱니)가 보입니다.
   * 창 크기에 맞춰 프레임을 줄여 한 화면에 전체가 보이게 합니다.
   */
  private frameFitBound = false;

  private fitGameFrameToWindow(): void {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    const resize = (): void => {
      try {
        const gameDiv = document.getElementById('GameDiv');
        if (!gameDiv) return;
        // 헤더/푸터는 제거됨. 전체 창에 맞춥니다.
        const fullscreen = Boolean(document.fullscreenElement)
          || document.documentElement.classList.contains('exgame-fullscreen');
        const margin = fullscreen ? 0 : 0;
        const width = Math.max(640, window.innerWidth - margin);
        const height = Math.max(360, window.innerHeight - margin);
        gameDiv.style.width = `${width}px`;
        gameDiv.style.height = `${height}px`;
        gameDiv.style.maxWidth = '100%';
        // Cocos 버전에 따라 없을 수 있어 안전하게 호출합니다.
        const resizable = view as unknown as {
          resizeWithBrowserSize?: (value: boolean) => void;
        };
        resizable.resizeWithBrowserSize?.(true);
        // GameDiv CSS(예: 911px)와 캔버스 버퍼(예: 874px)가 어긋나면
        // 세로로 늘어나 클릭 Y가 약 1타일 밀립니다. 프레임을 맞춥니다.
        const syncFrame = (): void => {
          const frameW = Math.max(1, Math.round(gameDiv.clientWidth));
          const frameH = Math.max(1, Math.round(gameDiv.clientHeight));
          view.setFrameSize(frameW, frameH);
          view.setDesignResolutionSize(
            DESIGN_WIDTH,
            DESIGN_HEIGHT,
            ResolutionPolicy.SHOW_ALL,
          );
        };
        syncFrame();
        requestAnimationFrame(syncFrame);
      } catch {
        // 프레임 맞춤 실패해도 게임 부트는 계속합니다.
      }
    };

    resize();
    if (this.frameFitBound) return;
    this.frameFitBound = true;
    window.addEventListener('resize', resize);
    document.addEventListener('fullscreenchange', () => {
      document.documentElement.classList.toggle(
        'exgame-fullscreen',
        Boolean(document.fullscreenElement),
      );
      resize();
    });
  }

  /**
   * 실행 시 전체화면을 시도합니다.
   * 브라우저 정책상 제스처가 필요하면 첫 클릭/키 입력에서 다시 시도합니다.
   */
  private setupFullscreenMode(): void {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const wantFullscreen = params.get('fullscreen') !== '0';
    if (!wantFullscreen) return;

    const request = (): void => {
      if (document.fullscreenElement) {
        this.fitGameFrameToWindow();
        return;
      }
      const target = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => void;
      };
      const fn = target.requestFullscreen?.bind(target)
        ?? target.webkitRequestFullscreen?.bind(target);
      if (!fn) return;
      try {
        const result = fn() as void | Promise<void>;
        if (result && typeof result.catch === 'function') {
          void result.catch(() => {
            // 제스처 대기
          });
        }
      } catch {
        // 무시하고 제스처에서 재시도
      }
      this.fitGameFrameToWindow();
    };

    // 앱 모드(--start-fullscreen)면 이미 창 전체화면일 수 있음.
    window.setTimeout(() => request(), 300);

    const onFirstGesture = (): void => {
      request();
      window.removeEventListener('pointerdown', onFirstGesture, true);
      window.removeEventListener('keydown', onFirstGesture, true);
    };
    window.addEventListener('pointerdown', onFirstGesture, true);
    window.addEventListener('keydown', onFirstGesture, true);
  }

  private async bootstrap(splash: DomSplashUi): Promise<void> {
    const inputController = this.node.addComponent(UnifiedInput);
    const worldNode = this.createWorld();
    const terrainRoot = this.createTerrainRoot(worldNode);
    const playerNode = this.createPlayer(worldNode);
    const inventory = new InventoryModel();
    const playerStats = new PlayerStatsModel();
    const teleportWaypoints = new TeleportWaypointStore();
    const gears = new GearInstanceStore();
    const bankAccount = new BankAccountStore();
    const blacksmithService = new BlacksmithService(inventory, gears, playerStats);
    const bankService = new BankService(inventory, playerStats, bankAccount);
    const teleporterUi = new DomTeleporterUi();
    const blacksmithUi = new DomBlacksmithUi();
    const merchantUi = new DomMerchantUi();
    const bankerUi = new DomBankerUi();
    const balance = new GameBalanceSettings();
    playerStats.bindBalance(balance);
    const bgmPlayer = new BgmPlaylistPlayer();
    await bgmPlayer.initialize();
    const sfxPlayer = new SfxPlayer();
    this.bindDebugListeners(inventory, playerStats, balance);

    const saveManager = new IndexedDbSaveManager(
      new DefaultSaveMigrationRegistry(),
    );
    const saveGame = await this.ensureSaveSlot(
      saveManager,
      inventory,
      playerStats,
    );
    const worldSeed = saveGame.world.seed;
    const restored = decodePlayerPosition(saveGame.player.position);
    playerNode.setPosition(restored.x, restored.y);
    inventory.loadFromState(saveGame.player.inventory);
    playerStats.loadFromStats(saveGame.player.stats);
    teleportWaypoints.loadFromState(saveGame.player.teleportWaypoints);
    gears.loadFromState(saveGame.player.gearState);
    bankAccount.loadFromState(saveGame.player.bankState);
    // 매 부팅마다 장비를 100개로 채우지 않음. 빈 인벤(신규)일 때만 초급 포션 10개.
    if (inventory.listOwnedStacks().length === 0) {
      inventory.ensureStarterGear(10);
    }

    const generator = new DefaultWorldGenerator(
      new DefaultSeedDeriver(),
      new DefaultWorldGenerationPipeline(),
      new DefaultContentGenerationPipeline(
        balance,
        () => playerStats.getLevel(),
      ),
    );

    const tileAtlas = new TileAtlas();
    try {
      await tileAtlas.load('./tiles');
    } catch (error) {
      console.warn('[ExGame] Tile atlas load failed, using flat colors.', error);
    }

    const monsterAtlas = new MonsterAtlas();
    try {
      await monsterAtlas.load('./monsters');
    } catch (error) {
      console.warn('[ExGame] Monster atlas load failed, using dots.', error);
    }

    const contentAtlas = new ContentAtlas();
    try {
      await contentAtlas.load('./content');
    } catch (error) {
      console.warn('[ExGame] Content atlas load failed, using shapes.', error);
    }

    const npcAtlas = new NpcSpriteAtlas();
    try {
      await npcAtlas.load('./npcs');
    } catch (error) {
      console.warn('[ExGame] NPC sprite load failed, using placeholder.', error);
    }

    const potionAtlas = new PotionAtlas();
    try {
      await potionAtlas.load('./potions');
    } catch (error) {
      console.warn('[ExGame] Potion atlas load failed, text-only menu.', error);
    }

    const itemAtlas = new ItemAtlas();
    try {
      await itemAtlas.load('./items');
    } catch (error) {
      console.warn('[ExGame] Item atlas load failed, text-only inventory.', error);
    }

    const playerSprite = new PlayerSprite();
    const initialCharacterId = getCharacterDefinition(
      saveGame.player.characterId,
    ).id;
    try {
      await playerSprite.load(getCharacterDefinition(initialCharacterId).playUrl);
      playerSprite.applyTo(playerNode);
      playerNode
        .addComponent(PlayerLowHealthFeedback)
        .configure(playerStats, playerSprite);
    } catch (error) {
      console.warn('[ExGame] Player sprite load failed, using placeholder.', error);
      this.drawPlayerPlaceholder(playerNode);
    }

    const deltaStore = new SlotChunkDeltaStore(saveManager, DEFAULT_SLOT_ID);
    const chunkManager = new RuntimeChunkManager(
      terrainRoot,
      worldSeed,
      generator,
      new ChunkRenderer(
        tileAtlas.isReady() ? tileAtlas : null,
        monsterAtlas.isReady() ? monsterAtlas : null,
        contentAtlas.isReady() ? contentAtlas : null,
        npcAtlas.isReady() ? npcAtlas : null,
      ),
      deltaStore,
    );
    const playerController = playerNode
      .addComponent(PlayerController);
    playerController.configure(
      inputController,
      () => chunkManager.getSolidColliders(),
      balance.get('moveSpeed'),
    );
    playerNode
      .addComponent(PlayerVisualMotion)
      .configure(playerController);
    const syncMoveSpeedFromGear = (): void => {
      const base = balance.get('moveSpeed');
      const bonusPct = gears.getEquippedMoveSpeedPercentBonus();
      playerController.setMoveSpeed(base * (1 + bonusPct / 100));
    };
    gears.addListener(() => syncMoveSpeedFromGear());
    balance.addListener(() => syncMoveSpeedFromGear());
    syncMoveSpeedFromGear();
    worldNode
      .addComponent(ChunkStreamingController)
      .configure(playerNode, chunkManager);

    const cameraNode = this.node.getChildByName('Camera');
    if (!cameraNode) return;

    const hotbarNode = new Node('HotbarHud');
    hotbarNode.layer = Layers.Enum.UI_2D;
    this.node.addChild(hotbarNode);
    hotbarNode.addComponent(HotbarHud).configure(inventory, cameraNode);

    const statusNode = new Node('StatusHud');
    statusNode.layer = Layers.Enum.UI_2D;
    this.node.addChild(statusNode);
    const statusHud = statusNode.addComponent(StatusHud);
    statusHud.configure(
      playerStats,
      cameraNode,
      DESIGN_WIDTH,
      DESIGN_HEIGHT,
    );

    const characterSelectUi = new DomCharacterSelectUi();
    const saveSession = this.node.addComponent(SaveSessionController);
    saveSession.configure({
      saveManager,
      deltaStore,
      slotId: DEFAULT_SLOT_ID,
      playerNode,
      chunkManager,
      inventory,
      playerStats,
      showMessage: (message) => statusHud.showMessage(message),
      characterSelectUi,
      initialCharacterId,
      teleportWaypoints,
      gears,
      bankAccount,
      applyCharacter: async (characterId) => {
        const definition = getCharacterDefinition(characterId);
        await playerSprite.load(definition.playUrl);
        playerSprite.applyTo(playerNode);
      },
    });

    const settingsHudNode = new Node('SettingsHud');
    settingsHudNode.layer = Layers.Enum.UI_2D;
    this.node.addChild(settingsHudNode);
    settingsHudNode
      .addComponent(SettingsHud)
      .configure(balance, cameraNode, bgmPlayer, sfxPlayer);

    // 설정 스택 DOM이 먼저 있어야 모바일에서 저장 버튼이 오디오 아래로 붙습니다.
    const saveHudNode = new Node('SaveHud');
    saveHudNode.layer = Layers.Enum.UI_2D;
    this.node.addChild(saveHudNode);
    saveHudNode.addComponent(SaveHud).configure(saveSession);

    const loadMenuNode = new Node('LoadMenuHud');
    loadMenuNode.layer = Layers.Enum.UI_2D;
    this.node.addChild(loadMenuNode);
    loadMenuNode
      .addComponent(LoadMenuHud)
      .configure(saveSession, cameraNode);

    const potionHudNode = new Node('PotionHud');
    potionHudNode.layer = Layers.Enum.UI_2D;
    this.node.addChild(potionHudNode);
    const potionHud = potionHudNode.addComponent(PotionHud);
    potionHud.configure(
      inventory,
      playerStats,
      cameraNode,
      (message) => statusHud.showMessage(message),
      potionAtlas.isReady() ? potionAtlas : null,
      balance,
    );

    const tooltipNode = new Node('TooltipHud');
    tooltipNode.layer = Layers.Enum.UI_2D;
    this.node.addChild(tooltipNode);
    const tooltipHud = tooltipNode.addComponent(TooltipHud);
    tooltipHud.configure(cameraNode);

    const inventoryHudNode = new Node('InventoryHud');
    inventoryHudNode.layer = Layers.Enum.UI_2D;
    this.node.addChild(inventoryHudNode);
    const inventoryHud = inventoryHudNode.addComponent(InventoryHud);
    inventoryHud.configure(
      inventory,
      cameraNode,
      itemAtlas.isReady() ? itemAtlas : null,
      (message) => statusHud.showMessage(message),
      gears,
      tooltipHud,
    );

    // 다른 HUD보다 위에 그려 톱니가 가려지지 않게 합니다.
    settingsHudNode.setSiblingIndex(this.node.children.length - 1);

    cameraNode.addComponent(CameraFollow).configure(playerNode);
    const pinchZoom = this.node.addComponent(WorldPinchZoom);
    pinchZoom.configure(worldNode, inputController);

    const mobileControls = new DomMobileControlsUi();
    mobileControls.mount(
      inputController,
      () => inventoryHud.toggleFromUi(),
      () => potionHud.toggleFromUi(),
      () => pinchZoom.adjustZoom(0.2),
      () => pinchZoom.adjustZoom(-0.2),
    );

    this.node.addComponent(BlockInteractionController).configure(
      inputController,
      playerNode,
      cameraNode,
      chunkManager,
      inventory,
      playerStats,
      balance,
      worldSeed,
      tooltipHud,
      monsterAtlas.isReady() ? monsterAtlas : null,
      (message) => statusHud.showMessage(message),
      () => playerNode.setPosition(PLAYER_SPAWN_X, PLAYER_SPAWN_Y),
      sfxPlayer,
      () => {
        teleporterUi.open({
          inventory,
          playerStats,
          waypoints: teleportWaypoints,
          showMessage: (message) => statusHud.showMessage(message),
          getPlayerWorldTile: () => {
            const x = Math.floor(playerNode.position.x / TILE_SIZE_PIXELS);
            const y = Math.floor(playerNode.position.y / TILE_SIZE_PIXELS);
            return { x, y };
          },
          teleportToWorldTile: (tileX, tileY) => {
            const worldX = tileX * TILE_SIZE_PIXELS + TILE_SIZE_PIXELS / 2;
            const worldY = tileY * TILE_SIZE_PIXELS + TILE_SIZE_PIXELS / 2;
            playerNode.setPosition(worldX, worldY);
            void chunkManager.syncAround({
              x: Math.floor(worldX / CHUNK_SIZE_PIXELS),
              y: Math.floor(worldY / CHUNK_SIZE_PIXELS),
            });
          },
        });
      },
      () => {
        blacksmithUi.open({
          inventory,
          playerStats,
          gears,
          service: blacksmithService,
          waypoints: teleportWaypoints,
          showMessage: (message) => statusHud.showMessage(message),
          getPlayerWorldTile: () => {
            const x = Math.floor(playerNode.position.x / TILE_SIZE_PIXELS);
            const y = Math.floor(playerNode.position.y / TILE_SIZE_PIXELS);
            return { x, y };
          },
          onGearChanged: () => syncMoveSpeedFromGear(),
        });
      },
      gears,
      () => {
        merchantUi.open({
          inventory,
          playerStats,
          showMessage: (message) => statusHud.showMessage(message),
        });
      },
      () => {
        bankerUi.open({
          inventory,
          playerStats,
          account: bankAccount,
          service: bankService,
          showMessage: (message) => statusHud.showMessage(message),
          getPlayerWorldTile: () => {
            const x = Math.floor(playerNode.position.x / TILE_SIZE_PIXELS);
            const y = Math.floor(playerNode.position.y / TILE_SIZE_PIXELS);
            return { x, y };
          },
          teleportToWorldTile: (tileX, tileY) => {
            const worldX = tileX * TILE_SIZE_PIXELS + TILE_SIZE_PIXELS / 2;
            const worldY = tileY * TILE_SIZE_PIXELS + TILE_SIZE_PIXELS / 2;
            playerNode.setPosition(worldX, worldY);
            void chunkManager.syncAround({
              x: Math.floor(worldX / CHUNK_SIZE_PIXELS),
              y: Math.floor(worldY / CHUNK_SIZE_PIXELS),
            });
          },
        });
      },
      worldNode,
    );

    const interaction = this.node.getComponent(BlockInteractionController);
    // hitDebug 시각화: URL/localStorage 또는 hitTrace 임시 ON 시 오버레이 부착
    if ((isWorldHitDebugEnabled() || isHitTraceEnabled()) && interaction) {
      const debugNode = new Node('WorldHitDebugOverlay');
      debugNode.layer = Layers.Enum.UI_2D;
      this.node.addChild(debugNode);
      debugNode.addComponent(UITransform).setContentSize(4, 4);
      debugNode.setSiblingIndex(this.node.children.length - 1);
      const overlay = debugNode.addComponent(WorldHitDebugOverlay);
      overlay.configure(cameraNode);
      interaction.setHitDebugOverlay(overlay);
      console.info(
        '[ExGame] hitDebug/hitTrace ON — console: [ExGame:hitTrace], '
        + 'screen: green AABB / red touch. Use F12. '
        + 'URL tip: ?offline=1&hitDebug=1',
      );
    }

    const firstSample = generator.generateChunk(worldSeed, { x: 0, y: 0 });
    const secondSample = generator.generateChunk(worldSeed, { x: 0, y: 0 });
    const debugGlobal = globalThis as typeof globalThis & {
      __EXGAME_DEBUG__?: Record<string, unknown>;
    };
    debugGlobal.__EXGAME_DEBUG__ = {
      ...debugGlobal.__EXGAME_DEBUG__,
      deterministicMatch: JSON.stringify(firstSample)
        === JSON.stringify(secondSample),
      worldSeed,
      chunkManager,
      saveManager,
      slotId: DEFAULT_SLOT_ID,
      balance,
      gears: gears.toState(),
      bgm: bgmPlayer.getSnapshot(),
      pinchZoom,
      worldNode,
      playerNode,
      cameraNode,
      probeHit: (zoom?: number) => {
        const camera = cameraNode.getComponent(Camera);
        if (!camera) return { error: 'no camera' };
        if (typeof zoom === 'number') pinchZoom.setZoom(zoom);
        const found = chunkManager.findNearestOreVisual(
          playerNode.position.x,
          playerNode.position.y,
        );
        if (!found) return { error: 'no ore near player', zoom: pinchZoom.getZoom() };
        return probeOreVisual(
          camera,
          found.visual,
          found.typeId,
          pinchZoom.getZoom(),
        );
      },
      setZoom: (z: number) => pinchZoom.setZoom(z),
      getZoom: () => pinchZoom.getZoom(),
      openSettings: () => {
        const settings = this.node
          .getChildByName('SettingsHud')
          ?.getComponent(SettingsHud);
        settings?.setOpen(true);
      },
    };
    gears.addListener(() => {
      debugGlobal.__EXGAME_DEBUG__ = {
        ...debugGlobal.__EXGAME_DEBUG__,
        gears: gears.toState(),
      };
    });
    bgmPlayer.addListener((snapshot) => {
      debugGlobal.__EXGAME_DEBUG__ = {
        ...debugGlobal.__EXGAME_DEBUG__,
        bgm: snapshot,
      };
    });

    // 부트가 빨라도 최소 4초 유지 후, 클릭해야 게임으로 넘어갑니다.
    await splash.waitMinimumThenHide(SPLASH_MIN_DURATION_MS);
  }

  private async ensureSaveSlot(
    saveManager: IndexedDbSaveManager,
    inventory: InventoryModel,
    playerStats: PlayerStatsModel,
  ) {
    const existing = await saveManager.loadSlot(DEFAULT_SLOT_ID);
    if (existing) return existing;

    const initialPlayer = createInitialPlayerState(inventory, playerStats);
    return saveManager.createSlot({
      slotId: DEFAULT_SLOT_ID,
      worldSeed: DEFAULT_WORLD_SEED,
      initialPlayer,
    });
  }

  private bindDebugListeners(
    inventory: InventoryModel,
    playerStats: PlayerStatsModel,
    balance: GameBalanceSettings,
  ): void {
    inventory.addListener((model) => {
      const debugGlobal = globalThis as typeof globalThis & {
        __EXGAME_DEBUG__?: Record<string, unknown>;
      };
      debugGlobal.__EXGAME_DEBUG__ = {
        ...debugGlobal.__EXGAME_DEBUG__,
        inventory: model.toState(),
        selectedHotbarIndex: model.getSelectedHotbarIndex(),
      };
    });
    playerStats.addListener((model) => {
      const debugGlobal = globalThis as typeof globalThis & {
        __EXGAME_DEBUG__?: Record<string, unknown>;
      };
      debugGlobal.__EXGAME_DEBUG__ = {
        ...debugGlobal.__EXGAME_DEBUG__,
        playerStats: model.toStats(),
      };
    });
    balance.addListener((model) => {
      const debugGlobal = globalThis as typeof globalThis & {
        __EXGAME_DEBUG__?: Record<string, unknown>;
      };
      debugGlobal.__EXGAME_DEBUG__ = {
        ...debugGlobal.__EXGAME_DEBUG__,
        balance: model.getSnapshot(),
      };
    });
  }

  private createWorld(): Node {
    const worldNode = new Node('World');
    worldNode.layer = Layers.Enum.UI_2D;
    this.node.addChild(worldNode);
    const ui = worldNode.addComponent(UITransform);
    ui.setAnchorPoint(0, 0);
    ui.setContentSize(65536, 65536);
    return worldNode;
  }

  private createTerrainRoot(worldNode: Node): Node {
    const terrainRoot = new Node('Terrain');
    terrainRoot.layer = Layers.Enum.UI_2D;
    worldNode.addChild(terrainRoot);
    return terrainRoot;
  }

  private createPlayer(worldNode: Node): Node {
    const playerNode = new Node('Player');
    playerNode.layer = Layers.Enum.UI_2D;
    worldNode.addChild(playerNode);
    playerNode.setPosition(PLAYER_SPAWN_X, PLAYER_SPAWN_Y);
    const size = PLAYER_COLLISION_HALF * 2;
    playerNode.addComponent(UITransform).setContentSize(size, size);
    return playerNode;
  }

  /** 스프라이트 로드 실패 시 기존 초록 박스를 그립니다. */
  private drawPlayerPlaceholder(playerNode: Node): void {
    const half = PLAYER_COLLISION_HALF;
    const size = half * 2;
    const graphics = playerNode.addComponent(Graphics);
    graphics.fillColor = new Color(65, 220, 150, 255);
    graphics.roundRect(-half, -half, size, size, 8);
    graphics.fill();
    graphics.strokeColor = new Color(225, 255, 245, 255);
    graphics.lineWidth = 3;
    graphics.roundRect(-half, -half, size, size, 8);
    graphics.stroke();
  }
}

function createInitialPlayerState(
  inventory: InventoryModel,
  playerStats: PlayerStatsModel,
): PlayerState {
  return buildPlayerState(
    PLAYER_SPAWN_X,
    PLAYER_SPAWN_Y,
    inventory,
    playerStats,
    getCharacterDefinition(undefined).id,
  );
}
