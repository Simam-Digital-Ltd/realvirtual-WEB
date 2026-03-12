import { RVDrive, type IDriveBehavior } from './rv-drive';

/**
 * RVErraticDriver - TypeScript port of Drive_ErraticPosition.cs
 *
 * Continuously moves a drive to random positions between MinPos and MaxPos.
 * When one target is reached, picks a new random target.
 *
 * Implements IDriveBehavior — owned by the drive and called during drive.update(),
 * mirroring Unity's Drive.CalcFixedUpdate() calling its DriveBehaviours.
 */
export class RVErraticDriver implements IDriveBehavior {
  readonly drive: RVDrive;
  readonly minPos: number;
  readonly maxPos: number;
  readonly speed: number;
  readonly iterateBetweenMaxAndMin: boolean;

  private driving = false;
  private destPos = 0;
  private readonly tolerance = 0.01;

  constructor(
    drive: RVDrive,
    options?: {
      minPos?: number;
      maxPos?: number;
      speed?: number;
      iterateBetweenMaxAndMin?: boolean;
    },
  ) {
    this.drive = drive;

    // Use drive limits if available, otherwise defaults
    const cfg = drive.config;
    this.minPos = options?.minPos ?? (cfg.useLimits ? cfg.lowerLimit : 0);
    this.maxPos = options?.maxPos ?? (cfg.useLimits ? cfg.upperLimit : 100);
    this.speed = options?.speed ?? cfg.targetSpeed;
    this.iterateBetweenMaxAndMin = options?.iterateBetweenMaxAndMin ?? false;
  }

  /** Call every fixed timestep - picks targets and checks arrival */
  update(_dt: number) {
    // Skip if drive is in positionOverwrite mode (controlled by recording)
    if (this.drive.positionOverwrite) return;

    // Pick new target when not driving
    if (!this.driving) {
      this.drive.targetSpeed = this.speed;

      if (!this.iterateBetweenMaxAndMin) {
        // Random position between min and max
        this.drive.targetPosition =
          this.minPos + Math.random() * (this.maxPos - this.minPos);
      } else {
        // Toggle between min and max
        if (Math.abs(this.drive.currentPosition - this.maxPos) <= this.tolerance) {
          this.drive.targetPosition = this.minPos;
        } else {
          this.drive.targetPosition = this.maxPos;
        }
      }

      this.drive.startMove();
      this.driving = true;
      this.destPos = this.drive.targetPosition;
    }

    // Check if target reached
    if (
      this.driving &&
      Math.abs(this.drive.currentPosition - this.destPos) <= this.tolerance
    ) {
      this.driving = false;
    }
  }
}
