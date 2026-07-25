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
  DEFAULT_WEAPON_ITEM_ID,
  formatCompactQuantity,
  formatExactQuantity,
  getItemDefinition,
  HOTBAR_ITEM_IDS,
  isWeaponItem,
} from '../inventory/item-registry';
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  getHotbarCenterY,
  getHotbarSlotCenterX,
  hitTestHotbarSlot,
  HOTBAR_SLOT_SIZE,
  isInventoryMenuOpen,
  isLoadMenuOpen,
  isPotionMenuOpen,
} from './hud-layout';

const { ccclass } = _decorator;

const SLOT_KEY_CODES: ReadonlyArray<KeyCode> = [
  KeyCode.DIGIT_1,
  KeyCode.DIGIT_2,
  KeyCode.DIGIT_3,
  KeyCode.DIGIT_4,
  KeyCode.DIGIT_5,
  KeyCode.DIGIT_6,
];

interface HotbarSlotView {
  readonly background: Graphics;
  readonly countLabel: Label;
  readonly nameLabel: Label;
}

/**
 * 화면 하단 고정 핫바입니다.
 * 숫자 키 1~6 또는 터치/클릭으로 슬롯을 선택합니다.
 * 수량은 K/M 축약, 호버 시 정확한 숫자를 표시합니다.
 */
@ccclass('HotbarHud')
export class HotbarHud extends Component {
  private readonly slotViews: HotbarSlotView[] = [];
  private readonly pointerLocation = new Vec2();
  private inventory: InventoryModel | null = null;
  private cameraNode: Node | null = null;
  private hoverSlotIndex: number | null = null;
  private detailLabel: Label | null = null;

  configure(inventory: InventoryModel, cameraNode: Node): void {
    this.inventory = inventory;
    this.cameraNode = cameraNode;
    this.buildSlots();
    this.buildDetailLabel();
    inventory.addListener(() => this.refresh());
  }

  protected onEnable(): void {
    input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
    input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
  }

  protected onDisable(): void {
    input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
    input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
  }

  protected lateUpdate(): void {
    if (!this.cameraNode) return;
    const camera = this.cameraNode.position;
    this.node.setPosition(
      camera.x,
      camera.y + getHotbarCenterY() - DESIGN_HEIGHT / 2,
      0,
    );
  }

  private onKeyDown(event: EventKeyboard): void {
    if (isPotionMenuOpen() || isInventoryMenuOpen() || isLoadMenuOpen()) return;
    const slotIndex = SLOT_KEY_CODES.indexOf(event.keyCode);
    if (slotIndex >= 0) this.inventory?.selectHotbarIndex(slotIndex);
  }

  private onMouseUp(event: EventMouse): void {
    if (event.getButton() !== EventMouse.BUTTON_LEFT) return;
    event.getUILocation(this.pointerLocation);
    this.selectAtPointer();
  }

