import { TELEPORTER_MAX_WAYPOINTS } from './teleporter-config';
import type {
  TeleportWaypoint,
  TeleportWaypointListener,
} from './teleport-types';

/**
 * 텔레포터 위치 저장소(최대 99개).
 * 세이브의 PlayerState.teleportWaypoints와 동기화합니다.
 */
export class TeleportWaypointStore {
  private waypoints: TeleportWaypoint[] = [];
  private readonly listeners = new Set<TeleportWaypointListener>();
  private nextId = 1;

  addListener(listener: TeleportWaypointListener): void {
    this.listeners.add(listener);
    listener(this.getAll());
  }

  removeListener(listener: TeleportWaypointListener): void {
    this.listeners.delete(listener);
  }

  getAll(): ReadonlyArray<TeleportWaypoint> {
    return this.waypoints;
  }

  count(): number {
    return this.waypoints.length;
  }

  isFull(): boolean {
    return this.waypoints.length >= TELEPORTER_MAX_WAYPOINTS;
  }

  loadFromState(entries: ReadonlyArray<TeleportWaypoint> | undefined): void {
    this.waypoints = normalizeWaypoints(entries ?? []);
    this.nextId = this.waypoints.reduce(
      (max, entry) => Math.max(max, extractNumericId(entry.id) + 1),
      1,
    );
    this.notify();
  }

  toState(): ReadonlyArray<TeleportWaypoint> {
    return this.waypoints.map((entry) => ({ ...entry }));
  }

  /** 새 위치를 추가합니다. 가득 차면 null. */
  add(name: string, worldTileX: number, worldTileY: number): TeleportWaypoint | null {
    if (this.isFull()) return null;
    const trimmed = name.trim() || `위치 ${this.waypoints.length + 1}`;
    const waypoint: TeleportWaypoint = {
      id: `wp-${this.nextId}`,
      name: trimmed.slice(0, 32),
      worldTileX: Math.trunc(worldTileX),
      worldTileY: Math.trunc(worldTileY),
    };
    this.nextId += 1;
    this.waypoints = [...this.waypoints, waypoint];
    this.notify();
    return waypoint;
  }

  rename(id: string, name: string): boolean {
    const index = this.waypoints.findIndex((entry) => entry.id === id);
    if (index < 0) return false;
    const trimmed = name.trim();
    if (!trimmed) return false;
    const next = [...this.waypoints];
    next[index] = { ...next[index], name: trimmed.slice(0, 32) };
    this.waypoints = next;
    this.notify();
    return true;
  }

  remove(id: string): boolean {
    const next = this.waypoints.filter((entry) => entry.id !== id);
    if (next.length === this.waypoints.length) return false;
    this.waypoints = next;
    this.notify();
    return true;
  }

  findById(id: string): TeleportWaypoint | null {
    return this.waypoints.find((entry) => entry.id === id) ?? null;
  }

  clear(): void {
    this.waypoints = [];
    this.nextId = 1;
    this.notify();
  }

  private notify(): void {
    const snapshot = this.getAll();
    for (const listener of this.listeners) listener(snapshot);
  }
}

function extractNumericId(id: string): number {
  const match = /^wp-(\d+)$/.exec(id);
  return match ? Number(match[1]) : 0;
}

function normalizeWaypoints(
  entries: ReadonlyArray<TeleportWaypoint>,
): TeleportWaypoint[] {
  const result: TeleportWaypoint[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    if (typeof entry.id !== 'string' || !entry.id) continue;
    if (seen.has(entry.id)) continue;
    if (typeof entry.name !== 'string') continue;
    if (!Number.isFinite(entry.worldTileX) || !Number.isFinite(entry.worldTileY)) {
      continue;
    }
    seen.add(entry.id);
    result.push({
      id: entry.id,
      name: entry.name.slice(0, 32),
      worldTileX: Math.trunc(entry.worldTileX),
      worldTileY: Math.trunc(entry.worldTileY),
    });
    if (result.length >= TELEPORTER_MAX_WAYPOINTS) break;
  }
  return result;
}
