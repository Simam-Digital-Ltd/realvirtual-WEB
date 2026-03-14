/**
 * LogicStep Unit Tests
 *
 * Tests all LogicStep types: containers, delay, signal steps,
 * sensor steps, drive steps, and the engine builder.
 */
import { describe, it, expect, vi } from 'vitest';
import { Object3D } from 'three';
import { RVDrive, DriveDirection } from '../src/core/engine/rv-drive';
import { SignalStore } from '../src/core/engine/rv-signal-store';
import {
  StepState,
  RVSerialContainer,
  RVParallelContainer,
  RVDelay,
  RVSetSignalBool,
  RVWaitForSignalBool,
  RVWaitForSensor,
  RVDriveTo,
  RVSetDriveSpeed,
  RVEnable,
} from '../src/core/engine/rv-logic-step';
import type { RVSensor } from '../src/core/engine/rv-sensor';

function makeDrive(name: string, startPos = 0): RVDrive {
  const node = new Object3D();
  node.name = name;
  return new RVDrive(node, {
    direction: DriveDirection.LinearX,
    reverseDirection: false,
    offset: 0,
    startPosition: startPos,
    targetSpeed: 100,
    acceleration: 0,
    useAcceleration: false,
    useLimits: false,
    lowerLimit: 0,
    upperLimit: 1000,
    behaviors: [],
  });
}

function makeSensor(occupied = false): RVSensor {
  return { occupied, node: new Object3D() } as unknown as RVSensor;
}

// ─── Delay ───────────────────────────────────────────────────

describe('RVDelay', () => {
  it('should finish after duration', () => {
    const step = new RVDelay(0.5);
    step.start();
    expect(step.state).toBe(StepState.Active);

    step.fixedUpdate(0.2);
    expect(step.state).toBe(StepState.Active);

    step.fixedUpdate(0.3);
    expect(step.state).toBe(StepState.Finished);
  });

  it('should finish immediately with zero duration', () => {
    const step = new RVDelay(0);
    step.start();
    expect(step.state).toBe(StepState.Finished);
  });

  it('should reset correctly', () => {
    const step = new RVDelay(1);
    step.start();
    step.fixedUpdate(1);
    expect(step.state).toBe(StepState.Finished);

    step.reset();
    expect(step.state).toBe(StepState.Idle);
  });
});

// ─── SetSignalBool ───────────────────────────────────────────

describe('RVSetSignalBool', () => {
  it('should set signal and finish immediately', () => {
    const store = new SignalStore();
    store.register('sig/a', 'sig/a', false);

    const step = new RVSetSignalBool('sig/a', true, store);
    step.start();

    expect(step.state).toBe(StepState.Finished);
    expect(store.getBoolByPath('sig/a')).toBe(true);
  });

  it('should skip with null address', () => {
    const store = new SignalStore();
    const step = new RVSetSignalBool(null, true, store);
    step.start();
    expect(step.state).toBe(StepState.Finished);
  });
});

// ─── WaitForSignalBool ───────────────────────────────────────

describe('RVWaitForSignalBool', () => {
  it('should wait until signal matches', () => {
    const store = new SignalStore();
    store.register('sig/b', 'sig/b', false);

    const step = new RVWaitForSignalBool('sig/b', true, store);
    step.start();
    expect(step.state).toBe(StepState.Active);

    step.fixedUpdate(0.02);
    expect(step.state).toBe(StepState.Active);

    store.setByPath('sig/b', true);
    step.fixedUpdate(0.02);
    expect(step.state).toBe(StepState.Finished);
  });

  it('should finish immediately if signal already matches', () => {
    const store = new SignalStore();
    store.register('sig/c', 'sig/c', true);

    const step = new RVWaitForSignalBool('sig/c', true, store);
    step.start();
    expect(step.state).toBe(StepState.Finished);
  });

  it('should skip with null address', () => {
    const store = new SignalStore();
    const step = new RVWaitForSignalBool(null, true, store);
    step.start();
    expect(step.state).toBe(StepState.Finished);
  });
});

