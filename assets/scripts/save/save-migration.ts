import { SAVE_SCHEMA_VERSION } from '../core/schema';
import type { PlayerState } from '../player/player-types';
import type { WorldSeed } from '../world/world-types';
import type {
  SaveMigration,
  SaveMigrationRegistry,
} from './save-manager';
import type { SaveGame } from './save-types';

/**
 * 스키마 버전을 연속적으로 올립니다.
 * 중간 버전 누락·검증 실패는 조용히 무시하지 않고 오류를 던집니다.
 */
export class DefaultSaveMigrationRegistry implements SaveMigrationRegistry {
  private readonly migrations = new Map<number, SaveMigration>();

  register(migration: SaveMigration): void {
    if (migration.toVersion !== migration.fromVersion + 1) {
      throw new Error(
        `Migration must advance by 1 version: `
        + `${migration.fromVersion} -> ${migration.toVersion}`,
      );
    }
    this.migrations.set(migration.fromVersion, migration);
  }

  migrateToCurrent(payload: unknown): SaveGame {
    let current = normalizeSavePayload(payload);
    let version = current.schemaVersion;

    while (version < SAVE_SCHEMA_VERSION) {
      const migration = this.migrations.get(version);
      if (!migration) {
        throw new Error(
          `Missing migration from schema version ${version}`,
        );
      }
      current = normalizeSavePayload(migration.migrate(current));
      if (current.schemaVersion !== migration.toVersion) {
        throw new Error(
          `Migration claimed ${migration.toVersion} but produced `
          + `${current.schemaVersion}`,
        );
      }
      version = current.schemaVersion;
    }

    if (version !== SAVE_SCHEMA_VERSION) {
      throw new Error(`Unsupported schema version: ${version}`);
    }
    return current;
  }
}

interface LooseSavePayload {
  readonly schemaVersion?: number;
  readonly metadata?: {
    readonly slotId?: string;
    readonly createdAtIso?: string;
    readonly updatedAtIso?: string;
  };
  readonly world?: { readonly seed?: WorldSeed };
  readonly worldSeed?: WorldSeed;
  readonly player?: PlayerState;
  readonly chunkDeltas?: SaveGame['chunkDeltas'];
  readonly slotId?: string;
  readonly createdAtIso?: string;
  readonly updatedAtIso?: string;
}

/** IndexedDB 슬롯 레코드와 내보내기 JSON을 공통 SaveGame 형태로 맞춥니다. */
function normalizeSavePayload(payload: unknown): SaveGame {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Save payload must be an object.');
  }

  const loose = payload as LooseSavePayload;
  const schemaVersion = loose.schemaVersion;
  if (typeof schemaVersion !== 'number') {
    throw new Error('Save payload is missing schemaVersion.');
  }

  const slotId = loose.metadata?.slotId ?? loose.slotId;
  const createdAtIso = loose.metadata?.createdAtIso ?? loose.createdAtIso;
  const updatedAtIso = loose.metadata?.updatedAtIso ?? loose.updatedAtIso;
  const worldSeed = loose.world?.seed ?? loose.worldSeed;
  const player = loose.player;

  if (!slotId || !createdAtIso || !updatedAtIso || !worldSeed || !player) {
    throw new Error('Save payload is missing required fields.');
  }

  return {
    schemaVersion: schemaVersion as SaveGame['schemaVersion'],
    metadata: { slotId, createdAtIso, updatedAtIso },
    world: { seed: worldSeed },
    player,
    chunkDeltas: loose.chunkDeltas ?? {},
  };
}
