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

import {
  consumeKeyEvent,
  isEscapeKey,
  matchesKeyCode,
} from '../input/dom-keyboard';
import type { InventoryModel } from '../inventory/inventory-model';
import {
  DEFAULT_WEAPON_ITEM_ID,
  formatCompactQuantity,
  getItemDefinition,
  isEquipableArmor,
  isEquipableWeapon,
  isWeaponItem,
} from '../inventory/item-registry';
import type { ItemId } from '../inventory/item-types';
import {
  AFFIX_GRADE_LABEL,
  AFFIX_GRADES,
  describeAffix,
} from '../npc/equipment-affix';
import type {
  GearInstance,
  GearInstanceStore,
} from '../npc/gear-instance-store';
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  normalizeUiToDesign,
  setInventoryMenuOpen,
} from './hud-layout';
import {
  ITEM_ICON_DISPLAY_SIZE,
  type ItemAtlas,
} from './item-atlas';
import type { TooltipHud } from './tooltip-hud';

const { ccclass } = _decorator;

const PANEL_WIDTH = 560;
const PANEL_HEIGHT = 620;
const ROW_HEIGHT = 56;
const HEADER_ROW_HEIGHT = 32;
const ROW_GAP = 8;
const ROW_STRIDE = ROW_HEIGHT + ROW_GAP;
const TITLE_RESERVE = 48;
const EQUIP_SUMMARY_HEIGHT = 78;
const HINT_RESERVE = 44;
const LIST_TOP = PANEL_HEIGHT / 2 - TITLE_RESERVE - EQUIP_SUMMARY_HEIGHT;
const LIST_BOTTOM = -PANEL_HEIGHT / 2 + HINT_RESERVE;
const LIST_VIEW_HEIGHT = LIST_TOP - LIST_BOTTOM;
const LIST_PAD_X = 20;
const SCROLL_STEP = 48;
/** 장착 행 배경·테두리 (눈에 띄는 호박색 톤). */
const EQUIPPED_ROW_FILL = new Color(88, 58, 28, 240);
const EQUIPPED_ROW_STROKE = new Color(255, 196, 72, 255);
const NORMAL_ROW_FILL = new Color(28, 34, 44, 200);
const EQUIPABLE_ROW_FILL = new Color(40, 52, 70, 220);
/** 강화 장비 행. */
const GEAR_ROW_FILL = new Color(52, 36, 78, 235);
const GEAR_ROW_STROKE = new Color(186, 140, 255, 255);
const GEAR_EQUIPPED_FILL = new Color(72, 48, 96, 245);
const HEADER_ROW_FILL = new Color(22, 28, 40, 220);

type MessageSink = (message: string) => void;

interface InventoryRowView {
  readonly kind: 'stack' | 'gear' | 'header';
  readonly itemId: ItemId;
  readonly gearId: string | null;
  readonly tooltipText: string;
  readonly root: Node;
}

/**
 * I 키로 여는 아이템 창입니다.
 * 목록이 길면 마우스 휠로 스크롤합니다.
 */
@ccclass('InventoryHud')
export class InventoryHud extends Component {
  private readonly pointerLocation = new Vec2();
  private readonly rows: InventoryRowView[] = [];
  private readonly onDomKeyDown = (event: KeyboardEvent): void => {
    if (event.altKey || event.metaKey) return;
    if (isEscapeKey(event) && this.isOpen) {
      consumeKeyEvent(event);
      this.setOpen(false);
      return;
    }
    if (event.ctrlKey) return;
    if (!matchesKeyCode(event, 'KeyI')) return;
    consumeKeyEvent(event);
    this.toggleMenu();
  };

  private inventory: InventoryModel | null = null;
  private gears: GearInstanceStore | null = null;
  private tooltip: TooltipHud | null = null;
  private cameraNode: Node | null = null;
  private itemAtlas: ItemAtlas | null = null;
  private panelRoot: Node | null = null;
  private listRoot: Node | null = null;
  private equipSummaryLabel: Label | null = null;
  private scrollHintLabel: Label | null = null;
  private isOpen = false;
  private scrollOffset = 0;
  private contentHeight = 0;
  private showMessage: MessageSink = () => {};
  /** MOUSE_UP + TOUCH_END 중복으로 장착→즉시해제 되는 것을 막습니다. */
  private lastPointerHandledAtMs = 0;
  private suppressListenerRefresh = false;
  private readonly hoverLocation = new Vec2();

