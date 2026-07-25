import { _decorator, Component, Node, tween, Vec3 } from 'cc';

import {
  PLAYER_COLLISION_HALF,
} from './player-sprite';
import {
  PlayerAnimationState,
  type PlayerController,
} from './player-controller';

const { ccclass } = _decorator;

const VISUAL_NAME = 'PlayerVisual';
/** 이동 흔들림 각속도(느림). */
const WALK_SWAY_SPEED = 5.2;
/** 이동 시 좌우 기울기(도). */
const WALK_SWAY_ANGLE = 5;
/** 이동 시 상하 바운스(px). */
const WALK_BOB_PX = 2.2;

/**
 * PlayerVisual 자식에 이동(느림)·타격(빠름) 흔들림을 적용합니다.
 * 충돌 박스(부모 노드)는 그대로 두고 그림만 흔듭니다.
 */
@ccclass('PlayerVisualMotion')
export class PlayerVisualMotion extends Component {
  private visual: Node | null = null;
  private playerController: PlayerController | null = null;
  private readonly restPosition = new Vec3(0, -PLAYER_COLLISION_HALF, 0);
  private walkPhase = 0;
  private hitLockRemaining = 0;

  configure(playerController: PlayerController): void {
    this.playerController = playerController;
    this.bindVisual();
  }

  /** 타격·채집 시 빠른 흔들림. */
  playHitImpulse(): void {
    this.bindVisual();
    if (!this.visual) return;

    tween(this.visual).stop();
    this.hitLockRemaining = 0.22;
    this.visual.setPosition(this.restPosition);
    this.visual.angle = 0;

    const restX = this.restPosition.x;
    const restY = this.restPosition.y;
    tween(this.visual)
      .to(0.028, {
        position: new Vec3(restX + 6, restY, 0),
        angle: 14,
      })
      .to(0.028, {
        position: new Vec3(restX - 7, restY, 0),
        angle: -16,
      })
      .to(0.028, {
        position: new Vec3(restX + 4, restY, 0),
        angle: 10,
      })
      .to(0.028, {
        position: new Vec3(restX - 3, restY, 0),
        angle: -8,
      })
      .to(0.035, {
        position: new Vec3(restX, restY, 0),
        angle: 0,
      })
      .call(() => {
        this.hitLockRemaining = 0;
      })
      .start();
  }

  protected update(deltaTime: number): void {
    if (!this.visual || !this.visual.isValid) {
      this.bindVisual();
      if (!this.visual) return;
    }

    if (this.hitLockRemaining > 0) {
      this.hitLockRemaining -= deltaTime;
      return;
    }

    const moving = this.playerController?.getAnimationState()
      === PlayerAnimationState.Moving;

    if (!moving) {
      this.walkPhase = 0;
      this.visual.angle = 0;
      this.visual.setPosition(this.restPosition);
      return;
    }

    this.walkPhase += deltaTime * WALK_SWAY_SPEED;
    const wave = Math.sin(this.walkPhase);
    this.visual.angle = wave * WALK_SWAY_ANGLE;
    this.visual.setPosition(
      this.restPosition.x + wave * 1.2,
      this.restPosition.y + Math.abs(wave) * WALK_BOB_PX,
      0,
    );
  }

  private bindVisual(): void {
    const child = this.node.getChildByName(VISUAL_NAME);
    this.visual = child && child.isValid ? child : null;
  }
}
