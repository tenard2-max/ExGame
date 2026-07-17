import {
  Color,
  Graphics,
  Layers,
  Node,
  UITransform,
} from 'cc';

import { CHUNK_SIZE_TILES } from '../core/schema';
import type { GeneratedChunk } from './world-types';

export const TILE_SIZE_PIXELS = 32;
export const CHUNK_SIZE_PIXELS = CHUNK_SIZE_TILES * TILE_SIZE_PIXELS;

const BLOCK_COLORS: Readonly<Record<string, Color>> = {
  grass: new Color(66, 126, 72, 255),
  mud: new Color(94, 91, 61, 255),
  rock: new Color(103, 107, 112, 255),
  tree: new Color(36, 88, 52, 255),
  water: new Color(47, 104, 164, 255),
};

const ORE_COLORS: Readonly<Record<string, Color>> = {
  'ore-coal': new Color(40, 45, 52, 255),
  'ore-iron': new Color(191, 123, 82, 255),
  'ore-ark': new Color(72, 235, 224, 255),
};

const MONSTER_COLORS: Readonly<Record<string, Color>> = {
  'monster-slime': new Color(120, 200, 90, 255),
  'monster-wolf': new Color(160, 160, 175, 255),
  'monster-golem': new Color(205, 92, 92, 255),
};

const TREASURE_COLOR = new Color(235, 195, 60, 255);
const NPC_COLOR = new Color(240, 240, 250, 255);
const DUNGEON_COLOR = new Color(150, 80, 200, 255);

export class ChunkRenderer {
  createNode(chunk: GeneratedChunk): Node {
    const chunkNode = new Node(
      `Chunk(${chunk.coordinate.x},${chunk.coordinate.y})`,
    );
    chunkNode.layer = Layers.Enum.UI_2D;
    chunkNode.setPosition(
      chunk.coordinate.x * CHUNK_SIZE_PIXELS,
      chunk.coordinate.y * CHUNK_SIZE_PIXELS,
    );
    chunkNode.addComponent(UITransform).setContentSize(
      CHUNK_SIZE_PIXELS,
      CHUNK_SIZE_PIXELS,
    );

    const graphics = chunkNode.addComponent(Graphics);
    this.drawTerrain(graphics, chunk);
    this.drawContent(graphics, chunk);
    this.drawBorder(graphics);
    return chunkNode;
  }

  private drawTerrain(graphics: Graphics, chunk: GeneratedChunk): void {
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

    // 같은 색상끼리 묶어 fill 횟수를 줄입니다.
    for (const [typeId, color] of Object.entries(MONSTER_COLORS)) {
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

  private drawBorder(graphics: Graphics): void {
    graphics.strokeColor = new Color(255, 255, 255, 35);
    graphics.lineWidth = 2;
    graphics.rect(0, 0, CHUNK_SIZE_PIXELS, CHUNK_SIZE_PIXELS);
    graphics.stroke();
  }
}