  configure(
    inventory: InventoryModel,
    cameraNode: Node,
    itemAtlas: ItemAtlas | null,
    showMessage: MessageSink,
    gears: GearInstanceStore | null = null,
    tooltip: TooltipHud | null = null,
  ): void {
    this.inventory = inventory;
    this.gears = gears;
    this.tooltip = tooltip;
    this.cameraNode = cameraNode;
    this.itemAtlas = itemAtlas;
    this.showMessage = showMessage;
    this.buildPanel();
    inventory.addListener(() => {
      if (this.isOpen && !this.suppressListenerRefresh) this.refreshRows();
    });
    gears?.addListener(() => {
      if (this.isOpen && !this.suppressListenerRefresh) this.refreshRows();
    });
  }

  protected onEnable(): void {
    input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    // MOUSE_UP만 사용. TOUCH_END와 동시 발생 시 장착→즉시해제가 됩니다.
    input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
    input.on(Input.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
    window.addEventListener('keydown', this.onDomKeyDown, true);
  }

  protected onDisable(): void {
    input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
    input.off(Input.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
    window.removeEventListener('keydown', this.onDomKeyDown, true);
    this.tooltip?.hide();
    setInventoryMenuOpen(false);
  }

  protected lateUpdate(): void {
    if (!this.cameraNode || !this.panelRoot) return;
    const camera = this.cameraNode.position;
    this.panelRoot.setPosition(
      camera.x,
      camera.y - 40,
      0,
    );
  }

  private onKeyDown(event: EventKeyboard): void {
    if (!this.isOpen) return;
    if (event.keyCode === KeyCode.ESCAPE) {
      this.setOpen(false);
      return;
    }
    if (event.keyCode === KeyCode.ARROW_UP) {
      this.setScrollOffset(this.scrollOffset - SCROLL_STEP);
    } else if (event.keyCode === KeyCode.ARROW_DOWN) {
      this.setScrollOffset(this.scrollOffset + SCROLL_STEP);
    }
  }

  private onMouseUp(event: EventMouse): void {
    if (!this.isOpen || event.getButton() !== EventMouse.BUTTON_LEFT) return;
    event.getUILocation(this.pointerLocation);
    this.handlePointer();
  }

  private onMouseMove(event: EventMouse): void {
    if (!this.isOpen) {
      this.tooltip?.hide();
      return;
    }
    event.getUILocation(this.hoverLocation);
    this.updateHoverTooltip();
  }

  private onMouseWheel(event: EventMouse): void {
    if (!this.isOpen) return;
    const design = normalizeUiToDesign(
      event.getUILocation().x,
      event.getUILocation().y,
    );
    if (!this.isDesignInsidePanel(design.x, design.y)) return;
    const scrollY = event.getScrollY();
    this.setScrollOffset(
      this.scrollOffset + (scrollY > 0 ? -SCROLL_STEP : SCROLL_STEP),
    );
  }

  private toggleMenu(): void {
    this.setOpen(!this.isOpen);
  }

  /** 모바일 DOM 버튼 등에서 인벤토리를 토글합니다. */
  toggleFromUi(): void {
    this.toggleMenu();
  }

  private setOpen(open: boolean): void {
    this.isOpen = open;
    setInventoryMenuOpen(open);
    if (this.panelRoot) this.panelRoot.active = open;
    if (open) {
      this.scrollOffset = 0;
      this.refreshRows();
    } else {
      this.tooltip?.hide();
    }
  }

  private buildPanel(): void {
    const panel = new Node('InventoryPanel');
    panel.layer = Layers.Enum.UI_2D;
    this.node.addChild(panel);
    panel.addComponent(UITransform).setContentSize(PANEL_WIDTH, PANEL_HEIGHT);
    panel.active = false;
    this.panelRoot = panel;

    const bg = panel.addComponent(Graphics);
    bg.fillColor = new Color(18, 24, 34, 235);
    bg.roundRect(-PANEL_WIDTH / 2, -PANEL_HEIGHT / 2, PANEL_WIDTH, PANEL_HEIGHT, 16);
    bg.fill();
    bg.strokeColor = new Color(120, 160, 200, 255);
    bg.lineWidth = 3;
    bg.roundRect(-PANEL_WIDTH / 2, -PANEL_HEIGHT / 2, PANEL_WIDTH, PANEL_HEIGHT, 16);
    bg.stroke();

    const titleNode = new Node('Title');
    titleNode.layer = Layers.Enum.UI_2D;
    panel.addChild(titleNode);
    titleNode.setPosition(0, PANEL_HEIGHT / 2 - 24, 0);
    const title = titleNode.addComponent(Label);
    title.fontSize = 22;
    title.lineHeight = 26;
    title.color = new Color(240, 248, 255, 255);
    title.string = '아이템 (I) — 검:1번 / 갑옷:몸통 · 휠 스크롤';
    title.horizontalAlign = Label.HorizontalAlign.CENTER;

    const summaryNode = new Node('EquipSummary');
    summaryNode.layer = Layers.Enum.UI_2D;
    panel.addChild(summaryNode);
    const summaryY = PANEL_HEIGHT / 2 - TITLE_RESERVE - EQUIP_SUMMARY_HEIGHT / 2;
    summaryNode.setPosition(0, summaryY, 0);
    const summaryWidth = PANEL_WIDTH - LIST_PAD_X * 2;
    summaryNode.addComponent(UITransform).setContentSize(summaryWidth, EQUIP_SUMMARY_HEIGHT - 8);
    const summaryBg = summaryNode.addComponent(Graphics);
    summaryBg.fillColor = new Color(42, 36, 24, 230);
    summaryBg.roundRect(
      -summaryWidth / 2,
      -(EQUIP_SUMMARY_HEIGHT - 8) / 2,
      summaryWidth,
      EQUIP_SUMMARY_HEIGHT - 8,
      10,
    );
    summaryBg.fill();
    summaryBg.strokeColor = new Color(255, 186, 64, 220);
    summaryBg.lineWidth = 2;
    summaryBg.roundRect(
      -summaryWidth / 2,
      -(EQUIP_SUMMARY_HEIGHT - 8) / 2,
      summaryWidth,
      EQUIP_SUMMARY_HEIGHT - 8,
      10,
    );
    summaryBg.stroke();

    const summaryLabelNode = new Node('EquipSummaryLabel');
    summaryLabelNode.layer = Layers.Enum.UI_2D;
    summaryNode.addChild(summaryLabelNode);
    summaryLabelNode.setPosition(0, 0, 0);
    const summaryLabel = summaryLabelNode.addComponent(Label);
    summaryLabel.fontSize = 16;
    summaryLabel.lineHeight = 22;
    summaryLabel.color = new Color(255, 230, 170, 255);
    summaryLabel.string = '장착 중\n무기: 주먹 · 갑옷: 없음';
    summaryLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    summaryLabel.verticalAlign = Label.VerticalAlign.CENTER;
    this.equipSummaryLabel = summaryLabel;

    const listRoot = new Node('ItemList');
    listRoot.layer = Layers.Enum.UI_2D;
    panel.addChild(listRoot);
    listRoot.addComponent(UITransform).setContentSize(
      PANEL_WIDTH - LIST_PAD_X * 2,
      LIST_VIEW_HEIGHT,
    );
    this.listRoot = listRoot;

    const hintNode = new Node('Hint');
    hintNode.layer = Layers.Enum.UI_2D;
    panel.addChild(hintNode);
    hintNode.setPosition(0, -PANEL_HEIGHT / 2 + 22, 0);
    const hint = hintNode.addComponent(Label);
    hint.fontSize = 15;
    hint.lineHeight = 18;
    hint.color = new Color(180, 200, 220, 255);
    hint.string = '강화 장비는 상단 · 마우스 올리면 옵션 · 재클릭=해제';
    hint.horizontalAlign = Label.HorizontalAlign.CENTER;
    this.scrollHintLabel = hint;
  }

  private refreshRows(): void {
    const panel = this.panelRoot;
    const listRoot = this.listRoot;
    const inventory = this.inventory;
    if (!panel || !listRoot || !inventory) return;

    this.refreshEquipSummary(inventory);
    this.rows.length = 0;
    listRoot.removeAllChildren();

    const gears = this.gears?.getAll() ?? [];
    const stacks = inventory.listOwnedStacks();
    if (gears.length === 0 && stacks.length === 0) {
      this.contentHeight = 0;
      this.scrollOffset = 0;
      const empty = new Node('Empty');
      empty.layer = Layers.Enum.UI_2D;
      listRoot.addChild(empty);
      empty.setPosition(0, 0, 0);
      const label = empty.addComponent(Label);
      label.fontSize = 20;
      label.color = new Color(160, 170, 180, 255);
      label.string = '소지 아이템이 없습니다';
      this.rows.push({
        kind: 'header',
        itemId: '',
        gearId: null,
        tooltipText: '',
        root: empty,
      });
      this.applyScroll();
      return;
    }

    let contentHeight = 0;
    if (gears.length > 0) {
      contentHeight += HEADER_ROW_HEIGHT + ROW_GAP;
      contentHeight += gears.length * ROW_HEIGHT + Math.max(0, gears.length - 1) * ROW_GAP;
    }
    if (stacks.length > 0) {
      if (gears.length > 0) contentHeight += ROW_GAP;
      contentHeight += HEADER_ROW_HEIGHT + ROW_GAP;
      contentHeight += stacks.length * ROW_HEIGHT + Math.max(0, stacks.length - 1) * ROW_GAP;
    }
    this.contentHeight = contentHeight;
    let y = this.contentHeight / 2;

    if (gears.length > 0) {
      y -= HEADER_ROW_HEIGHT / 2;
      this.addSectionHeader(listRoot, '강화 장비 (호버=옵션)', y);
      y -= HEADER_ROW_HEIGHT / 2 + ROW_GAP;
      for (const gear of gears) {
        y -= ROW_HEIGHT / 2;
        this.addGearRow(listRoot, gear, y);
        y -= ROW_HEIGHT / 2 + ROW_GAP;
      }
    }

    if (stacks.length > 0) {
      y -= HEADER_ROW_HEIGHT / 2;
      this.addSectionHeader(listRoot, '일반 아이템', y);
      y -= HEADER_ROW_HEIGHT / 2 + ROW_GAP;
      for (const stack of stacks) {
        y -= ROW_HEIGHT / 2;
        this.addStackRow(listRoot, inventory, stack.itemId, stack.quantity, y);
        y -= ROW_HEIGHT / 2 + ROW_GAP;
      }
    }

    this.scrollOffset = this.clampScroll(this.scrollOffset);
    this.applyScroll();
  }

  private addSectionHeader(listRoot: Node, title: string, y: number): void {
    const rowNode = new Node(`Header:${title}`);
    rowNode.layer = Layers.Enum.UI_2D;
    listRoot.addChild(rowNode);
    rowNode.setPosition(0, y, 0);
    const rowWidth = PANEL_WIDTH - LIST_PAD_X * 2;
    rowNode.addComponent(UITransform).setContentSize(rowWidth, HEADER_ROW_HEIGHT);
    const background = rowNode.addComponent(Graphics);
    background.fillColor = HEADER_ROW_FILL;
    background.roundRect(-rowWidth / 2, -HEADER_ROW_HEIGHT / 2, rowWidth, HEADER_ROW_HEIGHT, 8);
    background.fill();
    const labelNode = new Node('Label');
    labelNode.layer = Layers.Enum.UI_2D;
    rowNode.addChild(labelNode);
    const label = labelNode.addComponent(Label);
    label.fontSize = 15;
    label.lineHeight = 18;
    label.color = new Color(170, 190, 220, 255);
    label.string = title;
    label.horizontalAlign = Label.HorizontalAlign.LEFT;
    this.rows.push({
      kind: 'header',
      itemId: '',
      gearId: null,
      tooltipText: '',
      root: rowNode,
    });
  }

  private addGearRow(listRoot: Node, gear: GearInstance, y: number): void {
    const rowNode = new Node(`Gear:${gear.id}`);
    rowNode.layer = Layers.Enum.UI_2D;
    listRoot.addChild(rowNode);
    rowNode.setPosition(0, y, 0);
    const rowWidth = PANEL_WIDTH - LIST_PAD_X * 2;
    rowNode.addComponent(UITransform).setContentSize(rowWidth, ROW_HEIGHT);
    const isEquipped = this.gears?.getEquippedWeaponGearId() === gear.id
      || this.gears?.getEquippedArmorGearId() === gear.id;
    const background = rowNode.addComponent(Graphics);
    background.fillColor = isEquipped ? GEAR_EQUIPPED_FILL : GEAR_ROW_FILL;
    background.roundRect(-rowWidth / 2, -ROW_HEIGHT / 2, rowWidth, ROW_HEIGHT, 10);
    background.fill();
    background.strokeColor = isEquipped ? EQUIPPED_ROW_STROKE : GEAR_ROW_STROKE;
    background.lineWidth = isEquipped ? 3 : 2;
    background.roundRect(-rowWidth / 2, -ROW_HEIGHT / 2, rowWidth, ROW_HEIGHT, 10);
    background.stroke();

    const frame = this.itemAtlas?.getFrame(gear.itemId) ?? null;
    if (frame) {
      const iconNode = new Node('Icon');
      iconNode.layer = Layers.Enum.UI_2D;
      rowNode.addChild(iconNode);
      iconNode.setPosition(-rowWidth / 2 + 36, 0, 0);
      iconNode.addComponent(UITransform).setContentSize(
        ITEM_ICON_DISPLAY_SIZE,
        ITEM_ICON_DISPLAY_SIZE,
      );
      const sprite = iconNode.addComponent(Sprite);
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.spriteFrame = frame;
    }

    const definition = getItemDefinition(gear.itemId);
    const optionCount = AFFIX_GRADES.filter((grade) => gear.options[grade]).length;
    const labelNode = new Node('Label');
    labelNode.layer = Layers.Enum.UI_2D;
    rowNode.addChild(labelNode);
    labelNode.setPosition(isEquipped ? -4 : 8, 0, 0);
    const label = labelNode.addComponent(Label);
    label.fontSize = 17;
    label.lineHeight = 21;
    label.color = new Color(235, 220, 255, 255);
    label.string = `${definition.displayName} +${gear.upgradeLevel}`
      + `  ATK+${gear.bonusAttack} DEF+${gear.bonusDefense}`
      + (optionCount > 0 ? `  옵션${optionCount}` : '')
      + (isEquipped ? '  [장착중]' : '  [보관중 · 클릭 장착]');
    label.horizontalAlign = Label.HorizontalAlign.LEFT;
    if (isEquipped) this.addEquippedBadge(rowNode, rowWidth);

    this.rows.push({
      kind: 'gear',
      itemId: gear.itemId,
      gearId: gear.id,
      tooltipText: formatGearTooltip(gear),
      root: rowNode,
    });
  }

  private addStackRow(
    listRoot: Node,
    inventory: InventoryModel,
    itemId: ItemId,
    quantity: number,
    y: number,
  ): void {
    const rowNode = new Node(`Item:${itemId}`);
    rowNode.layer = Layers.Enum.UI_2D;
    listRoot.addChild(rowNode);
    rowNode.setPosition(0, y, 0);
    const rowWidth = PANEL_WIDTH - LIST_PAD_X * 2;
    rowNode.addComponent(UITransform).setContentSize(rowWidth, ROW_HEIGHT);
    const background = rowNode.addComponent(Graphics);
    const equippedWeapon = inventory.getEquippedWeaponId() === itemId
      && !this.gears?.getEquippedWeapon();
    const equippedArmor = inventory.getEquippedArmorId() === itemId
      && !this.gears?.getEquippedArmor();
    const isEquipped = Boolean(equippedWeapon || equippedArmor);
    const canEquip = isEquipableWeapon(itemId) || isEquipableArmor(itemId);
    background.fillColor = isEquipped
      ? EQUIPPED_ROW_FILL
      : canEquip
        ? EQUIPABLE_ROW_FILL
        : NORMAL_ROW_FILL;
    background.roundRect(-rowWidth / 2, -ROW_HEIGHT / 2, rowWidth, ROW_HEIGHT, 10);
    background.fill();
    if (isEquipped) {
      background.strokeColor = EQUIPPED_ROW_STROKE;
      background.lineWidth = 3;
      background.roundRect(-rowWidth / 2, -ROW_HEIGHT / 2, rowWidth, ROW_HEIGHT, 10);
      background.stroke();
    }

    const frame = this.itemAtlas?.getFrame(itemId) ?? null;
    if (frame) {
      const iconNode = new Node('Icon');
      iconNode.layer = Layers.Enum.UI_2D;
      rowNode.addChild(iconNode);
      iconNode.setPosition(-rowWidth / 2 + 36, 0, 0);
      iconNode.addComponent(UITransform).setContentSize(
        ITEM_ICON_DISPLAY_SIZE,
        ITEM_ICON_DISPLAY_SIZE,
      );
      const sprite = iconNode.addComponent(Sprite);
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.spriteFrame = frame;
    }

    const definition = getItemDefinition(itemId);
    const atk = isWeaponItem(itemId) ? `  ATK ${definition.attackPower ?? 1}` : '';
    const def = isEquipableArmor(itemId) ? `  DEF ${definition.defensePower ?? 0}` : '';
    const mark = isEquipped ? '  [장착중]' : canEquip ? '  (클릭 장착)' : '';
    const labelNode = new Node('Label');
    labelNode.layer = Layers.Enum.UI_2D;
    rowNode.addChild(labelNode);
    labelNode.setPosition(isEquipped ? -4 : 8, 0, 0);
    const label = labelNode.addComponent(Label);
    label.fontSize = 18;
    label.lineHeight = 22;
    label.color = isEquipped
      ? new Color(255, 236, 180, 255)
      : new Color(235, 245, 255, 255);
    label.string = `${definition.displayName} ×${formatCompactQuantity(quantity)}${atk}${def}${mark}`;
    label.horizontalAlign = Label.HorizontalAlign.LEFT;
    if (isEquipped) this.addEquippedBadge(rowNode, rowWidth);

    this.rows.push({
      kind: 'stack',
      itemId,
      gearId: null,
      tooltipText: `${definition.displayName} ×${quantity}${atk}${def}`,
      root: rowNode,
    });
  }

  private addEquippedBadge(rowNode: Node, rowWidth: number): void {
    const badgeNode = new Node('EquippedBadge');
    badgeNode.layer = Layers.Enum.UI_2D;
    rowNode.addChild(badgeNode);
    badgeNode.setPosition(rowWidth / 2 - 52, 0, 0);
    badgeNode.addComponent(UITransform).setContentSize(88, 28);
    const badgeBg = badgeNode.addComponent(Graphics);
    badgeBg.fillColor = new Color(210, 140, 30, 255);
    badgeBg.roundRect(-44, -14, 88, 28, 8);
    badgeBg.fill();
    const badgeLabelNode = new Node('BadgeText');
    badgeLabelNode.layer = Layers.Enum.UI_2D;
    badgeNode.addChild(badgeLabelNode);
    const badgeLabel = badgeLabelNode.addComponent(Label);
    badgeLabel.fontSize = 14;
    badgeLabel.lineHeight = 18;
    badgeLabel.color = new Color(20, 14, 6, 255);
    badgeLabel.string = '장착중';
    badgeLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    badgeLabel.verticalAlign = Label.VerticalAlign.CENTER;
  }

  /** 상단 요약: 현재 장착 무기·갑옷을 한눈에 보여줍니다. */
  private refreshEquipSummary(inventory: InventoryModel): void {
    const label = this.equipSummaryLabel;
    if (!label) return;
    const gearWeapon = this.gears?.getEquippedWeapon();
    const gearArmor = this.gears?.getEquippedArmor();
    const weaponId = gearWeapon?.itemId ?? inventory.getEquippedWeaponId();
    const armorId = gearArmor?.itemId ?? inventory.getEquippedArmorId();
    const weaponName = getItemDefinition(weaponId).displayName
      + (gearWeapon ? ` +${gearWeapon.upgradeLevel}` : '');
    const armorName = armorId
      ? getItemDefinition(armorId).displayName
        + (gearArmor ? ` +${gearArmor.upgradeLevel}` : '')
      : '없음';
    const weaponTag = weaponId !== DEFAULT_WEAPON_ITEM_ID || gearWeapon
      ? ' [장착중]'
      : '';
    const armorTag = armorId || gearArmor ? ' [장착중]' : '';
    const gearCount = this.gears?.getAll().length ?? 0;
    const storedNote = gearCount > 0 ? `\n강화 장비 보관 ${gearCount}개 (아이템 창 상단)` : '';
    label.string = `장착 중\n무기: ${weaponName}${weaponTag} · 갑옷: ${armorName}${armorTag}${storedNote}`;
  }

  private setScrollOffset(next: number): void {
    const clamped = this.clampScroll(next);
    if (clamped === this.scrollOffset) {
      this.updateScrollHint();
      return;
    }
    this.scrollOffset = clamped;
    this.applyScroll();
  }

  private clampScroll(value: number): number {
    const maxScroll = Math.max(0, this.contentHeight - LIST_VIEW_HEIGHT + 8);
    return Math.min(maxScroll, Math.max(0, value));
  }

  private applyScroll(): void {
    const listRoot = this.listRoot;
    if (!listRoot) return;

    // scrollOffset=0 이면 콘텐츠 상단(강화 장비)이 뷰 상단에 오도록 맞춥니다.
    // 예전에는 목록 중앙 정렬이라 아이템이 많으면 강화 장비가 영원히 안 보였습니다.
    if (this.contentHeight <= LIST_VIEW_HEIGHT) {
      const listCenterY = (LIST_TOP + LIST_BOTTOM) / 2;
      listRoot.setPosition(0, listCenterY, 0);
    } else {
      listRoot.setPosition(
        0,
        LIST_TOP - this.contentHeight / 2 + this.scrollOffset,
        0,
      );
    }

    const viewTop = LIST_TOP;
    const viewBottom = LIST_BOTTOM;
    for (const row of this.rows) {
      if (!row.root.isValid) continue;
      const localY = listRoot.position.y + row.root.position.y;
      const half = row.kind === 'header' ? HEADER_ROW_HEIGHT / 2 : ROW_HEIGHT / 2;
      row.root.active = localY + half >= viewBottom - 4
        && localY - half <= viewTop + 4;
    }
    this.updateScrollHint();
  }

  private updateScrollHint(): void {
    if (!this.scrollHintLabel) return;
    const maxScroll = Math.max(0, this.contentHeight - LIST_VIEW_HEIGHT + 8);
    if (maxScroll <= 0) {
      this.scrollHintLabel.string = '강화 장비 호버=옵션 · 재클릭=해제';
      return;
    }
    const ratio = this.scrollOffset / maxScroll;
    const pct = Math.round(ratio * 100);
    this.scrollHintLabel.string = `휠/↑↓ 스크롤 · ${pct}%`
      + (this.scrollOffset <= 0 ? ' (맨 위)' : '')
      + (this.scrollOffset >= maxScroll ? ' (맨 아래)' : '');
  }

  private isDesignInsidePanel(designX: number, designY: number): boolean {
    const panelCenterX = DESIGN_WIDTH / 2;
    const panelCenterY = DESIGN_HEIGHT / 2 - 40;
    return Math.abs(designX - panelCenterX) <= PANEL_WIDTH / 2
      && Math.abs(designY - panelCenterY) <= PANEL_HEIGHT / 2;
  }

  private isDesignInsideList(designX: number, designY: number): boolean {
    const panelCenterX = DESIGN_WIDTH / 2;
    const panelCenterY = DESIGN_HEIGHT / 2 - 40;
    const localX = designX - panelCenterX;
    const localY = designY - panelCenterY;
    return Math.abs(localX) <= (PANEL_WIDTH - LIST_PAD_X * 2) / 2
      && localY <= LIST_TOP
      && localY >= LIST_BOTTOM;
  }

  private hitTestRow(
    designX: number,
    designY: number,
  ): InventoryRowView | null {
    if (!this.isDesignInsideList(designX, designY)) return null;
    const panelCenterX = DESIGN_WIDTH / 2;
    const panelCenterY = DESIGN_HEIGHT / 2 - 40;
    const localX = designX - panelCenterX;
    const localY = designY - panelCenterY;
    const listRoot = this.listRoot;
    if (!listRoot) return null;

    for (const row of this.rows) {
      if (row.kind === 'header' || !row.root.active) continue;
      const rowLocalY = listRoot.position.y + row.root.position.y;
      if (
        Math.abs(localX - row.root.position.x) <= (PANEL_WIDTH - LIST_PAD_X * 2) / 2
        && Math.abs(localY - rowLocalY) <= ROW_HEIGHT / 2
      ) {
        return row;
      }
    }
    return null;
  }

  private updateHoverTooltip(): void {
    if (!this.tooltip || !this.isOpen) return;
    const design = normalizeUiToDesign(this.hoverLocation.x, this.hoverLocation.y);
    const row = this.hitTestRow(design.x, design.y);
    if (!row || !row.tooltipText) {
      this.tooltip.hide();
      return;
    }
    this.tooltip.show(row.tooltipText, this.hoverLocation);
  }

  private handlePointer(): void {
    const now = Date.now();
    if (now - this.lastPointerHandledAtMs < 400) return;
    this.lastPointerHandledAtMs = now;

    const design = normalizeUiToDesign(
      this.pointerLocation.x,
      this.pointerLocation.y,
    );
    const row = this.hitTestRow(design.x, design.y);
    if (!row) return;
    if (row.kind === 'gear' && row.gearId) {
      this.onGearRowClicked(row.gearId);
      return;
    }
    if (row.kind === 'stack' && row.itemId) {
      this.onStackRowClicked(row.itemId);
    }
  }

  private onGearRowClicked(gearId: string): void {
    const gears = this.gears;
    const inventory = this.inventory;
    const gear = gears?.findById(gearId);
    if (!gears || !gear || !inventory) return;
    const def = getItemDefinition(gear.itemId);
    this.suppressListenerRefresh = true;
    try {
      if (isEquipableArmor(gear.itemId)) {
        const was = gears.getEquippedArmorGearId() === gearId;
        if (was) {
          gears.equipArmorGear(null);
          this.showMessage(`${def.displayName} +${gear.upgradeLevel} 갑옷 해제 · 강화 장비에 보관됨`);
        } else {
          gears.equipArmorGear(gearId);
          // 일반 갑옷 장착 표시와 충돌하지 않게 비웁니다.
          inventory.unequipArmor();
          this.showMessage(`${def.displayName} +${gear.upgradeLevel} 갑옷 장착`);
        }
      } else if (isEquipableWeapon(gear.itemId)) {
        const was = gears.getEquippedWeaponGearId() === gearId;
        if (was) {
          gears.equipWeaponGear(null);
          this.showMessage(`${def.displayName} +${gear.upgradeLevel} 해제 · 강화 장비에 보관됨`);
        } else {
          gears.equipWeaponGear(gearId);
          // 일반 무기 슬롯은 주먹으로 맞춰, 나중에 다른 검 클릭 시 토글 오동작을 막습니다.
          inventory.unequipWeaponToFist();
          inventory.selectHotbarIndex(0);
          this.showMessage(`${def.displayName} +${gear.upgradeLevel} 무기 장착`);
        }
      }
      this.refreshRows();
    } finally {
      this.suppressListenerRefresh = false;
    }
  }

  private onStackRowClicked(itemId: ItemId): void {
    const inventory = this.inventory;
    if (!inventory) return;

    this.suppressListenerRefresh = true;
    try {
      if (isEquipableWeapon(itemId)) {
        const previousGear = this.gears?.getEquippedWeapon() ?? null;
        if (previousGear) {
          this.gears?.equipWeaponGear(null);
          const ok = inventory.setEquippedWeapon(itemId);
          if (!ok) {
            // 장착 실패 시 강화 무기 복구
            this.gears?.equipWeaponGear(previousGear.id);
            return;
          }
          const prevName = getItemDefinition(previousGear.itemId).displayName;
          this.showMessage(
            `${getItemDefinition(itemId).displayName} 장착 · `
            + `${prevName} +${previousGear.upgradeLevel}은(는) 강화 장비에 보관됨`,
          );
          inventory.selectHotbarIndex(0);
          this.refreshRows();
          return;
        }

        const before = inventory.getEquippedWeaponId();
        const wasEquipped = before === itemId;
        const ok = inventory.equipWeapon(itemId);
        if (!ok) return;
        const after = inventory.getEquippedWeaponId();
        if (wasEquipped || after === DEFAULT_WEAPON_ITEM_ID) {
          this.showMessage(
            `${getItemDefinition(itemId).displayName} 해제 → 주먹`,
          );
        } else {
          this.showMessage(
            `${getItemDefinition(after).displayName} 장착 (무기 슬롯 1개)`,
          );
        }
        inventory.selectHotbarIndex(0);
        this.refreshRows();
        return;
      }

      if (isEquipableArmor(itemId)) {
        const previousGear = this.gears?.getEquippedArmor() ?? null;
        if (previousGear) {
          this.gears?.equipArmorGear(null);
          const ok = inventory.setEquippedArmor(itemId);
          if (!ok) {
            this.gears?.equipArmorGear(previousGear.id);
            return;
          }
          const prevName = getItemDefinition(previousGear.itemId).displayName;
          this.showMessage(
            `${getItemDefinition(itemId).displayName} 장착 · `
            + `${prevName} +${previousGear.upgradeLevel}은(는) 강화 장비에 보관됨`,
          );
          this.refreshRows();
          return;
        }

        const before = inventory.getEquippedArmorId();
        const wasEquipped = before === itemId;
        const ok = inventory.equipArmor(itemId);
        if (!ok) return;
        const after = inventory.getEquippedArmorId();
        if (wasEquipped || !after) {
          this.showMessage(
            `${getItemDefinition(itemId).displayName} 갑옷 해제`,
          );
        } else {
          this.showMessage(
            `${getItemDefinition(after).displayName} 장착 (갑옷 1개 · DEF ${getItemDefinition(after).defensePower ?? 0})`,
          );
        }
        this.refreshRows();
      }
    } finally {
      this.suppressListenerRefresh = false;
    }
  }
}

function formatGearTooltip(gear: GearInstance): string {
  const def = getItemDefinition(gear.itemId);
  const lines = [
    `${def.displayName} +${gear.upgradeLevel}`,
    `추가 ATK ${gear.bonusAttack} · 추가 DEF ${gear.bonusDefense}`,
  ];
  let hasOption = false;
  for (const grade of AFFIX_GRADES) {
    const affix = gear.options[grade];
    if (!affix) continue;
    hasOption = true;
    lines.push(`[${AFFIX_GRADE_LABEL[grade]}] ${describeAffix(affix)}`);
  }
  if (!hasOption) lines.push('옵션 없음');
  return lines.join('\n');
}
