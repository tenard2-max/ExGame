import type {
  DeterministicRandom,
  SeedDeriver,
} from './generation-contracts';
import type { ChunkCoordinate, WorldSeed } from './world-types';

/** 문자열을 32비트 정수로 고정 변환하는 FNV-1a 변형입니다. */
export function hashString32(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function sampleDeterministicUnit(
  worldSeed: WorldSeed,
  namespace: string,
  x: number,
  y: number,
): number {
  const hash = hashString32(`${worldSeed}|${namespace}|${x}|${y}`);
  let value = hash + 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export class Mulberry32Random implements DeterministicRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  nextFloat(): number {
    this.state += 0x6d2b79f5;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  nextInteger(minInclusive: number, maxExclusive: number): number {
    if (maxExclusive <= minInclusive) {
      throw new RangeError('maxExclusive must be greater than minInclusive.');
    }
    return minInclusive + Math.floor(
      this.nextFloat() * (maxExclusive - minInclusive),
    );
  }

  fork(namespace: string): DeterministicRandom {
    return new Mulberry32Random(
      hashString32(`${this.state}|${namespace}`),
    );
  }
}

export class DefaultSeedDeriver implements SeedDeriver {
  createRandom(
    worldSeed: WorldSeed,
    coordinate: ChunkCoordinate,
    namespace: string,
  ): DeterministicRandom {
    return new Mulberry32Random(
      hashString32(
        `${worldSeed}|${coordinate.x}|${coordinate.y}|${namespace}`,
      ),
    );
  }
}
