import { CHUNK_SIZE_TILES } from '../core/schema';
import { sampleDeterministicUnit } from './deterministic-random';
import type { BlockId, WorldSeed } from './world-types';

/** 원칙 2: 같은 종류 연결 성분의 최소 타일 수 (4-연결). */
export const MIN_TILE_REGION_SIZE = 32 as const;

/**
 * 저주파 스케일(타일). 특징 지름 ≈ SCALE 이라 면적이 MIN 을 상회합니다.
 * 샘플 비용을 낮추기 위해 옥타브·워프를 제한합니다.
 */
const FIELD_SCALE = 24;
const WARP_AMPLITUDE = 14;
const WARP_FREQUENCY = 1 / 16;

/** 종류별 누적 임계(0~1). */
const REGION_THRESHOLDS: ReadonlyArray<{ type: BlockId; until: number }> = [
  { type: 'water', until: 0.11 },
  { type: 'mud', until: 0.28 },
  { type: 'grass', until: 0.60 },
  { type: 'tree', until: 0.80 },
  { type: 'rock', until: 1.0 },
];

/**
 * 월드 타일 좌표의 지형 블록을 결정합니다.
 * 인접 청크와 맞닿는 면이 자동으로 연속되도록 월드 좌표만 사용합니다.
 */
export function sampleTerrainBlockAt(
  worldSeed: WorldSeed,
  worldX: number,
  worldY: number,
): BlockId {
  const warped = domainWarp(worldSeed, worldX, worldY);
  const field = fbm2D(
    worldSeed,
    'terrain-field',
    warped.x / FIELD_SCALE,
    warped.y / (FIELD_SCALE * 1.41),
    3,
  );
  // 경계 계단을 살짝 흔들되, 작은 섬이 과도하게 생기지 않게 약하게만
  const edge = (valueNoise2D(
    worldSeed,
    'terrain-edge',
    warped.x * 0.11,
    warped.y * 0.11,
  ) - 0.5) * 0.12;
  return classifyField(clamp01(field + edge));
}

/**
 * 청크를 생성할 때 원칙 1(A)(B)를 적용합니다.
 * 가장자리·이웃 맞닿음이 전부 동일 종류면 청크 전체를 그 종류로 채웁니다.
 */
export function buildChunkTerrainBlocks(
  worldSeed: WorldSeed,
  chunkX: number,
  chunkY: number,
): { blocks: Array<{ coordinate: { x: number; y: number }; blockId: BlockId }>; biomeId: string } {
  const size = CHUNK_SIZE_TILES;
  const originX = chunkX * size;
  const originY = chunkY * size;
  const sampled: BlockId[][] = [];

  for (let localY = 0; localY < size; localY += 1) {
    sampled[localY] = [];
    for (let localX = 0; localX < size; localX += 1) {
      sampled[localY][localX] = sampleTerrainBlockAt(
        worldSeed,
        originX + localX,
        originY + localY,
      );
    }
  }

  const interiorType = resolveInteriorUniformType(
    worldSeed,
    originX,
    originY,
    sampled,
  );
  if (interiorType) {
    for (let localY = 0; localY < size; localY += 1) {
      for (let localX = 0; localX < size; localX += 1) {
        sampled[localY][localX] = interiorType;
      }
    }
  }

  const blocks: Array<{ coordinate: { x: number; y: number }; blockId: BlockId }> = [];
  const counts = new Map<string, number>();
  for (let localY = 0; localY < size; localY += 1) {
    for (let localX = 0; localX < size; localX += 1) {
      const blockId = sampled[localY][localX];
      blocks.push({ coordinate: { x: localX, y: localY }, blockId });
      counts.set(blockId, (counts.get(blockId) ?? 0) + 1);
    }
  }

  return {
    blocks,
    biomeId: biomeFromCounts(counts),
  };
}

/**
 * 채집·제거 후 드러날 바닥. 나무/바위 아래는 인근 영역 경향의 grass/mud.
 */
