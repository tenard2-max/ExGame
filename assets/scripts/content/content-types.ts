import type {
  ChunkCoordinate,
  EntityId,
  TileCoordinate,
} from '../world/world-types';

export type ContentTypeId = string;

export interface GeneratedContent {
  readonly id: EntityId;
  readonly typeId: ContentTypeId;
  readonly coordinate: TileCoordinate;
  readonly properties: Readonly<Record<string, string | number | boolean>>;
}

/** Ore → Dungeon → NPC → Treasure → Monster 결과입니다. */
export interface ContentChunkData {
  readonly coordinate: ChunkCoordinate;
  readonly entries: ReadonlyArray<GeneratedContent>;
}