// ─── WaitForSensor ───────────────────────────────────────────

describe('RVWaitForSensor', () => {
  it('should wait until sensor is occupied', () => {
    const sensor = makeSensor(false);

    const step = new RVWaitForSensor(sensor, true);
    step.start();
    expect(step.state).toBe(StepState.Active);

    step.fixedUpdate(0.02);
    expect(step.state).toBe(StepState.Active);

    sensor.occupied = true;
    step.fixedUpdate(0.02);
    expect(step.state).toBe(StepState.Finished);
  });

  it('should finish immediately if sensor already matches', () => {
    const sensor = makeSensor(true);
    const step = new RVWaitForSensor(sensor, true);
    step.start();
    expect(step.state).toBe(StepState.Finished);
  });

  it('should wait for not-occupied', () => {
    const sensor = makeSensor(true);
    const step = new RVWaitForSensor(sensor, false);
    step.start();
    expect(step.state).toBe(StepState.Active);

    sensor.occupied = false;
    step.fixedUpdate(0.02);
    expect(step.state).toBe(StepState.Finished);
  });

  it('should skip with null sensor', () => {
    const step = new RVWaitForSensor(null, true);
    step.start();
    expect(step.state).toBe(StepState.Finished);
  });
});

// ─── DriveTo ─────────────────────────────────────────────────

describe('RVDriveTo', () => {
  it('should start drive movement to destination', () => {
    const drive = makeDrive('d1', 0);
    const step = new RVDriveTo(drive, 500, false, 'Automatic');
    step.start();

    expect(step.state).toBe(StepState.Active);
    expect(drive.targetPosition).toBe(500);
    expect(drive.isRunning).toBe(true);
  });

  it('should finish when drive reaches target', () => {
    const drive = makeDrive('d1', 0);
    const step = new RVDriveTo(drive, 500, false, 'Automatic');
    step.start();

    // Simulate drive reaching target
    drive.currentPosition = 500;
    step.fixedUpdate(0.02);
    expect(step.state).toBe(StepState.Finished);
  });

  it('should support relative destination', () => {
    const drive = makeDrive('d1', 100);
    const step = new RVDriveTo(drive, 200, true, 'Automatic');
    step.start();

    expect(drive.targetPosition).toBe(300); // 100 + 200
  });

  it('should clamp to drive limits', () => {
    const node = new Object3D();
    node.name = 'd1';
    const drive = new RVDrive(node, {
      direction: DriveDirection.LinearX,
      reverseDirection: false,
      offset: 0,
      startPosition: 0,
      targetSpeed: 100,
      acceleration: 0,
      useAcceleration: false,
      useLimits: true,
      lowerLimit: 0,
      upperLimit: 200,
      behaviors: [],
    });

    const step = new RVDriveTo(drive, 500, false, 'Automatic');
    step.start();

    expect(drive.targetPosition).toBe(200); // clamped to upperLimit
  });

  it('should skip with null drive', () => {
    const step = new RVDriveTo(null, 100, false, 'Automatic');
    step.start();
    expect(step.state).toBe(StepState.Finished);
  });
});

// ─── SetDriveSpeed ───────────────────────────────────────────

describe('RVSetDriveSpeed', () => {
  it('should set drive speed and finish immediately', () => {
    const drive = makeDrive('d1');
    const step = new RVSetDriveSpeed(drive, 250);
    step.start();

    expect(step.state).toBe(StepState.Finished);
    expect(drive.targetSpeed).toBe(250);
  });

  it('should skip with null drive', () => {
    const step = new RVSetDriveSpeed(null, 100);
    step.start();
    expect(step.state).toBe(StepState.Finished);
  });
});

// ─── Enable ──────────────────────────────────────────────────

