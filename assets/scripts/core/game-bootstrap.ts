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

import { UnifiedInput } from '../input/unified-input';
import { DefaultContentGenerationPipeline } from '../content/default-content-pipeline';
import { CameraFollow } from '../player/camera-follow';
import { PlayerController } from '../player/player-controller';
import { ChunkRenderer } from '../world/chunk-renderer';
import { ChunkStreamingController } from '../world/chunk-streaming-controller';
import { DefaultWorldGenerator } from '../world/default-world-generator';
import { DefaultWorldGenerationPipeline } from '../world/default-world-pipeline';
import { DefaultSeedDeriver } from '../world/deterministic-random';
import {
  EmptyChunkDeltaStore,
  RuntimeChunkManager,
} from '../world/runtime-chunk-manager';

const { ccclass } = _decorator;

const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;
const DEFAULT_WORLD_SEED = '851294';

@ccclass('GameBootstrap')
export class GameBootstrap extends Component {
  protected start(): void {
    view.setDesignResolutionSize(
      DESIGN_WIDTH,
      DESIGN_HEIGHT,
      ResolutionPolicy.SHOW_ALL,
    );

    const inputController = this.node.addComponent(UnifiedInput);
    const worldNode = this.createWorld();
    const terrainRoot = this.createTerrainRoot(worldNode);
    const playerNode = this.createPlayer(worldNode);
    const generator = new DefaultWorldGenerator(
      new DefaultSeedDeriver(),
      new DefaultWorldGenerationPipeline(),
      new DefaultContentGenerationPipeline(),
    );
    const chunkManager = new RuntimeChunkManager(
      terrainRoot,
      DEFAULT_WORLD_SEED,
      generator,
      new ChunkRenderer(),
      new EmptyChunkDeltaStore(),
    );
    const playerController = playerNode.addComponent(PlayerController);
    playerController.configure(
      inputController,
      () => chunkManager.getSolidColliders(),
    );
    worldNode
      .addComponent(ChunkStreamingController)
      .configure(playerNode, chunkManager);

    const firstSample = generator.generateChunk(
      DEFAULT_WORLD_SEED,
      { x: 0, y: 0 },
    );
    const secondSample = generator.generateChunk(
      DEFAULT_WORLD_SEED,
      { x: 0, y: 0 },
    );
    const debugGlobal = globalThis as typeof globalThis & {
      __EXGAME_DEBUG__?: Record<string, unknown>;
    };
    debugGlobal.__EXGAME_DEBUG__ = {
      deterministicMatch: JSON.stringify(firstSample)
        === JSON.stringify(secondSample),
      worldSeed: DEFAULT_WORLD_SEED,
    };

    const cameraNode = this.node.getChildByName('Camera');
    cameraNode?.addComponent(CameraFollow).configure(playerNode);
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
    playerNode.setPosition(256, 256);
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
