import type { RVDrive } from './rv-drive';
import type { SignalStore } from './rv-signal-store';
import type { RVSensor } from './rv-sensor';
import { debug } from './rv-debug';

// ─── Step State ──────────────────────────────────────────────────

export enum StepState {
  Idle = 'Idle',
  Active = 'Active',
  Finished = 'Finished',
}

// ─── Base Class ──────────────────────────────────────────────────

export abstract class RVLogicStep {
  state: StepState = StepState.Idle;
  name = '';

  /** Called by container when this step should begin executing */
  abstract start(): void;

  /** Called every fixed timestep while state === Active */
  abstract fixedUpdate(dt: number): void;

  /** Call to mark step as finished. Container advances on next update. */
  protected finish(): void {
    this.state = StepState.Finished;
  }

  /** Reset step to idle (for container restart) */
  reset(): void {
    this.state = StepState.Idle;
  }
}

// ─── Containers ──────────────────────────────────────────────────

/**
 * SerialContainer - Executes children one after another.
 * When autoLoop is true, restarts from first child after last finishes.
 */
export class RVSerialContainer extends RVLogicStep {
  children: RVLogicStep[];
  currentIndex = 0;
  autoLoop: boolean;
  completedCycles = 0;

  constructor(children: RVLogicStep[], autoLoop = true) {
    super();
    this.children = children;
    this.autoLoop = autoLoop;
  }

  start(): void {
    this.state = StepState.Active;
    this.currentIndex = 0;
    if (this.children.length === 0) {
      console.warn(`[LogicStep] SerialContainer "${this.name}" has 0 children — finishing immediately`);
      this.finish();
      return;
    }
    this.startChild(0);
  }

  fixedUpdate(dt: number): void {
    if (this.state !== StepState.Active) return;
    if (this.currentIndex >= this.children.length) return;

    const child = this.children[this.currentIndex];

    // Update active child
    if (child.state === StepState.Active) {
      child.fixedUpdate(dt);
    }

    // Check if child finished → advance
    if (child.state === StepState.Finished) {
      this.currentIndex++;

      // Start next child (may finish immediately → keep advancing)
      while (this.currentIndex < this.children.length) {
        this.startChild(this.currentIndex);
        const next = this.children[this.currentIndex];
        if (next.state === StepState.Finished) {
          this.currentIndex++;
        } else {
          return; // Next child is Active, wait for it
        }
      }

      // All children done
      this.completedCycles++;
      debug('logic', `[${this.name}] cycle #${this.completedCycles} complete`);
      if (this.autoLoop) {
        // Reset all children and restart
        for (const c of this.children) c.reset();
        this.currentIndex = 0;
        this.startChild(0);
      } else {
        this.finish();
      }
    }
  }

  private startChild(index: number): void {
    const child = this.children[index];
    child.reset();
    child.start();
    debug('logic', `[${this.name}] step ${index}/${this.children.length}: "${child.name}" → ${child.state}`);
  }

  reset(): void {
    super.reset();
    this.currentIndex = 0;
    for (const c of this.children) c.reset();
  }
}

/**
 * ParallelContainer - Executes all children simultaneously.
 * Finishes when all children have finished.
 */
export class RVParallelContainer extends RVLogicStep {
  children: RVLogicStep[];
  private finishedCount = 0;

  constructor(children: RVLogicStep[]) {
    super();
    this.children = children;
  }

  start(): void {
    this.state = StepState.Active;
    this.finishedCount = 0;

    if (this.children.length === 0) {
      this.finish();
      return;
    }

    for (const child of this.children) {
      child.start();
      if (child.state === StepState.Finished) {
        this.finishedCount++;
      }
    }

    if (this.finishedCount >= this.children.length) {
      this.finish();
    }
  }

  fixedUpdate(dt: number): void {
    if (this.state !== StepState.Active) return;

    for (const child of this.children) {
      if (child.state === StepState.Active) {
        child.fixedUpdate(dt);
        // Re-check state after fixedUpdate (step may have called finish())
        if ((child.state as StepState) === StepState.Finished) {
          this.finishedCount++;
        }
      }
    }

    if (this.finishedCount >= this.children.length) {
      this.finish();
    }
  }

  reset(): void {
    super.reset();
    this.finishedCount = 0;
    for (const c of this.children) c.reset();
  }
}

// ─── Leaf Steps ──────────────────────────────────────────────────

/** Delay - waits for a specified duration in seconds */
export class RVDelay extends RVLogicStep {
  duration: number;
  private elapsed = 0;

  constructor(duration: number) {
    super();
    this.duration = duration;
  }

  start(): void {
    this.state = StepState.Active;
    this.elapsed = 0;
    if (this.duration <= 0) {
      this.finish();
    }
  }

  fixedUpdate(dt: number): void {
    if (this.state !== StepState.Active) return;
    this.elapsed += dt;
    if (this.elapsed >= this.duration) {
      this.finish();
    }
  }

  reset(): void {
    super.reset();
    this.elapsed = 0;
  }
}

/** SetSignalBool - sets a boolean signal and finishes immediately */
export class RVSetSignalBool extends RVLogicStep {
  signalAddress: string | null;
  value: boolean;
  private signalStore: SignalStore;

