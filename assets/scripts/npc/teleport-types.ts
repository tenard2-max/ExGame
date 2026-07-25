/** 텔레포터가 기억하는 월드 타일 좌표 위치입니다. */
export interface TeleportWaypoint {
  readonly id: string;
  readonly name: string;
  /** 월드 타일 X (청크 경계와 무관한 절대 타일). */
  readonly worldTileX: number;
  readonly worldTileY: number;
}

export type TeleportWaypointListener = (
  waypoints: ReadonlyArray<TeleportWaypoint>,
) => void;
