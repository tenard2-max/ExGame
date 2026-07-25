/**
 * 히트디버그 오버레이 — touch(월드) / entity 월드 AABB 를 Canvas 로컬에 그립니다.
 * 활성: URL ?hitDebug=1 또는 localStorage / hitTrace
 *
 * screen↔UI 왕복 없이 world → Canvas.convertToNodeSpaceAR 만 사용합니다.
 */
import {
  _decorator,
  Camera,
  Color,
  Component,
  Graphics,
  Layers,
  Node,
  UITransform,
  Vec3,
} from 'cc';

import type { UiBounds, UiPoint } from '../world/world-ui-hit';

const { ccclass } = _decorator;

const TOUCH_COLOR = new Color(255, 64, 64, 220);
const BOUNDS_COLOR = new Color(64, 220, 120, 200);
const HIT_OK_COLOR = new Color(80, 255, 160, 240);
const HIT_FAIL_COLOR = new Color(255, 90, 90, 200);
const CENTER_COLOR = new Color(255, 220, 64, 220);

const worldTmp = new Vec3();
const localTmp = new Vec3();

export interface WorldHitDebugHit {
  bounds: UiBounds;
  success: boolean;
}

export interface WorldHitDebugFrame {
  touch?: UiPoint | null;
  bounds?: UiBounds[];
  hits?: WorldHitDebugHit[];
}

export function isWorldHitDebugEnabled(): boolean {
  try {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('hitDebug') === '1') return true;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('exgame.hitDebug') === '1';
    }
  } catch {
    // ignore
  }
  return false;
}

@ccclass('WorldHitDebugOverlay')
export class WorldHitDebugOverlay extends Component {
  private cameraNode: Node | null = null;
  private graphics: Graphics | null = null;
  private touch: UiPoint | null = null;
  private targets: UiBounds[] = [];
  private hits: WorldHitDebugHit[] = [];

  configure(cameraNode: Node): void {
    this.cameraNode = cameraNode;
    this.node.layer = Layers.Enum.UI_2D;
    let graphicsNode = this.node.getChildByName('HitDebugGfx');
    if (!graphicsNode) {
      graphicsNode = new Node('HitDebugGfx');
      graphicsNode.layer = Layers.Enum.UI_2D;
      this.node.addChild(graphicsNode);
      graphicsNode.addComponent(UITransform).setContentSize(4, 4);
      this.graphics = graphicsNode.addComponent(Graphics);
    } else {
      this.graphics = graphicsNode.getComponent(Graphics);
    }
  }

  setFrame(frame: WorldHitDebugFrame): void {
    this.touch = frame.touch ?? null;
    this.targets = frame.bounds ? [...frame.bounds] : [];
    this.hits = frame.hits ? [...frame.hits] : [];
  }

  setTouch(ui: UiPoint | null): void {
    this.touch = ui;
  }

  setTargets(bounds: UiBounds[]): void {
    this.targets = bounds;
  }

  clear(): void {
    this.touch = null;
    this.targets = [];
    this.hits = [];
    this.graphics?.clear();
  }

  protected lateUpdate(): void {
    if (!this.graphics || !this.cameraNode) return;
    this.graphics.clear();
    if (!this.touch && this.targets.length === 0 && this.hits.length === 0) {
      return;
    }

    for (const bounds of this.targets) {
      this.drawBounds(bounds, BOUNDS_COLOR, 1.5);
      this.drawCross(bounds.centerX, bounds.centerY, 8, CENTER_COLOR);
    }
    for (const hit of this.hits) {
      this.drawBounds(
        hit.bounds,
        hit.success ? HIT_OK_COLOR : HIT_FAIL_COLOR,
        hit.success ? 3 : 2,
      );
      this.drawCross(
        hit.bounds.centerX,
        hit.bounds.centerY,
        10,
        hit.success ? HIT_OK_COLOR : HIT_FAIL_COLOR,
      );
    }
    if (this.touch) {
      this.drawCross(this.touch.x, this.touch.y, 14, TOUCH_COLOR);
    }
  }

  private drawBounds(bounds: UiBounds, color: Color, lineWidth: number): void {
    const gfx = this.graphics!;
    const bl = this.worldToCanvasLocal(bounds.minX, bounds.minY);
    const br = this.worldToCanvasLocal(bounds.maxX, bounds.minY);
    const tr = this.worldToCanvasLocal(bounds.maxX, bounds.maxY);
    const tl = this.worldToCanvasLocal(bounds.minX, bounds.maxY);
    if (!bl || !br || !tr || !tl) return;
    gfx.strokeColor = color;
    gfx.lineWidth = lineWidth;
    gfx.moveTo(bl.x, bl.y);
    gfx.lineTo(br.x, br.y);
    gfx.lineTo(tr.x, tr.y);
    gfx.lineTo(tl.x, tl.y);
    gfx.close();
    gfx.stroke();
  }

  private drawCross(worldX: number, worldY: number, size: number, color: Color): void {
    const center = this.worldToCanvasLocal(worldX, worldY);
    if (!center) return;
    const gfx = this.graphics!;
    gfx.strokeColor = color;
    gfx.lineWidth = 2;
    gfx.moveTo(center.x - size, center.y);
    gfx.lineTo(center.x + size, center.y);
    gfx.moveTo(center.x, center.y - size);
    gfx.lineTo(center.x, center.y + size);
    gfx.stroke();
  }

  private worldToCanvasLocal(
    worldX: number,
    worldY: number,
  ): { x: number; y: number } | null {
    const canvas = this.cameraNode?.parent;
    const canvasUi = canvas?.getComponent(UITransform);
    if (!canvasUi) return null;
    worldTmp.set(worldX, worldY, 0);
    canvasUi.convertToNodeSpaceAR(worldTmp, localTmp);
    return { x: localTmp.x, y: localTmp.y };
  }
}
