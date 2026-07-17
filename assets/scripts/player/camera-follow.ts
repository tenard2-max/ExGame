import { _decorator, Component, Node, UITransform, Vec3 } from 'cc';

const { ccclass } = _decorator;

const DEFAULT_DAMPING = 8;

@ccclass('CameraFollow')
export class CameraFollow extends Component {
  private readonly targetPosition = new Vec3();
  private readonly nextPosition = new Vec3();
  private target: Node | null = null;
  private damping = DEFAULT_DAMPING;

  configure(target: Node, damping = DEFAULT_DAMPING): void {
    this.target = target;
    this.damping = damping;
  }

  protected lateUpdate(deltaTime: number): void {
    if (!this.target || !this.node.parent) return;

    const parentTransform = this.node.parent.getComponent(UITransform);
    if (parentTransform) {
      parentTransform.convertToNodeSpaceAR(
        this.target.worldPosition,
        this.targetPosition,
      );
    } else {
      this.targetPosition.set(this.target.position);
    }

    const current = this.node.position;
    this.targetPosition.z = current.z;
    const blend = 1 - Math.exp(-this.damping * deltaTime);
    Vec3.lerp(this.nextPosition, current, this.targetPosition, blend);
    this.node.setPosition(this.nextPosition);
  }
}
