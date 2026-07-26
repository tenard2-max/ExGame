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
/** 하피는 다른 몬스터보다 40% 크게 표시합니다. */
export const HARPY_DISPLAY_SCALE = 1.4;
/** 트롤은 다른 몬스터보다 50% 크게 표시합니다. */
export const TROLL_DISPLAY_SCALE = 1.5;
/** 오우거는 다른 몬스터보다 70% 크게 표시합니다. */
export const OGRE_DISPLAY_SCALE = 1.7;
const HARPY_TYPE_IDS = new Set<string>([
  'monster-harpy',
  'monster-blood-harpy',
  'monster-elder-harpy',
  'monster-harpy-siren',
  'monster-harpy-queen',
]);
const TROLL_TYPE_IDS = new Set<string>([
  'monster-troll',
  'monster-elder-troll',
  'monster-high-troll',
  'monster-twinhead-troll',
  'monster-blood-troll',
  'monster-troll-king',
]);
const OGRE_TYPE_IDS = new Set<string>([
  'monster-ogre',
  'monster-elder-ogre',
  'monster-twinhead-ogre',
  'monster-blood-ogre',
  'monster-thunder-ogre',
  'monster-ogre-king',
]);
/** 하피·트롤·오우거: 다른 몬스터와 동일 톤의 붉은 실루엣 아웃라인. */
const RED_OUTLINE_TYPE_IDS = new Set<string>([
  ...HARPY_TYPE_IDS,
  ...TROLL_TYPE_IDS,
  ...OGRE_TYPE_IDS,
]);
const RED_OUTLINE_COLOR: readonly [number, number, number, number] = [220, 35, 35, 255];
const RED_OUTLINE_THICKNESS = 2;
/** atlas.png/json 교체 시 브라우저·WebView 캐시 무효화용. */
export const MONSTER_ATLAS_CACHE_VERSION = '0.1.27';

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

  /** 화면에 그리는 크기. 하피 1.4배, 트롤 1.5배, 오우거 1.7배. */
  getDisplaySize(typeId: string): { width: number; height: number } | null {
    const size = this.sizes.get(typeId);
    if (!size) return null;
    const longest = Math.max(size.width, size.height);
    let scale = 1;
    if (HARPY_TYPE_IDS.has(typeId)) {
      scale = HARPY_DISPLAY_SCALE;
    } else if (TROLL_TYPE_IDS.has(typeId)) {
      scale = TROLL_DISPLAY_SCALE;
    } else if (OGRE_TYPE_IDS.has(typeId)) {
      scale = OGRE_DISPLAY_SCALE;
    }
    const maxSide = MONSTER_DISPLAY_MAX_SIDE * scale;
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
      let cropped = cropFrame(image, frame);
      if (RED_OUTLINE_TYPE_IDS.has(frame.typeId)) {
        cropped = addRedSilhouetteOutline(
          cropped,
          RED_OUTLINE_THICKNESS,
          RED_OUTLINE_COLOR,
        );
      }
      const imageAsset = new ImageAsset(cropped);
      const texture = new Texture2D();
      texture.image = imageAsset;
      texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
      texture.setMipFilter(Texture2D.Filter.NONE);

      const spriteFrame = new SpriteFrame();
      spriteFrame.texture = texture;
      spriteFrame.rect = new Rect(0, 0, cropped.width, cropped.height);
      spriteFrame.originalSize = new Size(cropped.width, cropped.height);
      spriteFrame.packable = false;
      this.frames.set(frame.typeId, spriteFrame);
      this.sizes.set(frame.typeId, { width: cropped.width, height: cropped.height });
    }
    this.ready = true;
  }
}

/**
 * 불투명 실루엣 바깥에 빨간 아웃라인을 깔고 캐릭터를 다시 올립니다.
 * slice-monsters.py 의 add_red_silhouette_outline 과 동일 톤입니다.
 */
function addRedSilhouetteOutline(
  source: HTMLCanvasElement,
  thickness = RED_OUTLINE_THICKNESS,
  color: readonly [number, number, number, number] = RED_OUTLINE_COLOR,
): HTMLCanvasElement {
  const pad = thickness + 1;
  const width = source.width + pad * 2;
  const height = source.height + pad * 2;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to create 2d context for monster red outline');
  }
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, width, height);
  context.drawImage(source, pad, pad);

  const imageData = context.getImageData(0, 0, width, height);
  const { data } = imageData;
  const pixelCount = width * height;
  const opaque = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    opaque[i] = data[i * 4 + 3] > 8 ? 1 : 0;
  }

  const radiusSq = thickness * thickness + 1;
  const outline = new Uint8Array(pixelCount);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (opaque[index]) continue;
      let hit = false;
      for (let dy = -thickness; dy <= thickness && !hit; dy += 1) {
        for (let dx = -thickness; dx <= thickness; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          if (dx * dx + dy * dy > radiusSq) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (opaque[ny * width + nx]) {
            hit = true;
            break;
          }
        }
      }
      if (hit) outline[index] = 1;
    }
  }

  for (let i = 0; i < pixelCount; i += 1) {
    if (!outline[i]) continue;
    const offset = i * 4;
    data[offset] = color[0];
    data[offset + 1] = color[1];
    data[offset + 2] = color[2];
    data[offset + 3] = color[3];
  }
  context.putImageData(imageData, 0, 0);
  // 캐릭터 본체를 아웃라인 위에 다시 올려 가장자리를 덮습니다.
  context.drawImage(source, pad, pad);
  return canvas;
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
