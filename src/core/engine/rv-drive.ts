import { Object3D, Vector3, Quaternion, Euler, MathUtils } from 'three';
import { DriveDirection, directionToGltfAxis, isRotation } from './rv-coordinate-utils';

// Re-export for backward compatibility
export { DriveDirection } from './rv-coordinate-utils';

export interface DriveConfig {
  direction: DriveDirection;
  reverseDirection: boolean;
  offset: number;
  startPosition: number;
  targetSpeed: number;
  acceleration: number;
  useAcceleration: boolean;
  useLimits: boolean;
  lowerLimit: number;
  upperLimit: number;
  /** DriveBehaviour component type names found on this node (e.g. "Drive_ErraticPosition") */
  behaviors: string[];
  /** Raw extras data for each DriveBehaviour, keyed by behavior name */
  behaviorExtras: Record<string, Record<string, unknown>>;
}

/**
 * IDriveBehavior - mirrors Unity's IDriveBehavior interface.
 * Behaviors are owned by the drive and called before drive physics,
 * exactly like Unity's Drive.CalcFixedUpdate() calls its DriveBehaviours.
 */
export interface IDriveBehavior {
  /** Called every fixed timestep, before drive physics. Sets targetPosition/targetSpeed/startMove. */
  update(dt: number): void;
}

// Reusable temp objects to avoid GC
const _euler = new Euler();
const _deltaQuat = new Quaternion();
const _axisScaled = new Vector3();

/**
 * RVDrive - TypeScript port of realvirtual Drive.cs transform logic.
 *
 * Stores the base (rest) transform from the GLB and applies drive position
 * changes as local transform deltas, exactly matching Unity's SetPosition().
 *
 * Controller scale is hardcoded to 1000 (mm->m) for the PoC.
 * In the GLB, positions are already in meters, so we divide by 1000.
 */
export class RVDrive {
  readonly config: DriveConfig;
  readonly node: Object3D;
  readonly name: string;
  readonly isRotary: boolean;

  // Base transform (rest position from GLB)
  private basePosition = new Vector3();
  private baseQuaternion = new Quaternion();

  // Drive state
  currentPosition = 0;
  currentSpeed = 0;
  targetPosition = 0;
  targetSpeed = 0;
  isRunning = false;

  /** Continuous forward motion at targetSpeed (set by Drive_Simple signal) */
  jogForward = false;
  /** Continuous backward motion at targetSpeed (set by Drive_Simple signal) */
  jogBackward = false;

  /** When true, update() skips physics and only applies transform (for DrivesPlayback) */
  positionOverwrite = false;

  /** Drive behaviors called before physics, mirroring Unity's IDriveBehavior pattern */
  readonly driveBehaviors: IDriveBehavior[] = [];

  // Direction axis (in local space)
  private axis = new Vector3();
  private controllerScale = 1000; // mm -> m, hardcoded for PoC

  constructor(node: Object3D, config: DriveConfig) {
    this.node = node;
    this.config = config;
    this.name = node.name;
    this.isRotary = isRotation(config.direction);

    // Store base transform
    this.basePosition.copy(node.position);
    this.baseQuaternion.copy(node.quaternion);

    // Compute axis
    this.axis.copy(directionToGltfAxis(config.direction));
    if (config.reverseDirection) {
      this.axis.negate();
    }

    // Set initial position (matches Unity Drive.Start(): CurrentPosition = StartPosition)
    this.currentPosition = config.startPosition;
    this.targetSpeed = config.targetSpeed;

    // Apply initial transform so StartPosition + Offset take effect immediately
    // (In Unity this happens on first FixedUpdate after Start())
    this.applyToNode();
  }

  /** Check if drive has reached its target position */
  get isAtTarget(): boolean {
    return Math.abs(this.currentPosition - this.targetPosition) < 0.01;
  }

  /** Start moving to targetPosition (no argument) or to a specific destination */
  startMove(destination?: number) {
    if (destination !== undefined) {
      this.targetPosition = destination;
    }
    this.isRunning = true;
  }

  stop() {
    this.isRunning = false;
    this.currentSpeed = 0;
  }

  /** Update drive physics - called every fixed timestep */
  update(dt: number) {
    if (this.positionOverwrite) {
      this.applyToNode();
      return;
    }

    // Call drive behaviors first (mirrors Unity: Drive.CalcFixedUpdate calls IDriveBehavior[])
    for (const behavior of this.driveBehaviors) {
      behavior.update(dt);
    }

    // Jog mode: continuous motion at targetSpeed (used by Drive_Simple / conveyors)
    // We update currentSpeed for TransportSurface to use, but do NOT call applyToNode()
    // because conveyor drives should not physically translate the mesh — only belt texture
    // would scroll in Unity, while the frame stays put.
    if (this.jogForward || this.jogBackward) {
      this.currentSpeed = this.targetSpeed;
      this.isRunning = true;
      return;
    }

    if (!this.isRunning) return;

    const dist = this.targetPosition - this.currentPosition;
    if (Math.abs(dist) < 0.01) {
      this.currentPosition = this.targetPosition;
      this.isRunning = false;
      this.currentSpeed = 0;
      this.applyToNode();
      return;
    }

    const dir = Math.sign(dist);
    const speed = this.targetSpeed;

    if (this.config.useAcceleration && this.config.acceleration > 0) {
      // Acceleration/deceleration
      const accel = this.config.acceleration;
      const stoppingDist = (this.currentSpeed * this.currentSpeed) / (2 * accel);

      if (stoppingDist >= Math.abs(dist)) {
        // Decelerate
        this.currentSpeed = Math.max(0, this.currentSpeed - accel * dt);
      } else if (this.currentSpeed < speed) {
        // Accelerate
        this.currentSpeed = Math.min(speed, this.currentSpeed + accel * dt);
      }
    } else {
      this.currentSpeed = speed;
    }

    let nextPos = this.currentPosition + dir * this.currentSpeed * dt;

    // Clamp to target
    if (dir > 0 && nextPos > this.targetPosition) nextPos = this.targetPosition;
    if (dir < 0 && nextPos < this.targetPosition) nextPos = this.targetPosition;

    // Apply limits
    if (this.config.useLimits) {
      nextPos = Math.max(this.config.lowerLimit, Math.min(this.config.upperLimit, nextPos));
    }

    this.currentPosition = nextPos;
    this.applyToNode();
  }

  /** Apply current position to Three.js node transform */
  applyToNode() {
    const pos = this.currentPosition + this.config.offset;

    if (this.config.direction === DriveDirection.Virtual) return;

    if (this.isRotary) {
      // Rotation: localRotation = baseQuat * Quaternion.Euler(axis * angle)
      // Unity uses degrees, Three.js Euler uses radians
      const rad = MathUtils.degToRad(pos);
      _axisScaled.copy(this.axis).multiplyScalar(rad);
      _euler.set(_axisScaled.x, _axisScaled.y, _axisScaled.z, 'XYZ');
      _deltaQuat.setFromEuler(_euler);
      this.node.quaternion.copy(this.baseQuaternion).multiply(_deltaQuat);
    } else {
      // Linear: localPosition = basePos + axis * (pos / controllerScale)
      // pos is in mm, we convert to meters by dividing by controllerScale
      const offset = pos / this.controllerScale;
      this.node.position.copy(this.basePosition);
      _axisScaled.copy(this.axis).multiplyScalar(offset);
      this.node.position.add(_axisScaled);
    }
  }
}
