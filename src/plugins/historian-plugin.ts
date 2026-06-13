// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db, storage } from "../core/rv-firebase";
import type { RVViewerPlugin } from "../core/rv-plugin";
import type { RVViewer } from "../core/rv-viewer";
import type { LoadResult } from "../core/engine/rv-scene-loader";
import type { UISlotEntry } from "../core/rv-ui-plugin";
import { TimelinePanel } from "../hmi/TimelinePanel";
import { DriveDataRecorder } from "../core/engine/rv-drive-recorder";
import { RVDrivesPlayback } from "../core/engine/rv-drives-playback";
import { logInfo, logError } from "../core/engine/rv-debug";
import { DataConnectService } from "../core/dataconnect-service";

/**
 * HistorianPlugin
 * "The Factory Time Machine"
 * Records live drive data into a ring buffer and allows 3D scrubbing/playback.
 * Supports cloud persistence via Firebase.
 */
export class HistorianPlugin implements RVViewerPlugin {
  readonly id = 'historian';
  readonly order = 110; // After drives are loaded

  readonly slots: UISlotEntry[] = [
    {
      slot: 'views',
      order: 10,
      component: TimelinePanel,
    }
  ];

  private _viewer: RVViewer | null = null;
  private _recorder: DriveDataRecorder | null = null;
  private _playback: RVDrivesPlayback | null = null;
  private _isTimeTraveling = false;

  get isTimeTraveling() { return this._isTimeTraveling; }
  get recorder() { return this._recorder; }
  get playback() { return this._playback; }

  onModelLoaded(result: LoadResult, viewer: RVViewer): void {
    this._viewer = viewer;
    
    // 1. Initialize Recorder (e.g. 5 minutes at 10Hz = 3000 samples)
    this._recorder = new DriveDataRecorder(3000, 10);
    this._recorder.setDrives(result.drives);
    
    // 2. Clear flags
    this._isTimeTraveling = false;
  }

  onFixedUpdatePost(dt: number): void {
    if (!this._isTimeTraveling && this._recorder) {
      this._recorder.sample(dt);
    }
    
    if (this._isTimeTraveling && this._playback) {
      this._playback.update(dt);
    }
  }

  /** Enter Time Travel mode using current live history. */
  startTimeTravel(): void {
    if (!this._recorder || this._isTimeTraveling) return;

    const recording = this._recorder.toCompactRecording();
    if (recording.numberFrames < 2) return;

    this._playback = new RVDrivesPlayback(recording, this._viewer!.registry!);
    this._isTimeTraveling = true;
    this._playback.play();
    
    logInfo('Time Machine: Entered playback mode');
    this._viewer?.emit('historian-mode-changed' as any, { mode: 'playback' });
  }

  /** Return to live simulation. */
  stopTimeTravel(): void {
    if (!this._isTimeTraveling) return;
    
    this._playback?.stop();
    this._playback = null;
    this._isTimeTraveling = false;
    
    logInfo('Time Machine: Returned to Live mode');
    this._viewer?.emit('historian-mode-changed' as any, { mode: 'live' });
  }

  /** 
   * Save the current history buffer to Firebase Cloud.
   * Uploads JSON blob to Storage and metadata to Firestore.
   */
  async cloudSave(label: string = "Manual Snapshot"): Promise<void> {
    if (!this._recorder || !this._viewer) return;
    
    const recording = this._recorder.toCompactRecording();
    const blob = new Blob([JSON.stringify(recording)], { type: 'application/json' });
    const filename = `events/${this._viewer.currentModelUrl || 'unknown'}/${Date.now()}.json`;
    
    try {
      logInfo(`Cloud Save: Uploading to ${filename}...`);
      const storageRef = ref(storage, filename);
      const snapshot = await uploadBytes(storageRef, blob);
      const downloadUrl = await getDownloadURL(snapshot.ref);

      // ── Save to Firestore (Legacy/Redundant) ──
      await addDoc(collection(db, "event_logs"), {
        label,
        siteId: this._viewer.scene.userData?.site?.id || 'default',
        modelUrl: this._viewer.currentModelUrl,
        storagePath: filename,
        downloadUrl,
        timestamp: serverTimestamp(),
        durationSeconds: recording.numberFrames * recording.fixedDeltaTime
      });

      // ── Save to Data Connect (SQL) ──
      // Using dummy IDs from seed data for demonstration
      await DataConnectService.recordSimulation({
        name: label,
        status: "Saved",
        simulationData: JSON.stringify({
          storagePath: filename,
          downloadUrl,
          frames: recording.numberFrames
        }),
        robotId: "d4e5f6a7-b8c9-0123-4567-890abcdef123", // Default from seed
        userId: "b0c1d2e3-f4a5-6789-0123-456789abcdef"    // Default from seed
      });

      logInfo('Cloud Save: Successfully uploaded and indexed in Firestore & SQL.');
    } catch (err) {
      logError('Cloud Save failed', err);
    }
  }

  dispose(): void {
    this.stopTimeTravel();
  }
}
