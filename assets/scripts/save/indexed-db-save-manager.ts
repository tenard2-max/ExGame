import { SAVE_SCHEMA_VERSION } from '../core/schema';
import type { PlayerState } from '../player/player-types';
import type { ChunkCoordinate, WorldSeed } from '../world/world-types';
import type {
  CreateSaveSlotInput,
  SaveManager,
  SaveMigrationRegistry,
} from './save-manager';
import type {
  ChunkDelta,
  SaveGame,
  SaveSlotId,
  SaveSlotSummary,
} from './save-types';

const DATABASE_NAME = 'exgame-saves';
const DATABASE_VERSION = 1;
const SLOT_STORE = 'slots';
const DELTA_STORE = 'chunkDeltas';

interface StoredSlotRecord {
  readonly slotId: SaveSlotId;
  readonly schemaVersion: number;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
  readonly worldSeed: WorldSeed;
  readonly player: PlayerState;
}

interface StoredDeltaRecord {
  readonly key: string;
  readonly slotId: SaveSlotId;
  readonly chunkX: number;
  readonly chunkY: number;
  readonly delta: ChunkDelta;
}

/**
 * Seed + 플레이어 상태 + 청크 변경분만 IndexedDB에 저장합니다.
 * 원본 지형 청크는 저장하지 않습니다.
 */
