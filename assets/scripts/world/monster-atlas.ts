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
/** ?袁???깅뮞 ?癒?궚???뚣끇猷??遺얇늺?癒?퐣??????癰궰 ??됱몵嚥?筌띿쉸??(????쎈뱜???袁???깅뮞?? ??쑴???筌ｋ떯而???由?. */
export const MONSTER_DISPLAY_MAX_SIDE = 112;
/** atlas.png/json ?대Ŋ猿????됰슢??怨?夷똚ebView 筌?Ŋ???얜똾??遺우뒠. ?癒??獄쏅떽? ???춳??????? */
export const MONSTER_ATLAS_CACHE_VERSION = '0.1.20';

/**
 * ./monsters/atlas.png + atlas.json ??嚥≪뮆諭??筌뤣딅뮞??SpriteFrame????볥궗??몃빍??
 * ?袁⑥쟿?袁⑥춳??筌?뗀苡??살쨮 ??롮뵬 揶쏆뮆????용뮞筌ｌ꼶? 筌띾슢諭??UV/Y??繹먥뫁彛??獄쎻뫗???몃빍??
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

  /** ?遺얇늺??域밸챶?????由?筌ㅼ뮆? 癰궰 ??쀫립 ?怨몄뒠). */
  getDisplaySize(typeId: string): { width: number; height: number } | null {
    const size = this.sizes.get(typeId);
    if (!size) return null;
    const longest = Math.max(size.width, size.height);
    const fit = longest > 0
      ? Math.min(MONSTER_DISPLAY_SCALE, MONSTER_DISPLAY_MAX_SIDE / longest)
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
  // atlas.json?? ???筌왖 ?ル슣湲??疫꿸퀣?(PIL)??낅빍??
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
