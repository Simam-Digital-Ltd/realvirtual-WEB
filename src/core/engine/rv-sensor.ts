import {
  Object3D,
  Mesh,
  BoxGeometry,
  CylinderGeometry,
  MeshBasicMaterial,
  DoubleSide,
  EdgesGeometry,
  LineSegments,
  LineBasicMaterial,
  Vector3,
  Quaternion,
} from 'three';
import { AABB } from './rv-aabb';
import type { RVMovingUnit } from './rv-mu';
import { debug } from './rv-debug';

export interface SensorConfig {
  invertSignal: boolean;
  mode: 'Collision' | 'Raycast';
  /** Local-space ray direction (glTF coords). Only for Raycast mode. */
  rayCastDirection?: { x: number; y: number; z: number };
  /** Ray length in mm. Only for Raycast mode. */
  rayCastLength?: number;
}

// Shared materials (reused across all sensors to save GPU resources)
const YELLOW = 0xffcc00;
const RED = 0xff2222;

const matYellow = new MeshBasicMaterial({
  color: YELLOW,
  transparent: true,
  opacity: 0.18,
  side: DoubleSide,
  depthWrite: false,
});

const matRed = new MeshBasicMaterial({
  color: RED,
  transparent: true,
  opacity: 0.35,
  side: DoubleSide,
  depthWrite: false,
});

const wireYellow = new LineBasicMaterial({ color: YELLOW, transparent: true, opacity: 0.6 });
const wireRed = new LineBasicMaterial({ color: RED, transparent: true, opacity: 0.8 });

// ─── Ray-AABB intersection (slab method) ─────────────────────────────

/** Reusable temporaries to avoid per-frame allocation */
const _origin = new Vector3();
const _dir = new Vector3();
const _forward = new Vector3(0, 0, 1);
const _quat = new Quaternion();

/**
 * Fast ray vs AABB intersection test (slab method).
 * Returns distance to closest hit, or -1 if no intersection.
 * O(1) per test — no mesh traversal.
 */
function rayIntersectsAABB(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  maxDist: number,
  aabbMin: Vector3, aabbMax: Vector3,
): number {
  let tmin = 0;
  let tmax = maxDist;

  // X slab
  if (Math.abs(dx) < 1e-8) {
    if (ox < aabbMin.x || ox > aabbMax.x) return -1;
  } else {
    let t1 = (aabbMin.x - ox) / dx;
    let t2 = (aabbMax.x - ox) / dx;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }

  // Y slab
  if (Math.abs(dy) < 1e-8) {
    if (oy < aabbMin.y || oy > aabbMax.y) return -1;
  } else {
    let t1 = (aabbMin.y - oy) / dy;
    let t2 = (aabbMax.y - oy) / dy;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }

  // Z slab
  if (Math.abs(dz) < 1e-8) {
    if (oz < aabbMin.z || oz > aabbMax.z) return -1;
  } else {
    let t1 = (aabbMin.z - oz) / dz;
    let t2 = (aabbMax.z - oz) / dz;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }

  return tmin;
}

/**
 * RVSensor - Detects MU presence via AABB overlap or raycast.
 *
 * Collision mode: uses AABB overlap (BoxCollider-based).
 * Raycast mode: casts a ray from the sensor origin in a configured direction
 * and checks intersection with MU bounding boxes (fast slab method).
 *
 * Visualization:
 * - Collision: semi-transparent box (yellow = idle, red = occupied)
 * - Raycast: line from origin to ray end/hit (yellow = idle, red = occupied)
 */
export class RVSensor {
  readonly node: Object3D;
  readonly config: SensorConfig;
  readonly aabb: AABB;

  /** Current occupied state */
  occupied = false;
  /** The MU currently occupying this sensor (first one found) */
  occupiedMU: RVMovingUnit | null = null;

  /** Callback for state change (for UI/visualization updates) */
  onChanged?: (occupied: boolean, sensor: RVSensor) => void;

