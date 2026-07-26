import {
  Color,
  Graphics,
  ImageAsset,
  Layers,
  Node,
  Rect,
  Size,
  Sprite,
  SpriteFrame,
  Texture2D,
  UITransform,
} from 'cc';

import { CHUNK_SIZE_TILES } from '../core/schema';
import { ContentAtlas } from './content-atlas';
import { entityVisualNodeName } from './hit-shake';
import { MonsterAtlas } from './monster-atlas';
import { NpcSpriteAtlas } from './npc-sprite-atlas';
import {
  TileAtlas,
  tileVariantSeed,
} from './tile-atlas';
import type { GeneratedChunk } from './world-types';
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

export const TILE_SIZE_PIXELS = 32;
export const CHUNK_SIZE_PIXELS = CHUNK_SIZE_TILES * TILE_SIZE_PIXELS;
/** 청크 경계 밖으로 튀어나오는 몬스터·콘텐츠용 여유(px). */
const CHUNK_OVERFLOW_PIXELS = 192;

export { MONSTER_DISPLAY_SCALE } from './monster-atlas';

const BLOCK_COLORS: Readonly<Record<string, Color>> = {
  grass: new Color(66, 126, 72, 255),
  mud: new Color(94, 91, 61, 255),
  rock: new Color(103, 107, 112, 255),
  tree: new Color(22, 58, 32, 255),
  water: new Color(47, 104, 164, 255),
};

const ORE_COLORS: Readonly<Record<string, Color>> = {
  'ore-coal': new Color(40, 45, 52, 255),
  'ore-iron': new Color(191, 123, 82, 255),
  'ore-ark': new Color(72, 235, 224, 255),
};

const CONTENT_SPRITE_TYPES = new Set([
  'ore-coal',
  'ore-iron',
  'ore-ark',
  'treasure-chest',
]);

const MONSTER_COLORS: Readonly<Record<string, Color>> = {
  'monster-slime': new Color(120, 200, 90, 255),
  'monster-wolf': new Color(160, 160, 175, 255),
  'monster-golem': new Color(205, 92, 92, 255),
  'monster-orc': new Color(70, 150, 55, 255),
  'monster-orc-warrior': new Color(55, 130, 50, 255),
  'monster-hero-orc': new Color(40, 110, 45, 255),
  'monster-werewolf': new Color(50, 50, 55, 255),
  'monster-red-wolf': new Color(190, 50, 45, 255),
  'monster-lycanthrope': new Color(70, 80, 120, 255),
  'monster-lizardman': new Color(70, 160, 70, 255),
  'monster-black-lizardman': new Color(45, 45, 50, 255),
  'monster-elder-lizardman': new Color(140, 100, 180, 255),
  'monster-harpy': new Color(150, 110, 70, 255),
  'monster-blood-harpy': new Color(180, 40, 50, 255),
  'monster-elder-harpy': new Color(60, 170, 90, 255),
  'monster-harpy-siren': new Color(50, 120, 200, 255),
  'monster-harpy-queen': new Color(220, 180, 50, 255),
  'monster-troll': new Color(120, 120, 110, 255),
  'monster-elder-troll': new Color(100, 130, 90, 255),
  'monster-high-troll': new Color(90, 90, 95, 255),
  'monster-twinhead-troll': new Color(130, 110, 90, 255),
  'monster-blood-troll': new Color(170, 35, 40, 255),
  'monster-troll-king': new Color(200, 160, 40, 255),
  'monster-ogre': new Color(70, 140, 60, 255),
  'monster-elder-ogre': new Color(55, 120, 55, 255),
  'monster-twinhead-ogre': new Color(40, 100, 50, 255),
  'monster-blood-ogre': new Color(150, 45, 40, 255),
  'monster-thunder-ogre': new Color(80, 140, 200, 255),
  'monster-ogre-king': new Color(210, 180, 60, 255),
};

const TREASURE_COLOR = new Color(235, 195, 60, 255);
const NPC_COLOR = new Color(240, 240, 250, 255);
const TELEPORTER_COLOR = new Color(80, 200, 255, 255);
const TELEPORTER_RING_COLOR = new Color(180, 120, 255, 255);
const DUNGEON_COLOR = new Color(150, 80, 200, 255);

export class ChunkRenderer {
  constructor(
    private readonly atlas: TileAtlas | null = null,
    private readonly monsters: MonsterAtlas | null = null,
    private readonly content: ContentAtlas | null = null,
    private readonly npcs: NpcSpriteAtlas | null = null,
  ) {}

