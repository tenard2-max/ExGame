/** 현재 영속 데이터 스키마 버전입니다. */
export const SAVE_SCHEMA_VERSION = 1 as const;

/** 기획에서 확정한 청크 한 변의 타일 수입니다. */
export const CHUNK_SIZE_TILES = 16 as const;

/** 중심 청크를 포함해 상하좌우 한 칸까지만 메모리에 유지합니다. */
export const CHUNK_MEMORY_RADIUS = 1 as const;

/** 3×3 활성 영역의 최대 청크 수입니다. */
export const MAX_LOADED_CHUNKS = 9 as const;

export type SaveSchemaVersion = typeof SAVE_SCHEMA_VERSION;
