import {
  _decorator,
  Color,
  Component,
  EventMouse,
  EventTouch,
  Graphics,
  Input,
  input,
  Label,
  Layers,
  Node,
  UITransform,
  Vec2,
} from 'cc';

import type { BgmPlaylistPlayer } from '../audio/bgm-playlist-player';
import { DomAudioSettingsUi } from '../audio/dom-audio-settings-ui';
import type { SfxPlayer } from '../audio/sfx-player';
import {
  GAME_BALANCE_ROWS,
  type GameBalanceKey,
  type GameBalanceSettings,
} from '../core/game-balance-settings';
import {
  consumeKeyEvent,
  isEscapeKey,
} from '../input/dom-keyboard';
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  normalizeUiToDesign,
  setSettingsPanelOpen,
  SETTINGS_BUTTON_SIZE,
  SETTINGS_LIST_VIEW_HEIGHT,
  SETTINGS_PANEL_HEIGHT,
  SETTINGS_PANEL_WIDTH,
  SETTINGS_ROW_HEIGHT,
} from './hud-layout';

const { ccclass } = _decorator;

interface NodeHitTarget {
  readonly node: Node;
  readonly action: () => void;
  readonly onPress?: boolean;
}

/**
 * 좌측 「설정」버튼으로 여는 게임 밸런스 패널입니다.
 * 오디오는 DomAudioSettingsUi의 「오디오」버튼에서 따로 엽니다.
 */
@ccclass('SettingsHud')
export class SettingsHud extends Component {
  private readonly pointerLocation = new Vec2();
  private balance: GameBalanceSettings | null = null;
  private sfx: SfxPlayer | null = null;
  private cameraNode: Node | null = null;
  private panelRoot: Node | null = null;
  private listRoot: Node | null = null;
  private valueLabels = new Map<GameBalanceKey, Label>();
  private nodeHits: NodeHitTarget[] = [];
  private isOpen = false;
  private panelOffsetX = 0;
  private panelOffsetY = 0;
  private topLeftOffsetX = 0;
  private topLeftOffsetY = 0;
  private scrollOffset = 0;
  private pressConsumed = false;
  private readonly domAudioUi = new DomAudioSettingsUi();
  private readonly onDomKeyDown = (event: KeyboardEvent): void => {
    if (!this.isOpen || !isEscapeKey(event)) return;
    consumeKeyEvent(event);
    this.setOpen(false);
  };

  configure(
    balance: GameBalanceSettings,
    cameraNode: Node,
    bgm: BgmPlaylistPlayer,
    sfx: SfxPlayer,
  ): void {
    this.balance = balance;
    this.cameraNode = cameraNode;
    this.sfx = sfx;
    this.topLeftOffsetX = -DESIGN_WIDTH / 2 + 18;
    this.topLeftOffsetY = DESIGN_HEIGHT / 2 - 18;
    this.panelRoot = this.buildPanel();
    this.domAudioUi.mount(bgm, sfx, (open) => {
      this.setOpen(open);
    });
    this.setOpen(false);
    balance.addListener(() => this.refreshValues());
  }

  protected onDestroy(): void {
    this.domAudioUi.destroy();
  }

