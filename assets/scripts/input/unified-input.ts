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

/**
 * 키보드와 포인터 드래그(마우스·터치)를 동일한 이동 벡터로 변환합니다.
 * hover 상태에 의존하지 않습니다.
 */
@ccclass('UnifiedInput')
export class UnifiedInput extends Component {
  private readonly pressedKeys = new Set<KeyCode>();
  private readonly pointerStart = new Vec2();
  private readonly pointerCurrent = new Vec2();
  private readonly keyboardDirection = new Vec2();
  private readonly pointerDirection = new Vec2();

  private activeTouchId: number | null = null;
  private isMouseDragging = false;

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

    if (out.lengthSqr() > 1) {
      out.normalize();
    }
    return out;
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
    this.pointerCurrent.set(this.pointerStart);
  }

  private onMouseMove(event: EventMouse): void {
    if (!this.isMouseDragging) return;
    event.getUILocation(this.pointerCurrent);
  }

  private onMouseUp(event: EventMouse): void {
    if (event.getButton() !== EventMouse.BUTTON_LEFT) return;
    this.isMouseDragging = false;
    this.pointerCurrent.set(this.pointerStart);
  }

  private onTouchStart(event: EventTouch): void {
    if (this.activeTouchId !== null) return;
    const touchId = event.getID();
    if (touchId === null) return;

    this.activeTouchId = touchId;
    event.getUILocation(this.pointerStart);
    this.pointerCurrent.set(this.pointerStart);
  }

  private onTouchMove(event: EventTouch): void {
    if (event.getID() !== this.activeTouchId) return;
    event.getUILocation(this.pointerCurrent);
  }

  private onTouchEnd(event: EventTouch): void {
    if (event.getID() !== this.activeTouchId) return;
    this.activeTouchId = null;
    this.pointerCurrent.set(this.pointerStart);
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
    this.pointerStart.set(0, 0);
    this.pointerCurrent.set(0, 0);
  }
}
