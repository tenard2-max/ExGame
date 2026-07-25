import { Node, tween, Vec3 } from 'cc';

const SHAKE_OFFSET = 4;
const SHAKE_STEP_SEC = 0.045;

/**
 * 히트 피드백용 짧은 좌우 흔들림입니다.
 * 같은 노드에 연속 호출되면 이전 트윈을 끊고 rest 위치로 되돌린 뒤 다시 흔듭니다.
 */
export function playNodeHitShake(node: Node, restX: number, restY: number): void {
  tween(node).stop();
  node.setPosition(restX, restY, 0);
  tween(node)
    .to(SHAKE_STEP_SEC, { position: new Vec3(restX + SHAKE_OFFSET, restY, 0) })
    .to(SHAKE_STEP_SEC, { position: new Vec3(restX - SHAKE_OFFSET, restY, 0) })
    .to(SHAKE_STEP_SEC, { position: new Vec3(restX + SHAKE_OFFSET * 0.5, restY, 0) })
    .to(SHAKE_STEP_SEC, { position: new Vec3(restX, restY, 0) })
    .start();
}

/** 청크 로컬 좌표에서 엔티티 시각 노드 이름을 만듭니다. */
export function entityVisualNodeName(entityId: string): string {
  return `entity:${entityId}`;
}
