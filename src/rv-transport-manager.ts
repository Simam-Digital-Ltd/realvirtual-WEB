import type { Scene } from 'three';
import type { RVTransportSurface } from './rv-transport-surface';
import type { RVSensor } from './rv-sensor';
import type { RVSource } from './rv-source';
import type { RVSink } from './rv-sink';
import type { RVMovingUnit } from './rv-mu';
import { debug } from './rv-debug';

/**
 * RVTransportManager - Central coordinator for transport simulation.
 *
 * Manages the update order: Sources -> Transport -> Sensors -> Sinks.
 * Called from SimulationLoop.onFixedUpdate.
 */
export class RVTransportManager {
  surfaces: RVTransportSurface[] = [];
  sensors: RVSensor[] = [];
  sources: RVSource[] = [];
  sinks: RVSink[] = [];
  mus: RVMovingUnit[] = [];
  scene: Scene | null = null;

  /** Total MUs spawned since start */
  totalSpawned = 0;
  /** Total MUs consumed by sinks since start */
  totalConsumed = 0;

  /**
   * Main update loop - called every fixed timestep (16.67ms @ 60Hz).
   *
   * Order matters:
   * 1. Sources spawn new MUs
   * 2. Update surface AABBs
   * 3. Transport: each MU is moved by exactly one surface (currentSurface tracking)
   * 4. Update MU AABBs (after transport moved them)
   * 5. Sensors check overlap with MUs
   * 6. Sinks mark overlapping MUs for removal
   * 7. Remove marked MUs (reverse iteration, swap-and-pop)
   */
  update(dt: number): void {
    // 1. Sources: spawn new MUs
    for (const source of this.sources) {
      const mu = source.update(dt);
      if (mu) {
        this.mus.push(mu);
        this.totalSpawned++;
        debug('transport', `Source "${source.node.name}" spawned MU #${this.totalSpawned}: "${mu.node.name}"`);
      }
    }

    // 2. Update surface AABBs
    for (const surface of this.surfaces) {
      surface.updateAABB();
    }

    // 3. Transport: each MU is moved by exactly one surface (currentSurface)
    for (const mu of this.mus) {
      if (mu.markedForRemoval) continue;

      // Check if currentSurface still overlaps
      if (mu.currentSurface) {
        const curr = mu.currentSurface;
        if (curr.isActive && curr.aabb.overlaps(mu.aabb)) {
          curr.transportMU(mu, dt);
          continue;
        }
        // Left the current surface
        mu.currentSurface = null;
      }

      // Find a new surface
      for (const surface of this.surfaces) {
        if (!surface.isActive) continue;
        if (surface.aabb.overlaps(mu.aabb)) {
          mu.currentSurface = surface;
          surface.transportMU(mu, dt);
          debug('transport', `MU "${mu.node.name}" entered surface "${surface.node.name}"`);
          break;
        }
      }
    }

    // 4. Update MU AABBs after transport
    for (const mu of this.mus) {
      if (!mu.markedForRemoval) {
        mu.updateAABB();
      }
    }

    // 5. Sensors: check overlap
    for (const sensor of this.sensors) {
      sensor.updateAABB();
      sensor.checkOverlap(this.mus);
    }

    // 6. Sinks: mark overlapping MUs
    for (const sink of this.sinks) {
      sink.updateAABB();
      sink.markOverlapping(this.mus);
    }

    // 7. Remove marked MUs (reverse iteration, swap-and-pop — no splice!)
    for (let i = this.mus.length - 1; i >= 0; i--) {
      if (this.mus[i].markedForRemoval) {
        this.mus[i].dispose();
        this.totalConsumed++;
        // Swap with last element and pop
        this.mus[i] = this.mus[this.mus.length - 1];
        this.mus.pop();
      }
    }
  }

  /** Get counts for stats display */
  get stats() {
    let occupiedSensors = 0;
    for (const s of this.sensors) {
      if (s.occupied) occupiedSensors++;
    }
    return {
      mus: this.mus.length,
      sensors: this.sensors.length,
      sensorsOccupied: occupiedSensors,
      surfaces: this.surfaces.length,
      sources: this.sources.length,
      sinks: this.sinks.length,
      totalSpawned: this.totalSpawned,
      totalConsumed: this.totalConsumed,
    };
  }

  /** Reset all state */
  reset(): void {
    for (const mu of this.mus) {
      mu.dispose();
    }
    this.mus.length = 0;
    this.totalSpawned = 0;
    this.totalConsumed = 0;
    for (const sensor of this.sensors) {
      sensor.occupied = false;
      sensor.occupiedMU = null;
    }
  }
}
