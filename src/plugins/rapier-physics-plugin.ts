/**
 * RapierPhysicsPlugin — Replaces kinematic transport with Rapier.js physics.
 *
 * When active (handlesTransport=true), transportManager.update() is skipped
 * and this plugin handles all MU movement, sensor detection, and sink removal
 * via the Rapier physics world.
 *
 * Lifecycle:
 *   preload() → WASM init (call BEFORE viewer.use())
 *   onModelLoaded → build Rapier world from scene
 *   onFixedUpdatePost → step, sync, process events, sources, sinks
 *   onModelCleared → dispose physics world
 *   dispose → cleanup WASM resources
 */

import type { RVViewerPlugin } from '../core/rv-plugin';
import type { RVViewer } from '../core/rv-viewer';
import type { LoadResult } from '../rv-scene-loader';
import { RVPhysicsWorld } from '../rv-physics-world';
import type { RVTransportSurface } from '../rv-transport-surface';
import type { RVSensor } from '../rv-sensor';
import type { RVSink } from '../rv-sink';
import type { RVMovingUnit } from '../rv-mu';
import { Vector3, Quaternion, MathUtils } from 'three';
import { loadPhysicsSettings } from '../hmi/physics-settings-store';
import { debug } from '../rv-debug';

// Pre-allocated temp vectors for zero-GC hot path
const _surfacePos = new Vector3();
const _muWorldPos = new Vector3();

export class RapierPhysicsPlugin implements RVViewerPlugin {
  readonly id = 'rapier-physics';
  readonly order = 50; // Before sensor-monitor (100) and transport-stats (100)
  handlesTransport = true;

  private _rapier: typeof import('@dimforge/rapier3d-compat') | null = null;
  private _physicsWorld: RVPhysicsWorld | null = null;
  private _viewer: RVViewer | null = null;

  /** Maps surface node name/path → surface ID used in physics world */
  private _surfaceIds = new Map<RVTransportSurface, string>();
  /** Maps sensor node name/path → sensor ID used in physics world */
  private _sensorIds = new Map<RVSensor, string>();
  /** Maps MU ID → RVMovingUnit instance (for sync and removal) */
  private _muMap = new Map<string, RVMovingUnit>();
  /** Maps sensor ID → RVSensor (for event dispatch) */
  private _sensorLookup = new Map<string, RVSensor>();
  /** Maps sink sensor ID → RVSink */
  private _sinkSensors = new Map<string, RVSink>();
  /** MU ID counter for unique identification */
  private _muIdCounter = 0;
  /** Maps RVMovingUnit → MU ID in physics world */
  private _muToId = new Map<RVMovingUnit, string>();

  /** Node sync map: MU ID → { position, quaternion } for Rapier → Three.js sync */
  private _nodeSyncMap = new Map<string, { position: Vector3; quaternion: Quaternion }>();

  // ─── WASM Preloading ──────────────────────────────────────────

  /**
   * Load and initialize Rapier WASM. Call this BEFORE viewer.use().
   * If this fails, handlesTransport is set to false and the viewer
   * falls back to kinematic transport.
   */
  async preload(): Promise<void> {
    try {
      const RAPIER = await import('@dimforge/rapier3d-compat');
      await RAPIER.init();
      this._rapier = RAPIER;
      console.log('[RapierPhysicsPlugin] WASM loaded successfully');
    } catch (e) {
      console.warn('[RapierPhysicsPlugin] WASM init failed, falling back to kinematic transport:', e);
      this.handlesTransport = false;
      this._rapier = null;
    }
  }

  /** Whether Rapier WASM is ready */
  get isReady(): boolean {
    return this._rapier !== null && this._physicsWorld?.physicsReady === true;
  }

  /** Expose physics world for testing/debugging */
  get physicsWorld(): RVPhysicsWorld | null {
    return this._physicsWorld;
  }

