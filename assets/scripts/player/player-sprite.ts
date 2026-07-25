import {
  Graphics,
  ImageAsset,
  Node,
  Rect,
  Size,
  Sprite,
  SpriteFrame,
  Texture2D,
  UITransform,
} from 'cc';

import { TILE_SIZE_PIXELS } from '../world/chunk-renderer';

/** 충돌 박스 반경(기존 40×40). 스프라이트와 별개로 유지합니다. */
export const PLAYER_COLLISION_HALF = 20;

/** prepare-player-sprite.py 의 흰 아웃라인 색. */
const NORMAL_OUTLINE_RGB: readonly [number, number, number] = [245, 245, 250];
/** 저체력 시 아웃라인 색. */
const DANGER_OUTLINE_RGB: readonly [number, number, number] = [220, 35, 35];

/**
 * ./player/player.png 를 로드해 플레이어 노드에 붙입니다.
 * 발은 충돌 박스 하단에 맞추고, 그림은 타일 여러 칸을 차지합니다.
 * 저체력용 빨간 아웃라인 프레임도 함께 준비합니다.
 */
export class PlayerSprite {
  private normalFrame: SpriteFrame | null = null;
  private dangerFrame: SpriteFrame | null = null;
  private sprite: Sprite | null = null;
  private width = 0;
  private height = 0;
  private ready = false;

  isReady(): boolean {
    return this.ready;
  }

  getDisplaySize(): { width: number; height: number } | null {
    if (!this.ready) return null;
    return { width: this.width, height: this.height };
  }

  async load(url = './player/player.png'): Promise<void> {
    const image = await loadHtmlImage(url);
    const normalCanvas = imageToCanvas(image);
    const dangerCanvas = recolorSilhouetteOutline(
      normalCanvas,
      NORMAL_OUTLINE_RGB,
      DANGER_OUTLINE_RGB,
    );

    this.normalFrame = canvasToSpriteFrame(normalCanvas);
    this.dangerFrame = canvasToSpriteFrame(dangerCanvas);
    this.width = normalCanvas.width;
    this.height = normalCanvas.height;
    this.ready = true;
  }

  /**
   * 초록 박스 Graphics를 제거하고 스프라이트를 붙입니다.
   * 노드 position은 충돌 중심, 발은 중심 − half 에 맞춥니다.
   */
  applyTo(playerNode: Node): void {
    if (!this.normalFrame || !this.ready) return;

    const existing = playerNode.getChildByName('PlayerVisual');
    if (existing) existing.destroy();

    const placeholder = playerNode.getComponent(Graphics);
    if (placeholder) placeholder.destroy();

    const visual = new Node('PlayerVisual');
    playerNode.addChild(visual);
    // 발 = 충돌 박스 하단. 앵커 (0.5, 0) → 발이 노드 로컬 y=0.
    visual.setPosition(0, -PLAYER_COLLISION_HALF);
    const transform = visual.addComponent(UITransform);
    transform.setContentSize(this.width, this.height);
    transform.setAnchorPoint(0.5, 0);

    const sprite = visual.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = this.normalFrame;
    this.sprite = sprite;

    // 충돌용 히트박스는 약 1타일 유지
    playerNode.getComponent(UITransform)?.setContentSize(
      PLAYER_COLLISION_HALF * 2,
      PLAYER_COLLISION_HALF * 2,
    );
  }

  /** 체력 위험 상태일 때 빨간 아웃라인 프레임으로 바꿉니다. */
  setDangerOutline(active: boolean): void {
    if (!this.sprite || !this.normalFrame) return;
    this.sprite.spriteFrame = active && this.dangerFrame
      ? this.dangerFrame
      : this.normalFrame;
  }
}

/** 표시 높이가 대략 몇 타일인지(디버그/문서용). */
export function playerSpriteTileFootprint(
  width: number,
  height: number,
): { tilesW: number; tilesH: number } {
  return {
    tilesW: width / TILE_SIZE_PIXELS,
    tilesH: height / TILE_SIZE_PIXELS,
  };
}

function canvasToSpriteFrame(canvas: HTMLCanvasElement): SpriteFrame {
  const imageAsset = new ImageAsset(canvas);
  const texture = new Texture2D();
  texture.image = imageAsset;
  texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
  texture.setMipFilter(Texture2D.Filter.NONE);

  const spriteFrame = new SpriteFrame();
  spriteFrame.texture = texture;
  spriteFrame.rect = new Rect(0, 0, canvas.width, canvas.height);
  spriteFrame.originalSize = new Size(canvas.width, canvas.height);
  spriteFrame.packable = false;
  return spriteFrame;
}

function imageToCanvas(image: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to create 2d context for player sprite');
  }
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0);
  return canvas;
}

/**
 * 흰 실루엣 아웃라인 색을 빨간 아웃라인으로 바꿉니다.
 * prepare-player-sprite 가 깐 외곽 링만 대상이 되도록 색 허용 오차를 좁힙니다.
 */
function recolorSilhouetteOutline(
  source: HTMLCanvasElement,
  fromRgb: readonly [number, number, number],
  toRgb: readonly [number, number, number],
  tolerance = 18,
): HTMLCanvasElement {
  const context = source.getContext('2d');
  if (!context) {
    throw new Error('Failed to read player pixels for outline recolor');
  }
  const imageData = context.getImageData(0, 0, source.width, source.height);
  const { data, width, height } = imageData;
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const outContext = out.getContext('2d');
  if (!outContext) {
    throw new Error('Failed to create danger outline canvas');
  }
  const result = outContext.createImageData(width, height);
  result.data.set(data);

  const tolSq = tolerance * tolerance;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] <= 8) continue;
    const dr = data[i] - fromRgb[0];
    const dg = data[i + 1] - fromRgb[1];
    const db = data[i + 2] - fromRgb[2];
    if (dr * dr + dg * dg + db * db > tolSq) continue;
    result.data[i] = toRgb[0];
    result.data[i + 1] = toRgb[1];
    result.data[i + 2] = toRgb[2];
  }

  outContext.putImageData(result, 0, 0);
  return out;
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    image.src = url;
  });
}