  createNode(chunk: GeneratedChunk): Node {
    const chunkNode = new Node(
      `Chunk(${chunk.coordinate.x},${chunk.coordinate.y})`,
    );
    chunkNode.layer = Layers.Enum.UI_2D;
    chunkNode.setPosition(
      chunk.coordinate.x * CHUNK_SIZE_PIXELS,
      chunk.coordinate.y * CHUNK_SIZE_PIXELS,
    );
    // 앵커 (0,0): 자식 좌표(0..CHUNK)와 AABB를 일치시킵니다.
    // 기본 (0.5,0.5)면 청크 절반·큰 몬스터가 컬링/잘림으로 사라집니다.
    const chunkUi = chunkNode.addComponent(UITransform);
    chunkUi.setAnchorPoint(0, 0);
    chunkUi.setContentSize(
      CHUNK_SIZE_PIXELS + CHUNK_OVERFLOW_PIXELS,
      CHUNK_SIZE_PIXELS + CHUNK_OVERFLOW_PIXELS,
    );

    const terrainRoot = new Node('Terrain');
    terrainRoot.layer = Layers.Enum.UI_2D;
    chunkNode.addChild(terrainRoot);
    terrainRoot.setPosition(CHUNK_SIZE_PIXELS / 2, CHUNK_SIZE_PIXELS / 2, 0);
    const terrainUi = terrainRoot.addComponent(UITransform);
    terrainUi.setAnchorPoint(0.5, 0.5);
    terrainUi.setContentSize(CHUNK_SIZE_PIXELS, CHUNK_SIZE_PIXELS);
    this.drawTerrain(terrainRoot, chunk);

    const overlay = new Node('ContentOverlay');
    overlay.layer = Layers.Enum.UI_2D;
    chunkNode.addChild(overlay);
    const overlayUi = overlay.addComponent(UITransform);
    overlayUi.setAnchorPoint(0, 0);
    overlayUi.setContentSize(
      CHUNK_SIZE_PIXELS + CHUNK_OVERFLOW_PIXELS,
      CHUNK_SIZE_PIXELS + CHUNK_OVERFLOW_PIXELS,
    );
    const graphics = overlay.addComponent(Graphics);
    this.drawContent(graphics, chunk);
    this.drawContentSprites(chunkNode, chunk);
    this.drawNpcSprites(chunkNode, chunk);
    // 몬스터는 청크 루트에 두어 타일보다 크게 그려져도 잘리지 않게 합니다.
    this.drawMonsters(chunkNode, chunk);
    return chunkNode;
  }

  private drawTerrain(parent: Node, chunk: GeneratedChunk): void {
    if (this.atlas?.isReady()) {
      const baked = this.bakeChunkTerrain(chunk);
      if (baked) {
        const sprite = parent.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = baked;
        parent.getComponent(UITransform)!.setContentSize(
          CHUNK_SIZE_PIXELS,
          CHUNK_SIZE_PIXELS,
        );
        return;
      }
    }

    const graphics = parent.addComponent(Graphics);
    // Graphics는 노드 원점 기준이므로 중앙 정렬 보정
    parent.setPosition(0, 0, 0);
    this.drawTerrainColors(graphics, chunk);
  }

