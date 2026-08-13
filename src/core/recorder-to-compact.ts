// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Convert live `DriveDataRecorder` ring buffers into a `CompactRecording`.
 *
 * The Simam Historian (time travel + cloud snapshots) needs to replay recorded
 * drive motion through `RVDrivesPlayback`, which consumes the same
 * `CompactRecording` shape that GLB `DrivesRecording_compact` extras use.
 *
 * This lives in the Simam layer rather than on `DriveDataRecorder` itself so the
 * upstream engine class stays untouched — keeping our fork mergeable.
 */

import type { DriveDataRecorder } from './engine/rv-drive-recorder';
import type { NodeRegistry } from './engine/rv-node-registry';
import type { CompactRecording } from './engine/rv-drives-playback';

/** Fallback sample interval if the time buffer has too few samples to infer one. */
const DEFAULT_DELTA = 0.1;

/**
 * Infer the sample interval from consecutive timestamps.
 * The recorder samples on a fixed cadence, so the mean delta is exact in
 * practice; the mean (rather than first delta) guards against a partial buffer.
 */
export function inferFixedDeltaTime(recorder: DriveDataRecorder): number {
  const times = recorder.timeBuffer.toArray();
  if (times.length < 2) return DEFAULT_DELTA;
  const span = times[times.length - 1] - times[0];
  const delta = span / (times.length - 1);
  return delta > 0 ? delta : DEFAULT_DELTA;
}

/**
 * Build a playback-compatible recording from whatever the recorder currently holds.
 *
 * `positions` is flat and frame-major — `positions[frame * driveCount + driveIndex]`
 * — matching `RVDrivesPlayback`.
 *
 * @param registry Used to resolve each drive's scene path so playback can rebind
 *                 the recording to the live scene graph. Falls back to the drive
 *                 name when a node has no registered path.
 */
export function toCompactRecording(
  recorder: DriveDataRecorder,
  registry: NodeRegistry | null,
): CompactRecording {
  const series = recorder.series;
  const driveCount = series.length;

  // Every series shares the recorder's cadence, but a ring buffer may be partially
  // filled — clamp to the shortest so no frame is half-populated.
  let numberFrames = recorder.timeBuffer.toArray().length;
  for (const s of series) {
    numberFrames = Math.min(numberFrames, s.position.toArray().length);
  }
  if (numberFrames < 0) numberFrames = 0;

  const drives = series.map((s, id) => ({
    id,
    path: registry?.getPathForNode(s.drive.node) ?? s.drive.node.name,
  }));

  const positions = new Array<number>(numberFrames * driveCount).fill(0);
  for (let d = 0; d < driveCount; d++) {
    const samples = series[d].position.toArray();
    // Take the most recent `numberFrames` so all drives stay frame-aligned.
    const offset = samples.length - numberFrames;
    for (let f = 0; f < numberFrames; f++) {
      positions[f * driveCount + d] = samples[offset + f];
    }
  }

  return {
    fixedDeltaTime: inferFixedDeltaTime(recorder),
    numberFrames,
    driveCount,
    drives,
    positions,
  };
}
