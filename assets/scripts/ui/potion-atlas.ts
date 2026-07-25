import {
  ImageAsset,
  Rect,
  Size,
  SpriteFrame,
  Texture2D,
} from 'cc';

export interface PotionFrameInfo {
  readonly name: string;
  readonly typeId: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** 포션 메뉴 아이콘 표시 크기. */
export const POTION_ICON_DISPLAY_SIZE = 40;

/**
 * ./potions/atlas.png + atlas.json 을 로드해 포션 SpriteFrame을 제공합니다.
 */
export class PotionAtlas {
  private readonly frames = new Map<string, SpriteFrame>();
  private ready = false;

  isReady(): boolean {
    return this.ready;
  }

  getFrame(typeId: string): SpriteFrame | null {
    return this.frames.get(typeId) ?? null;
  }

  async load(baseUrl = './potions'): Promise<void> {
    const response = await fetch(`${baseUrl}/atlas.json`);
    if (!response.ok) {
      throw new Error(`Failed to load potion atlas json: ${baseUrl}/atlas.json`);
    }
    const data = (await response.json()) as {
      width: number;
      height: number;
      frames: PotionFrameInfo[];
    };
    const image = await loadHtmlImage(`${baseUrl}/atlas.png`);
    const imageAsset = new ImageAsset(image);
    const texture = new Texture2D();
    texture.image = imageAsset;
    texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
    texture.setMipFilter(Texture2D.Filter.NONE);

    this.frames.clear();
    for (const frame of data.frames) {
      const spriteFrame = new SpriteFrame();
      spriteFrame.texture = texture;
      spriteFrame.rect = new Rect(frame.x, frame.y, frame.w, frame.h);
      spriteFrame.originalSize = new Size(frame.w, frame.h);
      spriteFrame.packable = false;
      this.frames.set(frame.typeId, spriteFrame);
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
