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

import {
  consumeKeyEvent,
  isEscapeKey,
} from '../input/dom-keyboard';
import {
  describeSlotRow,
  type SaveSessionController,
} from '../save/save-session-controller';
import {
  FIXED_SAVE_SLOT_COUNT,
  type SaveSlotListRow,
} from '../save/save-slots';
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  normalizeUiToDesign,
  setLoadMenuOpen,
} from './hud-layout';

const { ccclass } = _decorator;

const PANEL_WIDTH = 680;
const PANEL_HEIGHT = 640;
const ROW_HEIGHT = 64;
const ROW_GAP = 8;
const ROW_STRIDE = ROW_HEIGHT + ROW_GAP;
const TITLE_RESERVE = 56;
const HINT_RESERVE = 48;
const LIST_TOP = PANEL_HEIGHT / 2 - TITLE_RESERVE;
const LIST_BOTTOM = -PANEL_HEIGHT / 2 + HINT_RESERVE;
const LIST_VIEW_HEIGHT = LIST_TOP - LIST_BOTTOM;
const SCROLL_STEP = ROW_STRIDE;
/** 이 거리(디자인 px) 이상 움직이면 탭이 아니라 스크롤로 봅니다. */
const TOUCH_DRAG_THRESHOLD = 14;
const TOTAL_LOAD_ROWS = FIXED_SAVE_SLOT_COUNT + 1; // 슬롯 + 원본세이브파일로드
const TOTAL_SAVE_ROWS = FIXED_SAVE_SLOT_COUNT;

type MenuMode = 'load' | 'save';
type RowKind = 'slot' | 'import';

interface LoadRowView {
  readonly kind: RowKind;
  readonly slotIndex: number | null;
  readonly root: Node;
  readonly background: Graphics;
  readonly label: Label;
}

/**
 * 불러오기/저장 슬롯 목록 UI입니다.
 * 세이브 1~30(+불러오기 시 원본파일), 터치 드래그/마우스 휠/방향키로 스크롤합니다.
 */
@ccclass('LoadMenuHud')
export class LoadMenuHud extends Component {
  private readonly pointerLocation = new Vec2();
  private readonly rows: LoadRowView[] = [];
  private readonly onDomKeyDown = (event: KeyboardEvent): void => {
    if (!this.isOpen || !isEscapeKey(event)) return;
    consumeKeyEvent(event);
    this.setOpen(false);
  };

  private saveSession: SaveSessionController | null = null;
  private cameraNode: Node | null = null;
  private panelRoot: Node | null = null;
  private listRoot: Node | null = null;
  private titleLabel: Label | null = null;
  private hintLabel: Label | null = null;
  private slotRows: SaveSlotListRow[] = [];
  private isOpen = false;
  private mode: MenuMode = 'load';
  private scrollOffset = 0;
  private contentHeight = 0;
  private touchScrolling = false;
  private touchDragged = false;
  private touchStartDesignY = 0;
  private touchStartScroll = 0;
  private activeTouchId: number | null = null;

  configure(
    saveSession: SaveSessionController,
    cameraNode: Node,
  ): void {
    this.saveSession = saveSession;
    this.cameraNode = cameraNode;
    this.buildPanel();
    saveSession.setOpenLoadMenuHandler(() => {
      void this.openAndRefresh('load');
    });
    saveSession.setOpenSaveMenuHandler(() => {
      void this.openAndRefresh('save');
    });
    this.setOpen(false);
  }

