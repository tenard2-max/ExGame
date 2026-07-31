import {
  _decorator,
  Camera,
  Color,
  Component,
  EventMouse,
  Graphics,
  Input,
  input,
  Label,
  Layers,
  Node,
  UITransform,
  Vec2,
  Vec3,
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
  hitTestWorldBounds,
  screenToWorldPoint,
} from '../world/world-ui-hit';
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  setSettingsPanelOpen,
  SETTINGS_BUTTON_SIZE,
  SETTINGS_LIST_VIEW_HEIGHT,
  SETTINGS_PANEL_HEIGHT,
  SETTINGS_PANEL_WIDTH,
  SETTINGS_ROW_HEIGHT,
  resolveUiFontSize,
  resolveUiLineHeight,
} from './hud-layout';
import { isMobileShell } from './mobile-shell';

const { ccclass } = _decorator;

const SCROLLBAR_WIDTH = 16;
const SCROLLBAR_PAD = 10;
const MIN_THUMB_HEIGHT = 48;
/** touch+mouse 중복 클릭 방지 */
const ADJUST_DEBOUNCE_MS = 120;

interface NodeHitTarget {
  readonly node: Node;
  readonly action: () => void;
}

/**
 * 좌측 「설정」버튼으로 여는 게임 밸런스 패널 (PC 전용).
 * 오디오는 DomAudioSettingsUi의 「오디오」버튼에서 따로 엽니다.
 */
@ccclass('SettingsHud')
export class SettingsHud extends Component {
  private readonly pointerLocation = new Vec2();
  private readonly pointerScreen = new Vec2();
  private readonly worldHitTmp = new Vec3();
  private balance: GameBalanceSettings | null = null;
  private sfx: SfxPlayer | null = null;
  private cameraNode: Node | null = null;
  private panelRoot: Node | null = null;
  private listRoot: Node | null = null;
  private scrollTrack: Node | null = null;
  private scrollThumb: Node | null = null;
  private valueLabels = new Map<GameBalanceKey, Label>();
  private nodeHits: NodeHitTarget[] = [];
  private isOpen = false;
  private pcEnabled = false;
  private panelOffsetX = 0;
  private panelOffsetY = 0;
  private topLeftOffsetX = 0;
  private topLeftOffsetY = 0;
  private scrollOffset = 0;
  private pressConsumed = false;
  private lastAdjustAtMs = 0;
  private scrollDragging = false;
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
    this.pcEnabled = !isMobileShell();
    this.topLeftOffsetX = -DESIGN_WIDTH / 2 + 18;
    this.topLeftOffsetY = DESIGN_HEIGHT / 2 - 18;

    // 모바일: 오디오만. 게임 설정 버튼/패널 없음.
    this.domAudioUi.mount(
      bgm,
      sfx,
      this.pcEnabled
        ? (open) => {
          this.setOpen(open);
        }
        : null,
    );

    if (!this.pcEnabled) {
      this.setOpen(false);
      return;
    }

