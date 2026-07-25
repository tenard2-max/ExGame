import {
  ImageAsset,
  Rect,
  Size,
  SpriteFrame,
  Texture2D,
} from 'cc';

import {
  BLACKSMITH_FOOTPRINT_H,
  BLACKSMITH_FOOTPRINT_W,
  BLACKSMITH_TYPE_ID,
} from '../npc/blacksmith-config';
import {
  MERCHANT_FOOTPRINT_H,
  MERCHANT_FOOTPRINT_W,
  MERCHANT_TYPE_ID,
} from '../npc/merchant-config';
import {
  BANKER_FOOTPRINT_H,
  BANKER_FOOTPRINT_W,
  BANKER_TYPE_ID,
} from '../npc/banker-config';
import {
  TELEPORTER_FOOTPRINT_H,
  TELEPORTER_FOOTPRINT_W,
  TELEPORTER_TYPE_ID,
} from '../npc/teleporter-config';

const TILE_SIZE_PIXELS = 32;

interface NpcSpriteDef {
  readonly typeId: string;
  readonly fileName: string;
  readonly footprintW: number;
  readonly footprintH: number;
}

const NPC_SPRITES: ReadonlyArray<NpcSpriteDef> = [
  {
    typeId: BLACKSMITH_TYPE_ID,
    fileName: 'blacksmith.png',
    footprintW: BLACKSMITH_FOOTPRINT_W,
    footprintH: BLACKSMITH_FOOTPRINT_H,
  },
  {
    typeId: TELEPORTER_TYPE_ID,
    fileName: 'teleporter.png',
    footprintW: TELEPORTER_FOOTPRINT_W,
    footprintH: TELEPORTER_FOOTPRINT_H,
  },
  {
    typeId: MERCHANT_TYPE_ID,
    fileName: 'merchant.png',
    footprintW: MERCHANT_FOOTPRINT_W,
    footprintH: MERCHANT_FOOTPRINT_H,
  },
  {
    typeId: BANKER_TYPE_ID,
    fileName: 'banker.png',
    footprintW: BANKER_FOOTPRINT_W,
    footprintH: BANKER_FOOTPRINT_H,
  },
];

/**
 * NPC 전용 스프라이트 로더 (대장장이·텔레포터 등).
 */
export class NpcSpriteAtlas {
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
    return this.sizes.get(typeId) ?? null;
  }

  async load(baseUrl = './npcs'): Promise<void> {
    this.frames.clear();
    this.sizes.clear();
    let loaded = 0;
    for (const def of NPC_SPRITES) {
      try {
        const image = await loadHtmlImage(`${baseUrl}/${def.fileName}`);
        const frame = imageToSpriteFrame(image);
        this.frames.set(def.typeId, frame);
        this.sizes.set(def.typeId, {
          width: def.footprintW * TILE_SIZE_PIXELS,
          height: def.footprintH * TILE_SIZE_PIXELS,
        });
        loaded += 1;
      } catch (error) {
        console.warn(`[ExGame] Failed to load NPC sprite ${def.fileName}`, error);
      }
    }
    this.ready = loaded > 0;
  }
}

function imageToSpriteFrame(image: HTMLImageElement): SpriteFrame {
  const imageAsset = new ImageAsset(image);
  const texture = new Texture2D();
  texture.image = imageAsset;
  texture.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
  texture.setMipFilter(Texture2D.Filter.NONE);
  const spriteFrame = new SpriteFrame();
  spriteFrame.texture = texture;
  spriteFrame.rect = new Rect(0, 0, image.width, image.height);
  spriteFrame.originalSize = new Size(image.width, image.height);
  spriteFrame.packable = false;
  return spriteFrame;
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    image.src = url;
  });
}
