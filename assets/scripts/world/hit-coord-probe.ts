/**
 * 자동 좌표 진단 — window.__EXGAME_DEBUG__.probeHit(zoom) 용.
 */
import { Camera, Node, UITransform, Vec3, view } from 'cc';

import {
  getEntityWorldBounds,
  hitTestWorldBounds,
  projectWorldToUiVariants,
  screenToWorldPoint,
  worldToScreenPoint,
} from './world-ui-hit';

const localCorner = new Vec3();
const worldCorner = new Vec3();
const touchWorld = new Vec3();

export interface HitProbeResult {
  worldZoom: number;
  typeId: string;
  visibleOrigin: { x: number; y: number };
  viewport: { x: number; y: number; width: number; height: number };
  viewScale: { x: number; y: number };
  visualWorldPos: { x: number; y: number };
  hitTestBoundsWorld: {
    centerX: number;
    centerY: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } | null;
  hitTestBoundsUI_legacyWithOrigin: {
    centerX: number;
    centerY: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } | null;
  visualScreen: { x: number; y: number };
  visualOnScreenUI_withOrigin: { x: number; y: number };
  visualOnScreenUI_noOrigin: { x: number; y: number };
  assumedTouchUI_noOrigin: { x: number; y: number };
  /** 구 경로: getUILocation≈noOrigin 터치 vs withOrigin UI AABB */
  legacyUiHit_withOriginBounds: boolean;
  /** 신 경로: 스프라이트 스크린 클릭 → screenToWorld → world AABB */
  worldSpaceHit: boolean;
  delta_touch_minus_legacyCenter: { x: number; y: number } | null;
  originDelta: { x: number; y: number };
  screenClickForBrowser: { x: number; y: number };
}

function legacyUiBoundsWithOrigin(
  camera: Camera,
  visual: Node,
): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centerX: number;
  centerY: number;
} | null {
  const ui = visual.getComponent(UITransform);
  if (!ui) return null;
  const width = ui.contentSize.width;
  const height = ui.contentSize.height;
  if (width <= 0 || height <= 0) return null;
  const ax = ui.anchorX;
  const ay = ui.anchorY;
  const corners: ReadonlyArray<readonly [number, number]> = [
    [-width * ax, -height * ay],
    [width * (1 - ax), -height * ay],
    [width * (1 - ax), height * (1 - ay)],
    [-width * ax, height * (1 - ay)],
  ];
  const origin = view.getVisibleOrigin();
  const viewport = view.getViewportRect();
  const scaleX = view.getScaleX() || 1;
  const scaleY = view.getScaleY() || 1;

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const [lx, ly] of corners) {
    localCorner.set(lx, ly, 0);
    ui.convertToWorldSpaceAR(localCorner, worldCorner);
    const screen = worldToScreenPoint(
      camera,
      worldCorner.x,
      worldCorner.y,
      worldCorner.z,
    );
    // 버그 있던 공식: + visibleOrigin (이중 레터박스)
    const ux = (screen.x - viewport.x) / scaleX + origin.x;
    const uy = (screen.y - viewport.y) / scaleY + origin.y;
    minX = Math.min(minX, ux);
    maxX = Math.max(maxX, ux);
    minY = Math.min(minY, uy);
    maxY = Math.max(maxY, uy);
  }
  if (!Number.isFinite(minX)) return null;
  return {
    minX,
    maxX,
    minY,
    maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

export function probeOreVisual(
  camera: Camera,
  visual: Node,
  typeId: string,
  worldZoom: number,
): HitProbeResult {
  const wp = visual.worldPosition;
  const projected = projectWorldToUiVariants(camera, wp.x, wp.y, wp.z);
  const worldBounds = getEntityWorldBounds(visual);
  const legacy = legacyUiBoundsWithOrigin(camera, visual);
  const origin = view.getVisibleOrigin();
  const viewport = view.getViewportRect();
  const touchUI = projected.uiNoOrigin;
  const pad = 2;

  const legacyHit = !!legacy
    && touchUI.x >= legacy.minX - pad
    && touchUI.x <= legacy.maxX + pad
    && touchUI.y >= legacy.minY - pad
    && touchUI.y <= legacy.maxY + pad;

  screenToWorldPoint(camera, projected.screen.x, projected.screen.y, touchWorld);
  const worldHit = !!worldBounds
    && hitTestWorldBounds(touchWorld.x, touchWorld.y, worldBounds, pad);

  return {
    worldZoom,
    typeId,
    visibleOrigin: { x: origin.x, y: origin.y },
    viewport: {
      x: viewport.x,
      y: viewport.y,
      width: viewport.width,
      height: viewport.height,
    },
    viewScale: { x: view.getScaleX(), y: view.getScaleY() },
    visualWorldPos: { x: +wp.x.toFixed(2), y: +wp.y.toFixed(2) },
    hitTestBoundsWorld: worldBounds
      ? {
          centerX: +worldBounds.centerX.toFixed(2),
          centerY: +worldBounds.centerY.toFixed(2),
          minX: +worldBounds.minX.toFixed(2),
          maxX: +worldBounds.maxX.toFixed(2),
          minY: +worldBounds.minY.toFixed(2),
          maxY: +worldBounds.maxY.toFixed(2),
        }
      : null,
    hitTestBoundsUI_legacyWithOrigin: legacy
      ? {
          centerX: +legacy.centerX.toFixed(2),
          centerY: +legacy.centerY.toFixed(2),
          minX: +legacy.minX.toFixed(2),
          maxX: +legacy.maxX.toFixed(2),
          minY: +legacy.minY.toFixed(2),
          maxY: +legacy.maxY.toFixed(2),
        }
      : null,
    visualScreen: {
      x: +projected.screen.x.toFixed(2),
      y: +projected.screen.y.toFixed(2),
    },
    visualOnScreenUI_withOrigin: {
      x: +projected.uiWithOrigin.x.toFixed(2),
      y: +projected.uiWithOrigin.y.toFixed(2),
    },
    visualOnScreenUI_noOrigin: {
      x: +projected.uiNoOrigin.x.toFixed(2),
      y: +projected.uiNoOrigin.y.toFixed(2),
    },
    assumedTouchUI_noOrigin: {
      x: +touchUI.x.toFixed(2),
      y: +touchUI.y.toFixed(2),
    },
    legacyUiHit_withOriginBounds: legacyHit,
    worldSpaceHit: worldHit,
    delta_touch_minus_legacyCenter: legacy
      ? {
          x: +(touchUI.x - legacy.centerX).toFixed(2),
          y: +(touchUI.y - legacy.centerY).toFixed(2),
        }
      : null,
    originDelta: { x: origin.x, y: origin.y },
    screenClickForBrowser: {
      x: +projected.screen.x.toFixed(2),
      y: +projected.screen.y.toFixed(2),
    },
  };
}