  /**
   * 청크 지형을 오프스크린 캔버스에 한 장으로 구워 SpriteFrame 1장으로 만듭니다.
   * 타일당 Sprite 노드(수천 개)를 피하기 위함입니다.
   *
   * 중요: ImageData+uploadData 는 WebGL에서 Y가 한 번 더 뒤집혀
   * 콘텐츠(몬스터/광석)와 어긋납니다. ImageAsset(canvas)로 올려
   * Graphics·마우스 좌표와 같은 방향을 유지합니다.
   */
  private bakeChunkTerrain(chunk: GeneratedChunk): SpriteFrame | null {
    const atlasImage = this.atlas!.getAtlasImage();
    if (!atlasImage) return null;

    const canvas = document.createElement('canvas');
    canvas.width = CHUNK_SIZE_PIXELS;
    canvas.height = CHUNK_SIZE_PIXELS;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;

    for (const block of chunk.terrain.blocks) {
      const seed = tileVariantSeed(
        chunk.coordinate.x,
        chunk.coordinate.y,
        block.coordinate.x,
        block.coordinate.y,
        block.blockId,
      );
      const source = this.atlas!.getSourceRect(block.blockId, seed);
      // 게임 로컬 Y(아래→위 증가)와 맞추기: 캔버스는 위가 0이므로 뒤집습니다.
      // ImageAsset(canvas)는 캔버스 위쪽이 스프라이트 위쪽(높은 로컬 Y)으로 갑니다.
      const dx = block.coordinate.x * TILE_SIZE_PIXELS;
      const dy = (CHUNK_SIZE_TILES - 1 - block.coordinate.y) * TILE_SIZE_PIXELS;

      if (source) {
        ctx.drawImage(
          atlasImage,
          source.x,
          source.y,
          source.w,
          source.h,
          dx,
          dy,
          TILE_SIZE_PIXELS,
          TILE_SIZE_PIXELS,
        );
        // 나무는 풀과 구분되도록 약간만 어둡게 보정합니다.
        if (block.blockId === 'tree') {
          ctx.save();
          ctx.globalCompositeOperation = 'multiply';
          ctx.fillStyle = '#6a8a6a';
          ctx.fillRect(dx, dy, TILE_SIZE_PIXELS, TILE_SIZE_PIXELS);
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = 'rgba(0, 25, 0, 0.18)';
          ctx.fillRect(dx, dy, TILE_SIZE_PIXELS, TILE_SIZE_PIXELS);
          ctx.restore();
        }
      } else {
        const color = BLOCK_COLORS[block.blockId] ?? new Color(80, 80, 80, 255);
        ctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;
        ctx.fillRect(dx, dy, TILE_SIZE_PIXELS, TILE_SIZE_PIXELS);
      }
    }

    const imageAsset = new ImageAsset(canvas);
    const texture = new Texture2D();
    texture.image = imageAsset;
    texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
    texture.setMipFilter(Texture2D.Filter.NONE);

    const spriteFrame = new SpriteFrame();
    spriteFrame.texture = texture;
    spriteFrame.rect = new Rect(0, 0, CHUNK_SIZE_PIXELS, CHUNK_SIZE_PIXELS);
    spriteFrame.originalSize = new Size(CHUNK_SIZE_PIXELS, CHUNK_SIZE_PIXELS);
    spriteFrame.packable = false;
    return spriteFrame;
  }

  private drawTerrainColors(graphics: Graphics, chunk: GeneratedChunk): void {
    for (const [blockId, color] of Object.entries(BLOCK_COLORS)) {
      graphics.fillColor = color;
      let hasBlock = false;
      for (const block of chunk.terrain.blocks) {
        if (block.blockId !== blockId) continue;
        hasBlock = true;
        graphics.rect(
          block.coordinate.x * TILE_SIZE_PIXELS,
          block.coordinate.y * TILE_SIZE_PIXELS,
          TILE_SIZE_PIXELS,
          TILE_SIZE_PIXELS,
        );
      }
      if (hasBlock) graphics.fill();
    }
  }

