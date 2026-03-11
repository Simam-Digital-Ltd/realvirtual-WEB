/**
 * RVViewerPlugin — Interface for viewer lifecycle plugins.
 *
 * Plugins register via viewer.use(plugin) and receive callbacks at key
 * lifecycle points. Each callback is isolated with try/catch so a
 * faulty plugin cannot freeze the simulation.
 */

import type { LoadResult } from '../rv-scene-loader';
import type { RVViewer } from './rv-viewer';

export interface RVViewerPlugin {
  /** Unique plugin ID (e.g. 'drive-recorder', 'sensor-monitor'). */
  readonly id: string;

  /** Sort order in Pre/Post/Render lists (lower = earlier). Default: 100. */
  readonly order?: number;

  /** When true: plugin handles transport (transportManager.update is skipped). */
  readonly handlesTransport?: boolean;

  // ── Lifecycle Callbacks ──

  /**
   * Called after loadGLB + state assignment, before 'model-loaded' event.
   * Also called retroactively when a plugin is registered after model load.
   */
  onModelLoaded?(result: LoadResult, viewer: RVViewer): void;

  /** Called at the start of clearModel, BEFORE state reset. */
  onModelCleared?(viewer: RVViewer): void;

  /** 60Hz tick BEFORE drive physics (set drive targets: ErraticDriver, Replay, CAM). */
  onFixedUpdatePre?(dt: number): void;

  /** 60Hz tick AFTER drive physics + transport (read results: DriveRecorder, SensorMonitor). */
  onFixedUpdatePost?(dt: number): void;

  /** Per render frame, after renderer.render(). */
  onRender?(frameDt: number): void;

  /** Viewer is being destroyed — clean up global listeners, DOM elements, etc. */
  dispose?(): void;
}
