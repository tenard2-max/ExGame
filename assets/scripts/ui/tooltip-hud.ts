import {
  _decorator,
  Color,
  Component,
  Graphics,
  Label,
  Layers,
  Node,
  UITransform,
  Vec2,
  Vec3,
} from 'cc';

import { uiLocationToCanvasLocal } from './hud-layout';

const { ccclass } = _decorator;

const TOOLTIP_OFFSET_X = 18;
const TOOLTIP_OFFSET_Y = -22;
const TOOLTIP_PADDING_X = 10;
const TOOLTIP_PADDING_Y = 6;
const TOOLTIP_FONT_SIZE = 18;

/**
 * 마우스 커서를 따라다니는 이름·설명 툴팁입니다.
 * 매 프레임 show/hide로 갱신되며 카메라 이동을 보정합니다.
 */
@ccclass('TooltipHud')
export class TooltipHud extends Component {
  private readonly uiLocation = new Vec2();
  private readonly worldPosition = new Vec3();
  private cameraNode: Node | null = null;
  private background: Graphics | null = null;
  private label: Label | null = null;
  private isVisible = false;

  configure(cameraNode: Node): void {
    this.cameraNode = cameraNode;

    const backgroundNode = new Node('TooltipBackground');
    backgroundNode.layer = Layers.Enum.UI_2D;
    this.node.addChild(backgroundNode);
    this.background = backgroundNode.addComponent(Graphics);

    const labelNode = new Node('TooltipLabel');
    labelNode.layer = Layers.Enum.UI_2D;
    this.node.addChild(labelNode);
    labelNode.addComponent(UITransform).setAnchorPoint(0, 0.5);
    this.label = labelNode.addComponent(Label);
    this.label.fontSize = TOOLTIP_FONT_SIZE;
    this.label.lineHeight = TOOLTIP_FONT_SIZE + 6;
    this.label.color = new Color(240, 248, 255, 255);
    this.label.overflow = Label.Overflow.NONE;
    this.label.horizontalAlign = Label.HorizontalAlign.LEFT;
    this.label.verticalAlign = Label.VerticalAlign.CENTER;

    this.node.active = false;
  }

  show(text: string, uiLocation: Vec2): void {
    if (!this.label || !this.background) return;
    this.uiLocation.set(uiLocation);
    this.isVisible = true;
    this.node.active = true;

    if (this.label.string !== text) {
      this.label.string = text;
      this.label.updateRenderData(true);
      this.redrawBackground();
    }
  }

  hide(): void {
    this.isVisible = false;
    this.node.active = false;
  }

  protected lateUpdate(): void {
    if (!this.isVisible || !this.cameraNode) return;

    const local = uiLocationToCanvasLocal(
      this.uiLocation.x,
      this.uiLocation.y,
      this.cameraNode,
    );
    this.worldPosition.set(
      local.x + TOOLTIP_OFFSET_X,
      local.y + TOOLTIP_OFFSET_Y,
      0,
    );
    this.node.setPosition(this.worldPosition);
  }

  private redrawBackground(): void {
    if (!this.label || !this.background) return;

    const transform = this.label.node.getComponent(UITransform);
    const width = (transform?.contentSize.width ?? 120) + TOOLTIP_PADDING_X * 2;
    const height = (transform?.contentSize.height ?? 24) + TOOLTIP_PADDING_Y * 2;

    this.background.clear();
    this.background.fillColor = new Color(16, 24, 36, 235);
    this.background.roundRect(
      -TOOLTIP_PADDING_X,
      -height / 2,
      width,
      height,
      6,
    );
    this.background.fill();
  }
}