describe('RVEnable', () => {
  it('should set target visibility', () => {
    const target = { visible: true };
    const step = new RVEnable(target, false);
    step.start();

    expect(step.state).toBe(StepState.Finished);
    expect(target.visible).toBe(false);
  });

  it('should handle null target gracefully', () => {
    const step = new RVEnable(null, true);
    step.start();
    expect(step.state).toBe(StepState.Finished);
  });
});

// ─── SerialContainer ─────────────────────────────────────────

describe('RVSerialContainer', () => {
  it('should execute children sequentially', () => {
    const d1 = new RVDelay(0.1);
    const d2 = new RVDelay(0.1);
    const d3 = new RVDelay(0.1);
    const container = new RVSerialContainer([d1, d2, d3], false);

    container.start();
    expect(container.state).toBe(StepState.Active);
    expect(d1.state).toBe(StepState.Active);
    expect(d2.state).toBe(StepState.Idle);

    container.fixedUpdate(0.1);
    expect(d1.state).toBe(StepState.Finished);
    expect(d2.state).toBe(StepState.Active);

    container.fixedUpdate(0.1);
    expect(d2.state).toBe(StepState.Finished);
    expect(d3.state).toBe(StepState.Active);

    container.fixedUpdate(0.1);
    expect(d3.state).toBe(StepState.Finished);
    expect(container.state).toBe(StepState.Finished);
  });

  it('should auto-loop when enabled', () => {
    const store = new SignalStore();
    store.register('sig/x', 'sig/x', false);

    const set1 = new RVSetSignalBool('sig/x', true, store);
    const set2 = new RVSetSignalBool('sig/x', false, store);
    const container = new RVSerialContainer([set1, set2], true);

    container.start();
    // start() only starts child 0, advancement happens in fixedUpdate
    container.fixedUpdate(0.02);
    // Both set steps finish immediately → first cycle done → auto-loop restarts
    expect(container.completedCycles).toBeGreaterThanOrEqual(1);
    expect(container.state).toBe(StepState.Active);
  });

  it('should handle empty children', () => {
    const container = new RVSerialContainer([], false);
    container.start();
    expect(container.state).toBe(StepState.Finished);
  });

  it('should skip immediate-finish steps rapidly', () => {
    const store = new SignalStore();
    const s1 = new RVSetSignalBool('a', true, store);
    const s2 = new RVSetSignalBool('b', true, store);
    const delay = new RVDelay(0.5);
    const container = new RVSerialContainer([s1, s2, delay], false);

    container.start();
    // start() kicks off child 0 (s1 finishes immediately)
    // fixedUpdate advances through s1→s2→delay
    container.fixedUpdate(0.02);
    expect(delay.state).toBe(StepState.Active);
    expect(container.currentIndex).toBe(2);
  });

  it('should reset all children', () => {
    const d1 = new RVDelay(0.1);
    const d2 = new RVDelay(0.1);
    const container = new RVSerialContainer([d1, d2], false);

    container.start();
    container.fixedUpdate(0.1);
    container.fixedUpdate(0.1);
    expect(container.state).toBe(StepState.Finished);

    container.reset();
    expect(container.state).toBe(StepState.Idle);
    expect(d1.state).toBe(StepState.Idle);
    expect(d2.state).toBe(StepState.Idle);
    expect(container.currentIndex).toBe(0);
  });
});

// ─── ParallelContainer ───────────────────────────────────────