  // ─── Plugin Lifecycle ─────────────────────────────────────────

  onModelLoaded(result: LoadResult, viewer: RVViewer): void {
    if (!this._rapier) return;
    this._viewer = viewer;

    const settings = loadPhysicsSettings();

    // If physics is disabled in settings, revert to kinematic
    if (!settings.enabled) {
      this.handlesTransport = false;
      return;
    }
    this.handlesTransport = true;

    // Create physics world
    this._physicsWorld = new RVPhysicsWorld(this._rapier);
    this._physicsWorld.init({
      gravity: { x: 0, y: -settings.gravity, z: 0 },
      friction: settings.friction,
      substeps: settings.substeps,
    });

    const tm = viewer.transportManager;
    if (!tm) return;

    // Build conveyor surfaces as kinematic bodies
    for (const surface of tm.surfaces) {
      const surfaceId = `surface_${surface.node.name}_${surface.node.id}`;
      this._surfaceIds.set(surface, surfaceId);

      surface.node.updateWorldMatrix(true, false);
      surface.node.getWorldPosition(_surfacePos);

      const halfExtents = {
        x: surface.aabb.halfSize.x,
        y: surface.aabb.halfSize.y,
        z: surface.aabb.halfSize.z,
      };

      // Speed in m/s (currentSpeed is in mm/s)
      const speedMs = surface.speed / 1000;
      const dir = surface.config.transportDirection.clone().normalize();

      this._physicsWorld.addConveyorSurface(
        surfaceId,
        { x: surface.aabb.center.x, y: surface.aabb.center.y, z: surface.aabb.center.z },
        halfExtents,
        { x: dir.x, y: dir.y, z: dir.z },
        speedMs,
        settings.friction,
      );

      debug('transport', `[Rapier] Surface "${surface.node.name}" → kinematic body, speed=${speedMs.toFixed(3)} m/s`);
    }

    // Build sensors as fixed bodies with sensor colliders
    for (const sensor of tm.sensors) {
      if (sensor.config.mode === 'Collision') {
        const sensorId = `sensor_${sensor.node.name}_${sensor.node.id}`;
        this._sensorIds.set(sensor, sensorId);
        this._sensorLookup.set(sensorId, sensor);

        this._physicsWorld.addSensor(
          sensorId,
          { x: sensor.aabb.center.x, y: sensor.aabb.center.y, z: sensor.aabb.center.z },
          { x: sensor.aabb.halfSize.x, y: sensor.aabb.halfSize.y, z: sensor.aabb.halfSize.z },
        );

        debug('sensor', `[Rapier] Sensor "${sensor.node.name}" → sensor collider`);
      }
      // Raycast sensors use world.castRay() — no collider needed
    }

    // Build sinks as sensor colliders (detect MU entry to trigger removal)
    for (const sink of tm.sinks) {
      const sinkId = `sink_${sink.node.name}_${sink.node.id}`;
      this._sinkSensors.set(sinkId, sink);

      this._physicsWorld.addSensor(
        sinkId,
        { x: sink.aabb.center.x, y: sink.aabb.center.y, z: sink.aabb.center.z },
        { x: sink.aabb.halfSize.x, y: sink.aabb.halfSize.y, z: sink.aabb.halfSize.z },
      );

      debug('transport', `[Rapier] Sink "${sink.node.name}" → sensor collider`);
    }

    // Wire up sensor event callback
    this._physicsWorld.onSensorEvent = (sensorId: string, muId: string, entered: boolean) => {
      // Check if it is a regular sensor
      const sensor = this._sensorLookup.get(sensorId);
      if (sensor) {
        this._handleSensorEvent(sensor, sensorId, muId, entered);
      }

      // Check if it is a sink sensor
      const sink = this._sinkSensors.get(sensorId);
      if (sink && entered) {
        this._handleSinkEvent(sink, muId);
      }
    };

    console.log(
      `[RapierPhysicsPlugin] World built: ${tm.surfaces.length} surfaces, ` +
      `${tm.sensors.length} sensors, ${tm.sinks.length} sinks`,
    );
  }

