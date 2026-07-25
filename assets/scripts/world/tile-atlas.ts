import {
  ImageAsset,
  Rect,
  Size,
  SpriteFrame,
  Texture2D,
} from 'cc';

export interface TileAtlasFrame {
  readonly index: number;
  readonly blockId: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly file: string;
}

export interface TileAtlasData {
  readonly tileSize: number;
  readonly atlasWidth: number;
  readonly atlasHeight: number;
  readonly columns: number;
  readonly frames: ReadonlyArray<TileAtlasFrame>;
  readonly byBlockId: Readonly<Record<string, ReadonlyArray<number>>>;
}

export interface AtlasSourceRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * 웹 빌드에 복사된 tiles/atlas.png + atlas.json 을 읽어
 * 블록별 아틀라스 좌표를 제공합니다.
 */
export class TileAtlas {
  private readonly rectsByBlock = new Map<string, AtlasSourceRect[]>();
  private atlasImage: HTMLImageElement | null = null;
  private ready = false;

  isReady(): boolean {
    return this.ready;
  }

  getAtlasImage(): HTMLImageElement | null {
    return this.atlasImage;
  }

  getSourceRect(blockId: string, variantSeed: number): AtlasSourceRect | null {
    const rects = this.rectsByBlock.get(blockId);
    if (!rects || rects.length === 0) return null;
    const index = Math.abs(variantSeed) % rects.length;
    return rects[index] ?? null;
  }

  /** 개별 Sprite용(디버그). 청크 베이크가 기본 경로입니다. */
  getFrame(blockId: string, variantSeed: number): SpriteFrame | null {
    const rect = this.getSourceRect(blockId, variantSeed);
    if (!rect || !this.atlasImage) return null;
    const imageAsset = new ImageAsset(this.atlasImage);
    const texture = new Texture2D();
    texture.image = imageAsset;
    texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
    const spriteFrame = new SpriteFrame();
    spriteFrame.texture = texture;
    spriteFrame.rect = new Rect(rect.x, rect.y, rect.w, rect.h);
    spriteFrame.originalSize = new Size(rect.w, rect.h);
    spriteFrame.packable = false;
    return spriteFrame;
  }

  async load(baseUrl = './tiles'): Promise<void> {
    const jsonUrl = `${baseUrl}/atlas.json`;
    const pngUrl = `${baseUrl}/atlas.png`;
    const response = await fetch(jsonUrl);
    if (!response.ok) {
      throw new Error(`Failed to load tile atlas json: ${jsonUrl}`);
    }
    const data = (await response.json()) as TileAtlasData;
    this.atlasImage = await loadHtmlImage(pngUrl);

    this.rectsByBlock.clear();
    for (const [blockId, indices] of Object.entries(data.byBlockId)) {
      const rects = indices
        .map((index) => data.frames[index])
        .filter((frame): frame is TileAtlasFrame => !!frame)
        .map((frame) => ({
          x: frame.x,
          y: frame.y,
          w: frame.w,
          h: frame.h,
        }));
      this.rectsByBlock.set(blockId, rects);
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

/** 청크/타일 좌표로 결정적 변형 인덱스를 만듭니다. */
export function tileVariantSeed(
  chunkX: number,
  chunkY: number,
  localX: number,
  localY: number,
  blockId: string,
): number {
  let hash = 2166136261;
  const key = `${chunkX},${chunkY},${localX},${localY},${blockId}`;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
