import {
  _decorator,
  Color,
  Component,
  Graphics,
  Label,
  Layers,
  Node,
  UITransform,
} from 'cc';

import { formatNumber2 } from '../core/game-balance-settings';
import {
  resolveUiFontSize,
  resolveUiLineHeight,
} from '../ui/hud-layout';
import {
  PLAYER_COLLISION_HALF,
  type PlayerSprite,
} from './player-sprite';
import type { PlayerStatsModel } from './player-stats-model';

const { ccclass } = _decorator;

const LOW_HP_RATIO = 0.3;
const GAUGE_WIDTH = 56;
const GAUGE_HEIGHT = 8;
const GAUGE_GAP_ABOVE_HEAD = 10;
const LABEL_OFFSET_Y = 16;

/**
 * 플레이어 체력이 30% 이하일 때
 * 캐릭터 아웃라인을 빨갛게 바꾸고 머리 위 체력 게이지를 표시합니다.
 */
@ccclass('PlayerLowHealthFeedback')
export class PlayerLowHealthFeedback extends Component {
  private playerSprite: PlayerSprite | null = null;
  private gauge: Graphics | null = null;
  private label: Label | null = null;
  private gaugeBaseY = 0;

  configure(stats: PlayerStatsModel, playerSprite: PlayerSprite): void {
    this.playerSprite = playerSprite;
    this.createHud();
    stats.addListener((model) => this.refresh(model));
  }

  private createHud(): void {
    const size = this.playerSprite?.getDisplaySize();
    const spriteHeight = size?.height ?? 64;
    // PlayerVisual 발(y=-half) 기준 머리 위
    this.gaugeBaseY = -PLAYER_COLLISION_HALF + spriteHeight + GAUGE_GAP_ABOVE_HEAD;

    const barNode = new Node('PlayerLowHpBar');
    barNode.layer = Layers.Enum.UI_2D;
    this.node.addChild(barNode);
    this.gauge = barNode.addComponent(Graphics);

    const labelNode = new Node('PlayerLowHpLabel');
    labelNode.layer = Layers.Enum.UI_2D;
    this.node.addChild(labelNode);
    labelNode.addComponent(UITransform).setContentSize(80, 20);
    const label = labelNode.addComponent(Label);
    label.fontSize = resolveUiFontSize(14);
    label.lineHeight = resolveUiLineHeight(16);
    label.color = new Color(255, 240, 240, 255);
    label.string = '';
    label.overflow = Label.Overflow.NONE;
    this.label = label;
  }

  private refresh(model: PlayerStatsModel): void {
    const maxHp = model.getMaxHealth();
    const health = model.getHealth();
    const lowHp = maxHp > 0 && health > 0 && health / maxHp <= LOW_HP_RATIO;

    this.playerSprite?.setDangerOutline(lowHp);

    if (!lowHp) {
      this.clearGauge();
      return;
    }
    this.drawGauge(health, maxHp);
  }

  private drawGauge(current: number, max: number): void {
    const bar = this.gauge;
    const label = this.label;
    if (!bar || !label) return;

    const left = -GAUGE_WIDTH / 2;
    const top = this.gaugeBaseY;
    const ratio = max > 0 ? Math.min(Math.max(current / max, 0), 1) : 0;

    bar.clear();
    bar.fillColor = new Color(20, 28, 40, 230);
    bar.rect(left, top, GAUGE_WIDTH, GAUGE_HEIGHT);
    bar.fill();
    bar.fillColor = new Color(255, 90, 80, 255);
    bar.rect(left, top, GAUGE_WIDTH * ratio, GAUGE_HEIGHT);
    bar.fill();

    label.string = `${formatNumber2(current)}/${formatNumber2(max)}`;
    label.node.setPosition(0, top + LABEL_OFFSET_Y, 0);
  }

  private clearGauge(): void {
    this.gauge?.clear();
    if (this.label) this.label.string = '';
  }
}
