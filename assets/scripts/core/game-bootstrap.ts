import {
  _decorator,
  Color,
  Component,
  Graphics,
  Layers,
  Node,
  Rect,
  ResolutionPolicy,
  UITransform,
  view,
} from 'cc';

import { UnifiedInput } from '../input/unified-input';
import { CameraFollow } from '../player/camera-follow';
import { PlayerController } from '../player/player-controller';

const { ccclass } = _decorator;

const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;

const DEMO_COLLIDERS: ReadonlyArray<Rect> = [
  new Rect(180, -80, 180, 80),
  new Rect(-420, 180, 240, 64),
  new Rect(-120, -360, 80, 220),
];

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
    const playerNode = this.createPlayer(worldNode);
    const playerController = playerNode.addComponent(PlayerController);
    playerController.configure(inputController, DEMO_COLLIDERS);

    const cameraNode = this.node.getChildByName('Camera');
    cameraNode?.addComponent(CameraFollow).configure(playerNode);
  }

  private createWorld(): Node {
    const worldNode = new Node('World');
    worldNode.layer = Layers.Enum.UI_2D;
    this.node.addChild(worldNode);
    worldNode.addComponent(UITransform).setContentSize(4096, 4096);

    const graphics = worldNode.addComponent(Graphics);
    this.drawGrid(graphics);
    this.drawObstacles(graphics);
    return worldNode;
  }

  private createPlayer(worldNode: Node): Node {
    const playerNode = new Node('Player');
    playerNode.layer = Layers.Enum.UI_2D;
    worldNode.addChild(playerNode);
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

  private drawGrid(graphics: Graphics): void {
    graphics.strokeColor = new Color(45, 58, 72, 255);
    graphics.lineWidth = 1;

    for (let coordinate = -2048; coordinate <= 2048; coordinate += 64) {
      graphics.moveTo(coordinate, -2048);
      graphics.lineTo(coordinate, 2048);
      graphics.moveTo(-2048, coordinate);
      graphics.lineTo(2048, coordinate);
    }
    graphics.stroke();
  }

  private drawObstacles(graphics: Graphics): void {
    graphics.fillColor = new Color(120, 92, 70, 255);
    graphics.strokeColor = new Color(190, 150, 105, 255);
    graphics.lineWidth = 3;

    for (const collider of DEMO_COLLIDERS) {
      graphics.roundRect(
        collider.x,
        collider.y,
        collider.width,
        collider.height,
        10,
      );
      graphics.fill();
      graphics.roundRect(
        collider.x,
        collider.y,
        collider.width,
        collider.height,
        10,
      );
      graphics.stroke();
    }
  }
}
