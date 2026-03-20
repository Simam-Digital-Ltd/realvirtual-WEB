import { Object3D, Vector3, Box3 } from 'three';
import { AABB } from './rv-aabb';
import type { RVTransportSurface } from './rv-transport-surface';

/**
 * RVMovingUnit - A moving unit (part/product) being transported through the system.
 *
 * Created by RVSource, moved by RVTransportSurface, detected by RVSensor, removed by RVSink.
 */
export class RVMovingUnit {
  readonly node: Object3D;
  readonly aabb: AABB;
  readonly sourceName: string;

  /** Which transport surface is currently moving this MU (null = free) */
  currentSurface: RVTransportSurface | null = null;

  /** Marked for removal by Sink */
  markedForRemoval = false;

  constructor(node: Object3D, sourceName: string, halfSize?: Vector3) {
    this.node = node;
    this.sourceName = sourceName;

    if (halfSize) {
      this.aabb = AABB.fromHalfSize(node, halfSize);
    } else {
      this.aabb = AABB.fromNode(node);
    }
  }

  /** Update AABB world position after transport movement */
  updateAABB(): void {
    this.aabb.update();
  }

  /**
   * Dispose this MU - remove from scene and clear references.
   * Does NOT dispose geometry or materials — Object3D.clone() shares
   * geometry and materials by reference with the template. Disposing
   * them here would destroy the shared GPU buffers used by the template
   * and all other MU clones. Template geometries are disposed in clearModel().
   */
  dispose(): void {
    this.node.parent?.remove(this.node);
    // Do NOT dispose geometry here — it is shared by reference with the
    // template via Object3D.clone(). Disposing would corrupt all clones.
  }
}

/**
 * Compute half-size from a template node's bounding box.
 * Called once per template, result cached and reused for all clones.
 */
export function computeTemplateHalfSize(template: Object3D): Vector3 {
  const box = new Box3().setFromObject(template);
  const size = new Vector3();
  box.getSize(size);
  return size.multiplyScalar(0.5);
}
