import type { RVDrive } from './rv-drive';
import type { NodeRegistry } from './rv-node-registry';
import { debug, debugWarn } from './rv-debug';

/**
 * Compact recording format matching the GLB export.
 * positions is a flat Float array: positions[frame * driveCount + driveIndex]
 */
export interface CompactRecording {
  fixedDeltaTime: number;
  numberFrames: number;
  driveCount: number;
  drives: { id: number; path: string }[];
  sequences?: { name: string; startFrame: number; endFrame: number }[];
  positions: number[];
}

/**
 * RVDrivesPlayback - Frame-based drive recording playback.
 *
 * Reads a compact recording (flat float array of drive positions per frame)
 * and applies positions to RVDrive instances via positionOverwrite mode.
 *
 * Synchronizes with the simulation loop's fixedDeltaTime accumulator.
 * Supports looping and seeking.
 */
export class RVDrivesPlayback {
  private recording: CompactRecording;
  private driveBindings: (RVDrive | null)[];
  private currentFrame = 0;
  private accumulator = 0;
  private _isPlaying = false;
  private _loop = true;
  private _startFrame = 0;
  private _endFrame = 0;

  constructor(recording: CompactRecording, registry: NodeRegistry, options?: { startFrame?: number; endFrame?: number; loop?: boolean }) {
    this.validateRecording(recording);
    this.recording = recording;
    this._startFrame = options?.startFrame ?? 0;
    this._endFrame = (options?.endFrame && options.endFrame > 0) ? Math.min(options.endFrame, recording.numberFrames - 1) : recording.numberFrames - 1;
    this._loop = options?.loop ?? true;

    // Bind recording drive IDs to actual RVDrive instances via NodeRegistry
    this.driveBindings = recording.drives.map((rd) => {
      const drive = registry.getByPath<RVDrive>('Drive', rd.path);
      if (!drive) {
        debugWarn('playback', `Drive not found for path: "${rd.path}"`);
      }
      return drive;
    });

    const bound = this.driveBindings.filter(Boolean).length;
    debug('playback', `Created: ${recording.numberFrames}f, ${bound}/${recording.driveCount} drives bound, ` +
      `dt=${recording.fixedDeltaTime}s, loop=${this._loop}, range=[${this._startFrame}..${this._endFrame}]` +
      (recording.sequences?.length ? `, sequences=[${recording.sequences.map(s => s.name).join(',')}]` : ''));
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get loop(): boolean {
    return this._loop;
  }

  set loop(v: boolean) {
    this._loop = v;
  }

  get frame(): number {
    return this.currentFrame;
  }

  get totalFrames(): number {
    return this.recording.numberFrames;
  }

  get progress(): number {
    return this.recording.numberFrames > 0
      ? this.currentFrame / this.recording.numberFrames
      : 0;
  }

  /** Start playback — enables positionOverwrite on all bound drives */
  play(): void {
    if (this.recording.numberFrames <= 0) return;
    this._isPlaying = true;
    this.currentFrame = this._startFrame;
    for (const drive of this.driveBindings) {
      if (drive) drive.positionOverwrite = true;
    }
    this.applyFrame(this.currentFrame);
    debug('playback', `play() from frame ${this._startFrame}, loop=${this._loop}`);
  }

  /** Stop playback — disables positionOverwrite */
  pause(): void {
    this._isPlaying = false;
  }

  /** Stop and reset to frame 0 */
  stop(): void {
    this._isPlaying = false;
    this.currentFrame = 0;
    this.accumulator = 0;
    for (const drive of this.driveBindings) {
      if (drive) drive.positionOverwrite = false;
    }
  }

  /** Play a named sequence (non-looping). Used by RVReplayRecording. */
  playSequence(name: string): boolean {
    const seq = this.recording.sequences?.find((s) => s.name === name);
    if (!seq) {
      debugWarn('playback', `Sequence "${name}" not found`);
      return false;
    }
    debug('playback', `playSequence("${name}") frames [${seq.startFrame}..${seq.endFrame}] (${seq.endFrame - seq.startFrame} frames, ${((seq.endFrame - seq.startFrame) * this.recording.fixedDeltaTime).toFixed(1)}s)`);
    // Log first frame positions for debugging
    const firstOffset = seq.startFrame * this.recording.driveCount;
    const posInfo = this.recording.drives.map((rd, i) =>
      `${rd.path.split('/').pop()}=${this.recording.positions[firstOffset + i]?.toFixed(1)}`
    ).join(', ');
    debug('playback', `  Start positions: ${posInfo}`);
    this._startFrame = seq.startFrame;
    this._endFrame = Math.min(seq.endFrame, this.recording.numberFrames - 1);
    this._loop = false;
    this._isPlaying = true;
    this.currentFrame = this._startFrame;
    this.accumulator = 0;
    for (const drive of this.driveBindings) {
      if (drive) drive.positionOverwrite = true;
    }
    this.applyFrame(this.currentFrame);
    return true;
  }

  /** Seek to a specific percentage (0..1) */
  seekToPercent(pct: number): void {
    if (this.recording.numberFrames <= 0) return;
    const frame = Math.floor(Math.max(0, Math.min(1, pct)) * (this.recording.numberFrames - 1));
    this.currentFrame = frame;
    this.accumulator = 0;
    this.applyFrame(frame);
  }

  /**
   * Update — called every simulation fixed timestep.
   * Uses its own accumulator based on the recording's fixedDeltaTime
   * to advance frames at the correct rate.
   */
  update(dt: number): void {
    if (!this._isPlaying || this.recording.numberFrames <= 0) return;

    this.accumulator += dt;

    while (this.accumulator >= this.recording.fixedDeltaTime) {
      this.accumulator -= this.recording.fixedDeltaTime;
      this.currentFrame++;

      if (this.currentFrame > this._endFrame) {
        if (this._loop) {
          this.currentFrame = this._startFrame;
        } else {
          this.currentFrame = this._endFrame;
          this._isPlaying = false;
          debug('playback', `Reached end frame ${this._endFrame}, stopping (non-loop). Releasing positionOverwrite.`);
          // Release positionOverwrite so other systems (erratic, logic) can control these drives
          for (const drive of this.driveBindings) {
            if (drive) drive.positionOverwrite = false;
          }
          break;
        }
      }
    }

    this.applyFrame(this.currentFrame);
  }

  /** Apply a specific frame's positions to all bound drives */
  private applyFrame(frame: number): void {
    const { driveCount, positions } = this.recording;
    const offset = frame * driveCount;

    for (let i = 0; i < driveCount; i++) {
      const drive = this.driveBindings[i];
      if (drive) {
        drive.currentPosition = positions[offset + i];
      }
    }
  }

  /** Validate recording data integrity */
  private validateRecording(rec: CompactRecording): void {
    if (!rec.positions || !rec.drives) {
      throw new Error('[DrivesPlayback] Recording missing positions or drives');
    }
    if (rec.fixedDeltaTime <= 0) {
      throw new Error(`[DrivesPlayback] Invalid fixedDeltaTime: ${rec.fixedDeltaTime}`);
    }
    if (rec.numberFrames < 0) {
      throw new Error(`[DrivesPlayback] Invalid numberFrames: ${rec.numberFrames}`);
    }
    const expected = rec.numberFrames * rec.driveCount;
    if (rec.positions.length !== expected) {
      throw new Error(
        `[DrivesPlayback] positions.length ${rec.positions.length} !== frames*drives ${expected}`
      );
    }
  }
}