export class IndexedDbSaveManager implements SaveManager {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly migrations: SaveMigrationRegistry,
  ) {}

  async createSlot(input: CreateSaveSlotInput): Promise<SaveGame> {
    const now = new Date().toISOString();
    const record: StoredSlotRecord = {
      slotId: input.slotId,
      schemaVersion: SAVE_SCHEMA_VERSION,
      createdAtIso: now,
      updatedAtIso: now,
      worldSeed: input.worldSeed,
      player: input.initialPlayer,
    };
    await this.putSlot(record);
    return this.toSaveGame(record, {});
  }

  async listSlots(): Promise<ReadonlyArray<SaveSlotSummary>> {
    const database = await this.openDatabase();
    const records = await requestToPromise<StoredSlotRecord[]>(
      database.transaction(SLOT_STORE, 'readonly').objectStore(SLOT_STORE).getAll(),
    );

    return records
      .map((record) => ({
        slotId: record.slotId,
        updatedAtIso: record.updatedAtIso,
        worldSeed: record.worldSeed,
        playerLevel: record.player.stats.level,
      }))
      .sort((left, right) => right.updatedAtIso.localeCompare(left.updatedAtIso));
  }

  async loadSlot(slotId: SaveSlotId): Promise<SaveGame | null> {
    const database = await this.openDatabase();
    const record = await requestToPromise<StoredSlotRecord | undefined>(
      database.transaction(SLOT_STORE, 'readonly').objectStore(SLOT_STORE).get(slotId),
    );
    if (!record) return null;

    const migrated = this.migrations.migrateToCurrent(record);
    const deltas = await this.loadAllDeltas(slotId);
    return {
      ...migrated,
      chunkDeltas: deltas,
    };
  }

  async savePlayer(slotId: SaveSlotId, player: PlayerState): Promise<void> {
    const database = await this.openDatabase();
    const existing = await requestToPromise<StoredSlotRecord | undefined>(
      database.transaction(SLOT_STORE, 'readonly').objectStore(SLOT_STORE).get(slotId),
    );
    if (!existing) {
      throw new Error(`Save slot not found: ${slotId}`);
    }

    await this.putSlot({
      ...existing,
      updatedAtIso: new Date().toISOString(),
      player,
    });
  }

  async loadChunkDelta(
    slotId: SaveSlotId,
    coordinate: ChunkCoordinate,
  ): Promise<ChunkDelta | null> {
    const database = await this.openDatabase();
    const record = await requestToPromise<StoredDeltaRecord | undefined>(
      database
        .transaction(DELTA_STORE, 'readonly')
        .objectStore(DELTA_STORE)
        .get(createDeltaKey(slotId, coordinate)),
    );
    return record?.delta ?? null;
  }

  async saveChunkDelta(slotId: SaveSlotId, delta: ChunkDelta): Promise<void> {
    const database = await this.openDatabase();
    const key = createDeltaKey(slotId, delta.coordinate);
    const store = database.transaction(DELTA_STORE, 'readwrite').objectStore(DELTA_STORE);
    const isEmpty = delta.blocks.length === 0
      && delta.removedGeneratedEntityIds.length === 0
      && delta.placedEntities.length === 0;

    if (isEmpty) {
      await requestToPromise(store.delete(key));
      return;
    }

    const record: StoredDeltaRecord = {
      key,
      slotId,
      chunkX: delta.coordinate.x,
      chunkY: delta.coordinate.y,
      delta,
    };
    await requestToPromise(store.put(record));
  }

  async flush(): Promise<void> {
    // IndexedDB 요청은 각 write에서 이미 await되므로 추가 flush가 없습니다.
  }

  /** 슬롯 전체 SaveGame을 JSON으로보냅니다. */
  async exportSlot(slotId: SaveSlotId): Promise<string> {
    const saveGame = await this.loadSlot(slotId);
    if (!saveGame) throw new Error(`Save slot not found: ${slotId}`);
    return JSON.stringify(saveGame, null, 2);
  }

  /** JSON SaveGame을 가져와 현재 슬롯으로 덮어씁니다. */
  async importSlot(slotId: SaveSlotId, json: string): Promise<SaveGame> {
    const payload = JSON.parse(json) as unknown;
    const migrated = this.migrations.migrateToCurrent(payload);

    await this.clearDeltas(slotId);
    await this.createOrReplaceSlot({
      slotId,
      worldSeed: migrated.world.seed,
      initialPlayer: migrated.player,
      createdAtIso: migrated.metadata.createdAtIso,
    });

    for (const delta of Object.values(migrated.chunkDeltas)) {
      if (!delta) continue;
      await this.saveChunkDelta(slotId, delta);
    }
    return this.loadSlot(slotId) as Promise<SaveGame>;
  }

  /**
   * 청크 변경분을 지우고 플레이어·월드 시드를 교체합니다(새로 시작).
   */
  async resetSlotProgress(input: {
    readonly slotId: SaveSlotId;
    readonly worldSeed: WorldSeed;
    readonly initialPlayer: PlayerState;
  }): Promise<SaveGame> {
    await this.clearDeltas(input.slotId);
    const now = new Date().toISOString();
    await this.createOrReplaceSlot({
      slotId: input.slotId,
      worldSeed: input.worldSeed,
      initialPlayer: input.initialPlayer,
      createdAtIso: now,
    });
    return this.loadSlot(input.slotId) as Promise<SaveGame>;
  }

  private async clearDeltas(slotId: SaveSlotId): Promise<void> {
    const database = await this.openDatabase();
    const records = await requestToPromise<StoredDeltaRecord[]>(
      database
        .transaction(DELTA_STORE, 'readonly')
        .objectStore(DELTA_STORE)
        .index('bySlot')
        .getAll(slotId),
    );

    if (records.length === 0) return;
    const store = database
      .transaction(DELTA_STORE, 'readwrite')
      .objectStore(DELTA_STORE);
    await Promise.all(
      records.map((record) => requestToPromise(store.delete(record.key))),
    );
  }

  private async createOrReplaceSlot(input: {
    readonly slotId: SaveSlotId;
    readonly worldSeed: WorldSeed;
    readonly initialPlayer: PlayerState;
    readonly createdAtIso: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.putSlot({
      slotId: input.slotId,
      schemaVersion: SAVE_SCHEMA_VERSION,
      createdAtIso: input.createdAtIso,
      updatedAtIso: now,
      worldSeed: input.worldSeed,
      player: input.initialPlayer,
    });
  }

  private async loadAllDeltas(
    slotId: SaveSlotId,
  ): Promise<SaveGame['chunkDeltas']> {
    const database = await this.openDatabase();
    const index = database
      .transaction(DELTA_STORE, 'readonly')
      .objectStore(DELTA_STORE)
      .index('bySlot');
    const records = await requestToPromise<StoredDeltaRecord[]>(
      index.getAll(slotId),
    );

    const chunkDeltas: Record<string, ChunkDelta> = {};
    for (const record of records) {
      chunkDeltas[`${record.chunkX},${record.chunkY}`] = record.delta;
    }
    return chunkDeltas;
  }

  private async putSlot(record: StoredSlotRecord): Promise<void> {
    const database = await this.openDatabase();
    await requestToPromise(
      database.transaction(SLOT_STORE, 'readwrite').objectStore(SLOT_STORE).put(record),
    );
  }

  private toSaveGame(
    record: StoredSlotRecord,
    chunkDeltas: SaveGame['chunkDeltas'],
  ): SaveGame {
    return {
      schemaVersion: SAVE_SCHEMA_VERSION,
      metadata: {
        slotId: record.slotId,
        createdAtIso: record.createdAtIso,
        updatedAtIso: record.updatedAtIso,
      },
      world: { seed: record.worldSeed },
      player: record.player,
      chunkDeltas,
    };
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;

    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(SLOT_STORE)) {
          database.createObjectStore(SLOT_STORE, { keyPath: 'slotId' });
        }
        if (!database.objectStoreNames.contains(DELTA_STORE)) {
          const store = database.createObjectStore(DELTA_STORE, {
            keyPath: 'key',
          });
          store.createIndex('bySlot', 'slotId', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    });
    return this.databasePromise;
  }
}

function createDeltaKey(
  slotId: SaveSlotId,
  coordinate: ChunkCoordinate,
): string {
  return `${slotId}:${coordinate.x},${coordinate.y}`;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}
