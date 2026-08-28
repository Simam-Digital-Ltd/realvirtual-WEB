// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Ground guard — stops the camera going under the slab.
 *
 * Orbiting or dollying below y=0 puts the viewer underneath the factory, where
 * the floor is backface-culled and the scene reads as broken. Two independent
 * clamps are needed because two different gestures get you there:
 *
 *   1. ORBIT under the horizon — fixed by capping the OrbitControls polar
 *      angle just short of 90 degrees.
 *   2. DOLLY / PAN straight through the floor — polar angle does nothing here,
 *      so the camera position and the orbit target are both floored per frame.
 *
 * The target is clamped as well as the eye. Clamping only the eye lets the
 * target sink, which tilts the camera further down every frame and fights the
 * user's input instead of stopping cleanly at the floor.
 *
 * Deliberately NOT applied in walk/FPV modes: those own the camera height
 * themselves, and a second opinion about eye height would jitter.
 */

import type { RVViewerPlugin } from '../../core/rv-plugin';
import type { RVViewer } from '../../core/rv-viewer';

/** Minimum eye height above the slab, in metres. */
const MIN_EYE_Y = 0.35;
/** Minimum orbit-target height. Slightly below the eye so level views work. */
const MIN_TARGET_Y = 0.05;
/** ~87 degrees. Leaves a sliver so a level view is still reachable. */
const MAX_POLAR = Math.PI / 2 - 0.05;

export class GroundGuardPlugin implements RVViewerPlugin {
  readonly id = 'simam-ground-guard';
  readonly name = 'Ground Guard';
  /** Runs late so it clamps whatever the camera manager just did. */
  readonly order = 990;

  private _viewer: RVViewer | null = null;
  private _applied = false;

  init(viewer: RVViewer): void {
    this._viewer = viewer;
  }

  onRender(): void {
    const viewer = this._viewer;
    if (!viewer) return;

    // Modes that own camera height must be left alone.
    const mode = viewer.modes?.activeMode;
    if (mode === 'fpv' || mode === 'walk') return;

    // `viewer.controls` is the PUBLIC, typed OrbitControls handle.
    //
    // This previously reached through `viewer.cameraManager.state.controls`
    // behind an `as unknown as` cast. That cast compiled cleanly and was
    // silently undefined at runtime — the manager is the private field
    // `_cameraManager` — so the polar cap and the target clamp never ran and
    // only the eye-height floor did any work. Casting around the public API
    // turns a compile error into an invisible one; don't.
    const controls = viewer.controls;

    // Set the polar cap once; it is sticky, unlike the per-frame position clamp.
    if (controls && !this._applied) {
      controls.maxPolarAngle = Math.min(controls.maxPolarAngle, MAX_POLAR);
      this._applied = true;
    }

    const camera = viewer.camera;
    if (camera && camera.position.y < MIN_EYE_Y) camera.position.y = MIN_EYE_Y;
    if (controls && controls.target.y < MIN_TARGET_Y) controls.target.y = MIN_TARGET_Y;
  }

  dispose(): void {
    this._viewer = null;
    this._applied = false;
  }
}
