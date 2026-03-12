import { Vector3, Object3D, Box3 } from 'three';
import { unityPositionToGltf } from './rv-coordinate-utils';

/**
 * Pre-allocated Axis-Aligned Bounding Box for fast overlap tests.
 * All vectors are pre-allocated — no GC in hot path.
 */
export class AABB {
  readonly center = new Vector3();
  readonly halfSize = new Vector3();
  readonly min = new Vector3();
  readonly max = new Vector3();

  /** Local-space offset from node origin (e.g., BoxCollider center) */
  readonly localCenter = new Vector3();
  /** Reference to the scene node for position updates */
  private node: Object3D | null = null;

  /**
   * Create AABB from BoxCollider center/size in GLB extras.
   * glTF negates Unity X-axis, so center.x is flipped.
   */
  static fromBoxCollider(
    node: Object3D,
    center: { x: number; y: number; z: number },
    size: { x: number; y: number; z: number },
  ): AABB {
    const aabb = new AABB();
    aabb.node = node;
    // Convert Unity LHS BoxCollider center to glTF RHS space
    aabb.localCenter.copy(unityPositionToGltf(center.x, center.y, center.z));
    aabb.halfSize.set(
      Math.abs(size.x) / 2,
      Math.abs(size.y) / 2,
      Math.abs(size.z) / 2,
    );
    aabb.update();
    return aabb;
  }

  /**
   * Create AABB from mesh bounding box (fallback when no BoxCollider data).
   */
  static fromNode(node: Object3D): AABB {
    const aabb = new AABB();
    aabb.node = node;
    const box = new Box3().setFromObject(node);
    const size = new Vector3();
    box.getSize(size);
    aabb.halfSize.copy(size).multiplyScalar(0.5);
    // localCenter = box center relative to node position
    const boxCenter = new Vector3();
    box.getCenter(boxCenter);
    node.getWorldPosition(aabb.localCenter);
    aabb.localCenter.subVectors(boxCenter, aabb.localCenter);
    aabb.update();
    return aabb;
  }

  /**
   * Create AABB with explicit half-size (for dynamically spawned MUs).
   */
  static fromHalfSize(node: Object3D, halfSize: Vector3): AABB {
    const aabb = new AABB();
    aabb.node = node;
    aabb.localCenter.set(0, 0, 0);
    aabb.halfSize.copy(halfSize);
    aabb.update();
    return aabb;
  }

  /** Update world-space min/max from node position + local offset */
  update(): void {
    if (this.node) {
      this.node.getWorldPosition(this.center);
      this.center.add(this.localCenter);
    }
    this.min.copy(this.center).sub(this.halfSize);
    this.max.copy(this.center).addScaledVector(this.halfSize, 1);
    // Explicit: min = center - halfSize, max = center + halfSize
    this.max.copy(this.center).add(this.halfSize);
  }

  /** Fast AABB overlap test — no allocations */
  overlaps(other: AABB): boolean {
    return (
      this.min.x <= other.max.x && this.max.x >= other.min.x &&
      this.min.y <= other.max.y && this.max.y >= other.min.y &&
      this.min.z <= other.max.z && this.max.z >= other.min.z
    );
  }
}
