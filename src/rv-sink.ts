import { Object3D } from 'three';
import { AABB } from './rv-aabb';
import type { RVMovingUnit } from './rv-mu';

/**
 * RVSink - Removes MUs that overlap with this sink's AABB.
 *
 * In Unity, Sink uses OnTriggerEnter to delete MUs.
 * In WebViewer, we use explicit AABB overlap checks.
 */
export class RVSink {
  readonly node: Object3D;
  readonly aabb: AABB;

  /** Callback when a MU is consumed */
  onConsumed?: (mu: RVMovingUnit, sink: RVSink) => void;

  constructor(node: Object3D, aabb: AABB) {
    this.node = node;
    this.aabb = aabb;
  }

  /**
   * Mark MUs that overlap this sink for removal.
   * Returns the marked MUs.
   */
  markOverlapping(mus: RVMovingUnit[]): RVMovingUnit[] {
    const marked: RVMovingUnit[] = [];
    for (const mu of mus) {
      if (mu.markedForRemoval) continue;
      if (this.aabb.overlaps(mu.aabb)) {
        mu.markedForRemoval = true;
        marked.push(mu);
        this.onConsumed?.(mu, this);
      }
    }
    return marked;
  }

  /** Update AABB world position */
  updateAABB(): void {
    this.aabb.update();
  }
}
