import { Object3D, Vector3 } from 'three';
import { RVMovingUnit, computeTemplateHalfSize } from './rv-mu';

// Pre-allocated temp vector (no GC in hot path)
const _sourcePos = new Vector3();
const _lastMUPos = new Vector3();

export interface SourceConfig {
  spawnMode: 'Interval' | 'Distance' | 'OnSignal';
  spawnInterval: number;  // seconds
  spawnDistance: number;   // mm
  muName: string;          // Template MU name (from ThisObjectAsMU path)
  placeOnTransportSurface: boolean;
  sourceIsTemplate: boolean;  // True when ThisObjectAsMU points to the Source itself
}

/**
 * RVSource - Spawns new MU instances at regular intervals or by distance.
 *
 * Uses a template MU node from the GLB (found by name) and clones it.
 * Template is hidden at load time and used as a clone source.
 */
export class RVSource {
  readonly node: Object3D;
  readonly config: SourceConfig;

  /** Template to clone for new MUs */
  muTemplate: Object3D | null = null;
  /** Cached half-size from template (computed once) */
  private templateHalfSize: Vector3 | null = null;

  /** Timer for interval-based spawning */
  private timer = 0;
  /** Counter for unique MU names */
  private spawnCount = 0;
  /** Last spawned MU (for distance mode) */
  private lastSpawnedMU: RVMovingUnit | null = null;

  /** Parent scene node to add spawned MUs to */
  spawnParent: Object3D | null = null;

  constructor(node: Object3D, config: SourceConfig) {
    this.node = node;
    this.config = config;
  }

  /** Set the template MU and pre-compute its half-size */
  setTemplate(template: Object3D): void {
    this.muTemplate = template;
    this.templateHalfSize = computeTemplateHalfSize(template);
    // Hide template (it's just for cloning)
    template.visible = false;
  }

  /**
   * Update source timer and spawn MU if ready.
   * Returns new MU or null.
   */
  update(dt: number): RVMovingUnit | null {
    if (!this.muTemplate || !this.spawnParent) return null;

    if (this.config.spawnMode === 'Interval') {
      this.timer += dt;
      if (this.timer >= this.config.spawnInterval) {
        this.timer -= this.config.spawnInterval;
        return this.spawn();
      }
    } else if (this.config.spawnMode === 'Distance') {
      // Distance mode: spawn when previous MU has moved spawnDistance mm away
      // (or immediately if no MU has been spawned yet)
      if (!this.lastSpawnedMU || this.lastSpawnedMU.markedForRemoval) {
        return this.spawn();
      }
      // Measure distance from source to last spawned MU (in meters)
      this.node.getWorldPosition(_sourcePos);
      this.lastSpawnedMU.node.getWorldPosition(_lastMUPos);
      const distM = _sourcePos.distanceTo(_lastMUPos);
      const distMM = distM * 1000;
      if (distMM >= this.config.spawnDistance) {
        return this.spawn();
      }
    }
    // OnSignal mode not implemented for PoC

    return null;
  }

  /** Create a new MU at this source's position */
  private spawn(): RVMovingUnit | null {
    if (!this.muTemplate || !this.spawnParent || !this.templateHalfSize) return null;

    const clone = this.muTemplate.clone();
    clone.visible = true;
    clone.name = `${this.muTemplate.name}_${this.spawnCount++}`;

    // Position at source location
    this.node.getWorldPosition(clone.position);

    this.spawnParent.add(clone);

    const mu = new RVMovingUnit(clone, this.node.name, this.templateHalfSize.clone());
    this.lastSpawnedMU = mu;
    return mu;
  }
}
