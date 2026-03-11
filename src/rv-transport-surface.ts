import { Object3D, Vector3, MathUtils } from 'three';
import { AABB } from './rv-aabb';
import type { RVDrive } from './rv-drive';
import type { RVMovingUnit } from './rv-mu';

// Pre-allocated temp vectors (no GC in hot path)
const _movement = new Vector3();
const _offset = new Vector3();

export interface TransportSurfaceConfig {
  /** World-space transport direction from GLB extras */
  transportDirection: Vector3;
  /** Is this a radial (rotary) transport? */
  isRadial: boolean;
  /** Texture scale for conveyor belt animation */
  textureScale: number;
  /** Height offset override */
  heightOffset: number;
}

/**
 * RVTransportSurface - Moves MUs along a direction at the associated Drive's speed.
 *
 * TransportDirection comes from GLB extras (computed by Unity at export time).
 * Speed comes from the associated RVDrive's currentSpeed.
 */
export class RVTransportSurface {
  readonly node: Object3D;
  readonly config: TransportSurfaceConfig;
  readonly aabb: AABB;

  /** Associated drive (provides speed). Found during scene loading. */
  drive: RVDrive | null = null;

  /** Normalized transport direction in world space */
  private direction = new Vector3();
  /** Rotation axis for radial transport */
  private rotationAxis = new Vector3();

  constructor(node: Object3D, config: TransportSurfaceConfig, aabb: AABB) {
    this.node = node;
    this.config = config;
    this.aabb = aabb;

    // Normalize the transport direction
    this.direction.copy(config.transportDirection).normalize();

    if (config.isRadial) {
      // For radial transport, the direction IS the rotation axis
      this.rotationAxis.copy(this.direction);
    }
  }

  /** Current transport speed in mm/s from the associated Drive */
  get speed(): number {
    if (!this.drive) return 0;
    // Use drive's actual current speed (respects acceleration ramps)
    return this.drive.currentSpeed;
  }

  /** Is the surface actively transporting? */
  get isActive(): boolean {
    return this.drive != null && this.speed > 0;
  }

  /**
   * Move a MU along the transport direction.
   * Linear transport: direct position offset.
   */
  transportMU(mu: RVMovingUnit, dt: number): void {
    if (this.config.isRadial) {
      this.transportMURadial(mu, dt);
      return;
    }

    // Linear transport: position += direction * speed * dt
    // Speed is in mm/s, Three.js positions are in meters -> divide by 1000
    const speedM = this.speed / 1000;
    _movement.copy(this.direction).multiplyScalar(speedM * dt);
    mu.node.position.add(_movement);
  }

  /**
   * Rotate a MU around the surface center (turntable).
   */
  private transportMURadial(mu: RVMovingUnit, dt: number): void {
    // Speed is in degrees/s for rotational drives
    const angleDeg = this.speed * dt;
    const angleRad = MathUtils.degToRad(angleDeg);

    // Get surface center in world space
    const surfacePos = this.node.getWorldPosition(_offset);

    // Offset from surface center to MU
    _movement.copy(mu.node.position).sub(surfacePos);
    // Rotate offset around axis
    _movement.applyAxisAngle(this.rotationAxis, angleRad);
    // Apply new position
    mu.node.position.copy(surfacePos).add(_movement);

    // Also rotate the MU itself
    mu.node.rotateOnAxis(this.rotationAxis, angleRad);
  }

  /** Update AABB (call once per frame, before overlap checks) */
  updateAABB(): void {
    this.aabb.update();
  }
}