  /** Visual mesh for sensor zone — Collision mode (child of sensor node) */
  private visMesh: Mesh | null = null;
  /** Wireframe edges for sensor zone — Collision mode */
  private visEdges: LineSegments | null = null;

  /** Ray tube visualization — Raycast mode (added to scene, world-space) */
  private rayTube: Mesh | null = null;

  constructor(node: Object3D, config: SensorConfig, aabb: AABB) {
    this.node = node;
    this.config = config;
    this.aabb = aabb;
  }

  // ─── Collision-mode visualization (box) ────────────────────────────

  /**
   * Create the visual indicator mesh for Collision mode.
   * Must be called after construction with the BoxCollider center/size
   * from the GLB extras (in glTF space, matching the AABB).
   */
  createVisualization(localCenter: { x: number; y: number; z: number }, halfSize: { x: number; y: number; z: number }): void {
    const sx = halfSize.x * 2;
    const sy = halfSize.y * 2;
    const sz = halfSize.z * 2;
    if (sx < 0.0001 && sy < 0.0001 && sz < 0.0001) return;

    const geo = new BoxGeometry(sx, sy, sz);
    this.visMesh = new Mesh(geo, matYellow);
    this.visMesh.position.set(localCenter.x, localCenter.y, localCenter.z);
    this.visMesh.renderOrder = 999; // render on top of scene geometry
    this.visMesh.name = `${this.node.name}_sensorViz`;

    const edgesGeo = new EdgesGeometry(geo);
    this.visEdges = new LineSegments(edgesGeo, wireYellow);
    this.visEdges.position.copy(this.visMesh.position);
    this.visEdges.renderOrder = 999;

    this.node.add(this.visMesh);
    this.node.add(this.visEdges);
  }

  // ─── Raycast-mode visualization (tube) ──────────────────────────────

  /** Shared ray tube materials (more visible than Line which has no width on WebGL) */
  private static readonly rayMatYellow = new MeshBasicMaterial({
    color: YELLOW, transparent: true, opacity: 0.5, depthWrite: false,
  });
  private static readonly rayMatRed = new MeshBasicMaterial({
    color: RED, transparent: true, opacity: 0.7, depthWrite: false,
  });

  /** Create the ray tube visualization for Raycast mode. */
  createRayVisualization(): void {
    if (this.config.mode !== 'Raycast') return;

    const maxDist = (this.config.rayCastLength ?? 1000) / 1000;
    const radius = 0.002; // 2mm radius — visible but not obtrusive
    const indexedGeo = new CylinderGeometry(radius, radius, maxDist, 6, 1);
    // CylinderGeometry is along Y by default; we'll orient it per-frame
    indexedGeo.translate(0, maxDist / 2, 0); // pivot at bottom (origin = ray start)
    indexedGeo.rotateX(Math.PI / 2); // point along +Z as default forward

    // Convert to non-indexed to avoid WebGPU index buffer format issues
    const geo = indexedGeo.toNonIndexed();
    indexedGeo.dispose();

    this.rayTube = new Mesh(geo, RVSensor.rayMatYellow);
    this.rayTube.renderOrder = 999;
    this.rayTube.frustumCulled = false;
    this.rayTube.name = `${this.node.name}_sensorRay`;

    // Add to scene root (world-space transform)
    let root: Object3D = this.node;
    while (root.parent && root.parent.parent) root = root.parent;
    root.add(this.rayTube);

    // Initialize position/orientation
    this.updateRayTube();
  }

  /** Compute world-space ray origin and direction. */
  private computeRay(): { origin: Vector3; dir: Vector3; maxDist: number } {
    const cfg = this.config;
    const d = cfg.rayCastDirection ?? { x: -1, y: 0, z: 0 };
    const maxDist = (cfg.rayCastLength ?? 1000) / 1000; // mm → meters

    this.node.updateWorldMatrix(true, false);
    _origin.setFromMatrixPosition(this.node.matrixWorld);
    _dir.set(d.x, d.y, d.z).transformDirection(this.node.matrixWorld).normalize();

    return { origin: _origin, dir: _dir, maxDist };
  }

