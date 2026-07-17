import {
  _decorator,
  Color,
  Component,
  EventKeyboard,
  Graphics,
  Input,
  input,
  KeyCode,
  Label,
  Layers,
  Node,
  UITransform,
} from 'cc';

import type { SaveSessionController } from '../save/save-session-controller';

const { ccclass } = _decorator;

const BUTTON_WIDTH = 120;
const BUTTON_HEIGHT = 40;
const BUTTON_GAP = 10;
const MARGIN = 18;

interface SaveButton {
  readonly keyCode: KeyCode;
  readonly label: string;
  readonly action: () => void;
}

/**
 * 우측 상단 세이브 버튼과 단축키(S/L/E/I)를 제공합니다.
 * 월드보다 늦게 그리도록 Canvas 마지막 자식으로 두고 카메라를 따라갑니다.
 */
@ccclass('SaveHud')
export class SaveHud extends Component {
  private cameraNode: Node | null = null;
  private saveSession: SaveSessionController | null = null;
  private offsetX = 0;
  private offsetY = 0;
  private buttons: SaveButton[] = [];

  configure(
    saveSession: SaveSessionController,
    cameraNode: Node,
    designWidth: number,
    designHeight: number,
  ): void {
    this.saveSession = saveSession;
    this.cameraNode = cameraNode;
    this.offsetX = designWidth / 2 - MARGIN;
    this.offsetY = designHeight / 2 - MARGIN;
    this.buttons = [
      {
        keyCode: KeyCode.KEY_S,
        label: 'S 저장',
        action: () => void this.saveSession?.saveNow(true),
      },
      {
        keyCode: KeyCode.KEY_L,
        label: 'L 불러오기',
        action: () => void this.saveSession?.loadNow(),
      },
      {
        keyCode: KeyCode.KEY_E,
        label: 'E 내보내기',
        action: () => void this.saveSession?.exportNow(),
      },
      {
        keyCode: KeyCode.KEY_I,
        label: 'I 가져오기',
        action: () => void this.saveSession?.importNow(),
      },
    ];
    this.buildButtons();
  }

  protected onEnable(): void {
    input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
  }

  protected onDisable(): void {
    input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
  }

  protected lateUpdate(): void {
    if (!this.cameraNode) return;
    const camera = this.cameraNode.position;
    this.node.setPosition(
      camera.x + this.offsetX,
      camera.y + this.offsetY,
      0,
    );
  }

  private onKeyDown(event: EventKeyboard): void {
    const button = this.buttons.find(
      (entry) => entry.keyCode === event.keyCode,
    );
    button?.action();
  }

  private buildButtons(): void {
    this.buttons.forEach((button, index) => {
      const buttonNode = new Node(`SaveButton${index}`);
      buttonNode.layer = Layers.Enum.UI_2D;
      this.node.addChild(buttonNode);
      buttonNode.setPosition(
        -BUTTON_WIDTH / 2,
        -index * (BUTTON_HEIGHT + BUTTON_GAP) - BUTTON_HEIGHT / 2,
      );
      buttonNode
        .addComponent(UITransform)
        .setContentSize(BUTTON_WIDTH, BUTTON_HEIGHT);

      const graphics = buttonNode.addComponent(Graphics);
      graphics.fillColor = new Color(28, 38, 52, 220);
      graphics.roundRect(
        -BUTTON_WIDTH / 2,
        -BUTTON_HEIGHT / 2,
        BUTTON_WIDTH,
        BUTTON_HEIGHT,
        8,
      );
      graphics.fill();
      graphics.strokeColor = new Color(120, 150, 180, 255);
      graphics.lineWidth = 2;
      graphics.roundRect(
        -BUTTON_WIDTH / 2,
        -BUTTON_HEIGHT / 2,
        BUTTON_WIDTH,
        BUTTON_HEIGHT,
        8,
      );
      graphics.stroke();

      const labelNode = new Node('Label');
      labelNode.layer = Layers.Enum.UI_2D;
      buttonNode.addChild(labelNode);
      const label = labelNode.addComponent(Label);
      label.fontSize = 18;
      label.lineHeight = 22;
      label.color = new Color(235, 245, 255, 255);
      label.string = button.label;
    });
  }
}
