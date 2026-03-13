/**
 * TestAxesPlugin Tests — real RVDrive with Object3D, fixedUpdate state machine.
 */
import { describe, it, expect, vi } from 'vitest';
import { Object3D } from 'three';
import { TestAxesPlugin } from '../src/plugins/test-axes-plugin';
import { RVDrive, type DriveConfig } from '../src/core/engine/rv-drive';
import { DriveDirection } from '../src/core/engine/rv-coordinate-utils';
import type { RVViewerPlugin } from '../src/core/rv-plugin';
import type { LoadResult } from '../src/core/engine/rv-scene-loader';
import type { RVViewer } from '../src/core/rv-viewer';

// ── Helpers ──

function makeConfig(direction: DriveDirection): DriveConfig {
  return {
    direction, reverseDirection: false, offset: 0, startPosition: 0,
    targetSpeed: 100, acceleration: 100, useAcceleration: false,
    useLimits: false, lowerLimit: 0, upperLimit: 360,
    behaviors: [], behaviorExtras: {},
  };
}

function makeDrive(name: string, direction: DriveDirection): RVDrive {
  const node = new Object3D();
  node.name = name;
  return new RVDrive(node, makeConfig(direction));
}

/** Robot axes A1-A6. */
function makeRobotDrives(): RVDrive[] {
  return [
    makeDrive('A1', DriveDirection.RotationY),
    makeDrive('A2', DriveDirection.RotationZ),
    makeDrive('A3', DriveDirection.RotationZ),
    makeDrive('A4', DriveDirection.RotationX),
    makeDrive('A5', DriveDirection.RotationZ),
    makeDrive('A6', DriveDirection.RotationX),
  ];
}

function makeViewer(drives: RVDrive[], playbackPlaying = false) {
  const playback = { isPlaying: playbackPlaying, play: vi.fn(), pause: vi.fn() };
  let connState: 'Connected' | 'Disconnected' = 'Connected';
  return {
    drives, playback,
    get connectionState() { return connState; },
    setConnectionState(s: 'Connected' | 'Disconnected') { connState = s; },
    getPlugin<T extends RVViewerPlugin>(_id: string): T | undefined { return undefined; },
  } as unknown as RVViewer;
}

function asLoadResult(drives: RVDrive[]): LoadResult {
  return { drives } as unknown as LoadResult;
}

/** Tick the plugin N seconds at 60Hz. */
function tick(plugin: TestAxesPlugin, seconds: number) {
  const dt = 1 / 60;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) plugin.onFixedUpdatePre!(dt);
}

// ── Tests ──

describe('TestAxesPlugin', () => {
  it('registers button-group slot at order 60', () => {
    const plugin = new TestAxesPlugin();
    expect(plugin.id).toBe('test-axes');
    expect(plugin.slots).toHaveLength(1);
    expect(plugin.slots[0].slot).toBe('button-group');
    expect(plugin.slots[0].order).toBe(60);
  });

  it('finds A1-A6 by name in onModelLoaded', () => {
    const plugin = new TestAxesPlugin();
    const drives = makeRobotDrives();
    const viewer = makeViewer(drives);
    plugin.onModelLoaded(asLoadResult(drives), viewer);

    plugin.toggle(10);
    expect(plugin.running).toBe(true);
    // All 6 drives should be locked
    expect(drives.every(d => d.positionOverwrite)).toBe(true);
  });

  it('runs full test cycle: rest → hold each axis → done', () => {
    const plugin = new TestAxesPlugin();
    const drives = makeRobotDrives();
    const viewer = makeViewer(drives, true);
    plugin.onModelLoaded(asLoadResult(drives), viewer);

    // Save positions
    drives.forEach((d, i) => { d.currentPosition = (i + 1) * 10; });
    const saved = drives.map(d => d.currentPosition);

    plugin.toggle(15);
    expect(plugin.running).toBe(true);
    expect(viewer.connectionState).toBe('Disconnected');

    // Phase: rest (1.5s)
    tick(plugin, 1.6);

    // Phase: hold A1 (should be at 15°)
    expect(drives[0].currentPosition).toBe(15);

    // Tick through all 6 axes: each = 1.5s hold + 0.3s pause = 1.8s
    // Remaining after A1 hold: need 5 more complete cycles + rest of A1
    tick(plugin, 1.5 + 0.3); // finish A1, pause
    tick(plugin, 5 * (1.5 + 0.3)); // A2-A6

    // Should be done
    expect(plugin.running).toBe(false);

    // All positions restored
    drives.forEach((d, i) => {
      expect(d.currentPosition).toBe(saved[i]);
      expect(d.positionOverwrite).toBe(false);
    });
    expect(viewer.connectionState).toBe('Connected');
    expect(viewer.playback!.play).toHaveBeenCalled();
  });

  it('toggle stops mid-test and restores', () => {
    const plugin = new TestAxesPlugin();
    const drives = makeRobotDrives();
    drives[0].currentPosition = 42;
    const viewer = makeViewer(drives, true);
    plugin.onModelLoaded(asLoadResult(drives), viewer);

    plugin.toggle(10);
    expect(plugin.running).toBe(true);

    tick(plugin, 2.0); // mid-test

    plugin.toggle(); // stop
    expect(plugin.running).toBe(false);
    expect(drives[0].currentPosition).toBe(42);
    expect(viewer.connectionState).toBe('Connected');
  });

  it('onModelCleared aborts and restores', () => {
    const plugin = new TestAxesPlugin();
    const drives = makeRobotDrives();
    const viewer = makeViewer(drives, true);
    plugin.onModelLoaded(asLoadResult(drives), viewer);

    plugin.toggle(10);
    tick(plugin, 2.0);

    plugin.onModelCleared(viewer);
    expect(plugin.running).toBe(false);
    expect(viewer.playback!.play).toHaveBeenCalled();
  });

  it('restores Disconnected if that was the original state', () => {
    const plugin = new TestAxesPlugin();
    const drives = makeRobotDrives();
    const viewer = makeViewer(drives);
    viewer.setConnectionState('Disconnected');
    plugin.onModelLoaded(asLoadResult(drives), viewer);

    plugin.toggle(10);
    tick(plugin, 20); // run to completion

    expect(plugin.running).toBe(false);
    expect(viewer.connectionState).toBe('Disconnected');
  });

  it('does nothing when no axes found', () => {
    const plugin = new TestAxesPlugin();
    const drives = [makeDrive('Linear1', DriveDirection.LinearX)];
    const viewer = makeViewer(drives);
    plugin.onModelLoaded(asLoadResult(drives), viewer);

    plugin.toggle(10);
    expect(plugin.running).toBe(false); // no A1-A6 found
  });
});
