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
  Sprite,
  UITransform,
  Vec2,
} from 'cc';

import type { GameBalanceSettings } from '../core/game-balance-settings';
import {
  consumeKeyEvent,
  isEscapeKey,
  matchesKeyCode,
} from '../input/dom-keyboard';
import type { InventoryModel } from '../inventory/inventory-model';
import {
  getHealthPotionDefinition,
  HEALTH_POTIONS,
} from '../inventory/item-registry';
import type { ItemId } from '../inventory/item-types';
import type { PlayerStatsModel } from '../player/player-stats-model';
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  normalizeUiToDesign,
  setPotionMenuOpen,
} from './hud-layout';
import {
  POTION_ICON_DISPLAY_SIZE,
  type PotionAtlas,
} from './potion-atlas';

const { ccclass } = _decorator;

const PANEL_WIDTH = 460;
const PANEL_HEIGHT = 300;
const ROW_HEIGHT = 64;
const ROW_GAP = 12;
const ICON_SLOT = POTION_ICON_DISPLAY_SIZE;

type MessageSink = (message: string) => void;

interface PotionRowView {
  readonly itemId: ItemId;
  readonly root: Node;
  readonly background: Graphics;
  readonly label: Label;
  readonly iconSprite: Sprite | null;
}

/**
 * E 키로 여는 포션 사용 메뉴입니다.
 * Ctrl+E(세이브 내보내기)와 충돌하지 않도록 Ctrl이 없을 때만 토글합니다.
 */
@ccclass('PotionHud')
export class PotionHud extends Component {
  private readonly pointerLocation = new Vec2();
  private readonly rows: PotionRowView[] = [];
  private readonly onDomKeyDown = (event: KeyboardEvent): void => {
    if (event.altKey || event.metaKey) return;
    if (isEscapeKey(event) && this.isOpen) {
      consumeKeyEvent(event);
      this.setOpen(false);
      return;
    }
    if (event.ctrlKey) return;
    if (!matchesKeyCode(event, 'KeyE')) return;
    consumeKeyEvent(event);
    this.toggleMenu();
  };

  private inventory: InventoryModel | null = null;
  private playerStats: PlayerStatsModel | null = null;
  private balance: GameBalanceSettings | null = null;
  private cameraNode: Node | null = null;
  private potionAtlas: PotionAtlas | null = null;
  private panelRoot: Node | null = null;
  private isOpen = false;
  private showMessage: MessageSink = () => {};

  configure(
    inventory: InventoryModel,
    playerStats: PlayerStatsModel,
    cameraNode: Node,
    showMessage: MessageSink,
    potionAtlas: PotionAtlas | null = null,
    balance: GameBalanceSettings | null = null,
  ): void {
    this.inventory = inventory;
    this.playerStats = playerStats;
    this.cameraNode = cameraNode;
    this.showMessage = showMessage;
    this.potionAtlas = potionAtlas;
    this.balance = balance;
    this.buildPanel();
    inventory.addListener(() => this.refresh());
    balance?.addListener(() => this.refresh());
    this.setOpen(false);
  }

  protected onEnable(): void {
    window.addEventListener('keydown', this.onDomKeyDown, { capture: true });
    input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
  }

  protected onDisable(): void {
    window.removeEventListener('keydown', this.onDomKeyDown, { capture: true });
    input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    setPotionMenuOpen(false);
  }

  protected lateUpdate(): void {
    if (!this.cameraNode) return;
    const camera = this.cameraNode.position;
    this.node.setPosition(camera.x, camera.y - 80, 0);
  }

  private onKeyDown(event: EventKeyboard): void {
    if (!this.isOpen) return;
    if (event.keyCode === KeyCode.ESCAPE) {
      this.setOpen(false);
      return;
    }
    const index = keyToPotionIndex(event.keyCode);
    if (index === null) return;
    this.usePotionAt(index);
  }