export function sampleGroundBlockAt(
  worldSeed: WorldSeed,
  worldX: number,
  worldY: number,
): BlockId {
  const block = sampleTerrainBlockAt(worldSeed, worldX, worldY);
  if (block === 'grass' || block === 'mud' || block === 'water') return block;

  const warped = domainWarp(worldSeed, worldX, worldY);
  const moisture = valueNoise2D(
    worldSeed,
    'ground-moisture',
    warped.x / FIELD_SCALE,
    warped.y / FIELD_SCALE,
  );
  return moisture < 0.45 ? 'mud' : 'grass';
}

function classifyField(field: number): BlockId {
  for (const entry of REGION_THRESHOLDS) {
    if (field < entry.until) return entry.type;
  }
  return 'grass';
}

function resolveInteriorUniformType(
  worldSeed: WorldSeed,
  originX: number,
  originY: number,
  sampled: BlockId[][],
): BlockId | null {
  const size = CHUNK_SIZE_TILES;
  const edgeType = sampled[0][0];

  for (let x = 0; x < size; x += 1) {
    if (sampled[0][x] !== edgeType) return null;
    if (sampled[size - 1][x] !== edgeType) return null;
  }
  for (let y = 0; y < size; y += 1) {
    if (sampled[y][0] !== edgeType) return null;
    if (sampled[y][size - 1] !== edgeType) return null;
  }

  for (let x = 0; x < size; x += 1) {
    if (sampleTerrainBlockAt(worldSeed, originX + x, originY - 1) !== edgeType) {
      return null;
    }
    if (sampleTerrainBlockAt(worldSeed, originX + x, originY + size) !== edgeType) {
      return null;
    }
  }
  for (let y = 0; y < size; y += 1) {
    if (sampleTerrainBlockAt(worldSeed, originX - 1, originY + y) !== edgeType) {
      return null;
    }
    if (sampleTerrainBlockAt(worldSeed, originX + size, originY + y) !== edgeType) {
      return null;
    }
  }

  return edgeType;
}

function domainWarp(
  worldSeed: WorldSeed,
  worldX: number,
  worldY: number,
): { x: number; y: number } {
  const nx = worldX * WARP_FREQUENCY;
  const ny = worldY * WARP_FREQUENCY;
  const dx = (fbm2D(worldSeed, 'warp-x', nx, ny, 2) - 0.5) * 2 * WARP_AMPLITUDE;
  const dy = (fbm2D(worldSeed, 'warp-y', nx + 19.1, ny - 7.3, 2) - 0.5)
    * 2
    * WARP_AMPLITUDE;
  return { x: worldX + dx, y: worldY + dy };
}

function fbm2D(
  worldSeed: WorldSeed,
  namespace: string,
  x: number,
  y: number,
  octaves: number,
): number {
  let amplitude = 0.5;
  let frequency = 1;
  let sum = 0;
  let norm = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += amplitude * valueNoise2D(
      worldSeed,
      `${namespace}:o${octave}`,
      x * frequency,
      y * frequency,
    );
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return norm > 0 ? sum / norm : 0;
}

function valueNoise2D(
  worldSeed: WorldSeed,
  namespace: string,
  x: number,
  y: number,
): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const tx = fade(x - x0);
  const ty = fade(y - y0);

  const n00 = sampleDeterministicUnit(worldSeed, namespace, x0, y0);
  const n10 = sampleDeterministicUnit(worldSeed, namespace, x1, y0);
  const n01 = sampleDeterministicUnit(worldSeed, namespace, x0, y1);
  const n11 = sampleDeterministicUnit(worldSeed, namespace, x1, y1);

  const nx0 = lerp(n00, n10, tx);
  const nx1 = lerp(n01, n11, tx);
  return lerp(nx0, nx1, ty);
}

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function biomeFromCounts(counts: Map<string, number>): string {
  const mud = counts.get('mud') ?? 0;
  const water = counts.get('water') ?? 0;
  const tree = counts.get('tree') ?? 0;
  const rock = counts.get('rock') ?? 0;
  const grass = counts.get('grass') ?? 0;

  if (water + mud >= grass + tree + rock && water + mud > 0) return 'wetland';
  if (rock >= tree && rock >= grass && rock > 0) return 'rocky';
  if (tree >= grass && tree > 0) return 'forest';
  return 'meadow';
}
