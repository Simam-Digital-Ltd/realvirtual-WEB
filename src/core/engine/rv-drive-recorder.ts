// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Drive Data Recorder — samples drive positions and speeds into ring buffers.
 *
 * Attaches to the simulation loop via `sample()` called each fixed-update tick.
 * Each drive gets its own pair of ring buffers (position + speed).
 * A shared time buffer stores elapsed simulation seconds.
 */

import { RingBuffer } from './rv-ring-buffer';
import type { RVDrive } from './rv-drive';
import type { CompactRecording } from './rv-drives-playback';

export interface DriveTimeSeries {
  drive: RVDrive;
  position: RingBuffer<number>;
  speed: RingBuffer<number>;
}

export class DriveDataRecorder {
  readonly timeBuffer: RingBuffer<number>;
  readonly series: DriveTimeSeries[] = [];
  private elapsedTime = 0;
  private sampleInterval: number;
  private timeSinceLastSample = 0;

  /**
   * @param capacity   Number of samples to keep per drive.
   * @param sampleRate Samples per second (default 10 = every 100ms).
   */
  constructor(capacity = 300, sampleRate = 10) {
    this.timeBuffer = new RingBuffer<number>(capacity);
    this.sampleInterval = 1 / sampleRate;
  }

  /** Bind drives — call after model load. Clears existing data. */
  setDrives(drives: RVDrive[]): void {
    this.series.length = 0;
    this.timeBuffer.clear();
    this.elapsedTime = 0;
    this.timeSinceLastSample = 0;

    for (const drive of drives) {
      this.series.push({
        drive,
        position: new RingBuffer<number>(this.timeBuffer.capacity),
        speed: new RingBuffer<number>(this.timeBuffer.capacity),
      });
    }
  }

  /** Call every simulation fixed-update tick. */
  sample(dt: number): void {
    this.elapsedTime += dt;
    this.timeSinceLastSample += dt;

    if (this.timeSinceLastSample < this.sampleInterval) return;
    this.timeSinceLastSample -= this.sampleInterval;

    this.timeBuffer.push(this.elapsedTime);
    for (const s of this.series) {
      s.position.push(s.drive.currentPosition);
      s.speed.push(Math.abs(s.drive.currentSpeed));
    }
  }

  /** Clear all recorded data. */
  clear(): void {
    this.timeBuffer.clear();
    this.elapsedTime = 0;
    this.timeSinceLastSample = 0;
    for (const s of this.series) {
      s.position.clear();
      s.speed.clear();
    }
  }

  /** 
   * Exports the current ring buffer state to a compact recording format.
   * Useful for "Factory Time Machine" playback.
   */
  toCompactRecording(): CompactRecording {
    const numberFrames = this.timeBuffer.count;
    const driveCount = this.series.length;
    
    // positions is a flat array: [f0d0, f0d1, ..., f1d0, f1d1, ...]
    const positions = new Array<number>(numberFrames * driveCount);
    
    // Extract each drive's time series to arrays
    const drivePositions = this.series.map(s => s.position.toArray());
    
    for (let f = 0; f < numberFrames; f++) {
      for (let d = 0; d < driveCount; d++) {
        positions[f * driveCount + d] = drivePositions[d][f];
      }
    }

    return {
      fixedDeltaTime: this.sampleInterval,
      numberFrames,
      driveCount,
      drives: this.series.map((s, idx) => ({
        id: idx,
        path: s.drive.node.userData.path || '' 
      })),
      positions
    };
  }
}
