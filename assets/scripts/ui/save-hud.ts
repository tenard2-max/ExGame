import {
  _decorator,
  Color,
  Component,
  EventKeyboard,
  EventMouse,
  EventTouch,
  Graphics,
  Input,
  input,
  KeyCode,
  Label,
  Layers,
  Node,
  UITransform,
  Vec2,
} from 'cc';

import type { SaveSessionController } from '../save/save-session-controller';
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  hitTestSaveButton,
  SAVE_BUTTON_GAP,
  SAVE_BUTTON_HEIGHT,
  SAVE_BUTTON_WIDTH,
  SAVE_MARGIN,
} from './hud-layout';

const { ccclass } = _decorator;

interface SaveButton {
  readonly keyCode: KeyCode;
  readonly label: string;
  readonly action: () => void;
}

/**
 * 우측 상단 세이브 버튼과 단축키(S/L/E/I)를 제공합니다.
 * 마우스 클릭과 터치 탭으로도 동일하게 동작합니다.
 */
@ccclass('SaveHud')
export class SaveHud extends Component {
  private readonly pointerLocation = new Vec2();
  private cameraNode: Node | null = null;
  private saveSession: SaveSessionController | null = null;
  private buttons: SaveButton[] = [];

  configure(
    saveSession: SaveSessionController,
    cameraNode: Node,
  ): void {
    this.saveSession = saveSession;
    this.cameraNode = cameraNode;
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
    input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
  }

  protected onDisable(): void {
    input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
  }

  protected lateUpdate(): void {
    if (!this.cameraNode) return;
    const camera = this.cameraNode.position;
    this.node.setPosition(
      camera.x + DESIGN_WIDTH / 2 - SAVE_MARGIN,
      camera.y + DESIGN_HEIGHT / 2 - SAVE_MARGIN,
      0,
    );
  }

  private onKeyDown(event: EventKeyboard): void {
    const button = this.buttons.find(
      (entry) => entry.keyCode === event.keyCode,
    );
    button?.action();
  }

  private onMouseUp(event: EventMouse): void {
    if (event.getButton() !== EventMouse.BUTTON_LEFT) return;
    event.getUILocation(this.pointerLocation);
    this.activateAtPointer();
  }

  private onTouchEnd(event: EventTouch): void {
    event.getUILocation(this.pointerLocation);
    this.activateAtPointer();
  }

  private activateAtPointer(): void {
    const index = hitTestSaveButton(
      this.pointerLocation.x,
      this.pointerLocation.y,
    );
    if (index !== null) this.buttons[index]?.action();
  }

  private buildButtons(): void {
    this.buttons.forEach((button, index) => {
      const buttonNode = new Node(`SaveButton${index}`);
      buttonNode.layer = Layers.Enum.UI_2D;
      this.node.addChild(buttonNode);
      buttonNode.setPosition(
        -SAVE_BUTTON_WIDTH / 2,
        -index * (SAVE_BUTTON_HEIGHT + SAVE_BUTTON_GAP) - SAVE_BUTTON_HEIGHT / 2,
      );
      buttonNode
        .addComponent(UITransform)
        .setContentSize(SAVE_BUTTON_WIDTH, SAVE_BUTTON_HEIGHT);

      const graphics = buttonNode.addComponent(Graphics);
      graphics.fillColor = new Color(28, 38, 52, 220);
      graphics.roundRect(
        -SAVE_BUTTON_WIDTH / 2,
        -SAVE_BUTTON_HEIGHT / 2,
        SAVE_BUTTON_WIDTH,
        SAVE_BUTTON_HEIGHT,
        10,
      );
      graphics.fill();
      graphics.strokeColor = new Color(120, 150, 180, 255);
      graphics.lineWidth = 2;
      graphics.roundRect(
        -SAVE_BUTTON_WIDTH / 2,
        -SAVE_BUTTON_HEIGHT / 2,
        SAVE_BUTTON_WIDTH,
        SAVE_BUTTON_HEIGHT,
        10,
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