  protected onEnable(): void {
    input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
    input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
    input.on(Input.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
    window.addEventListener('keydown', this.onDomKeyDown, true);
  }

  protected onDisable(): void {
    input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
    input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
    input.off(Input.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
    window.removeEventListener('keydown', this.onDomKeyDown, true);
  }

  protected lateUpdate(): void {
    if (!this.cameraNode) return;
    const camera = this.cameraNode.position;
    this.node.setPosition(
      camera.x + this.topLeftOffsetX,
      camera.y + this.topLeftOffsetY,
      0,
    );
    if (this.node.parent) {
      this.node.setSiblingIndex(this.node.parent.children.length - 1);
    }
  }

  setOpen(isOpen: boolean): void {
    this.isOpen = isOpen;
    setSettingsPanelOpen(isOpen);
    this.domAudioUi.setGameSettingsOpen(isOpen);

    if (this.panelRoot) {
      this.panelOffsetX = SETTINGS_PANEL_WIDTH / 2 + 96;
      this.panelOffsetY = -SETTINGS_PANEL_HEIGHT / 2 - 20;
      this.panelRoot.setPosition(
        isOpen ? this.panelOffsetX : 100000,
        isOpen ? this.panelOffsetY : 0,
        0,
      );
      if (isOpen) {
        this.applyScroll();
        this.rebuildHitTargets();
      }
    }
    if (isOpen) {
      this.node.setSiblingIndex(this.node.parent!.children.length - 1);
      this.refreshValues();
    }
  }

  private onMouseDown(event: EventMouse): void {
    if (event.getButton() !== EventMouse.BUTTON_LEFT) return;
    event.getUILocation(this.pointerLocation);
    this.pressConsumed = false;
    this.sfx?.unlock();
    if (!this.isOpen) return;
    if (this.tryHandlePress(this.pointerLocation.x, this.pointerLocation.y, true)) {
      this.pressConsumed = true;
      event.propagationStopped = true;
    }
  }

  private onTouchStart(event: EventTouch): void {
    event.getUILocation(this.pointerLocation);
    this.pressConsumed = false;
    this.sfx?.unlock();
    if (!this.isOpen) return;
    if (this.tryHandlePress(this.pointerLocation.x, this.pointerLocation.y, true)) {
      this.pressConsumed = true;
    }
  }

  private onMouseUp(event: EventMouse): void {
    if (event.getButton() !== EventMouse.BUTTON_LEFT) return;
    event.getUILocation(this.pointerLocation);
    if (this.pressConsumed) {
      this.pressConsumed = false;
      return;
    }
    this.handlePointerRelease();
  }

  private onTouchEnd(event: EventTouch): void {
    event.getUILocation(this.pointerLocation);
    if (this.pressConsumed) {
      this.pressConsumed = false;
      return;
    }
    this.handlePointerRelease();
  }

  private onMouseWheel(event: EventMouse): void {
    if (!this.isOpen) return;
    const design = normalizeUiToDesign(
      event.getUILocation().x,
      event.getUILocation().y,
    );
    if (!this.isDesignInsidePanel(design.x, design.y)) return;

    const scrollY = event.getScrollY();
    this.scrollOffset = clampScroll(
      this.scrollOffset + (scrollY > 0 ? -40 : 40),
    );
    this.applyScroll();
    this.rebuildHitTargets();
  }

  private handlePointerRelease(): void {
    if (!this.isOpen) return;
    if (this.tryHandlePress(this.pointerLocation.x, this.pointerLocation.y, false)) {
      return;
    }
    const design = normalizeUiToDesign(
      this.pointerLocation.x,
      this.pointerLocation.y,
    );
    if (!this.isDesignInsidePanel(design.x, design.y)) {
      this.setOpen(false);
    }
  }

  private tryHandlePress(
    rawUiX: number,
    rawUiY: number,
    onPressOnly: boolean,
  ): boolean {
    this.rebuildHitTargets();
    const hit = this.findHitTarget(rawUiX, rawUiY);
    if (!hit) return false;
    if (onPressOnly && !hit.onPress) return false;
    if (!onPressOnly && hit.onPress) return false;
    hit.action();
    return true;
  }

  private findHitTarget(rawUiX: number, rawUiY: number): NodeHitTarget | null {
    if (!this.cameraNode) return null;
    const design = normalizeUiToDesign(rawUiX, rawUiY);
    const camera = this.cameraNode.position;
    const worldX = camera.x + design.x - DESIGN_WIDTH / 2;
    const worldY = camera.y + design.y - DESIGN_HEIGHT / 2;

    for (const target of this.nodeHits) {
      if (!target.node.isValid || !target.node.activeInHierarchy) continue;
      const transform = target.node.getComponent(UITransform);
      if (!transform) continue;
      const pos = target.node.worldPosition;
      const halfW = transform.contentSize.width / 2 + 8;
      const halfH = transform.contentSize.height / 2 + 8;
      if (
        Math.abs(worldX - pos.x) <= halfW
        && Math.abs(worldY - pos.y) <= halfH
      ) {
        return target;
      }
    }
    return null;
  }

  private isDesignInsidePanel(designX: number, designY: number): boolean {
    const localX = designX - (18 + this.panelOffsetX);
    const localY = designY - (DESIGN_HEIGHT - 18 + this.panelOffsetY);
    return Math.abs(localX) <= SETTINGS_PANEL_WIDTH / 2
      && Math.abs(localY) <= SETTINGS_PANEL_HEIGHT / 2;
  }

  private refreshValues(): void {
    if (!this.balance) return;
    for (const row of GAME_BALANCE_ROWS) {
      const label = this.valueLabels.get(row.key);
      if (label) label.string = this.balance.formatValue(row.key);
    }
  }

  private buildPanel(): Node {
    const root = new Node('SettingsPanel');
    root.layer = Layers.Enum.UI_2D;
    this.node.addChild(root);
    root.addComponent(UITransform).setContentSize(
      SETTINGS_PANEL_WIDTH,
      SETTINGS_PANEL_HEIGHT,
    );

    const graphics = root.addComponent(Graphics);
    graphics.fillColor = new Color(18, 26, 38, 240);
    graphics.roundRect(
      -SETTINGS_PANEL_WIDTH / 2,
      -SETTINGS_PANEL_HEIGHT / 2,
      SETTINGS_PANEL_WIDTH,
      SETTINGS_PANEL_HEIGHT,
      16,
    );
    graphics.fill();
    graphics.strokeColor = new Color(130, 170, 210, 255);
    graphics.lineWidth = 3;
    graphics.roundRect(
      -SETTINGS_PANEL_WIDTH / 2,
      -SETTINGS_PANEL_HEIGHT / 2,
      SETTINGS_PANEL_WIDTH,
      SETTINGS_PANEL_HEIGHT,
      16,
    );
    graphics.stroke();

    this.addLabel(root, '게임 설정', 0, SETTINGS_PANEL_HEIGHT / 2 - 26, 26);
    this.addLabel(
      root,
      '몬스터·채집·전투 밸런스를 조절합니다',
      0,
      SETTINGS_PANEL_HEIGHT / 2 - 50,
      13,
    );

    const list = new Node('SettingsList');
    list.layer = Layers.Enum.UI_2D;
    root.addChild(list);
    this.listRoot = list;
    const startY = SETTINGS_LIST_VIEW_HEIGHT / 2 - 10;
    GAME_BALANCE_ROWS.forEach((row, index) => {
      this.buildRow(list, row.key, row.label, startY - index * SETTINGS_ROW_HEIGHT);
    });

    this.buildActionButton(root, '기본값', -110, -SETTINGS_PANEL_HEIGHT / 2 + 40);
    this.buildActionButton(root, '닫기', 110, -SETTINGS_PANEL_HEIGHT / 2 + 40);
    this.applyScroll();
    return root;
  }

  private applyScroll(): void {
    if (!this.listRoot) return;
    const listTop = SETTINGS_PANEL_HEIGHT / 2 - 70;
    this.listRoot.setPosition(
      0,
      listTop - SETTINGS_LIST_VIEW_HEIGHT / 2 + this.scrollOffset,
    );
    const viewTop = listTop;
    const viewBottom = listTop - SETTINGS_LIST_VIEW_HEIGHT;
    for (const child of this.listRoot.children) {
      const worldY = this.listRoot.position.y + child.position.y;
      child.active = worldY <= viewTop + 8 && worldY >= viewBottom - 8;
    }
  }

  private rebuildHitTargets(): void {
    if (!this.panelRoot || !this.listRoot) return;
    this.nodeHits = [];

    const reset = this.panelRoot.getChildByName('Action_기본값');
    if (reset) {
      this.nodeHits.push({
        node: reset,
        action: () => this.balance?.resetToDefaults(),
      });
    }
    const close = this.panelRoot.getChildByName('Action_닫기');
    if (close) {
      this.nodeHits.push({
        node: close,
        action: () => this.setOpen(false),
      });
    }

    for (const child of this.listRoot.children) {
      if (!child.active || !child.name.startsWith('Step_')) continue;
      const isPlus = child.name.includes('Step_+');
      const row = GAME_BALANCE_ROWS.find((entry) => {
        const startY = SETTINGS_LIST_VIEW_HEIGHT / 2 - 10;
        const index = GAME_BALANCE_ROWS.indexOf(entry);
        return Math.abs(child.position.y - (startY - index * SETTINGS_ROW_HEIGHT)) < 1;
      });
      if (!row) continue;
      this.nodeHits.push({
        node: child,
        action: () => this.balance?.adjust(row.key, isPlus ? 1 : -1),
      });
    }
  }

  private buildRow(
    parent: Node,
    key: GameBalanceKey,
    label: string,
    rowY: number,
  ): void {
    this.addLabel(parent, label, -190, rowY, 16);
    this.buildStepButton(parent, '-', -20, rowY);
    const valueNode = new Node(`Value_${key}`);
    valueNode.layer = Layers.Enum.UI_2D;
    parent.addChild(valueNode);
    valueNode.setPosition(90, rowY);
    const valueLabel = valueNode.addComponent(Label);
    valueLabel.fontSize = 16;
    valueLabel.lineHeight = 20;
    valueLabel.color = new Color(255, 230, 120, 255);
    valueLabel.string = this.balance?.formatValue(key) ?? '';
    this.valueLabels.set(key, valueLabel);
    this.buildStepButton(parent, '+', 200, rowY);
  }

  private buildStepButton(
    parent: Node,
    text: string,
    x: number,
    y: number,
  ): Node {
    const button = new Node(`Step_${text}_${x}`);
    button.layer = Layers.Enum.UI_2D;
    parent.addChild(button);
    button.setPosition(x, y);
    button.addComponent(UITransform).setContentSize(
      SETTINGS_BUTTON_SIZE,
      SETTINGS_BUTTON_SIZE,
    );
    const graphics = button.addComponent(Graphics);
    graphics.fillColor = new Color(50, 70, 95, 255);
    graphics.roundRect(
      -SETTINGS_BUTTON_SIZE / 2,
      -SETTINGS_BUTTON_SIZE / 2,
      SETTINGS_BUTTON_SIZE,
      SETTINGS_BUTTON_SIZE,
      6,
    );
    graphics.fill();
    const labelNode = new Node('Label');
    labelNode.layer = Layers.Enum.UI_2D;
    button.addChild(labelNode);
    const label = labelNode.addComponent(Label);
    label.fontSize = 22;
    label.lineHeight = 26;
    label.color = new Color(245, 250, 255, 255);
    label.string = text;
    return button;
  }

  private buildActionButton(parent: Node, text: string, x: number, y: number): void {
    const width = 140;
    const height = 40;
    const button = new Node(`Action_${text}`);
    button.layer = Layers.Enum.UI_2D;
    parent.addChild(button);
    button.setPosition(x, y);
    button.addComponent(UITransform).setContentSize(width, height);
    const graphics = button.addComponent(Graphics);
    graphics.fillColor = new Color(55, 85, 120, 255);
    graphics.roundRect(-width / 2, -height / 2, width, height, 10);
    graphics.fill();
    const labelNode = new Node('Label');
    labelNode.layer = Layers.Enum.UI_2D;
    button.addChild(labelNode);
    const label = labelNode.addComponent(Label);
    label.fontSize = 18;
    label.lineHeight = 22;
    label.color = new Color(245, 250, 255, 255);
    label.string = text;
  }

  private addLabel(
    parent: Node,
    text: string,
    x: number,
    y: number,
    fontSize: number,
  ): void {
    const node = new Node('Label');
    node.layer = Layers.Enum.UI_2D;
    parent.addChild(node);
    node.setPosition(x, y);
    const label = node.addComponent(Label);
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 4;
    label.color = new Color(235, 245, 255, 255);
    label.string = text;
  }
}

function clampScroll(offset: number): number {
  const contentHeight = GAME_BALANCE_ROWS.length * SETTINGS_ROW_HEIGHT;
  const maxScroll = Math.max(0, contentHeight - SETTINGS_LIST_VIEW_HEIGHT + 20);
  return Math.min(maxScroll, Math.max(0, offset));
}
