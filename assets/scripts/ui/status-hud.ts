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
import { isMobileShell } from './mobile-shell';

const { ccclass } = _decorator;

const MARGIN = 18;
/** 좌상단 설정·오디오 DOM 버튼(약 88px)과 겹치지 않도록 오른쪽으로 민다. */
const BUTTON_COLUMN_CLEARANCE = 160;
/** 모바일: 버튼 폭이 절반(44px)이므로 여유를 줄입니다. */
const BUTTON_COLUMN_CLEARANCE_MOBILE = 72;
const MESSAGE_DURATION_SECONDS = 4;
const STATS_LABEL_WIDTH = 720;

/**
 * 좌측 상단 고정 상태 표시(레벨·체력·경험치)와
 * 전투·상호작용 메시지 한 줄을 담당합니다.
 */
@ccclass('StatusHud')
export class StatusHud extends Component {
  private levelLabel: Label | null = null;
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
    const clearance = isMobileShell()
      ? BUTTON_COLUMN_CLEARANCE_MOBILE
      : BUTTON_COLUMN_CLEARANCE;
    this.topLeftOffsetX = -designWidth / 2 + MARGIN + clearance;
    this.topLeftOffsetY = designHeight / 2 - MARGIN;

    this.levelLabel = this.createLabel(
      'Level',
      0,
      new Color(255, 220, 120, 255),
      34,
      40,
    );
    this.statsLabel = this.createLabel(
      'Stats',
      -42,
      new Color(235, 245, 255, 255),
      24,
      30,
    );
    this.messageLabel = this.createLabel(
      'Message',
      -78,
      new Color(255, 226, 150, 255),
      22,
      28,
    );
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
    if (this.levelLabel) {
      this.levelLabel.string = `레벨 ${model.getLevel()}`;
    }
    if (!this.statsLabel) return;
    const atk = model.getAttackPower();
    const atkText = Number.isInteger(atk) ? String(atk) : atk.toFixed(2);
    this.statsLabel.string = `HP ${model.getHealth()}/${model.getMaxHealth()}  `
      + `ATK ${atkText}  `
      + `XP ${model.getExperience()}/${model.getExperienceToNextLevel()}`;
  }

  private createLabel(
    name: string,
    offsetY: number,
    color: Color,
    fontSize: number,
    lineHeight: number,
  ): Label {
    const labelNode = new Node(name);
    labelNode.layer = Layers.Enum.UI_2D;
    this.node.addChild(labelNode);
    labelNode.setPosition(0, offsetY);
    const transform = labelNode.addComponent(UITransform);
    transform.setAnchorPoint(0, 1);
    transform.setContentSize(STATS_LABEL_WIDTH, lineHeight + 8);

    const label = labelNode.addComponent(Label);
    label.fontSize = fontSize;
    label.lineHeight = lineHeight;
    label.color = color;
    label.string = '';
    label.overflow = Label.Overflow.NONE;
    label.horizontalAlign = Label.HorizontalAlign.LEFT;
    label.verticalAlign = Label.VerticalAlign.TOP;
    return label;
  }
}