  onFixedUpdatePost(dt: number): void {
    if (!this._physicsWorld?.physicsReady || !this._viewer) return;
    const tm = this._viewer.transportManager;
    if (!tm) return;

    // 1. Sources: spawn new MUs (with Rapier bodies)
    for (const source of tm.sources) {
      const mu = source.update(dt);
      if (mu) {
        tm.mus.push(mu);
        tm.totalSpawned++;
        this._addMUToPhysics(mu);
        debug('transport', `[Rapier] Source "${source.node.name}" spawned MU "${mu.node.name}"`);
      }
    }

    // 2. Update conveyor velocities from drive speeds
    for (const surface of tm.surfaces) {
      const surfaceId = this._surfaceIds.get(surface);
      if (!surfaceId) continue;

      const speedMs = surface.speed / 1000;
      if (surface.config.isRadial) {
        // Radial: angular velocity
        const angularSpeed = MathUtils.degToRad(surface.speed); // speed is in deg/s for radial
        const dir = surface.config.transportDirection;
        this._physicsWorld.updateConveyorAngularVelocity(
          surfaceId,
          { x: dir.x, y: dir.y, z: dir.z },
          angularSpeed,
        );
      } else {
        // Linear: linear velocity
        const dir = surface.config.transportDirection.clone().normalize();
        this._physicsWorld.updateConveyorVelocity(
          surfaceId,
          { x: dir.x, y: dir.y, z: dir.z },
          speedMs,
        );
      }
    }

    // 3. Step physics
    this._physicsWorld.step(dt);

    // 4. Sync physics → Three.js
    this._physicsWorld.sync(this._nodeSyncMap);

    // 5. Update MU AABBs (for any non-physics checks)
    for (const mu of tm.mus) {
      if (!mu.markedForRemoval) {
        mu.updateAABB();
      }
    }

    // 6. Process sensor/sink events
    this._physicsWorld.processEvents();

    // 7. Raycast sensors (use Rapier ray queries)
    for (const sensor of tm.sensors) {
      if (sensor.config.mode === 'Raycast') {
        this._updateRaycastSensor(sensor, tm.mus);
      }
    }

    // 8. Process out-of-bounds MUs
    const oob = this._physicsWorld.processOutOfBounds();
    for (const muId of oob) {
      const mu = this._muMap.get(muId);
      if (mu && !mu.markedForRemoval) {
        mu.markedForRemoval = true;
        debug('transport', `[Rapier] MU "${mu.node.name}" fell out of bounds, removing`);
      }
    }

    // 9. Remove marked MUs (swap-and-pop as in kinematic mode)
    for (let i = tm.mus.length - 1; i >= 0; i--) {
      if (tm.mus[i].markedForRemoval) {
        const mu = tm.mus[i];
        this._removeMUFromPhysics(mu);
        mu.dispose();
        tm.totalConsumed++;
        // Swap with last element and pop
        tm.mus[i] = tm.mus[tm.mus.length - 1];
        tm.mus.pop();
      }
    }
  }

  onModelCleared(): void {
    this._cleanup();
  }

  dispose(): void {
    this._cleanup();
  }

  // ─── Private Helpers ──────────────────────────────────────────

  private _addMUToPhysics(mu: RVMovingUnit): void {
    if (!this._physicsWorld) return;

    const muId = `mu_${this._muIdCounter++}`;
    this._muMap.set(muId, mu);
    this._muToId.set(mu, muId);

    mu.node.getWorldPosition(_muWorldPos);

    this._physicsWorld.addMU(
      muId,
      { x: _muWorldPos.x, y: _muWorldPos.y, z: _muWorldPos.z },
      { x: mu.aabb.halfSize.x, y: mu.aabb.halfSize.y, z: mu.aabb.halfSize.z },
    );

    // Register for sync
    this._nodeSyncMap.set(muId, {
      position: mu.node.position,
      quaternion: mu.node.quaternion,
    });
  }