  /** Update the ray tube position, orientation, and color. Always full length. */
  private updateRayTube(): void {
    if (!this.rayTube) return;

    const { origin, dir } = this.computeRay();

    // Position at ray origin
    this.rayTube.position.copy(origin);

    // Orient tube to point along ray direction
    // The tube geometry points along +Z after our rotateX(PI/2)
    _forward.set(0, 0, 1);
    _quat.setFromUnitVectors(_forward, dir);
    this.rayTube.quaternion.copy(_quat);

    // Color: yellow=idle, red=occupied
    this.rayTube.material = this.occupied ? RVSensor.rayMatRed : RVSensor.rayMatYellow;
  }

  // ─── Visualization update (both modes) ─────────────────────────────

  /** Update visualization color based on occupied state */
  private updateVisualization(): void {
    // Collision mode (box)
    if (this.visMesh && this.visEdges) {
      this.visMesh.material = this.occupied ? matRed : matYellow;
      this.visEdges.material = this.occupied ? wireRed : wireYellow;
    }
    // Raycast mode (tube color updated in updateRayTube)
  }

  // ─── Detection ─────────────────────────────────────────────────────

  /**
   * Check for MU presence and update occupied state.
   * Called once per fixed timestep.
   * Dispatches to collision (AABB) or raycast check based on config mode.
   */
  checkOverlap(mus: RVMovingUnit[]): void {
    if (this.config.mode === 'Raycast') {
      this.checkRaycast(mus);
    } else {
      this.checkCollision(mus);
    }
  }

  /** Collision mode: AABB overlap check. */
  private checkCollision(mus: RVMovingUnit[]): void {
    let foundMU: RVMovingUnit | null = null;

    for (const mu of mus) {
      if (mu.markedForRemoval) continue;
      if (this.aabb.overlaps(mu.aabb)) {
        foundMU = mu;
        break; // First overlap is enough
      }
    }

    this.applyResult(foundMU);
  }

  /** Raycast mode: ray-AABB intersection against all MUs. */
  private checkRaycast(mus: RVMovingUnit[]): void {
    const { origin, dir, maxDist } = this.computeRay();

    let foundMU: RVMovingUnit | null = null;
    let hitDist = maxDist;

    for (const mu of mus) {
      if (mu.markedForRemoval) continue;
      const d = rayIntersectsAABB(
        origin.x, origin.y, origin.z,
        dir.x, dir.y, dir.z,
        maxDist,
        mu.aabb.min, mu.aabb.max,
      );
      if (d >= 0 && d < hitDist) {
        hitDist = d;
        foundMU = mu;
      }
    }

    this.applyResult(foundMU);
    this.updateRayTube();
  }

  /** Apply detection result and fire callback if state changed. */
  private applyResult(foundMU: RVMovingUnit | null): void {
    const rawOccupied = foundMU !== null;
    const newOccupied = this.config.invertSignal ? !rawOccupied : rawOccupied;

    if (newOccupied !== this.occupied) {
      this.occupied = newOccupied;
      this.occupiedMU = foundMU;
      debug('sensor', `Sensor "${this.node.name}" → ${newOccupied ? 'OCCUPIED' : 'CLEARED'}${foundMU ? ` by "${foundMU.node.name}"` : ''}`);
      this.updateVisualization();
      this.onChanged?.(this.occupied, this);
    } else if (this.config.mode === 'Raycast') {
      // Still update ray line even if state didn't change (MU might be moving)
      // updateRayTube is called from checkRaycast already
    }
  }

  /** Update AABB world position */
  updateAABB(): void {
    this.aabb.update();
  }
}
