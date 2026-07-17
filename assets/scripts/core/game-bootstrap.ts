import {
  _decorator,
  Color,
  Component,
  Graphics,
  Layers,
  Node,
  ResolutionPolicy,
  UITransform,
  view,
} from 'cc';

import { DefaultContentGenerationPipeline } from '../content/default-content-pipeline';
import { UnifiedInput } from '../input/unified-input';
import { InventoryModel } from '../inventory/inventory-model';
import { BlockInteractionController } from '../player/block-interaction-controller';
import { CameraFollow } from '../player/camera-follow';
import { PlayerController } from '../player/player-controller';
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
import { HotbarHud } from '../ui/hotbar-hud';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../ui/hud-layout';
import { SaveHud } from '../ui/save-hud';
import { StatusHud } from '../ui/status-hud';
import { ChunkRenderer } from '../world/chunk-renderer';
import { ChunkStreamingController } from '../world/chunk-streaming-controller';
import { DefaultWorldGenerator } from '../world/default-world-generator';
import { DefaultWorldGenerationPipeline } from '../world/default-world-pipeline';
import { DefaultSeedDeriver } from '../world/deterministic-random';
import { RuntimeChunkManager } from '../world/runtime-chunk-manager';

const { ccclass } = _decorator;

const DEFAULT_WORLD_SEED = '851294';
const DEFAULT_SLOT_ID: SaveSlotId = 'slot-1';
const PLAYER_SPAWN_X = 256;
const PLAYER_SPAWN_Y = 256;

@ccclass('GameBootstrap')
export class GameBootstrap extends Component {
  protected start(): void {
    view.setDesignResolutionSize(
      DESIGN_WIDTH,
      DESIGN_HEIGHT,
      ResolutionPolicy.SHOW_ALL,
    );
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    const inputController = this.node.addComponent(UnifiedInput);
    const worldNode = this.createWorld();
    const terrainRoot = this.createTerrainRoot(worldNode);
    const playerNode = this.createPlayer(worldNode);
    const inventory = new InventoryModel();
    const playerStats = new PlayerStatsModel();
    this.bindDebugListeners(inventory, playerStats);

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

    const generator = new DefaultWorldGenerator(
      new DefaultSeedDeriver(),
      new DefaultWorldGenerationPipeline(),
      new DefaultContentGenerationPipeline(),
    );
    const chunkManager = new RuntimeChunkManager(
      terrainRoot,
      worldSeed,
      generator,
      new ChunkRenderer(),
      new SlotChunkDeltaStore(saveManager, DEFAULT_SLOT_ID),
    );
    playerNode
      .addComponent(PlayerController)
      .configure(inputController, () => chunkManager.getSolidColliders());
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

    const saveSession = this.node.addComponent(SaveSessionController);
    saveSession.configure({
      saveManager,
      slotId: DEFAULT_SLOT_ID,
      playerNode,
      chunkManager,
      inventory,
      playerStats,
      showMessage: (message) => statusHud.showMessage(message),
    });

    const saveHudNode = new Node('SaveHud');
    saveHudNode.layer = Layers.Enum.UI_2D;
    this.node.addChild(saveHudNode);
    saveHudNode
      .addComponent(SaveHud)
      .configure(saveSession, cameraNode);

    this.node.addComponent(BlockInteractionController).configure(
      inputController,
      playerNode,
      cameraNode,
      chunkManager,
      inventory,
      playerStats,
      worldSeed,
      (message) => statusHud.showMessage(message),
      () => playerNode.setPosition(PLAYER_SPAWN_X, PLAYER_SPAWN_Y),
    );

    cameraNode.addComponent(CameraFollow).configure(playerNode);

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
    };
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
  }

  private createWorld(): Node {
    const worldNode = new Node('World');
    worldNode.layer = Layers.Enum.UI_2D;
    this.node.addChild(worldNode);
    worldNode.addComponent(UITransform).setContentSize(65536, 65536);
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
    playerNode.addComponent(UITransform).setContentSize(40, 40);

    const graphics = playerNode.addComponent(Graphics);
    graphics.fillColor = new Color(65, 220, 150, 255);
    graphics.roundRect(-20, -20, 40, 40, 8);
    graphics.fill();
    graphics.strokeColor = new Color(225, 255, 245, 255);
    graphics.lineWidth = 3;
    graphics.roundRect(-20, -20, 40, 40, 8);
    graphics.stroke();
    return playerNode;
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
  );
}