  private onMouseUp(event: EventMouse): void {
    if (!this.isOpen) return;
    this.pointerLocation.set(event.getUILocation().x, event.getUILocation().y);
    this.handlePointer(this.pointerLocation);
  }

  private onTouchEnd(event: EventTouch): void {
    if (!this.isOpen) return;
    this.pointerLocation.set(event.getUILocation().x, event.getUILocation().y);
    this.handlePointer(this.pointerLocation);
  }

  private handlePointer(uiLocation: Vec2): void {
    const design = normalizeUiToDesign(uiLocation.x, uiLocation.y);
    const index = this.hitTestRow(design.x, design.y);
    if (index === null) {
      if (!this.isOverPanel(design.x, design.y)) {
        this.setOpen(false);
      }
      return;
    }
    this.usePotionAt(index);
  }

  private toggleMenu(): void {
    this.setOpen(!this.isOpen);
  }

  /** 모바일 DOM 버튼 등에서 물약 메뉴를 토글합니다. */
  toggleFromUi(): void {
    this.toggleMenu();
  }

  private setOpen(open: boolean): void {
    this.isOpen = open;
    setPotionMenuOpen(open);
    if (this.panelRoot) this.panelRoot.active = open;
    if (open) this.refresh();
  }

  private usePotionAt(index: number): void {
    const potion = HEALTH_POTIONS[index];
    if (!potion || !this.inventory || !this.playerStats) return;

    if (this.inventory.getQuantity(potion.itemId) <= 0) {
      this.showMessage(`${potion.displayName}이(가) 없습니다.`);
      return;
    }

    if (!this.inventory.remove(potion.itemId, 1)) return;
    const boost = this.balance?.getPotionHealthBoost(potion.itemId)
      ?? potion.healthBoost;
    this.playerStats.applyHealthPotion(boost);
    this.showMessage(
      `${potion.displayName} 사용! 최대 체력 +${boost} `
      + `(HP ${this.playerStats.getHealth()}/${this.playerStats.getMaxHealth()})`,
    );
    this.refresh();
  }

  private buildPanel(): void {
    const root = new Node('PotionMenu');
    root.layer = Layers.Enum.UI_2D;
    this.node.addChild(root);
    root.addComponent(UITransform).setContentSize(PANEL_WIDTH, PANEL_HEIGHT);
    this.panelRoot = root;

    const bg = root.addComponent(Graphics);
    bg.fillColor = new Color(18, 24, 36, 235);
    bg.rect(-PANEL_WIDTH / 2, -PANEL_HEIGHT / 2, PANEL_WIDTH, PANEL_HEIGHT);
    bg.fill();
    bg.strokeColor = new Color(120, 180, 220, 255);
    bg.lineWidth = 2;
    bg.rect(-PANEL_WIDTH / 2, -PANEL_HEIGHT / 2, PANEL_WIDTH, PANEL_HEIGHT);
    bg.stroke();

    const titleNode = new Node('Title');
    titleNode.layer = Layers.Enum.UI_2D;
    root.addChild(titleNode);
    titleNode.setPosition(0, PANEL_HEIGHT / 2 - 36, 0);
    titleNode.addComponent(UITransform).setContentSize(PANEL_WIDTH - 24, 32);
    const title = titleNode.addComponent(Label);
    title.string = '포션 사용 (E·ESC 닫기 / 1~3)';
    title.fontSize = 22;
    title.lineHeight = 26;
    title.color = new Color(230, 240, 255, 255);

    const startY = 48;
    HEALTH_POTIONS.forEach((potion, index) => {
      const rowNode = new Node(`PotionRow-${potion.itemId}`);
      rowNode.layer = Layers.Enum.UI_2D;
      root.addChild(rowNode);
      const y = startY - index * (ROW_HEIGHT + ROW_GAP);
      rowNode.setPosition(0, y, 0);
      rowNode.addComponent(UITransform).setContentSize(PANEL_WIDTH - 40, ROW_HEIGHT);

      const rowBg = rowNode.addComponent(Graphics);

      let iconSprite: Sprite | null = null;
      const frame = this.potionAtlas?.isReady()
        ? this.potionAtlas.getFrame(potion.itemId)
        : null;
      if (frame) {
        const iconNode = new Node('Icon');
        iconNode.layer = Layers.Enum.UI_2D;
        rowNode.addChild(iconNode);
        iconNode.setPosition(-(PANEL_WIDTH - 40) / 2 + 28, 0, 0);
        iconNode.addComponent(UITransform).setContentSize(ICON_SLOT, ICON_SLOT);
        const sprite = iconNode.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = frame;
        iconSprite = sprite;
      }

      const labelNode = new Node('Label');
      labelNode.layer = Layers.Enum.UI_2D;
      rowNode.addChild(labelNode);
      labelNode.setPosition(frame ? 28 : 0, 0, 0);
      labelNode.addComponent(UITransform).setContentSize(
        PANEL_WIDTH - (frame ? 100 : 56),
        ROW_HEIGHT,
      );
      const label = labelNode.addComponent(Label);
      label.fontSize = 20;
      label.lineHeight = 24;
      label.color = new Color(255, 255, 255, 255);
      label.horizontalAlign = Label.HorizontalAlign.LEFT;
      label.verticalAlign = Label.VerticalAlign.CENTER;

      this.rows.push({
        itemId: potion.itemId,
        root: rowNode,
        background: rowBg,
        label,
        iconSprite,
      });
    });
  }

