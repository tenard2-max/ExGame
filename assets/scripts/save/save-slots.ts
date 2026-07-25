import type { SaveSlotId, SaveSlotSummary } from './save-types';

/** 불러오기/저장에 쓰는 고정 슬롯 개수입니다. */
export const FIXED_SAVE_SLOT_COUNT = 30;

/** 불러오기/저장에 쓰는 고정 슬롯입니다. */
export const FIXED_SAVE_SLOT_IDS: ReadonlyArray<SaveSlotId> = Array.from(
  { length: FIXED_SAVE_SLOT_COUNT },
  (_, index) => `slot-${index + 1}`,
);

export function getSaveSlotDisplayName(slotId: SaveSlotId): string {
  const index = FIXED_SAVE_SLOT_IDS.indexOf(slotId);
  if (index >= 0) return `세이브 ${index + 1}`;
  return slotId;
}

export interface SaveSlotListRow {
  readonly slotId: SaveSlotId;
  readonly displayName: string;
  readonly summary: SaveSlotSummary | null;
  readonly isActive: boolean;
}

export function formatSaveUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}
