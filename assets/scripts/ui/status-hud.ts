import {
  _decorator,
  Color,
  Component,
  Label,
  Layers,
  Node,
  UITransform,
} from 'cc';

import type { PlayerStatsModel } from '../player/player-stats-model';

const { ccclass } = _decorator;

const MARGIN = 18;
const MESSAGE_DURATION_SECONDS = 4;

/**
 * 좌측 상단 고정 상태 표시(레벨·체력·경험치)와
 * 전투·상호작용 메시지 한 줄을 담당합니다.
 */
@ccclass('StatusHud')
export class StatusHud extends Component {
  private statsLabel: Label | null = null;
  private messageLabel: Label | null = null;
  private cameraNode: Node | null = null;
  private topLeftOffsetX = 0;
  private topLeftOffsetY = 0;
  private messageRemainingSeconds = 0;

  configure(
    stats: PlayerStatsModel,
    cameraNode: Node,
    designWidth: number,
    designHeight: number,
  ): void {
    this.cameraNode = cameraNode;
    this.topLeftOffsetX = -designWidth / 2 + MARGIN;
    this.topLeftOffsetY = designHeight / 2 - MARGIN;

    this.statsLabel = this.createLabel('Stats', 0, new Color(235, 245, 255, 255));
    this.messageLabel = this.createLabel('Message', -34, new Color(255, 226, 150, 255));
    stats.addListener((model) => this.refreshStats(model));
  }

  showMessage(text: string): void {
    if (!this.messageLabel) return;
    this.messageLabel.string = text;
    this.messageRemainingSeconds = MESSAGE_DURATION_SECONDS;
  }

  protected lateUpdate(deltaTime: number): void {
    if (!this.cameraNode) return;
    const camera = this.cameraNode.position;
    this.node.setPosition(
      camera.x + this.topLeftOffsetX,
      camera.y + this.topLeftOffsetY,
      0,
    );

    if (this.messageRemainingSeconds > 0 && this.messageLabel) {
      this.messageRemainingSeconds -= deltaTime;
      if (this.messageRemainingSeconds <= 0) this.messageLabel.string = '';
    }
  }

  private refreshStats(model: PlayerStatsModel): void {
    if (!this.statsLabel) return;
    this.statsLabel.string = `Lv.${model.getLevel()}  `
      + `HP ${model.getHealth()}/${model.getMaxHealth()}  `
      + `XP ${model.getExperience()}/${model.getExperienceToNextLevel()}`;
  }

  private createLabel(name: string, offsetY: number, color: Color): Label {
    const labelNode = new Node(name);
    labelNode.layer = Layers.Enum.UI_2D;
    this.node.addChild(labelNode);
    labelNode.setPosition(0, offsetY);
    labelNode.addComponent(UITransform).setAnchorPoint(0, 1);

    const label = labelNode.addComponent(Label);
    label.fontSize = 24;
    label.lineHeight = 30;
    label.color = color;
    label.string = '';
    label.horizontalAlign = Label.HorizontalAlign.LEFT;
    return label;
  }
}
