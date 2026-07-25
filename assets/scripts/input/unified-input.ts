import {
  _decorator,
  Component,
  EventKeyboard,
  EventMouse,
  EventTouch,
  Input,
  input,
  KeyCode,
  Vec2,
} from 'cc';

const { ccclass } = _decorator;

const POINTER_DEAD_ZONE = 8;
const POINTER_MAX_DISTANCE = 96;
const TAP_MAX_DURATION_MS = 300;

/**
 * 키보드와 포인터 드래그(마우스·터치)를 동일한 이동 벡터로 변환합니다.
 * hover 상태에 의존하지 않습니다.
 *
 * HUD: getUILocation / consumeTap(out)
 * 월드 히트: getLocation / consumeTap(out, outScreen)
 */
@ccclass('UnifiedInput')
export class UnifiedInput extends Component {
  private readonly pressedKeys = new Set<KeyCode>();
  private readonly pointerStart = new Vec2();
  private readonly pointerCurrent = new Vec2();
  private readonly pointerStartScreen = new Vec2();
  private readonly pointerCurrentScreen = new Vec2();
  private readonly keyboardDirection = new Vec2();
  private readonly pointerDirection = new Vec2();
  private readonly virtualDirection = new Vec2();

  private readonly pendingTapLocation = new Vec2();
  private readonly pendingTapScreen = new Vec2();
  private readonly hoverLocation = new Vec2();
  private readonly hoverScreen = new Vec2();
  private activeTouchId: number | null = null;
  private isMouseDragging = false;
  private pointerDownAtMs = 0;
  private pointerMaxDistance = 0;
  private hasPendingTap = false;
  private hasHover = false;

  protected onEnable(): void {
    input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
    input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
    input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
    input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
    input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
  }

  protected onDisable(): void {
    input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
    input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
    input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
    input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
    input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    this.reset();
  }

  getMovementDirection(out: Vec2): Vec2 {
    this.readKeyboardDirection(this.keyboardDirection);
    this.readPointerDirection(this.pointerDirection);
    Vec2.add(out, this.keyboardDirection, this.pointerDirection);
    Vec2.add(out, out, this.virtualDirection);

    if (out.lengthSqr() > 1) {
      out.normalize();
    }
    return out;
  }

  setVirtualDirection(x: number, y: number): void {
    const clampedX = Math.max(-1, Math.min(1, x));
    const clampedY = Math.max(-1, Math.min(1, y));
    this.virtualDirection.set(clampedX, clampedY);
    if (this.virtualDirection.lengthSqr() > 1) {
      this.virtualDirection.normalize();
    }
  }

  cancelPointerGesture(): void {
    this.activeTouchId = null;
    this.isMouseDragging = false;
    this.hasPendingTap = false;
    this.pointerMaxDistance = 0;
    this.pointerCurrent.set(this.pointerStart);
    this.pointerCurrentScreen.set(this.pointerStartScreen);
  }

  /**
   * out = getUILocation (HUD), outScreen = getLocation (월드 히트).
   */
  consumeTap(out: Vec2, outScreen?: Vec2): boolean {
    if (!this.hasPendingTap) return false;
    out.set(this.pendingTapLocation);
    outScreen?.set(this.pendingTapScreen);
    this.hasPendingTap = false;
    return true;
  }

  isPointerHeldStill(out: Vec2, outScreen?: Vec2): boolean {
    const isPointerDown = this.isMouseDragging || this.activeTouchId !== null;
    if (!isPointerDown || this.pointerMaxDistance > POINTER_DEAD_ZONE) {
      return false;
    }
    out.set(this.pointerStart);
    outScreen?.set(this.pointerStartScreen);
    return true;
  }

  getHoverLocation(out: Vec2, outScreen?: Vec2): boolean {
    if (!this.hasHover) return false;
    out.set(this.hoverLocation);
    outScreen?.set(this.hoverScreen);
    return true;
  }

  private onKeyDown(event: EventKeyboard): void {
    this.pressedKeys.add(event.keyCode);
  }

  private onKeyUp(event: EventKeyboard): void {
    this.pressedKeys.delete(event.keyCode);
  }

  private onMouseDown(event: EventMouse): void {
    if (event.getButton() !== EventMouse.BUTTON_LEFT) return;
    this.isMouseDragging = true;
    event.getUILocation(this.pointerStart);
    event.getLocation(this.pointerStartScreen);
    this.pointerCurrent.set(this.pointerStart);
    this.pointerCurrentScreen.set(this.pointerStartScreen);
    this.beginPointerGesture();
  }