  private _removeMUFromPhysics(mu: RVMovingUnit): void {
    if (!this._physicsWorld) return;

    const muId = this._muToId.get(mu);
    if (!muId) return;

    this._physicsWorld.removeMU(muId);
    this._muMap.delete(muId);
    this._muToId.delete(mu);
    this._nodeSyncMap.delete(muId);
  }

  private _handleSensorEvent(sensor: RVSensor, sensorId: string, muId: string, entered: boolean): void {
    if (!this._physicsWorld) return;

    const occupantCount = this._physicsWorld.getSensorOccupantCount(sensorId);
    const wasOccupied = sensor.occupied;
    const rawOccupied = occupantCount > 0;
    const newOccupied = sensor.config.invertSignal ? !rawOccupied : rawOccupied;

    // Update occupiedMU reference
    if (rawOccupied) {
      const mu = this._muMap.get(muId);
      sensor.occupiedMU = mu ?? null;
    } else {
      sensor.occupiedMU = null;
    }

    if (newOccupied !== wasOccupied) {
      sensor.occupied = newOccupied;
      debug('sensor', `[Rapier] Sensor "${sensor.node.name}" → ${newOccupied ? 'OCCUPIED' : 'CLEARED'}`);
      // Fire onChanged callback (SensorMonitorPlugin wraps this)
      sensor.onChanged?.(newOccupied, sensor);
    }
  }

  private _handleSinkEvent(sink: RVSink, muId: string): void {
    const mu = this._muMap.get(muId);
    if (!mu || mu.markedForRemoval) return;

    mu.markedForRemoval = true;
    sink.onConsumed?.(mu, sink);
    debug('transport', `[Rapier] Sink "${sink.node.name}" consumed MU "${mu.node.name}"`);
  }

  private _updateRaycastSensor(sensor: RVSensor, mus: RVMovingUnit[]): void {
    if (!this._physicsWorld) {
      // Fallback to AABB raycast
      sensor.checkOverlap(mus);
      return;
    }

    // Compute world-space ray
    const cfg = sensor.config;
    const d = cfg.rayCastDirection ?? { x: -1, y: 0, z: 0 };
    const maxDist = (cfg.rayCastLength ?? 1000) / 1000; // mm → meters

    sensor.node.updateWorldMatrix(true, false);
    const origin = new Vector3().setFromMatrixPosition(sensor.node.matrixWorld);
    const dir = new Vector3(d.x, d.y, d.z).transformDirection(sensor.node.matrixWorld).normalize();

    const hit = this._physicsWorld.castRay(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: dir.x, y: dir.y, z: dir.z },
      maxDist,
    );

    const foundMU = hit?.muId ? (this._muMap.get(hit.muId) ?? null) : null;
    const rawOccupied = foundMU !== null;
    const newOccupied = cfg.invertSignal ? !rawOccupied : rawOccupied;

    if (newOccupied !== sensor.occupied) {
      sensor.occupied = newOccupied;
      sensor.occupiedMU = foundMU;
      debug('sensor', `[Rapier] Raycast Sensor "${sensor.node.name}" → ${newOccupied ? 'OCCUPIED' : 'CLEARED'}`);
      sensor.onChanged?.(newOccupied, sensor);
    }
  }

  private _cleanup(): void {
    this._physicsWorld?.dispose();
    this._physicsWorld = null;
    this._viewer = null;
    this._surfaceIds.clear();
    this._sensorIds.clear();
    this._sensorLookup.clear();
    this._sinkSensors.clear();
    this._muMap.clear();
    this._muToId.clear();
    this._nodeSyncMap.clear();
    this._muIdCounter = 0;
  }
}
