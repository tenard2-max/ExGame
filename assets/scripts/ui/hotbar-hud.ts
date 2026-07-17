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

import type { InventoryModel } from '../inventory/inventory-model';
import {
  getItemDefinition,
  HOTBAR_ITEM_IDS,
} from '../inventory/item-registry';

const { ccclass } = _decorator;

const SLOT_SIZE = 76;
const SLOT_GAP = 10;
const HOTBAR_BOTTOM_MARGIN = 26;

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
 * 화면 하단 고정 핫바입니다. 숫자 키 1~5로 슬롯을 선택하며
 * 선택된 슬롯의 아이템이 설치 재료로 사용됩니다.
 *
 * 월드보다 나중에 그려지도록 Canvas의 마지막 자식으로 두고,
 * 카메라 x·y를 따라가 화면에 고정된 것처럼 보이게 합니다.
 */
@ccclass('HotbarHud')
export class HotbarHud extends Component {
  private readonly slotViews: HotbarSlotView[] = [];
  private inventory: InventoryModel | null = null;
  private cameraNode: Node | null = null;
  private bottomOffset = 0;

  configure(
    inventory: InventoryModel,
    cameraNode: Node,
    designHeight: number,
  ): void {
    this.inventory = inventory;
    this.cameraNode = cameraNode;
    this.bottomOffset = -designHeight / 2 + HOTBAR_BOTTOM_MARGIN + SLOT_SIZE / 2;
    this.buildSlots();
    inventory.addListener(() => this.refresh());
  }

  protected onEnable(): void {
    input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
  }

  protected lateUpdate(): void {
    if (!this.cameraNode) return;
    const camera = this.cameraNode.position;
    this.node.setPosition(camera.x, camera.y + this.bottomOffset, 0);
  }

  protected onDisable(): void {
    input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
  }

  private onKeyDown(event: EventKeyboard): void {
    const slotIndex = SLOT_KEY_CODES.indexOf(event.keyCode);
    if (slotIndex >= 0) this.inventory?.selectHotbarIndex(slotIndex);
  }

  private buildSlots(): void {
    const totalWidth = HOTBAR_ITEM_IDS.length * SLOT_SIZE
      + (HOTBAR_ITEM_IDS.length - 1) * SLOT_GAP;

    HOTBAR_ITEM_IDS.forEach((itemId, index) => {
      const slotNode = new Node(`Slot${index + 1}`);
      slotNode.layer = Layers.Enum.UI_2D;
      this.node.addChild(slotNode);
      slotNode.setPosition(
        -totalWidth / 2 + SLOT_SIZE / 2 + index * (SLOT_SIZE + SLOT_GAP),
        0,
      );
      slotNode.addComponent(UITransform).setContentSize(SLOT_SIZE, SLOT_SIZE);
      const background = slotNode.addComponent(Graphics);

      const nameNode = new Node('Name');
      nameNode.layer = Layers.Enum.UI_2D;
      slotNode.addChild(nameNode);
      nameNode.setPosition(0, 12);
      const nameLabel = nameNode.addComponent(Label);
      nameLabel.fontSize = 18;
      nameLabel.lineHeight = 22;
      nameLabel.color = new Color(235, 245, 255, 255);
      nameLabel.string = `${index + 1} ${getItemDefinition(itemId).displayName}`;

      const countNode = new Node('Count');
      countNode.layer = Layers.Enum.UI_2D;
      slotNode.addChild(countNode);
      countNode.setPosition(0, -14);
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
        -SLOT_SIZE / 2,
        -SLOT_SIZE / 2,
        SLOT_SIZE,
        SLOT_SIZE,
        10,
      );
      view.background.fill();
      view.background.strokeColor = isSelected
        ? new Color(150, 220, 255, 255)
        : new Color(90, 104, 122, 255);
      view.background.lineWidth = isSelected ? 4 : 2;
      view.background.roundRect(
        -SLOT_SIZE / 2,
        -SLOT_SIZE / 2,
        SLOT_SIZE,
        SLOT_SIZE,
        10,
      );
      view.background.stroke();
    });
  }
}