describe('RVParallelContainer', () => {
  it('should execute all children simultaneously', () => {
    const d1 = new RVDelay(0.2);
    const d2 = new RVDelay(0.1);
    const container = new RVParallelContainer([d1, d2]);

    container.start();
    expect(d1.state).toBe(StepState.Active);
    expect(d2.state).toBe(StepState.Active);

    container.fixedUpdate(0.1);
    expect(d2.state).toBe(StepState.Finished);
    expect(d1.state).toBe(StepState.Active);
    expect(container.state).toBe(StepState.Active);

    container.fixedUpdate(0.1);
    expect(d1.state).toBe(StepState.Finished);
    expect(container.state).toBe(StepState.Finished);
  });

  it('should finish immediately if all children are instant', () => {
    const store = new SignalStore();
    const s1 = new RVSetSignalBool('a', true, store);
    const s2 = new RVSetSignalBool('b', true, store);
    const container = new RVParallelContainer([s1, s2]);

    container.start();
    expect(container.state).toBe(StepState.Finished);
  });

  it('should handle empty children', () => {
    const container = new RVParallelContainer([]);
    container.start();
    expect(container.state).toBe(StepState.Finished);
  });

  it('should reset all children', () => {
    const d1 = new RVDelay(0.1);
    const d2 = new RVDelay(0.1);
    const container = new RVParallelContainer([d1, d2]);

    container.start();
    container.fixedUpdate(0.1);
    expect(container.state).toBe(StepState.Finished);

    container.reset();
    expect(container.state).toBe(StepState.Idle);
    expect(d1.state).toBe(StepState.Idle);
    expect(d2.state).toBe(StepState.Idle);
  });
});

// ─── Nested Containers ───────────────────────────────────────

describe('Nested Containers', () => {
  it('should execute serial inside parallel', () => {
    const d1 = new RVDelay(0.1);
    const d2 = new RVDelay(0.1);
    const serial = new RVSerialContainer([d1, d2], false);

    const d3 = new RVDelay(0.15);
    const parallel = new RVParallelContainer([serial, d3]);

    parallel.start();
    expect(parallel.state).toBe(StepState.Active);

    // After 0.1s: d1 done, d2 starts; d3 still active
    parallel.fixedUpdate(0.1);
    expect(d1.state).toBe(StepState.Finished);
    expect(d2.state).toBe(StepState.Active);
    expect(d3.state).toBe(StepState.Active);

    // After 0.15s: d3 done; d2 still active
    parallel.fixedUpdate(0.05);
    expect(d3.state).toBe(StepState.Finished);
    expect(d2.state).toBe(StepState.Active);
    expect(parallel.state).toBe(StepState.Active);

    // After 0.2s: d2 done → serial done → parallel done
    parallel.fixedUpdate(0.05);
    expect(d2.state).toBe(StepState.Finished);
    expect(serial.state).toBe(StepState.Finished);
    expect(parallel.state).toBe(StepState.Finished);
  });

  it('should support serial containing parallel', () => {
    const store = new SignalStore();
    const s1 = new RVSetSignalBool('a', true, store);
    const d1 = new RVDelay(0.1);
    const parallel = new RVParallelContainer([s1, d1]);

    const d2 = new RVDelay(0.1);
    const serial = new RVSerialContainer([parallel, d2], false);

    serial.start();
    expect(parallel.state).toBe(StepState.Active); // d1 not done yet

    serial.fixedUpdate(0.1);
    expect(parallel.state).toBe(StepState.Finished);
    expect(d2.state).toBe(StepState.Active);

    serial.fixedUpdate(0.1);
    expect(serial.state).toBe(StepState.Finished);
  });
});

// ─── Integration: Signal-Driven Flow ─────────────────────────

describe('Signal-Driven Flow', () => {
  it('should coordinate set + wait signal steps', () => {
    const store = new SignalStore();
    store.register('conveyor/start', 'conveyor/start', false);

    // Process 1: Set signal to true
    const setter = new RVSetSignalBool('conveyor/start', true, store);

    // Process 2: Wait for signal
    const waiter = new RVWaitForSignalBool('conveyor/start', true, store);

    // Run parallel
    const parallel = new RVParallelContainer([setter, waiter]);
    parallel.start();

    // setter finishes immediately, sets signal to true
    // waiter should also finish because signal is now true
    parallel.fixedUpdate(0.02);
    expect(parallel.state).toBe(StepState.Finished);
    expect(store.getBool('conveyor/start')).toBe(true);
  });
});
