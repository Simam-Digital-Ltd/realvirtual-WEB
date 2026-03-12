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
   * Dispose this MU - remove from scene.
   * Does NOT dispose shared geometry/textures (clones share with template).
   */
  dispose(): void {
    this.node.parent?.remove(this.node);
    // Only dispose materials that were uniquely created for this clone
    this.node.traverse((child) => {
      const mesh = child as { material?: { dispose(): void } | { dispose(): void }[] };
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    });
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
