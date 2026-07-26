/**
 * 두 손가락 핀치(및 마우스 휠)로 월드 확대/축소합니다.
 * Canvas Align 때문에 카메라 ortho 대신 World 노드 스케일을 바꿉니다.
 * HUD·DOM 버튼 크기는 유지됩니다.
 */
import {
  _decorator,
  Component,
  EventMouse,
  EventTouch,
  Input,
  input,
  Node,
  Vec2,
} from 'cc';

import type { UnifiedInput } from '../input/unified-input';
import { isModalMenuBlockingPointer } from '../ui/hud-layout';

const { ccclass } = _decorator;

const MIN_ZOOM = 0.55;
const MAX_ZOOM = 2.75;
const WHEEL_STEP = 0.12;
const STORAGE_KEY = 'exgame.worldZoom';
/** 0.1.8 잘못된 히트 변환으로 저장된 줌을 1회 초기화합니다. */
const STORAGE_RESET_FLAG = 'exgame.worldZoom.reset019';

@ccclass('WorldPinchZoom')
export class WorldPinchZoom extends Component {
  private world: Node | null = null;
  private inputController: UnifiedInput | null = null;
  private zoom = 1;
  private pinchStartDistance = 0;
  private pinchStartZoom = 1;
  private readonly touches = new Map<number, Vec2>();

  configure(world: Node, inputController: UnifiedInput): void {
    this.world = world;
    this.inputController = inputController;
    this.zoom = this.loadZoom();
    this.applyZoom();
  }

  /** 외부(+/- 버튼)에서 호출합니다. */
  adjustZoom(delta: number): void {
    this.setZoom(this.zoom + delta);
  }

  setZoom(next: number): void {
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    this.applyZoom();
    this.saveZoom();
  }

  getZoom(): number {
    return this.zoom;
  }

  protected onEnable(): void {
    input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
    input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    input.on(Input.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
  }

  protected onDisable(): void {
    input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
    input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    input.off(Input.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
    this.touches.clear();
  }

  private onTouchStart(event: EventTouch): void {
    const id = event.getID();
    if (id === null) return;
    const loc = new Vec2();
    event.getUILocation(loc);
    this.touches.set(id, loc);

    if (this.touches.size >= 2) {
      this.inputController?.cancelPointerGesture();
      this.pinchStartDistance = this.currentPinchDistance();
      this.pinchStartZoom = this.zoom;
    }
  }

  private onTouchMove(event: EventTouch): void {
    const id = event.getID();
    if (id === null || !this.touches.has(id)) return;
    const loc = this.touches.get(id)!;
    event.getUILocation(loc);

    if (this.touches.size < 2 || this.pinchStartDistance <= 1) return;
    this.inputController?.cancelPointerGesture();
    const distance = this.currentPinchDistance();
    if (distance <= 1) return;
    const ratio = distance / this.pinchStartDistance;
    this.setZoom(this.pinchStartZoom * ratio);
  }

  private onTouchEnd(event: EventTouch): void {
    const id = event.getID();
    if (id === null) return;
    this.touches.delete(id);
    if (this.touches.size < 2) {
      this.pinchStartDistance = 0;
    } else {
      this.pinchStartDistance = this.currentPinchDistance();
      this.pinchStartZoom = this.zoom;
    }
  }

  private onMouseWheel(event: EventMouse): void {
    // 아이템/설정/불러오기 등 모달이 열려 있으면 휠은 UI 스크롤 전용입니다.
    if (isModalMenuBlockingPointer()) return;
    const scrollY = event.getScrollY();
    if (scrollY === 0) return;
    // 위로 스크롤 = 확대
    this.adjustZoom(scrollY > 0 ? WHEEL_STEP : -WHEEL_STEP);
  }

  private currentPinchDistance(): number {
    if (this.touches.size < 2) return 0;
    const points = Array.from(this.touches.values());
    return Vec2.distance(points[0], points[1]);
  }

  private applyZoom(): void {
    if (!this.world) return;
    this.world.setScale(this.zoom, this.zoom, 1);
  }

  private loadZoom(): number {
    try {
      if (typeof localStorage === 'undefined') return 1;
      // 0.1.8에서 줌≠1 이면 클릭이 전부 실패할 수 있어 1회 리셋합니다.
      if (!localStorage.getItem(STORAGE_RESET_FLAG)) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.setItem(STORAGE_RESET_FLAG, '1');
        return 1;
      }
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return 1;
      const value = Number(raw);
      if (!Number.isFinite(value)) return 1;
      return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
    } catch {
      return 1;
    }
  }

  private saveZoom(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, String(this.zoom));
    } catch {
      // ignore
    }
  }
}
