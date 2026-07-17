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

import type { InventoryModel } from '../inventory/inventory-model';
import {
  getItemDefinition,
  HOTBAR_ITEM_IDS,
} from '../inventory/item-registry';
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  getHotbarCenterY,
  getHotbarSlotCenterX,
  hitTestHotbarSlot,
  HOTBAR_SLOT_SIZE,
} from './hud-layout';

const { ccclass } = _decorator;

const SLOT_KEY_CODES: ReadonlyArray<KeyCode> = [
  KeyCode.DIGIT_1,
  KeyCode.DIGIT_2,
  KeyCode.DIGIT_3,
  KeyCode.DIGIT_4,
  KeyCode.DIGIT_5,
];

interface HotbarSlotView {
  readonly background: Graphics;
  readonly countLabel: Label;
}

/**
 * 화면 하단 고정 핫바입니다.
 * 숫자 키 1~5 또는 터치/클릭으로 슬롯을 선택합니다.
 */
@ccclass('HotbarHud')
export class HotbarHud extends Component {
  private readonly slotViews: HotbarSlotView[] = [];
  private readonly pointerLocation = new Vec2();
  private inventory: InventoryModel | null = null;
  private cameraNode: Node | null = null;

  configure(inventory: InventoryModel, cameraNode: Node): void {
    this.inventory = inventory;
    this.cameraNode = cameraNode;
    this.buildSlots();
    inventory.addListener(() => this.refresh());
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
    // UI 좌표 (DESIGN_WIDTH/2, getHotbarCenterY)에 맞추기 위해 카메라 기준 오프셋을 씁니다.
    this.node.setPosition(
      camera.x,
      camera.y + getHotbarCenterY() - DESIGN_HEIGHT / 2,
      0,
    );
  }

  private onKeyDown(event: EventKeyboard): void {
    const slotIndex = SLOT_KEY_CODES.indexOf(event.keyCode);
    if (slotIndex >= 0) this.inventory?.selectHotbarIndex(slotIndex);
  }

  private onMouseUp(event: EventMouse): void {
    if (event.getButton() !== EventMouse.BUTTON_LEFT) return;
    event.getUILocation(this.pointerLocation);
    this.selectAtPointer();
  }

  private onTouchEnd(event: EventTouch): void {
    event.getUILocation(this.pointerLocation);
    this.selectAtPointer();
  }

  private selectAtPointer(): void {
    const slotIndex = hitTestHotbarSlot(
      this.pointerLocation.x,
      this.pointerLocation.y,
    );
    if (slotIndex !== null) this.inventory?.selectHotbarIndex(slotIndex);
  }

  private buildSlots(): void {
    HOTBAR_ITEM_IDS.forEach((itemId, index) => {
      const slotNode = new Node(`Slot${index + 1}`);
      slotNode.layer = Layers.Enum.UI_2D;
      this.node.addChild(slotNode);
      // 부모 원점이 화면 중앙 x·핫바 중앙 y이므로 슬롯은 상대 좌표로 둡니다.
      slotNode.setPosition(
        getHotbarSlotCenterX(index) - DESIGN_WIDTH / 2,
        0,
      );
      slotNode
        .addComponent(UITransform)
        .setContentSize(HOTBAR_SLOT_SIZE, HOTBAR_SLOT_SIZE);
      const background = slotNode.addComponent(Graphics);

      const nameNode = new Node('Name');
      nameNode.layer = Layers.Enum.UI_2D;
      slotNode.addChild(nameNode);
      nameNode.setPosition(0, 14);
      const nameLabel = nameNode.addComponent(Label);
      nameLabel.fontSize = 18;
      nameLabel.lineHeight = 22;
      nameLabel.color = new Color(235, 245, 255, 255);
      nameLabel.string = `${index + 1} ${getItemDefinition(itemId).displayName}`;

      const countNode = new Node('Count');
      countNode.layer = Layers.Enum.UI_2D;
      slotNode.addChild(countNode);
      countNode.setPosition(0, -16);
      const countLabel = countNode.addComponent(Label);
      countLabel.fontSize = 22;
      countLabel.lineHeight = 26;
      countLabel.color = new Color(255, 235, 160, 255);
      countLabel.string = '0';

      this.slotViews.push({ background, countLabel });
    });
    this.refresh();
  }

  private refresh(): void {
    const inventory = this.inventory;
    if (!inventory) return;

    this.slotViews.forEach((view, index) => {
      const itemId = HOTBAR_ITEM_IDS[index];
      const isSelected = inventory.getSelectedHotbarIndex() === index;

      view.countLabel.string = String(inventory.getQuantity(itemId));
      view.background.clear();
      view.background.fillColor = isSelected
        ? new Color(70, 96, 128, 220)
        : new Color(24, 32, 44, 200);
      view.background.roundRect(
        -HOTBAR_SLOT_SIZE / 2,
        -HOTBAR_SLOT_SIZE / 2,
        HOTBAR_SLOT_SIZE,
        HOTBAR_SLOT_SIZE,
        12,
      );
      view.background.fill();
      view.background.strokeColor = isSelected
        ? new Color(150, 220, 255, 255)
        : new Color(90, 104, 122, 255);
      view.background.lineWidth = isSelected ? 4 : 2;
      view.background.roundRect(
        -HOTBAR_SLOT_SIZE / 2,
        -HOTBAR_SLOT_SIZE / 2,
        HOTBAR_SLOT_SIZE,
        HOTBAR_SLOT_SIZE,
        12,
      );
      view.background.stroke();
    });
  }
}