  private onMouseMove(event: EventMouse): void {
    event.getUILocation(this.pointerLocation);
    const slotIndex = hitTestHotbarSlot(
      this.pointerLocation.x,
      this.pointerLocation.y,
    );
    if (slotIndex === this.hoverSlotIndex) return;
    this.hoverSlotIndex = slotIndex;
    this.refresh();
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

  private buildDetailLabel(): void {
    const node = new Node('QuantityDetail');
    node.layer = Layers.Enum.UI_2D;
    this.node.addChild(node);
    node.setPosition(0, HOTBAR_SLOT_SIZE / 2 + 28, 0);
    node.addComponent(UITransform).setContentSize(220, 28);
    const label = node.addComponent(Label);
    label.fontSize = 18;
    label.lineHeight = 22;
    label.color = new Color(255, 250, 210, 255);
    label.string = '';
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    this.detailLabel = label;
    node.active = false;
  }

  private buildSlots(): void {
    HOTBAR_ITEM_IDS.forEach((itemId, index) => {
      const slotNode = new Node(`Slot${index + 1}`);
      slotNode.layer = Layers.Enum.UI_2D;
      this.node.addChild(slotNode);
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
      nameLabel.fontSize = 16;
      nameLabel.lineHeight = 20;
      nameLabel.color = new Color(235, 245, 255, 255);
      nameLabel.string = `${index + 1} ${getItemDefinition(itemId).displayName}`;

      const countNode = new Node('Count');
      countNode.layer = Layers.Enum.UI_2D;
      slotNode.addChild(countNode);
      countNode.setPosition(0, -16);
      const countLabel = countNode.addComponent(Label);
      countLabel.fontSize = 20;
      countLabel.lineHeight = 24;
      countLabel.color = new Color(255, 235, 160, 255);
      countLabel.string = '0';

      this.slotViews.push({ background, countLabel, nameLabel });
    });
    this.refresh();
  }

  private refresh(): void {
    const inventory = this.inventory;
    if (!inventory) return;

    this.slotViews.forEach((view, index) => {
      const itemId = inventory.getHotbarItemId(index);
      if (!itemId) return;
      const isSelected = inventory.getSelectedHotbarIndex() === index;
      const quantity = inventory.getQuantity(itemId);
      const definition = getItemDefinition(itemId);
      const isEquippedWeaponSlot = index === 0
        && itemId !== DEFAULT_WEAPON_ITEM_ID;

      if (isEquippedWeaponSlot) {
        view.nameLabel.string = `1 ${definition.displayName}`;
        view.nameLabel.color = new Color(255, 230, 150, 255);
        view.countLabel.string = '장착';
        view.countLabel.color = new Color(255, 210, 90, 255);
      } else {
        view.nameLabel.string = `${index + 1} ${definition.displayName}`;
        view.nameLabel.color = new Color(235, 245, 255, 255);
        if (isWeaponItem(itemId)) {
          view.countLabel.string = '—';
          view.countLabel.color = new Color(180, 190, 200, 255);
        } else if (this.hoverSlotIndex === index) {
          view.countLabel.string = formatExactQuantity(quantity);
          view.countLabel.color = new Color(255, 235, 160, 255);
        } else {
          view.countLabel.string = formatCompactQuantity(quantity);
          view.countLabel.color = new Color(255, 235, 160, 255);
        }
      }

      view.background.clear();
      if (isEquippedWeaponSlot) {
        view.background.fillColor = isSelected
          ? new Color(96, 72, 36, 235)
          : new Color(72, 52, 28, 220);
      } else {
        view.background.fillColor = isSelected
          ? new Color(70, 96, 128, 220)
          : new Color(24, 32, 44, 200);
      }
      view.background.roundRect(
        -HOTBAR_SLOT_SIZE / 2,
        -HOTBAR_SLOT_SIZE / 2,
        HOTBAR_SLOT_SIZE,
        HOTBAR_SLOT_SIZE,
        12,
      );
      view.background.fill();
      if (isEquippedWeaponSlot) {
        view.background.strokeColor = isSelected
          ? new Color(255, 210, 90, 255)
          : new Color(230, 170, 50, 255);
        view.background.lineWidth = isSelected ? 4 : 3;
      } else {
        view.background.strokeColor = isSelected
          ? new Color(150, 220, 255, 255)
          : new Color(90, 104, 122, 255);
        view.background.lineWidth = isSelected ? 4 : 2;
      }
      view.background.roundRect(
        -HOTBAR_SLOT_SIZE / 2,
        -HOTBAR_SLOT_SIZE / 2,
        HOTBAR_SLOT_SIZE,
        HOTBAR_SLOT_SIZE,
        12,
      );
      view.background.stroke();
    });

    this.refreshDetailLabel(inventory);
  }

  private refreshDetailLabel(inventory: InventoryModel): void {
    const label = this.detailLabel;
    if (!label) return;
    const index = this.hoverSlotIndex;
    if (index === null) {
      label.node.active = false;
      return;
    }

    const itemId = inventory.getHotbarItemId(index);
    if (!itemId) {
      label.node.active = false;
      return;
    }
    const definition = getItemDefinition(itemId);
    if (isWeaponItem(itemId)) {
      const equipped = itemId !== DEFAULT_WEAPON_ITEM_ID;
      label.string = equipped
        ? `${definition.displayName} [장착중] · 피해 ${definition.attackPower ?? 1}`
        : `${definition.displayName} (무기 · 피해 ${definition.attackPower ?? 1})`;
    } else {
      const quantity = inventory.getQuantity(itemId);
      label.string = `${definition.displayName}: ${formatExactQuantity(quantity)}`;
    }
    label.node.active = true;
    label.node.setPosition(
      getHotbarSlotCenterX(index) - DESIGN_WIDTH / 2,
      HOTBAR_SLOT_SIZE / 2 + 28,
      0,
    );
  }
}
