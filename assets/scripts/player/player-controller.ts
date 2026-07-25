import { _decorator, Component, Rect, Vec2, Vec3 } from 'cc';

import type { UnifiedInput } from '../input/unified-input';

const { ccclass } = _decorator;

const PLAYER_HALF_SIZE = 20;
const DEFAULT_MOVE_SPEED = 260;
type ColliderProvider = () => ReadonlyArray<Rect>;

export enum PlayerAnimationState {
  Idle = 'idle',
  Moving = 'moving',
}

/**
 * 입력과 이동을 분리하고 X/Y축을 각각 해결해 모서리에서 자연스럽게 미끄러집니다.
 */
@ccclass('PlayerController')
export class PlayerController extends Component {
  private readonly direction = new Vec2();
  private readonly nextPosition = new Vec3();
  private inputSource: UnifiedInput | null = null;
  private colliderProvider: ColliderProvider = () => [];
  private moveSpeed = DEFAULT_MOVE_SPEED;
  private animationState = PlayerAnimationState.Idle;

  configure(
    inputSource: UnifiedInput,
    colliders: ReadonlyArray<Rect> | ColliderProvider,
    moveSpeed = DEFAULT_MOVE_SPEED,
  ): void {
    this.inputSource = inputSource;
    this.colliderProvider = typeof colliders === 'function'
      ? colliders
      : () => colliders;
    this.moveSpeed = moveSpeed;
  }

  setMoveSpeed(moveSpeed: number): void {
    this.moveSpeed = moveSpeed;
  }

  getAnimationState(): PlayerAnimationState {
    return this.animationState;
  }

  protected update(deltaTime: number): void {
    if (!this.inputSource) return;

    this.inputSource.getMovementDirection(this.direction);
    this.animationState = this.direction.lengthSqr() > 0
      ? PlayerAnimationState.Moving
      : PlayerAnimationState.Idle;

    if (this.animationState === PlayerAnimationState.Idle) return;

    const current = this.node.position;
    const distance = this.moveSpeed * deltaTime;
    let nextX = current.x + this.direction.x * distance;
    let nextY = current.y + this.direction.y * distance;

    if (this.intersectsCollider(nextX, current.y)) nextX = current.x;
    if (this.intersectsCollider(nextX, nextY)) nextY = current.y;

    this.nextPosition.set(nextX, nextY, current.z);
    this.node.setPosition(this.nextPosition);
  }

  private intersectsCollider(centerX: number, centerY: number): boolean {
    const playerLeft = centerX - PLAYER_HALF_SIZE;
    const playerRight = centerX + PLAYER_HALF_SIZE;
    const playerBottom = centerY - PLAYER_HALF_SIZE;
    const playerTop = centerY + PLAYER_HALF_SIZE;

    return this.colliderProvider().some((collider) => (
      playerRight > collider.x
      && playerLeft < collider.x + collider.width
      && playerTop > collider.y
      && playerBottom < collider.y + collider.height
    ));
  }
}
