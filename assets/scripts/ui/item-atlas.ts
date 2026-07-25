import {
  ImageAsset,
  Rect,
  Size,
  SpriteFrame,
  Texture2D,
} from 'cc';

export interface ItemFrameInfo {
  readonly name: string;
  readonly itemId: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export const ITEM_ICON_DISPLAY_SIZE = 40;

/**
 * ./items/atlas.png + atlas.json 아이콘 프레임을 제공합니다.
 */
export class ItemAtlas {
  private readonly frames = new Map<string, SpriteFrame>();
  private ready = false;

  isReady(): boolean {
    return this.ready;
  }

  getFrame(itemId: string): SpriteFrame | null {
    return this.frames.get(itemId) ?? null;
  }

  async load(baseUrl = './items'): Promise<void> {
    const response = await fetch(`${baseUrl}/atlas.json`);
    if (!response.ok) {
      throw new Error(`Failed to load item atlas json: ${baseUrl}/atlas.json`);
    }
    const data = (await response.json()) as {
      width: number;
      height: number;
      frames: ItemFrameInfo[];
    };
    const image = await loadHtmlImage(`${baseUrl}/atlas.png`);

    this.frames.clear();
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
      this.frames.set(frame.itemId, spriteFrame);
    }
    this.ready = true;
  }
}

function cropFrame(
  source: HTMLImageElement,
  frame: ItemFrameInfo,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = frame.w;
  canvas.height = frame.h;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to create 2d context for item frame crop');
  }
  context.imageSmoothingEnabled = false;
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
