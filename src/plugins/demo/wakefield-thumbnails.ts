// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Zone thumbnails, captured from the live scene.
 *
 * WHY NOT SHIP IMAGE FILES
 * ------------------------
 * Because they rot. A stock render of the packing hall stops matching the
 * packing hall the first time anyone moves a rack, and the strip quietly
 * becomes a brochure bolted to the side of a twin. Rendering the cards from
 * the same scene they link into means the picture is always the view, and
 * there is nothing to re-export when the model changes.
 *
 * HOW
 * ---
 * One offscreen render target, reused for every zone. For each zone we point
 * a throwaway camera at its pose, render, read the pixels back, and flip them
 * into a 2D canvas — WebGL reads bottom-up and canvases are top-down, so
 * skipping the flip gives you an upside-down factory.
 *
 * COST AND SCHEDULING
 * -------------------
 * Seven extra renders at 320 x 196 is a few milliseconds of GPU, but
 * `readRenderTargetPixels` STALLS the pipeline waiting for the frame, and
 * seven stalls back to back is a visible hitch on first load. So captures are
 * handed out one per call and the plugin spreads them across frames.
 *
 * WEBGPU
 * ------
 * Not supported here: the readback is async on WebGPU and this path is
 * synchronous. `captureZone` returns null, and the strip falls back to
 * lettered cards. A blank card is a smaller failure than a wrong one.
 */

import {
  PerspectiveCamera,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
  type Object3D,
  type Scene,
} from 'three';
import { THUMB_W, THUMB_H, type SiteZone } from './wakefield-zones';

/**
 * Scene objects to hide while capturing.
 *
 * The entry posts and the hotspot rings are chrome — they exist to tell a
 * first-time visitor where to click. Leaving them in the thumbnails would
 * put UI inside a picture OF the UI, which reads as a screenshot of a
 * screenshot.
 */
const CHROME_NAMES = ['wpf-entry-hotspots'];

export interface ThumbnailCapture {
  /** Offscreen target, sized once and reused. */
  target: WebGLRenderTarget;
  camera: PerspectiveCamera;
  buffer: Uint8Array;
  canvas: HTMLCanvasElement;
}

/** Build the reusable capture rig. Cheap; call once per model load. */
export function createCaptureRig(): ThumbnailCapture {
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;
  return {
    target: new WebGLRenderTarget(THUMB_W, THUMB_H),
    // 46 degrees is close enough to the app's own framing that the thumbnail
    // and the arrival view read as the same shot.
    camera: new PerspectiveCamera(46, THUMB_W / THUMB_H, 0.1, 4000),
    buffer: new Uint8Array(THUMB_W * THUMB_H * 4),
    canvas,
  };
}

/** Release everything the rig owns. */
export function disposeCaptureRig(rig: ThumbnailCapture): void {
  rig.target.dispose();
  rig.canvas.width = 0;
  rig.canvas.height = 0;
}

function findChrome(scene: Scene): Object3D[] {
  const found: Object3D[] = [];
  for (const name of CHROME_NAMES) {
    const obj = scene.getObjectByName(name);
    if (obj) found.push(obj);
  }
  return found;
}

/**
 * Render one zone to a data URL.
 *
 * Returns null when the renderer is not a WebGLRenderer (WebGPU), which the
 * caller must treat as "no thumbnail", not as an error.
 */
export function captureZone(
  renderer: unknown,
  scene: Scene,
  zone: SiteZone,
  rig: ThumbnailCapture,
): string | null {
  if (!(renderer instanceof WebGLRenderer)) return null;

  const ctx = rig.canvas.getContext('2d');
  if (!ctx) return null;

  rig.camera.position.set(zone.cameraPos.x, zone.cameraPos.y, zone.cameraPos.z);
  rig.camera.lookAt(new Vector3(zone.cameraTarget.x, zone.cameraTarget.y, zone.cameraTarget.z));
  rig.camera.updateMatrixWorld(true);

  // Hide chrome, remembering each object's own visibility so an already
  // hidden group is not switched on by the restore.
  const chrome = findChrome(scene);
  const wasVisible = chrome.map((o) => o.visible);
  for (const o of chrome) o.visible = false;

  const previousTarget = renderer.getRenderTarget();

  try {
    renderer.setRenderTarget(rig.target);
    renderer.render(scene, rig.camera);
    renderer.readRenderTargetPixels(rig.target, 0, 0, THUMB_W, THUMB_H, rig.buffer);
  } catch {
    // A context loss mid-capture must not take the strip down with it.
    return null;
  } finally {
    renderer.setRenderTarget(previousTarget);
    chrome.forEach((o, i) => { o.visible = wasVisible[i]!; });
  }

  // WebGL origin is bottom-left, canvas origin is top-left: copy row by row
  // in reverse rather than drawing and CSS-flipping, so the data URL itself
  // is the right way up and can be used anywhere.
  const image = ctx.createImageData(THUMB_W, THUMB_H);
  const rowBytes = THUMB_W * 4;
  for (let y = 0; y < THUMB_H; y++) {
    const src = (THUMB_H - 1 - y) * rowBytes;
    image.data.set(rig.buffer.subarray(src, src + rowBytes), y * rowBytes);
  }
  ctx.putImageData(image, 0, 0);

  // WebP at 0.72 keeps seven thumbnails to a few tens of KB; these live in
  // memory for the session and never touch the network.
  return rig.canvas.toDataURL('image/webp', 0.72);
}