  constructor(signalAddress: string | null, value: boolean, signalStore: SignalStore) {
    super();
    this.signalAddress = signalAddress;
    this.value = value;
    this.signalStore = signalStore;
  }

  start(): void {
    if (!this.signalAddress) {
      console.warn(`[LogicStep] SetSignalBool "${this.name}": null signal address — skipping`);
      this.state = StepState.Finished;
      return;
    }
    this.signalStore.setByPath(this.signalAddress, this.value);
    debug('logic', `SetSignalBool "${this.name}": ${this.signalAddress} = ${this.value}`);
    this.state = StepState.Finished;
  }

  fixedUpdate(): void {}
}

/** WaitForSignalBool - polls until a boolean signal matches the expected value */
export class RVWaitForSignalBool extends RVLogicStep {
  signalAddress: string | null;
  waitForTrue: boolean;
  private signalStore: SignalStore;

  constructor(signalAddress: string | null, waitForTrue: boolean, signalStore: SignalStore) {
    super();
    this.signalAddress = signalAddress;
    this.waitForTrue = waitForTrue;
    this.signalStore = signalStore;
  }

  start(): void {
    if (!this.signalAddress) {
      console.warn(`[LogicStep] WaitForSignalBool "${this.name}": null signal address — skipping`);
      this.state = StepState.Finished;
      return;
    }
    this.state = StepState.Active;
    // Check immediately
    if (this.signalStore.getBoolByPath(this.signalAddress) === this.waitForTrue) {
      this.finish();
    }
  }

  fixedUpdate(): void {
    if (this.state !== StepState.Active || !this.signalAddress) return;
    if (this.signalStore.getBoolByPath(this.signalAddress) === this.waitForTrue) {
      debug('logic', `WaitForSignalBool "${this.name}": ${this.signalAddress} matched (${this.waitForTrue})`);
      this.finish();
    }
  }
}

/** WaitForSensor - polls until a sensor matches the expected occupied state */
export class RVWaitForSensor extends RVLogicStep {
  sensor: RVSensor | null;
  waitForOccupied: boolean;

  constructor(sensor: RVSensor | null, waitForOccupied: boolean) {
    super();
    this.sensor = sensor;
    this.waitForOccupied = waitForOccupied;
  }

  start(): void {
    if (!this.sensor) {
      console.warn(`[LogicStep] WaitForSensor "${this.name}": null sensor — skipping`);
      this.state = StepState.Finished;
      return;
    }
    this.state = StepState.Active;
    if (this.sensor.occupied === this.waitForOccupied) {
      this.finish();
    }
  }

  fixedUpdate(): void {
    if (this.state !== StepState.Active || !this.sensor) return;
    if (this.sensor.occupied === this.waitForOccupied) {
      debug('logic', `WaitForSensor "${this.name}": sensor "${this.sensor.node.name}" ${this.waitForOccupied ? 'occupied' : 'cleared'}`);
      this.finish();
    }
  }
}

/** DriveTo - moves a drive to a target position, finishes when reached */
export class RVDriveTo extends RVLogicStep {
  drive: RVDrive | null;
  destination: number;
  relative: boolean;
  direction: string;

  constructor(drive: RVDrive | null, destination: number, relative: boolean, direction: string) {
    super();
    this.drive = drive;
    this.destination = destination;
    this.relative = relative;
    this.direction = direction;
  }

  start(): void {
    if (!this.drive) {
      console.warn(`[LogicStep] DriveTo "${this.name}": null drive — skipping`);
      this.state = StepState.Finished;
      return;
    }

    let dest = this.relative
      ? this.drive.currentPosition + this.destination
      : this.destination;

    // Clamp to drive limits
    if (this.drive.config.useLimits) {
      dest = Math.max(this.drive.config.lowerLimit, Math.min(this.drive.config.upperLimit, dest));
    }

    this.drive.startMove(dest);
    this.state = StepState.Active;

    // Check if already at target
    if (this.drive.isAtTarget) {
      this.finish();
    }
  }

  fixedUpdate(): void {
    if (this.state !== StepState.Active || !this.drive) return;
    if (this.drive.isAtTarget) {
      this.finish();
    }
  }
}

/** SetDriveSpeed - changes a drive's target speed and finishes immediately */
export class RVSetDriveSpeed extends RVLogicStep {
  drive: RVDrive | null;
  speed: number;

  constructor(drive: RVDrive | null, speed: number) {
    super();
    this.drive = drive;
    this.speed = speed;
  }

  start(): void {
    if (!this.drive) {
      console.warn(`[LogicStep] SetDriveSpeed "${this.name}": null drive — skipping`);
      this.state = StepState.Finished;
      return;
    }
    this.drive.targetSpeed = this.speed;
    this.state = StepState.Finished;
  }

  fixedUpdate(): void {}
}

/** Enable - enables/disables a Three.js Object3D (visibility) and finishes immediately */
export class RVEnable extends RVLogicStep {
  private target: { visible: boolean } | null;
  private enable: boolean;

  constructor(target: { visible: boolean } | null, enable: boolean) {
    super();
    this.target = target;
    this.enable = enable;
  }

  start(): void {
    if (this.target) {
      this.target.visible = this.enable;
    }
    this.state = StepState.Finished;
  }

  fixedUpdate(): void {}
}
