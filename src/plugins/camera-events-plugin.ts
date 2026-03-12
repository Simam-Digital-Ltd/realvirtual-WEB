/**
 * CameraEventsPlugin — Emits 'camera-animation-done' when a camera animation finishes.
 *
 * Watches the viewer's internal camera animation state each render frame.
 */

import type { RVViewerPlugin } from '../core/rv-plugin';
import type { RVViewer } from '../core/rv-viewer';
import type { LoadResult } from '../core/engine/rv-scene-loader';

export class CameraEventsPlugin implements RVViewerPlugin {
  readonly id = 'camera-events';
  private viewer: RVViewer | null = null;
  private wasAnimating = false;

  onModelLoaded(_result: LoadResult, viewer: RVViewer): void {
    this.viewer = viewer;
  }

  onRender(): void {
    if (!this.viewer) return;
    // Access private cameraAnim via bracket notation (no API change needed)
    const isAnimating = (this.viewer as unknown as { cameraAnim: unknown }).cameraAnim !== null;
    if (this.wasAnimating && !isAnimating) {
      this.viewer.emit('camera-animation-done', {});
    }
    this.wasAnimating = isAnimating;
  }
}
