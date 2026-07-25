import {
  ImageAsset,
  Rect,
  Size,
  SpriteFrame,
  Texture2D,
} from 'cc';

export interface ContentFrameInfo {
  readonly name: string;
  readonly typeId: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** 광석·보물 등 콘텐츠 스프라이트 표시 배율. */
export const CONTENT_DISPLAY_SCALE = 1.0;

/**
 * ./content/atlas.png + atlas.json 을 로드해 콘텐츠 SpriteFrame을 제공합니다.
 */
export class ContentAtlas {
  private readonly frames = new Map<string, SpriteFrame>();
  private readonly sizes = new Map<string, { width: number; height: number }>();
  private ready = false;

  isReady(): boolean {
    return this.ready;
  }

  getFrame(typeId: string): SpriteFrame | null {
    return this.frames.get(typeId) ?? null;
  }

  getDisplaySize(typeId: string): { width: number; height: number } | null {
    const size = this.sizes.get(typeId);
    if (!size) return null;
    return {
      width: Math.round(size.width * CONTENT_DISPLAY_SCALE),
      height: Math.round(size.height * CONTENT_DISPLAY_SCALE),
    };
  }

  async load(baseUrl = './content'): Promise<void> {
    const response = await fetch(`${baseUrl}/atlas.json`);
    if (!response.ok) {
      throw new Error(`Failed to load content atlas json: ${baseUrl}/atlas.json`);
    }
    const data = (await response.json()) as {
      width: number;
      height: number;
      frames: ContentFrameInfo[];
    };
    const image = await loadHtmlImage(`${baseUrl}/atlas.png`);
    const imageAsset = new ImageAsset(image);
    const texture = new Texture2D();
    texture.image = imageAsset;
    texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
    texture.setMipFilter(Texture2D.Filter.NONE);

    this.frames.clear();
    this.sizes.clear();
    for (const frame of data.frames) {
      const spriteFrame = new SpriteFrame();
      spriteFrame.texture = texture;
      spriteFrame.rect = new Rect(frame.x, frame.y, frame.w, frame.h);
      spriteFrame.originalSize = new Size(frame.w, frame.h);
      spriteFrame.packable = false;
      this.frames.set(frame.typeId, spriteFrame);
      this.sizes.set(frame.typeId, { width: frame.w, height: frame.h });
    }
    this.ready = true;
  }
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    image.src = url;
  });
}
