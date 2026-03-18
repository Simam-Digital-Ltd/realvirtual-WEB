/**
 * Tooltip utility functions — projection and viewport clamping.
 *
 * Extracted from DriveTooltip.tsx for reuse across all tooltip types.
 * Pre-allocates temp vectors for GC-free projection in hot paths.
 */

import { Vector3, type Object3D, type Camera, type WebGLRenderer } from 'three';

// Pre-allocated temp vector for GC-free projection
const _tempVec = new Vector3();

/** Result of projecting a 3D object to screen coordinates. */
export interface ScreenProjection {
  /** Screen X in pixels (relative to renderer canvas). */
  x: number;
  /** Screen Y in pixels (relative to renderer canvas). */
  y: number;
  /** Whether the object is in front of the camera (visible). */
  visible: boolean;
}

/**
 * Project a 3D object's world position to screen (pixel) coordinates.
 *
 * Uses the renderer's domElement bounding rect for canvas-relative calculation,
 * so this works correctly even when the canvas is not fullscreen.
 *
 * Returns `visible: false` when the object is behind the camera (z > 1).
 */
export function projectToScreen(
  object: Object3D,
  camera: Camera,
  renderer: WebGLRenderer,
): ScreenProjection {
  object.updateWorldMatrix(true, false);
  object.getWorldPosition(_tempVec);
  _tempVec.project(camera);

  // Behind-camera check: projected z > 1 means behind
  if (_tempVec.z > 1) {
    return { x: 0, y: 0, visible: false };
  }

  const rect = renderer.domElement.getBoundingClientRect();
  return {
    x: (_tempVec.x * 0.5 + 0.5) * rect.width + rect.left,
    y: (-_tempVec.y * 0.5 + 0.5) * rect.height + rect.top,
    visible: true,
  };
}

/**
 * Clamp a tooltip position to stay within the viewport on all 4 edges.
 *
 * @param x - Tooltip left position in pixels
 * @param y - Tooltip top position in pixels
 * @param tooltipWidth - Estimated tooltip width in pixels
 * @param tooltipHeight - Estimated tooltip height in pixels
 * @param margin - Minimum margin from viewport edges in pixels
 * @param viewWidth - Viewport width in pixels
 * @param viewHeight - Viewport height in pixels
 * @returns Clamped { x, y } position
 */
export function clampToViewport(
  x: number,
  y: number,
  tooltipWidth: number,
  tooltipHeight: number,
  margin: number,
  viewWidth: number,
  viewHeight: number,
): { x: number; y: number } {
  // Clamp right edge
  const clampedX = Math.min(x, viewWidth - tooltipWidth - margin);
  // Clamp left edge
  const finalX = Math.max(clampedX, margin);

  // Clamp bottom edge
  const clampedY = Math.min(y, viewHeight - tooltipHeight - margin);
  // Clamp top edge
  const finalY = Math.max(clampedY, margin);

  return { x: finalX, y: finalY };
}
