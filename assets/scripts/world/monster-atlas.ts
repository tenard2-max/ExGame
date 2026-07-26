import {
  ImageAsset,
  Rect,
  Size,
  SpriteFrame,
  Texture2D,
} from 'cc';

export interface MonsterFrameInfo {
  readonly name: string;
  readonly typeId: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export const MONSTER_DISPLAY_SCALE = 1;
/** 아틀라스 원본이 커도 화면에서는 이 한 변 안으로 맞춤. */
export const MONSTER_DISPLAY_MAX_SIDE = 112;
/** 오우거는 다른 몬스터보다 30% 크게 표시합니다. */
export const OGRE_DISPLAY_SCALE = 1.3;
const OGRE_TYPE_IDS = new Set<string>([
  'monster-ogre',
  'monster-elder-ogre',
  'monster-twinhead-ogre',
  'monster-blood-ogre',
  'monster-thunder-ogre',
  'monster-ogre-king',
]);
/** atlas.png/json 교체 시 브라우저·WebView 캐시 무효화용. */
export const MONSTER_ATLAS_CACHE_VERSION = '0.1.23';

/**
 * ./monsters/atlas.png + atlas.json 을 로드해 몬스터 SpriteFrame을 제공합니다.
 * 프레임마다 캔버스로 잘라 개별 텍스처를 만들어 UV/Y축 깨짐을 방지합니다.
 */
export class MonsterAtlas {
  private readonly frames = new Map<string, SpriteFrame>();
  private readonly sizes = new Map<string, { width: number; height: number }>();
  private ready = false;

  isReady(): boolean {
    return this.ready;
  }

  getFrame(typeId: string): SpriteFrame | null {
    return this.frames.get(typeId) ?? null;
  }

  /** 화면에 그리는 크기. 오우거는 max side를 1.3배로 씁니다. */
  getDisplaySize(typeId: string): { width: number; height: number } | null {
    const size = this.sizes.get(typeId);
    if (!size) return null;
    const longest = Math.max(size.width, size.height);
    const maxSide = OGRE_TYPE_IDS.has(typeId)
      ? MONSTER_DISPLAY_MAX_SIDE * OGRE_DISPLAY_SCALE
      : MONSTER_DISPLAY_MAX_SIDE;
    const fit = longest > 0
      ? Math.min(MONSTER_DISPLAY_SCALE, maxSide / longest)
      : MONSTER_DISPLAY_SCALE;
    return {
      width: Math.max(1, Math.round(size.width * fit)),
      height: Math.max(1, Math.round(size.height * fit)),
    };
  }

  async load(baseUrl = './monsters'): Promise<void> {
    const bust = `v=${MONSTER_ATLAS_CACHE_VERSION}`;
    const jsonUrl = `${baseUrl}/atlas.json?${bust}`;
    const response = await fetch(jsonUrl, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to load monster atlas json: ${jsonUrl}`);
    }
    const data = (await response.json()) as {
      width: number;
      height: number;
      frames: MonsterFrameInfo[];
    };
    const image = await loadHtmlImage(`${baseUrl}/atlas.png?${bust}`);

    this.frames.clear();
    this.sizes.clear();
    for (const frame of data.frames) {
      const cropped = cropFrame(image, frame);
      const imageAsset = new ImageAsset(cropped);
      const texture = new Texture2D();
      texture.image = imageAsset;
      texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
      texture.setMipFilter(Texture2D.Filter.NONE);

      const spriteFrame = new SpriteFrame();
      spriteFrame.texture = texture;
      spriteFrame.rect = new Rect(0, 0, frame.w, frame.h);
      spriteFrame.originalSize = new Size(frame.w, frame.h);
      spriteFrame.packable = false;
      this.frames.set(frame.typeId, spriteFrame);
      this.sizes.set(frame.typeId, { width: frame.w, height: frame.h });
    }
    this.ready = true;
  }
}

function cropFrame(
  source: HTMLImageElement,
  frame: MonsterFrameInfo,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = frame.w;
  canvas.height = frame.h;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to create 2d context for monster frame crop');
  }
  context.imageSmoothingEnabled = false;
  // atlas.json은 이미지 좌상단 기준(PIL)입니다.
  context.drawImage(
    source,
    frame.x,
    frame.y,
    frame.w,
    frame.h,
    0,
    0,
    frame.w,
    frame.h,
  );
  return canvas;
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    image.src = url;
  });
}