  private drawContent(graphics: Graphics, chunk: GeneratedChunk): void {
    for (const [typeId, color] of Object.entries(ORE_COLORS)) {
      // 스프라이트가 있으면 원형 플레이스홀더는 건너뜁니다.
      if (this.content?.isReady() && this.content.getFrame(typeId)) continue;
      graphics.fillColor = color;
      let hasContent = false;

      for (const entry of chunk.content.entries) {
        if (entry.typeId !== typeId) continue;
        hasContent = true;
        graphics.circle(
          (entry.coordinate.x + 0.5) * TILE_SIZE_PIXELS,
          (entry.coordinate.y + 0.5) * TILE_SIZE_PIXELS,
          typeId === 'ore-ark' ? 7 : 5,
        );
      }
      if (hasContent) graphics.fill();
    }

    for (const [typeId, color] of Object.entries(MONSTER_COLORS)) {
      // 스프라이트가 있으면 원은 그리지 않습니다.
      if (this.monsters?.isReady() && this.monsters.getFrame(typeId)) {
        continue;
      }
      graphics.fillColor = color;
      let hasMonster = false;
      for (const entry of chunk.content.entries) {
        if (entry.typeId !== typeId) continue;
        hasMonster = true;
        graphics.circle(
          (entry.coordinate.x + 0.5) * TILE_SIZE_PIXELS,
          (entry.coordinate.y + 0.5) * TILE_SIZE_PIXELS,
          10,
        );
      }
      if (hasMonster) graphics.fill();
    }

    graphics.fillColor = TREASURE_COLOR;
    let hasTreasure = false;
    for (const entry of chunk.content.entries) {
      if (entry.typeId !== 'treasure-chest') continue;
      if (this.content?.isReady() && this.content.getFrame(entry.typeId)) {
        continue;
      }
      hasTreasure = true;
      graphics.rect(
        entry.coordinate.x * TILE_SIZE_PIXELS + 7,
        entry.coordinate.y * TILE_SIZE_PIXELS + 9,
        18,
        14,
      );
    }
    if (hasTreasure) graphics.fill();

    graphics.fillColor = NPC_COLOR;
    let hasNpc = false;
    for (const entry of chunk.content.entries) {
      if (entry.typeId !== 'npc-villager') continue;
      hasNpc = true;
      graphics.circle(
        (entry.coordinate.x + 0.5) * TILE_SIZE_PIXELS,
        (entry.coordinate.y + 0.5) * TILE_SIZE_PIXELS,
        8,
      );
    }
    if (hasNpc) graphics.fill();

    // NPC 스프라이트 미로드 시 임시 박스
    if (!this.npcs?.isReady() || !this.npcs.getFrame(BLACKSMITH_TYPE_ID)) {
      for (const entry of chunk.content.entries) {
        if (entry.typeId !== BLACKSMITH_TYPE_ID) continue;
        const cx = (entry.coordinate.x + 0.5) * TILE_SIZE_PIXELS;
        const cy = (entry.coordinate.y + 0.5) * TILE_SIZE_PIXELS;
        const w = BLACKSMITH_FOOTPRINT_W * TILE_SIZE_PIXELS;
        const h = BLACKSMITH_FOOTPRINT_H * TILE_SIZE_PIXELS;
        graphics.fillColor = new Color(180, 120, 60, 220);
        graphics.roundRect(cx - w / 2, cy - h / 2, w, h, 6);
        graphics.fill();
      }
    }

    if (!this.npcs?.isReady() || !this.npcs.getFrame(TELEPORTER_TYPE_ID)) {
      for (const entry of chunk.content.entries) {
        if (entry.typeId !== TELEPORTER_TYPE_ID) continue;
        const cx = (entry.coordinate.x + 0.5) * TILE_SIZE_PIXELS;
        const cy = (entry.coordinate.y + 0.5) * TILE_SIZE_PIXELS;
        const w = TELEPORTER_FOOTPRINT_W * TILE_SIZE_PIXELS;
        const h = TELEPORTER_FOOTPRINT_H * TILE_SIZE_PIXELS;
        graphics.fillColor = TELEPORTER_RING_COLOR;
        graphics.roundRect(cx - w / 2, cy - h / 2, w, h, 8);
        graphics.fill();
        graphics.fillColor = TELEPORTER_COLOR;
        graphics.circle(cx, cy, 10);
        graphics.fill();
      }
    }

    if (!this.npcs?.isReady() || !this.npcs.getFrame(MERCHANT_TYPE_ID)) {
      for (const entry of chunk.content.entries) {
        if (entry.typeId !== MERCHANT_TYPE_ID) continue;
        const cx = (entry.coordinate.x + 0.5) * TILE_SIZE_PIXELS;
        const cy = (entry.coordinate.y + 0.5) * TILE_SIZE_PIXELS;
        const w = MERCHANT_FOOTPRINT_W * TILE_SIZE_PIXELS;
        const h = MERCHANT_FOOTPRINT_H * TILE_SIZE_PIXELS;
        graphics.fillColor = new Color(210, 170, 90, 220);
        graphics.roundRect(cx - w / 2, cy - h / 2, w, h, 8);
        graphics.fill();
      }
    }

    if (!this.npcs?.isReady() || !this.npcs.getFrame(BANKER_TYPE_ID)) {
      for (const entry of chunk.content.entries) {
        if (entry.typeId !== BANKER_TYPE_ID) continue;
        const cx = (entry.coordinate.x + 0.5) * TILE_SIZE_PIXELS;
        const cy = (entry.coordinate.y + 0.5) * TILE_SIZE_PIXELS;
        const w = BANKER_FOOTPRINT_W * TILE_SIZE_PIXELS;
        const h = BANKER_FOOTPRINT_H * TILE_SIZE_PIXELS;
        graphics.fillColor = new Color(90, 150, 210, 220);
        graphics.roundRect(cx - w / 2, cy - h / 2, w, h, 8);
        graphics.fill();
      }
    }

    graphics.fillColor = DUNGEON_COLOR;
    let hasDungeon = false;
    for (const entry of chunk.content.entries) {
      if (entry.typeId !== 'dungeon-entrance') continue;
      hasDungeon = true;
      graphics.rect(
        entry.coordinate.x * TILE_SIZE_PIXELS + 4,
        entry.coordinate.y * TILE_SIZE_PIXELS + 4,
        24,
        24,
      );
    }
    if (hasDungeon) graphics.fill();
  }

