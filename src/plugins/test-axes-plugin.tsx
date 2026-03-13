/**
 * TestAxesPlugin — Sequential axis tester (MonoBehaviour-style).
 *
 * - onModelLoaded = Start(): get drive references by name
 * - onFixedUpdatePre = FixedUpdate(): run test state machine
 * - slots: button on the left sidebar
 */

import { useState, useEffect } from 'react';
import { Science } from '@mui/icons-material';
import type { RVViewerPlugin } from '../core/rv-plugin';
import type { UISlotEntry, UISlotProps } from '../core/rv-ui-plugin';
import type { LoadResult } from '../core/engine/rv-scene-loader';
import type { RVViewer } from '../core/rv-viewer';
import type { RVDrive } from '../core/engine/rv-drive';
import { NavButton } from '../core/hmi/NavButton';

// ─── React Button ───────────────────────────────────────────────────────

function TestAxesButton({ viewer }: UISlotProps) {
  const [running, setRunning] = useState(false);
  const plugin = viewer.getPlugin<TestAxesPlugin>('test-axes');

  useEffect(() => {
    if (plugin) plugin._setRunning = setRunning;
    return () => { if (plugin) plugin._setRunning = null; };
  }, [plugin]);

  return (
    <NavButton
      icon={<Science />}
      label="Test Axes"
      active={running}
      onClick={() => {
        if (!plugin || running) return;
        plugin.toggle();
      }}
    />
  );
}

// ─── Plugin ─────────────────────────────────────────────────────────────

const HOLD_TIME = 1.5;   // seconds to hold each axis at test angle
const PAUSE_TIME = 0.3;  // seconds between axes (rest at 0)

export class TestAxesPlugin implements RVViewerPlugin {
  readonly id = 'test-axes';
  readonly slots: UISlotEntry[] = [
    { slot: 'button-group', component: TestAxesButton, order: 60 },
  ];

  // --- Drive references (set in onModelLoaded, like Start()) ---
  private _viewer: RVViewer | null = null;
  private _allDrives: RVDrive[] = [];
  /** Hardcoded robot axes A1-A6. */
  private _axes: RVDrive[] = [];

  // --- Test state machine ---
  private _testing = false;
  private _axisIndex = 0;
  private _timer = 0;
  private _phase: 'rest' | 'hold' | 'pause' = 'rest';
  private _angle = 10;

  // --- Saved state for restore ---
  private _savedPositions: number[] = [];
  private _savedOverwrites: boolean[] = [];
  private _playbackWasPlaying = false;
  private _previousConnectionState: 'Connected' | 'Disconnected' = 'Connected';

  /** React state bridge. */
  _setRunning: ((v: boolean) => void) | null = null;

  get running() { return this._testing; }

  // ── Start() — get references ──

  /** Axis names to test — hardcoded for the robot. */
  static readonly AXIS_NAMES = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'];

  onModelLoaded(_result: LoadResult, viewer: RVViewer): void {
    this._viewer = viewer;
    this._allDrives = viewer.drives;
    // Get references by name — like GetComponent<Drive> in Unity
    this._axes = TestAxesPlugin.AXIS_NAMES
      .map(name => viewer.drives.find(d => d.name === name))
      .filter((d): d is RVDrive => d !== undefined);
  }

  onModelCleared(): void {
    if (this._testing) this._stop();
    this._viewer = null;
    this._allDrives = [];
    this._axes = [];
  }

  dispose(): void {
    if (this._testing) this._stop();
    this._viewer = null;
    this._setRunning = null;
  }

  // ── Button click — toggle test ──

  toggle(angle = 10): void {
    if (this._testing) {
      this._stop();
    } else {
      this._start(angle);
    }
  }

  // ── FixedUpdate() — state machine ──

  onFixedUpdatePre(dt: number): void {
    if (!this._testing) return;

    this._timer += dt;

    if (this._phase === 'rest') {
      // Initial rest: show all axes at 0
      if (this._timer >= HOLD_TIME) {
        this._timer = 0;
        this._phase = 'hold';
        this._axisIndex = 0;
        this._activateAxis(this._axisIndex);
      }
    } else if (this._phase === 'hold') {
      // Holding current axis at test angle
      if (this._timer >= HOLD_TIME) {
        this._timer = 0;
        this._axes[this._axisIndex].currentPosition = 0;
        this._axisIndex++;
        if (this._axisIndex >= this._axes.length) {
          this._stop();
          return;
        }
        this._phase = 'pause';
      }
    } else if (this._phase === 'pause') {
      // Brief pause between axes
      if (this._timer >= PAUSE_TIME) {
        this._timer = 0;
        this._phase = 'hold';
        this._activateAxis(this._axisIndex);
      }
    }
  }

  // ── Internal ──

  private _start(angle: number): void {
    if (!this._viewer || this._axes.length === 0) return;

    this._angle = angle;

    // Save state
    this._previousConnectionState = this._viewer.connectionState;
    this._savedPositions = this._allDrives.map(d => d.currentPosition);
    this._savedOverwrites = this._allDrives.map(d => d.positionOverwrite);
    this._playbackWasPlaying = this._viewer.playback?.isPlaying ?? false;

    // Switch to Disconnected — pauses playback/logic
    this._viewer.setConnectionState('Disconnected');

    // Lock all drives, reset to 0
    for (const d of this._allDrives) {
      d.currentPosition = 0;
      d.positionOverwrite = true;
    }

    // Start state machine
    this._testing = true;
    this._timer = 0;
    this._phase = 'rest';
    this._axisIndex = 0;
    this._setRunning?.(true);

    console.log(`[TestAxes] Testing ${this._axes.length} axes with +${angle}°`);
    console.table(this._axes.map(d => ({
      name: d.name,
      direction: d.config.direction,
      reverse: d.config.reverseDirection,
    })));
  }

  private _stop(): void {
    if (!this._viewer) { this._testing = false; return; }

    // Restore positions + overwrite flags
    for (let i = 0; i < this._allDrives.length; i++) {
      if (i < this._savedPositions.length) this._allDrives[i].currentPosition = this._savedPositions[i];
      if (i < this._savedOverwrites.length) this._allDrives[i].positionOverwrite = this._savedOverwrites[i];
    }

    // Resume playback if it was playing
    if (this._playbackWasPlaying) this._viewer.playback?.play();

    // Restore connection state
    this._viewer.setConnectionState(this._previousConnectionState);

    this._testing = false;
    this._setRunning?.(false);
    this._savedPositions = [];
    this._savedOverwrites = [];

    console.log('[TestAxes] Done — state restored');
  }

  private _activateAxis(index: number): void {
    const d = this._axes[index];
    d.currentPosition = this._angle;
    console.log(`[TestAxes] >>> ${d.name} = +${this._angle}° (${d.config.direction})`);
  }
}
