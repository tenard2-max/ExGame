/** 배경음 트랙 메타데이터입니다. 실제 파일 바이너리는 IndexedDB에 둡니다. */
export interface BgmTrackMeta {
  readonly id: string;
  readonly name: string;
  /** url: 원격/상대 경로, file: IndexedDB에 저장된 로컬 파일 */
  readonly kind: 'url' | 'file';
  /** kind===url 일 때 재생 URL */
  readonly url?: string;
}

export interface BgmPlaylistSnapshot {
  readonly enabled: boolean;
  /** 0~1 */
  readonly volume: number;
  readonly tracks: ReadonlyArray<BgmTrackMeta>;
  readonly currentIndex: number;
}

export type BgmPlaylistListener = (snapshot: BgmPlaylistSnapshot) => void;

export const DEFAULT_BGM_VOLUME = 0.45;