  /** 광석·보물상자 스프라이트를 타일 중심에 그립니다. */
  private drawContentSprites(parent: Node, chunk: GeneratedChunk): void {
    if (!this.content?.isReady()) return;

    for (const entry of chunk.content.entries) {
      if (!CONTENT_SPRITE_TYPES.has(entry.typeId)) continue;
      const frame = this.content.getFrame(entry.typeId);
      if (!frame) continue;

      const node = new Node(entityVisualNodeName(entry.id));
      node.layer = Layers.Enum.UI_2D;
      parent.addChild(node);
      const size = this.content.getDisplaySize(entry.typeId)
        ?? {
          width: frame.rect.width,
          height: frame.rect.height,
        };
      node.setPosition(
        (entry.coordinate.x + 0.5) * TILE_SIZE_PIXELS,
        (entry.coordinate.y + 0.5) * TILE_SIZE_PIXELS,
      );
      node.addComponent(UITransform).setContentSize(size.width, size.height);
      const sprite = node.addComponent(Sprite);
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.spriteFrame = frame;
    }
  }

  /** 대장장이·텔레포터 NPC 스프라이트. */
  private drawNpcSprites(parent: Node, chunk: GeneratedChunk): void {
    if (!this.npcs?.isReady()) return;

    for (const entry of chunk.content.entries) {
      if (
        entry.typeId !== BLACKSMITH_TYPE_ID
        && entry.typeId !== TELEPORTER_TYPE_ID
        && entry.typeId !== MERCHANT_TYPE_ID
        && entry.typeId !== BANKER_TYPE_ID
      ) {
        continue;
      }
      const frame = this.npcs.getFrame(entry.typeId);
      if (!frame) continue;
      const fallbackSize = entry.typeId === TELEPORTER_TYPE_ID
        ? {
            width: TELEPORTER_FOOTPRINT_W * TILE_SIZE_PIXELS,
            height: TELEPORTER_FOOTPRINT_H * TILE_SIZE_PIXELS,
          }
        : entry.typeId === MERCHANT_TYPE_ID
          ? {
              width: MERCHANT_FOOTPRINT_W * TILE_SIZE_PIXELS,
              height: MERCHANT_FOOTPRINT_H * TILE_SIZE_PIXELS,
            }
          : entry.typeId === BANKER_TYPE_ID
            ? {
                width: BANKER_FOOTPRINT_W * TILE_SIZE_PIXELS,
                height: BANKER_FOOTPRINT_H * TILE_SIZE_PIXELS,
              }
          : {
              width: BLACKSMITH_FOOTPRINT_W * TILE_SIZE_PIXELS,
              height: BLACKSMITH_FOOTPRINT_H * TILE_SIZE_PIXELS,
            };
      const size = this.npcs.getDisplaySize(entry.typeId) ?? fallbackSize;

      const node = new Node(entityVisualNodeName(entry.id));
      node.layer = Layers.Enum.UI_2D;
      parent.addChild(node);
      node.setPosition(
        (entry.coordinate.x + 0.5) * TILE_SIZE_PIXELS,
        (entry.coordinate.y + 0.5) * TILE_SIZE_PIXELS,
      );
      const transform = node.addComponent(UITransform);
      transform.setContentSize(size.width, size.height);
      transform.setAnchorPoint(0.5, 0.5);
      const sprite = node.addComponent(Sprite);
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.spriteFrame = frame;
    }
  }

  private drawMonsters(parent: Node, chunk: GeneratedChunk): void {
    if (!this.monsters?.isReady()) return;

    for (const entry of chunk.content.entries) {
      if (!entry.typeId.startsWith('monster-')) continue;
      const frame = this.monsters.getFrame(entry.typeId);
      if (!frame) continue;

      const node = new Node(entityVisualNodeName(entry.id));
      node.layer = Layers.Enum.UI_2D;
      // 청크 노드에 직접 붙여 오버레이 Graphics 영향·클리핑을 피합니다.
      parent.addChild(node);
      const size = this.monsters.getDisplaySize(entry.typeId)
        ?? {
          width: Math.round(frame.rect.width * 1.35),
          height: Math.round(frame.rect.height * 1.35),
        };
      const width = size.width;
      const height = size.height;
      // 타일 중심에 두어 청크 중앙 스폰과 시각 위치가 일치합니다.
      node.setPosition(
        (entry.coordinate.x + 0.5) * TILE_SIZE_PIXELS,
        (entry.coordinate.y + 0.5) * TILE_SIZE_PIXELS,
      );
      node.addComponent(UITransform).setContentSize(width, height);
      const sprite = node.addComponent(Sprite);
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.spriteFrame = frame;
      node.setSiblingIndex(parent.children.length - 1);
    }
  }
}