  private onMouseMove(event: EventMouse): void {
    event.getUILocation(this.hoverLocation);
    event.getLocation(this.hoverScreen);
    this.hasHover = true;

    if (!this.isMouseDragging) return;
    event.getUILocation(this.pointerCurrent);
    event.getLocation(this.pointerCurrentScreen);
    this.trackPointerDistance();
  }

  private onMouseUp(event: EventMouse): void {
    if (event.getButton() !== EventMouse.BUTTON_LEFT) return;
    this.isMouseDragging = false;
    this.finishPointerGesture();
    this.pointerCurrent.set(this.pointerStart);
    this.pointerCurrentScreen.set(this.pointerStartScreen);
  }

  private onTouchStart(event: EventTouch): void {
    if (this.activeTouchId !== null) return;
    const touchId = event.getID();
    if (touchId === null) return;

    this.activeTouchId = touchId;
    event.getUILocation(this.pointerStart);
    event.getLocation(this.pointerStartScreen);
    this.pointerCurrent.set(this.pointerStart);
    this.pointerCurrentScreen.set(this.pointerStartScreen);
    this.beginPointerGesture();
  }

  private onTouchMove(event: EventTouch): void {
    if (event.getID() !== this.activeTouchId) return;
    event.getUILocation(this.pointerCurrent);
    event.getLocation(this.pointerCurrentScreen);
    this.trackPointerDistance();
  }

  private onTouchEnd(event: EventTouch): void {
    if (event.getID() !== this.activeTouchId) return;
    this.activeTouchId = null;
    this.finishPointerGesture();
    this.pointerCurrent.set(this.pointerStart);
    this.pointerCurrentScreen.set(this.pointerStartScreen);
  }

  private beginPointerGesture(): void {
    this.pointerDownAtMs = performance.now();
    this.pointerMaxDistance = 0;
  }

  private trackPointerDistance(): void {
    const distance = Vec2.distance(this.pointerCurrent, this.pointerStart);
    this.pointerMaxDistance = Math.max(this.pointerMaxDistance, distance);
  }

  private finishPointerGesture(): void {
    const duration = performance.now() - this.pointerDownAtMs;
    if (
      this.pointerMaxDistance <= POINTER_DEAD_ZONE
      && duration <= TAP_MAX_DURATION_MS
    ) {
      this.pendingTapLocation.set(this.pointerCurrent);
      this.pendingTapScreen.set(this.pointerCurrentScreen);
      this.hasPendingTap = true;
    }
  }

  private readKeyboardDirection(out: Vec2): void {
    const left = this.hasAnyKey(KeyCode.KEY_A, KeyCode.ARROW_LEFT);
    const right = this.hasAnyKey(KeyCode.KEY_D, KeyCode.ARROW_RIGHT);
    const down = this.hasAnyKey(KeyCode.KEY_S, KeyCode.ARROW_DOWN);
    const up = this.hasAnyKey(KeyCode.KEY_W, KeyCode.ARROW_UP);

    out.set(Number(right) - Number(left), Number(up) - Number(down));
    if (out.lengthSqr() > 1) out.normalize();
  }

  private readPointerDirection(out: Vec2): void {
    if (!this.isMouseDragging && this.activeTouchId === null) {
      out.set(0, 0);
      return;
    }

    Vec2.subtract(out, this.pointerCurrent, this.pointerStart);
    const distance = out.length();
    if (distance <= POINTER_DEAD_ZONE) {
      out.set(0, 0);
      return;
    }

    const strength = Math.min(
      (distance - POINTER_DEAD_ZONE) / (POINTER_MAX_DISTANCE - POINTER_DEAD_ZONE),
      1,
    );
    out.multiplyScalar(strength / distance);
  }

  private hasAnyKey(...keys: ReadonlyArray<KeyCode>): boolean {
    return keys.some((key) => this.pressedKeys.has(key));
  }

  private reset(): void {
    this.pressedKeys.clear();
    this.activeTouchId = null;
    this.isMouseDragging = false;
    this.hasPendingTap = false;
    this.hasHover = false;
    this.pointerStart.set(0, 0);
    this.pointerCurrent.set(0, 0);
    this.pointerStartScreen.set(0, 0);
    this.pointerCurrentScreen.set(0, 0);
    this.virtualDirection.set(0, 0);
  }
}