  private refresh(): void {
    for (const row of this.rows) {
      const potion = getHealthPotionDefinition(row.itemId);
      if (!potion) continue;
      const boost = this.balance?.getPotionHealthBoost(potion.itemId)
        ?? potion.healthBoost;
      const count = this.inventory?.getQuantity(row.itemId) ?? 0;
      const index = HEALTH_POTIONS.findIndex((entry) => entry.itemId === row.itemId);
      row.label.string = `${index + 1}. ${potion.displayName}  `
        + `(+${boost} HP)  ×${count}`;
      if (row.iconSprite) {
        row.iconSprite.color = count > 0
          ? new Color(255, 255, 255, 255)
          : new Color(255, 255, 255, 110);
      }
      row.background.clear();
      row.background.fillColor = count > 0
        ? new Color(40, 70, 100, 220)
        : new Color(40, 40, 48, 180);
      row.background.rect(
        -(PANEL_WIDTH - 40) / 2,
        -ROW_HEIGHT / 2,
        PANEL_WIDTH - 40,
        ROW_HEIGHT,
      );
      row.background.fill();
    }
  }

  private hitTestRow(uiX: number, uiY: number): number | null {
    if (!this.isOverPanel(uiX, uiY)) return null;
    const panelCenterUiY = DESIGN_HEIGHT / 2 - 80;
    const relY = uiY - panelCenterUiY;
    const startY = 48;
    for (let index = 0; index < this.rows.length; index += 1) {
      const y = startY - index * (ROW_HEIGHT + ROW_GAP);
      if (Math.abs(relY - y) <= ROW_HEIGHT / 2) return index;
    }
    return null;
  }

  private isOverPanel(uiX: number, uiY: number): boolean {
    const panelCenterUiX = DESIGN_WIDTH / 2;
    const panelCenterUiY = DESIGN_HEIGHT / 2 - 80;
    return Math.abs(uiX - panelCenterUiX) <= PANEL_WIDTH / 2
      && Math.abs(uiY - panelCenterUiY) <= PANEL_HEIGHT / 2;
  }
}

function keyToPotionIndex(keyCode: KeyCode): number | null {
  if (keyCode === KeyCode.DIGIT_1 || keyCode === KeyCode.NUM_1) return 0;
  if (keyCode === KeyCode.DIGIT_2 || keyCode === KeyCode.NUM_2) return 1;
  if (keyCode === KeyCode.DIGIT_3 || keyCode === KeyCode.NUM_3) return 2;
  return null;
}
