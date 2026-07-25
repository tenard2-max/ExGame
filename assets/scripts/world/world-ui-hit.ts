/**
 * 월드 오브젝트 히트테스트.
 *
 * 렌더와 동일한 공간에서 판정합니다:
 *   event.getLocation()(스크린)
 *   → Camera.screenToWorld
 *   → UITransform.getBoundingBoxToWorld() / 타일 월드 AABB
 *
 * screen↔UI 수동 매핑·zoom 보정·magic offset 없음.
 * HUD 는 계속 getUILocation / normalizeUiToDesign 을 사용합니다.
 */
import { Camera, Node, Rect, UITransform, Vec3, view } from 'cc';

export interface UiPoint {
  x: number;
  y: number;
}

/** 월드(=렌더) 공간 AABB. */
export interface WorldBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centerX: number;
  centerY: number;
}

/** @deprecated UI 공간 bounds — 디버그/레거시 호환용. 히트는 WorldBounds 사용. */
export type UiBounds = WorldBounds;

const screenTmp = new Vec3();
const worldTmp = new Vec3();
const localCorner = new Vec3();

export function isHitTraceEnabled(): boolean {
  try {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('hitTrace') === '0') return false;
      if (params.get('hitTrace') === '1' || params.get('hitDebug') === '1') {
        return true;
      }
    }
    if (typeof localStorage !== 'undefined') {
      if (localStorage.getItem('exgame.hitTrace') === '0') return false;
      if (localStorage.getItem('exgame.hitTrace') === '1') return true;
      if (localStorage.getItem('exgame.hitDebug') === '1') return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * 엔진 getUILocation 과 동일한 변환:
 *   ui = (screen - viewport) / viewScale
 * visibleOrigin 을 다시 더하지 않습니다(이중 레터박스 보정 금지).
 */
export function screenToUiLocation(screenX: number, screenY: number): UiPoint {
  const viewport = view.getViewportRect();
  const scaleX = view.getScaleX() || 1;
  const scaleY = view.getScaleY() || 1;
  return {
    x: (screenX - viewport.x) / scaleX,
    y: (screenY - viewport.y) / scaleY,
  };
}

/** @deprecated screenToUiLocation 과 동일(진단 호환). */
export function screenToUiLocationNoOrigin(screenX: number, screenY: number): UiPoint {
  return screenToUiLocation(screenX, screenY);
}

/** UI → 스크린. screenToUiLocation 의 역. */
export function uiLocationToScreen(uiX: number, uiY: number): UiPoint {
  const viewport = view.getViewportRect();
  const scaleX = view.getScaleX() || 1;
  const scaleY = view.getScaleY() || 1;
  return {
    x: uiX * scaleX + viewport.x,
    y: uiY * scaleY + viewport.y,
  };
}

/** 스크린 → 월드(렌더 카메라 행렬). */
export function screenToWorldPoint(
  camera: Camera,
  screenX: number,
  screenY: number,
  out: Vec3 = worldTmp,
): Vec3 {
  screenTmp.set(screenX, screenY, 0);
  camera.screenToWorld(screenTmp, out);
  return out;
}

/** 월드 → 스크린. */
export function worldToScreenPoint(
  camera: Camera,
  worldX: number,
  worldY: number,
  worldZ = 0,
): UiPoint {
  worldTmp.set(worldX, worldY, worldZ);
  camera.worldToScreen(worldTmp, screenTmp);
  return { x: screenTmp.x, y: screenTmp.y };
}

/** @deprecated 히트 경로 미사용. 진단 전용. */
export function worldToUiLocation(
  camera: Camera,
  worldX: number,
  worldY: number,
  worldZ = 0,
): UiPoint {
  const screen = worldToScreenPoint(camera, worldX, worldY, worldZ);
  return screenToUiLocation(screen.x, screen.y);
}

export function projectWorldToUiVariants(
  camera: Camera,
  worldX: number,
  worldY: number,
  worldZ = 0,
): {
  screen: UiPoint;
  uiWithOrigin: UiPoint;
  uiNoOrigin: UiPoint;
} {
  const screen = worldToScreenPoint(camera, worldX, worldY, worldZ);
  const viewport = view.getViewportRect();
  const scaleX = view.getScaleX() || 1;
  const scaleY = view.getScaleY() || 1;
  const origin = view.getVisibleOrigin();
  const uiNoOrigin = {
    x: (screen.x - viewport.x) / scaleX,
    y: (screen.y - viewport.y) / scaleY,
  };
  return {
    screen,
    uiNoOrigin,
    uiWithOrigin: {
      x: uiNoOrigin.x + origin.x,
      y: uiNoOrigin.y + origin.y,
    },
  };
}

function rectToBounds(rect: Rect): WorldBounds {
  return {
    minX: rect.xMin,
    maxX: rect.xMax,
    minY: rect.yMin,
    maxY: rect.yMax,
    centerX: rect.center.x,
    centerY: rect.center.y,
  };
}

export function getEntityWorldBounds(visualNode: Node): WorldBounds | null {
  const ui = visualNode.getComponent(UITransform);
  if (!ui || !visualNode.activeInHierarchy) return null;
  const width = ui.contentSize.width;
  const height = ui.contentSize.height;
  if (width <= 0 || height <= 0) return null;
  return rectToBounds(ui.getBoundingBoxToWorld());
}

/** @deprecated 이름만 UI — 실제로는 월드 bounds(히트 SSoT). */
export function getEntityUIBounds(visualNode: Node, _camera?: Camera): WorldBounds | null {
  return getEntityWorldBounds(visualNode);
}

export function getNodeUIBounds(node: Node, _camera?: Camera): WorldBounds | null {
  return getEntityWorldBounds(node);
}

export function getChunkTileWorldBounds(
  chunkNode: Node,
  localTileX: number,
  localTileY: number,
  tileSize: number,
): WorldBounds | null {
  const ui = chunkNode.getComponent(UITransform);
  if (!ui || !chunkNode.activeInHierarchy) return null;

  const x0 = localTileX * tileSize;
  const y0 = localTileY * tileSize;
  const x1 = x0 + tileSize;
  const y1 = y0 + tileSize;
  const corners: ReadonlyArray<readonly [number, number]> = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const [lx, ly] of corners) {
    localCorner.set(lx, ly, 0);
    ui.convertToWorldSpaceAR(localCorner, worldTmp);
    minX = Math.min(minX, worldTmp.x);
    maxX = Math.max(maxX, worldTmp.x);
    minY = Math.min(minY, worldTmp.y);
    maxY = Math.max(maxY, worldTmp.y);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null;

  return {
    minX,
    maxX,
    minY,
    maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

/** @deprecated 카메라 불필요 — 월드 AABB. */
export function getChunkTileUIBounds(
  chunkNode: Node,
  localTileX: number,
  localTileY: number,
  tileSize: number,
  _camera?: Camera,
): WorldBounds | null {
  return getChunkTileWorldBounds(chunkNode, localTileX, localTileY, tileSize);
}

export function hitTestWorldBounds(
  worldX: number,
  worldY: number,
  bounds: WorldBounds,
  pad = 0,
): boolean {
  return worldX >= bounds.minX - pad
    && worldX <= bounds.maxX + pad
    && worldY >= bounds.minY - pad
    && worldY <= bounds.maxY + pad;
}

/** @deprecated 시그니처 호환 — 인자는 월드 좌표여야 함. */
export function hitTestUIBounds(
  point: UiPoint,
  bounds: WorldBounds,
  pad = 0,
): boolean {
  return hitTestWorldBounds(point.x, point.y, bounds, pad);
}

export function hitTestWorldEntityScreen(
  screenX: number,
  screenY: number,
  visualNode: Node,
  camera: Camera,
  padWorld = 2,
): boolean {
  const bounds = getEntityWorldBounds(visualNode);
  if (!bounds) return false;
  screenToWorldPoint(camera, screenX, screenY, worldTmp);
  return hitTestWorldBounds(worldTmp.x, worldTmp.y, bounds, padWorld);
}

/** @deprecated */
export function hitTestWorldEntity(
  uiTouch: UiPoint,
  visualNode: Node,
  camera: Camera,
  pad = 2,
): boolean {
  return hitTestWorldEntityScreen(uiTouch.x, uiTouch.y, visualNode, camera, pad);
}

/**
 * 클릭 진단: 스크린 터치 vs UI 후보식 vs 월드 AABB.
 * touchScreen 이 있으면 월드 히트 경로를 기준으로 비교합니다.
 */
export function logEntityHitTrace(args: {
  tag: string;
  path: string;
  uiTouch: UiPoint;
  camera: Camera;
  visual: Node;
  typeId?: string;
  hit: boolean;
  worldZoom?: number;
  screenTouch?: UiPoint;
}): void {
  if (!isHitTraceEnabled()) return;

  const {
    tag, path, uiTouch, camera, visual, typeId, hit, worldZoom, screenTouch,
  } = args;
  const wp = visual.worldPosition;
  const projected = projectWorldToUiVariants(camera, wp.x, wp.y, wp.z);
  const bounds = getEntityWorldBounds(visual);
  const origin = view.getVisibleOrigin();
  const viewport = view.getViewportRect();

  let touchWorld: UiPoint | null = null;
  let hitWorld = false;
  if (screenTouch) {
    screenToWorldPoint(camera, screenTouch.x, screenTouch.y, worldTmp);
    touchWorld = { x: worldTmp.x, y: worldTmp.y };
    hitWorld = !!bounds && hitTestWorldBounds(worldTmp.x, worldTmp.y, bounds, 2);
  }

  // eslint-disable-next-line no-console
  console.info(`[ExGame:hitTrace] ${tag}`, {
    path,
    typeId: typeId ?? visual.name,
    hit,
    hitWorld,
    worldZoom: worldZoom ?? null,
    touchUI_getUILocation: {
      x: +uiTouch.x.toFixed(2),
      y: +uiTouch.y.toFixed(2),
    },
    touchScreen: screenTouch
      ? { x: +screenTouch.x.toFixed(2), y: +screenTouch.y.toFixed(2) }
      : null,
    touchWorld: touchWorld
      ? { x: +touchWorld.x.toFixed(2), y: +touchWorld.y.toFixed(2) }
      : null,
    visualWorldPos: {
      x: +wp.x.toFixed(2),
      y: +wp.y.toFixed(2),
      z: +wp.z.toFixed(2),
    },
    visualOnScreenUI_withOrigin: {
      x: +projected.uiWithOrigin.x.toFixed(2),
      y: +projected.uiWithOrigin.y.toFixed(2),
    },
    visualOnScreenUI_noOrigin: {
      x: +projected.uiNoOrigin.x.toFixed(2),
      y: +projected.uiNoOrigin.y.toFixed(2),
    },
    screenRaw: {
      x: +projected.screen.x.toFixed(2),
      y: +projected.screen.y.toFixed(2),
    },
    hitTestBoundsWorld: bounds
      ? {
          centerX: +bounds.centerX.toFixed(2),
          centerY: +bounds.centerY.toFixed(2),
          minX: +bounds.minX.toFixed(2),
          maxX: +bounds.maxX.toFixed(2),
          minY: +bounds.minY.toFixed(2),
          maxY: +bounds.maxY.toFixed(2),
        }
      : null,
    delta_touchUI_minus_visual_withOrigin: {
      x: +(uiTouch.x - projected.uiWithOrigin.x).toFixed(2),
      y: +(uiTouch.y - projected.uiWithOrigin.y).toFixed(2),
    },
    delta_touchUI_minus_visual_noOrigin: {
      x: +(uiTouch.x - projected.uiNoOrigin.x).toFixed(2),
      y: +(uiTouch.y - projected.uiNoOrigin.y).toFixed(2),
    },
    view: {
      visibleOrigin: { x: origin.x, y: origin.y },
      viewport: {
        x: viewport.x,
        y: viewport.y,
        width: viewport.width,
        height: viewport.height,
      },
      scaleX: view.getScaleX(),
      scaleY: view.getScaleY(),
    },
  });
}