    this.panelRoot = this.buildPanel();
    this.setOpen(false);
    balance.addListener(() => this.refreshValues());
  }

  protected onDestroy(): void {
    this.domAudioUi.destroy();
  }

  protected onEnable(): void {
    // PC 전용 — mouse만 사용 (touch+mouse 이중 발화로 2씩 증감되던 문제 방지)
    input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
    input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
    input.on(Input.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
    window.addEventListener('keydown', this.onDomKeyDown, true);
  }

  protected onDisable(): void {
    input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
    input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
    input.off(Input.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
    window.removeEventListener('keydown', this.onDomKeyDown, true);
  }

  protected lateUpdate(): void {
    if (!this.cameraNode || !this.pcEnabled) return;
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
    if (!this.pcEnabled) {
      this.isOpen = false;
      setSettingsPanelOpen(false);
      return;
    }
    this.isOpen = isOpen;
    setSettingsPanelOpen(isOpen);
    this.domAudioUi.setGameSettingsOpen(isOpen);
    this.scrollDragging = false;

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
    if (!this.pcEnabled || event.getButton() !== EventMouse.BUTTON_LEFT) return;
    event.getUILocation(this.pointerLocation);
    event.getLocation(this.pointerScreen);
    this.pressConsumed = false;
    this.sfx?.unlock();
    if (!this.isOpen) return;

    if (this.tryBeginScrollDrag(this.pointerScreen.x, this.pointerScreen.y)) {
      this.pressConsumed = true;
      event.propagationStopped = true;
      return;
    }

    if (this.tryHandlePress(this.pointerScreen.x, this.pointerScreen.y)) {
      this.pressConsumed = true;
      event.propagationStopped = true;
    }
  }

  private onMouseMove(event: EventMouse): void {
    if (!this.pcEnabled || !this.isOpen || !this.scrollDragging) return;
    event.getLocation(this.pointerScreen);
    this.updateScrollFromThumbWorldY(this.pointerScreen.x, this.pointerScreen.y);
  }

  private onMouseUp(event: EventMouse): void {
    if (!this.pcEnabled || event.getButton() !== EventMouse.BUTTON_LEFT) return;
    event.getUILocation(this.pointerLocation);
    event.getLocation(this.pointerScreen);
    if (this.scrollDragging) {
      this.scrollDragging = false;
      this.pressConsumed = false;
      return;
    }
    if (this.pressConsumed) {
      this.pressConsumed = false;
      return;
    }
    this.handlePointerRelease();
  }

  private onMouseWheel(event: EventMouse): void {
    if (!this.pcEnabled || !this.isOpen) return;
    event.getLocation(this.pointerScreen);
    if (!this.isScreenInsidePanel(this.pointerScreen.x, this.pointerScreen.y)) {
      return;
    }

    const scrollY = event.getScrollY();
    this.scrollOffset = clampScroll(
      this.scrollOffset + (scrollY > 0 ? -40 : 40),
    );
    this.applyScroll();
    this.rebuildHitTargets();
  }

  private handlePointerRelease(): void {
    if (!this.isOpen) return;
    if (!this.isScreenInsidePanel(this.pointerScreen.x, this.pointerScreen.y)) {
      this.setOpen(false);
    }
  }

  private tryHandlePress(screenX: number, screenY: number): boolean {
    this.rebuildHitTargets();
    const hit = this.findHitTarget(screenX, screenY);
    if (!hit) return false;
    const now = performance.now();
    if (now - this.lastAdjustAtMs < ADJUST_DEBOUNCE_MS) return true;
    this.lastAdjustAtMs = now;
    hit.action();
    return true;
  }

  private findHitTarget(screenX: number, screenY: number): NodeHitTarget | null {
    const camera = this.cameraNode?.getComponent(Camera);
    if (!camera) return null;
    screenToWorldPoint(camera, screenX, screenY, this.worldHitTmp);
    const wx = this.worldHitTmp.x;
    const wy = this.worldHitTmp.y;

    let best: NodeHitTarget | null = null;
    let bestArea = Number.POSITIVE_INFINITY;
    for (const target of this.nodeHits) {
      if (!target.node.isValid || !target.node.activeInHierarchy) continue;
      const transform = target.node.getComponent(UITransform);
      if (!transform) continue;
      const rect = transform.getBoundingBoxToWorld();
      const bounds = {
        minX: rect.xMin - 6,
        maxX: rect.xMax + 6,
        minY: rect.yMin - 6,
        maxY: rect.yMax + 6,
        centerX: (rect.xMin + rect.xMax) / 2,
        centerY: (rect.yMin + rect.yMax) / 2,
      };
      if (!hitTestWorldBounds(wx, wy, bounds, 0)) continue;
      const area = (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY);
      if (area < bestArea) {
        bestArea = area;
        best = target;
      }
    }
    return best;
  }

  private isScreenInsidePanel(screenX: number, screenY: number): boolean {
    const camera = this.cameraNode?.getComponent(Camera);
    if (!camera || !this.panelRoot) return false;
    const ui = this.panelRoot.getComponent(UITransform);
    if (!ui) return false;
    screenToWorldPoint(camera, screenX, screenY, this.worldHitTmp);
    const rect = ui.getBoundingBoxToWorld();
    return this.worldHitTmp.x >= rect.xMin
      && this.worldHitTmp.x <= rect.xMax
      && this.worldHitTmp.y >= rect.yMin
      && this.worldHitTmp.y <= rect.yMax;
  }

  private tryBeginScrollDrag(screenX: number, screenY: number): boolean {
    if (!this.scrollTrack || !this.scrollThumb) return false;
    const camera = this.cameraNode?.getComponent(Camera);
    if (!camera) return false;
    screenToWorldPoint(camera, screenX, screenY, this.worldHitTmp);
    const wx = this.worldHitTmp.x;
    const wy = this.worldHitTmp.y;

    const thumbUi = this.scrollThumb.getComponent(UITransform);
    const trackUi = this.scrollTrack.getComponent(UITransform);
    if (!thumbUi || !trackUi) return false;

    const thumbRect = thumbUi.getBoundingBoxToWorld();
    const trackRect = trackUi.getBoundingBoxToWorld();
    const inThumb = wx >= thumbRect.xMin - 4 && wx <= thumbRect.xMax + 4
      && wy >= thumbRect.yMin - 4 && wy <= thumbRect.yMax + 4;
    const inTrack = wx >= trackRect.xMin - 4 && wx <= trackRect.xMax + 4
      && wy >= trackRect.yMin && wy <= trackRect.yMax;

    if (!inThumb && !inTrack) return false;

    this.scrollDragging = true;
    if (!inThumb) {
      // 트랙 클릭: 그 위치로 점프
      this.updateScrollFromThumbWorldY(screenX, screenY);
    }
    return true;
  }

  private updateScrollFromThumbWorldY(screenX: number, screenY: number): void {
    const camera = this.cameraNode?.getComponent(Camera);
    if (!camera || !this.scrollTrack) return;
    screenToWorldPoint(camera, screenX, screenY, this.worldHitTmp);
    const trackUi = this.scrollTrack.getComponent(UITransform);
    if (!trackUi) return;
    const rect = trackUi.getBoundingBoxToWorld();
    const trackH = Math.max(1, rect.yMax - rect.yMin);
    const thumbH = this.getThumbHeight();
    const travel = Math.max(1, trackH - thumbH);
    // 엄지 중심이 포인터에 오도록
    const topCenter = rect.yMax - thumbH / 2;
    const bottomCenter = rect.yMin + thumbH / 2;
    const clampedY = Math.min(topCenter, Math.max(bottomCenter, this.worldHitTmp.y));
    const t = (topCenter - clampedY) / travel;
    this.scrollOffset = clampScroll(t * maxScroll());
    this.applyScroll();
    this.rebuildHitTargets();
  }

  private getThumbHeight(): number {
    const contentHeight = GAME_BALANCE_ROWS.length * SETTINGS_ROW_HEIGHT;
    const ratio = Math.min(1, SETTINGS_LIST_VIEW_HEIGHT / Math.max(1, contentHeight));
    return Math.max(MIN_THUMB_HEIGHT, SETTINGS_LIST_VIEW_HEIGHT * ratio);
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
      '몬스터·채집·전투 밸런스 (PC) · 휠/스크롤바',
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

    this.buildScrollbar(root);
    this.buildActionButton(root, '기본값', -110, -SETTINGS_PANEL_HEIGHT / 2 + 40);
    this.buildActionButton(root, '닫기', 110, -SETTINGS_PANEL_HEIGHT / 2 + 40);
    this.applyScroll();
    return root;
  }

  private buildScrollbar(parent: Node): void {
    const listTop = SETTINGS_PANEL_HEIGHT / 2 - 70;
    const trackX = SETTINGS_PANEL_WIDTH / 2 - SCROLLBAR_PAD - SCROLLBAR_WIDTH / 2;
    const trackCenterY = listTop - SETTINGS_LIST_VIEW_HEIGHT / 2;

    const track = new Node('ScrollTrack');
    track.layer = Layers.Enum.UI_2D;
    parent.addChild(track);
    track.setPosition(trackX, trackCenterY);
    track.addComponent(UITransform).setContentSize(
      SCROLLBAR_WIDTH,
      SETTINGS_LIST_VIEW_HEIGHT,
    );
    const trackGfx = track.addComponent(Graphics);
    trackGfx.fillColor = new Color(30, 40, 55, 220);
    trackGfx.roundRect(
      -SCROLLBAR_WIDTH / 2,
      -SETTINGS_LIST_VIEW_HEIGHT / 2,
      SCROLLBAR_WIDTH,
      SETTINGS_LIST_VIEW_HEIGHT,
      6,
    );
    trackGfx.fill();
    this.scrollTrack = track;

    const thumb = new Node('ScrollThumb');
    thumb.layer = Layers.Enum.UI_2D;
    parent.addChild(thumb);
    const thumbH = this.getThumbHeight();
    thumb.addComponent(UITransform).setContentSize(SCROLLBAR_WIDTH - 4, thumbH);
    const thumbGfx = thumb.addComponent(Graphics);
    thumbGfx.fillColor = new Color(120, 160, 210, 240);
    thumbGfx.roundRect(
      -(SCROLLBAR_WIDTH - 4) / 2,
      -thumbH / 2,
      SCROLLBAR_WIDTH - 4,
      thumbH,
      5,
    );
    thumbGfx.fill();
    this.scrollThumb = thumb;
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
    this.layoutScrollbarThumb();
  }

  private layoutScrollbarThumb(): void {
    if (!this.scrollThumb || !this.scrollTrack) return;
    const listTop = SETTINGS_PANEL_HEIGHT / 2 - 70;
    const trackX = SETTINGS_PANEL_WIDTH / 2 - SCROLLBAR_PAD - SCROLLBAR_WIDTH / 2;
    const thumbH = this.getThumbHeight();
    const ui = this.scrollThumb.getComponent(UITransform);
    if (ui) ui.setContentSize(SCROLLBAR_WIDTH - 4, thumbH);

    // Graphics는 크기 변경 시 다시 그림
    const gfx = this.scrollThumb.getComponent(Graphics);
    if (gfx) {
      gfx.clear();
      gfx.fillColor = new Color(120, 160, 210, 240);
      gfx.roundRect(
        -(SCROLLBAR_WIDTH - 4) / 2,
        -thumbH / 2,
        SCROLLBAR_WIDTH - 4,
        thumbH,
        5,
      );
      gfx.fill();
    }

    const max = maxScroll();
    const travel = Math.max(0, SETTINGS_LIST_VIEW_HEIGHT - thumbH);
    const t = max <= 0 ? 0 : this.scrollOffset / max;
    const thumbCenterY = listTop - thumbH / 2 - t * travel;
    this.scrollThumb.setPosition(trackX, thumbCenterY);
    this.scrollThumb.active = max > 0;
    this.scrollTrack.active = max > 0;
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
    valueLabel.fontSize = resolveUiFontSize(16);
    valueLabel.lineHeight = resolveUiLineHeight(20);
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
    label.fontSize = resolveUiFontSize(22);
    label.lineHeight = resolveUiLineHeight(26);
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
    label.fontSize = resolveUiFontSize(18);
    label.lineHeight = resolveUiLineHeight(22);
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
    label.fontSize = resolveUiFontSize(fontSize);
    label.lineHeight = resolveUiLineHeight(fontSize + 4);
    label.color = new Color(235, 245, 255, 255);
    label.string = text;
  }
}

function maxScroll(): number {
  const contentHeight = GAME_BALANCE_ROWS.length * SETTINGS_ROW_HEIGHT;
  return Math.max(0, contentHeight - SETTINGS_LIST_VIEW_HEIGHT + 20);
}

function clampScroll(offset: number): number {
  return Math.min(maxScroll(), Math.max(0, offset));
}