  protected onEnable(): void {
    window.addEventListener('keydown', this.onDomKeyDown, true);
    input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
    input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
    input.on(Input.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
  }

  protected onDisable(): void {
    window.removeEventListener('keydown', this.onDomKeyDown, true);
    input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
    input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
    input.off(Input.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
    this.resetTouchScroll();
    setLoadMenuOpen(false);
  }

  protected lateUpdate(): void {
    if (!this.cameraNode) return;
    const camera = this.cameraNode.position;
    this.node.setPosition(camera.x, camera.y - 40, 0);
  }

  private onKeyDown(event: EventKeyboard): void {
    if (!this.isOpen) return;
    if (event.keyCode === KeyCode.ESCAPE) {
      this.setOpen(false);
      return;
    }
    if (event.keyCode === KeyCode.ARROW_UP) {
      this.setScrollOffset(this.scrollOffset - SCROLL_STEP);
      return;
    }
    if (event.keyCode === KeyCode.ARROW_DOWN) {
      this.setScrollOffset(this.scrollOffset + SCROLL_STEP);
      return;
    }
    if (event.keyCode === KeyCode.PAGE_UP) {
      this.setScrollOffset(this.scrollOffset - LIST_VIEW_HEIGHT);
      return;
    }
    if (event.keyCode === KeyCode.PAGE_DOWN) {
      this.setScrollOffset(this.scrollOffset + LIST_VIEW_HEIGHT);
    }
  }

  private onMouseUp(event: EventMouse): void {
    if (!this.isOpen || event.getButton() !== EventMouse.BUTTON_LEFT) return;
    event.getUILocation(this.pointerLocation);
    this.handlePointer(this.pointerLocation);
  }

  private onTouchStart(event: EventTouch): void {
    if (!this.isOpen || this.activeTouchId !== null) return;
    const touchId = event.getID();
    if (touchId === null) return;
    event.getUILocation(this.pointerLocation);
    const design = normalizeUiToDesign(
      this.pointerLocation.x,
      this.pointerLocation.y,
    );
    if (!this.isOverListArea(design.x, design.y)) return;
    this.activeTouchId = touchId;
    this.touchScrolling = true;
    this.touchDragged = false;
    this.touchStartDesignY = design.y;
    this.touchStartScroll = this.scrollOffset;
  }

  private onTouchMove(event: EventTouch): void {
    if (!this.isOpen || !this.touchScrolling) return;
    if (event.getID() !== this.activeTouchId) return;
    event.getUILocation(this.pointerLocation);
    const design = normalizeUiToDesign(
      this.pointerLocation.x,
      this.pointerLocation.y,
    );
    const deltaY = design.y - this.touchStartDesignY;
    if (Math.abs(deltaY) >= TOUCH_DRAG_THRESHOLD) {
      this.touchDragged = true;
    }
    // 손가락을 위로 올리면 아래 슬롯이 보이도록 스크롤을 증가시킵니다.
    this.setScrollOffset(this.touchStartScroll - deltaY);
  }

  private onTouchEnd(event: EventTouch): void {
    if (!this.isOpen) return;
    if (this.activeTouchId !== null && event.getID() !== this.activeTouchId) {
      return;
    }
    const wasDrag = this.touchDragged;
    this.resetTouchScroll();
    if (wasDrag) return;
    event.getUILocation(this.pointerLocation);
    this.handlePointer(this.pointerLocation);
  }

  private onTouchCancel(event: EventTouch): void {
    if (this.activeTouchId !== null && event.getID() !== this.activeTouchId) {
      return;
    }
    this.resetTouchScroll();
  }

  private resetTouchScroll(): void {
    this.touchScrolling = false;
    this.touchDragged = false;
    this.activeTouchId = null;
  }

  private onMouseWheel(event: EventMouse): void {
    if (!this.isOpen) return;
    const design = normalizeUiToDesign(
      event.getUILocation().x,
      event.getUILocation().y,
    );
    if (!this.isOverPanel(design.x, design.y)) return;
    const scrollY = event.getScrollY();
    this.setScrollOffset(
      this.scrollOffset + (scrollY > 0 ? -SCROLL_STEP : SCROLL_STEP),
    );
  }

  private handlePointer(uiLocation: Vec2): void {
    const design = normalizeUiToDesign(uiLocation.x, uiLocation.y);
    const index = this.hitTestRow(design.x, design.y);
    if (index === null) {
      if (!this.isOverPanel(design.x, design.y)) this.setOpen(false);
      return;
    }
    void this.activateRow(index);
  }

  private async openAndRefresh(mode: MenuMode): Promise<void> {
    this.mode = mode;
    this.scrollOffset = 0;
    this.setOpen(true);
    await this.refreshRows();
  }

  private setOpen(open: boolean): void {
    this.isOpen = open;
    setLoadMenuOpen(open);
    if (this.panelRoot) this.panelRoot.active = open;
    if (!open) {
      this.resetTouchScroll();
      return;
    }
    this.scrollOffset = 0;
    void this.refreshRows();
  }

  private visibleRowCount(): number {
    return this.mode === 'save' ? TOTAL_SAVE_ROWS : TOTAL_LOAD_ROWS;
  }

  private async refreshRows(): Promise<void> {
    if (!this.saveSession) return;
    this.slotRows = [...await this.saveSession.listSlotRows()];
    this.contentHeight = this.visibleRowCount() * ROW_STRIDE - ROW_GAP;

    if (this.titleLabel) {
      this.titleLabel.string = this.mode === 'save'
        ? `저장할 슬롯 선택 (세이브 1~${FIXED_SAVE_SLOT_COUNT})`
        : `불러오기 (세이브 1~${FIXED_SAVE_SLOT_COUNT})`;
    }
    if (this.hintLabel) {
      this.hintLabel.string = this.mode === 'save'
        ? '슬롯 선택 시 저장 · 드래그로 스크롤 · ESC 닫기'
        : '드래그·휠 스크롤 · ESC 닫기 · 빈 슬롯=현재 진행 저장';
    }

    for (let index = 0; index < this.rows.length; index += 1) {
      const view = this.rows[index];
      if (!view) continue;
      if (view.kind === 'import') {
        const showImport = this.mode === 'load';
        view.root.active = showImport;
        if (showImport) {
          view.label.string = '원본세이브파일로드';
          paintRow(view.background, false, true);
        }
        continue;
      }
      const slot = this.slotRows[view.slotIndex ?? -1];
      if (!slot) continue;
      view.label.string = describeSlotRow(slot);
      paintRow(view.background, Boolean(slot.summary), slot.isActive);
    }
    this.setScrollOffset(this.scrollOffset);
  }

  private setScrollOffset(next: number): void {
    const maxScroll = Math.max(0, this.contentHeight - LIST_VIEW_HEIGHT);
    this.scrollOffset = Math.min(maxScroll, Math.max(0, next));
    this.applyScroll();
  }

  private applyScroll(): void {
    if (!this.listRoot) return;
    // 스크롤이 커질수록 목록이 위로 올라갑니다.
    this.listRoot.setPosition(0, this.scrollOffset, 0);
    const visibleCount = this.visibleRowCount();
    for (let index = 0; index < this.rows.length; index += 1) {
      const view = this.rows[index];
      if (!view) continue;
      if (index >= visibleCount) {
        view.root.active = false;
        continue;
      }
      const y = this.rowLocalY(index);
      const worldY = y + this.scrollOffset;
      const visible = worldY <= LIST_TOP + ROW_HEIGHT / 2
        && worldY >= LIST_BOTTOM - ROW_HEIGHT / 2;
      view.root.active = visible;
    }
  }

  private rowLocalY(index: number): number {
    return LIST_TOP - ROW_HEIGHT / 2 - index * ROW_STRIDE;
  }

  private async activateRow(index: number): Promise<void> {
    const view = this.rows[index];
    if (!view || !this.saveSession) return;
    if (index >= this.visibleRowCount()) return;

    if (view.kind === 'import') {
      this.setOpen(false);
      await this.saveSession.importNow();
      return;
    }

    const slot = this.slotRows[view.slotIndex ?? -1];
    if (!slot) return;

    if (this.mode === 'save') {
      if (slot.summary) {
        const confirmed = globalThis.confirm?.(
          `${slot.displayName}에 이미 세이브가 있습니다.\n`
          + `레벨 ${slot.summary.playerLevel} 세이브를 덮어쓸까요?`,
        );
        if (!confirmed) return;
      }
      this.setOpen(false);
      await this.saveSession.saveToSlot(slot.slotId, true);
      return;
    }

    if (slot.summary) {
      this.setOpen(false);
      await this.saveSession.loadSlotById(slot.slotId);
      return;
    }

    const confirmed = globalThis.confirm?.(
      `${slot.displayName}은(는) 비어 있습니다.\n현재 진행을 이 슬롯에 저장할까요?`,
    );
    if (!confirmed) return;
    this.setOpen(false);
    await this.saveSession.saveToSlot(slot.slotId, true);
  }

  private buildPanel(): void {
    const root = new Node('LoadMenu');
    root.layer = Layers.Enum.UI_2D;
    this.node.addChild(root);
    root.addComponent(UITransform).setContentSize(PANEL_WIDTH, PANEL_HEIGHT);
    this.panelRoot = root;

    const bg = root.addComponent(Graphics);
    bg.fillColor = new Color(16, 22, 34, 240);
    bg.rect(-PANEL_WIDTH / 2, -PANEL_HEIGHT / 2, PANEL_WIDTH, PANEL_HEIGHT);
    bg.fill();
    bg.strokeColor = new Color(130, 190, 230, 255);
    bg.lineWidth = 2;
    bg.rect(-PANEL_WIDTH / 2, -PANEL_HEIGHT / 2, PANEL_WIDTH, PANEL_HEIGHT);
    bg.stroke();

    const titleNode = new Node('Title');
    titleNode.layer = Layers.Enum.UI_2D;
    root.addChild(titleNode);
    titleNode.setPosition(0, PANEL_HEIGHT / 2 - 28, 0);
    titleNode.addComponent(UITransform).setContentSize(PANEL_WIDTH - 24, 36);
    const title = titleNode.addComponent(Label);
    title.string = `불러오기 (세이브 1~${FIXED_SAVE_SLOT_COUNT})`;
    title.fontSize = 26;
    title.lineHeight = 30;
    title.color = new Color(235, 245, 255, 255);
    this.titleLabel = title;

    const listRoot = new Node('ListRoot');
    listRoot.layer = Layers.Enum.UI_2D;
    root.addChild(listRoot);
    this.listRoot = listRoot;

    for (let index = 0; index < TOTAL_LOAD_ROWS; index += 1) {
      const isImport = index === FIXED_SAVE_SLOT_COUNT;
      const rowNode = new Node(isImport ? 'ImportRow' : `SlotRow${index}`);
      rowNode.layer = Layers.Enum.UI_2D;
      listRoot.addChild(rowNode);
      rowNode.setPosition(0, this.rowLocalY(index), 0);
      rowNode.addComponent(UITransform).setContentSize(PANEL_WIDTH - 40, ROW_HEIGHT);

      const rowBg = rowNode.addComponent(Graphics);
      const labelNode = new Node('Label');
      labelNode.layer = Layers.Enum.UI_2D;
      rowNode.addChild(labelNode);
      labelNode.addComponent(UITransform).setContentSize(PANEL_WIDTH - 64, ROW_HEIGHT - 8);
      const label = labelNode.addComponent(Label);
      label.fontSize = 20;
      label.lineHeight = 26;
      label.color = new Color(255, 255, 255, 255);
      label.horizontalAlign = Label.HorizontalAlign.LEFT;
      label.verticalAlign = Label.VerticalAlign.CENTER;
      label.overflow = Label.Overflow.SHRINK;
      label.string = '';

      this.rows.push({
        kind: isImport ? 'import' : 'slot',
        slotIndex: isImport ? null : index,
        root: rowNode,
        background: rowBg,
        label,
      });
    }

    this.contentHeight = TOTAL_LOAD_ROWS * ROW_STRIDE - ROW_GAP;

    const hintNode = new Node('Hint');
    hintNode.layer = Layers.Enum.UI_2D;
    root.addChild(hintNode);
    hintNode.setPosition(0, -PANEL_HEIGHT / 2 + 24, 0);
    hintNode.addComponent(UITransform).setContentSize(PANEL_WIDTH - 32, 28);
    const hint = hintNode.addComponent(Label);
    hint.fontSize = 17;
    hint.lineHeight = 22;
    hint.color = new Color(180, 200, 220, 255);
    hint.string = '';
    this.hintLabel = hint;
  }

  private hitTestRow(uiX: number, uiY: number): number | null {
    if (!this.isOverListArea(uiX, uiY)) return null;
    const panelCenterUiY = DESIGN_HEIGHT / 2 - 40;
    const relY = uiY - panelCenterUiY;
    for (let index = 0; index < this.rows.length; index += 1) {
      const view = this.rows[index];
      if (!view || !view.root.active) continue;
      const y = this.rowLocalY(index) + this.scrollOffset;
      if (Math.abs(relY - y) <= ROW_HEIGHT / 2) return index;
    }
    return null;
  }

  private isOverListArea(uiX: number, uiY: number): boolean {
    if (!this.isOverPanel(uiX, uiY)) return false;
    const panelCenterUiY = DESIGN_HEIGHT / 2 - 40;
    const relY = uiY - panelCenterUiY;
    return relY <= LIST_TOP && relY >= LIST_BOTTOM;
  }

  private isOverPanel(uiX: number, uiY: number): boolean {
    const panelCenterUiX = DESIGN_WIDTH / 2;
    const panelCenterUiY = DESIGN_HEIGHT / 2 - 40;
    return Math.abs(uiX - panelCenterUiX) <= PANEL_WIDTH / 2
      && Math.abs(uiY - panelCenterUiY) <= PANEL_HEIGHT / 2;
  }
}

function paintRow(
  graphics: Graphics,
  hasSave: boolean,
  highlight: boolean,
): void {
  graphics.clear();
  if (highlight) {
    graphics.fillColor = new Color(50, 84, 64, 230);
  } else if (hasSave) {
    graphics.fillColor = new Color(36, 58, 88, 230);
  } else {
    graphics.fillColor = new Color(40, 44, 52, 200);
  }
  graphics.rect(-(PANEL_WIDTH - 40) / 2, -ROW_HEIGHT / 2, PANEL_WIDTH - 40, ROW_HEIGHT);
  graphics.fill();
}
