// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Wakefield zoom LOD.
 *
 * Drives one continuous journey from estate to machine as the camera dollies
 * in, by switching which dressing layer is visible:
 *
 *   REGION   (> 220 m)  estate context only; reserved for the Google
 *                       photorealistic 3D-tiles layer once that lands.
 *   SITE     (55-220 m) full exterior — shell, roof, yard, neighbours.
 *                       Interior hidden: it is inside a closed box and would
 *                       only cost triangles.
 *   BUILDING (28-55 m)  shell and roof fade out so the hall opens up;
 *                       interior fades in. Both are drawn during the cross-
 *                       fade, which is the only range where that happens.
 *   PROCESS  (< 28 m)   interior and machine only; exterior context stays
 *                       (it is visible through the open shell) but the roof
 *                       is fully gone.
 *
 * Why distance and not a mode toggle: the user asked to "zoom in and it's the
 * factory interior". Tying it to camera distance means it happens as a
 * consequence of looking closer, with no UI to discover.
 *
 * HYSTERESIS is the reason this is a class and not a function. A bare
 * threshold flickers when the camera sits exactly on a boundary — one frame
 * of jitter crosses it repeatedly and the roof strobes. Each band therefore
 * has separate enter/exit distances.
 *
 * Opacity is driven per-material rather than by toggling `visible`, so the
 * transition reads as the building opening up rather than as a pop.
 */

import type { Camera, Group, Material, Mesh, Object3D } from 'three';
import { Vector3 } from 'three';

export type WakefieldLodBand = 'region' | 'site' | 'building' | 'process';

/** Band boundaries in metres, measured camera-to-site-centre. */
const BANDS = {
  regionEnter: 220,
  regionExit: 200,
  siteEnter: 55,
  siteExit: 48,
  buildingEnter: 28,
  buildingExit: 24,
} as const;

/** Seconds for a full 0..1 opacity cross-fade. */
const FADE_SECONDS = 0.45;

interface TrackedMaterial {
  material: Material;
  baseOpacity: number;
  baseTransparent: boolean;
}

/**
 * Collect every material under a subtree exactly once, remembering its
 * original opacity so a fade can be undone rather than accumulated.
 */
function trackMaterials(root: Object3D): TrackedMaterial[] {
  const seen = new Set<Material>();
  const out: TrackedMaterial[] = [];
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of list) {
      if (seen.has(m)) continue;
      seen.add(m);
      out.push({ material: m, baseOpacity: m.opacity, baseTransparent: m.transparent });
    }
  });
  return out;
}

function applyFade(tracked: TrackedMaterial[], factor: number): void {
  for (const t of tracked) {
    if (factor >= 0.999) {
      // Restore the authored state exactly — leaving everything permanently
      // `transparent: true` would silently disable depth-write optimisations
      // and change sort order for the whole layer.
      t.material.opacity = t.baseOpacity;
      t.material.transparent = t.baseTransparent;
    } else {
      t.material.transparent = true;
      t.material.opacity = t.baseOpacity * factor;
    }
    t.material.needsUpdate = false;
  }
}

export class WakefieldLodController {
  private _interior: Group;
  private _exterior: Group;
  private _shellParts: Object3D[] = [];
  private _interiorMats: TrackedMaterial[] = [];
  private _shellMats: TrackedMaterial[] = [];
  private _centre: Vector3;

  private _band: WakefieldLodBand = 'site';
  /** 0 = shell fully open (interior visible), 1 = shell fully closed. */
  private _shellFactor = 1;
  private _target = 1;
  private _tmp = new Vector3();

  constructor(interior: Group, exterior: Group, centre: Vector3) {
    this._interior = interior;
    this._exterior = exterior;
    this._centre = centre.clone();

    for (const child of exterior.children) {
      if (child.userData?.wpfLod === 'shell') this._shellParts.push(child);
    }
    this._interiorMats = trackMaterials(interior);
    for (const part of this._shellParts) this._shellMats.push(...trackMaterials(part));
  }

  get band(): WakefieldLodBand { return this._band; }

  /** Call once per frame with the render camera and frame delta. */
  update(camera: Camera, dt: number): void {
    const dist = this._tmp.setFromMatrixPosition(camera.matrixWorld).distanceTo(this._centre);
    this._band = this._resolveBand(dist);

    // Shell closed at site/region range, open at process range, and
    // proportionally open across the building band so the fade tracks the
    // camera rather than running on a fixed timer.
    if (this._band === 'process') this._target = 0;
    else if (this._band === 'building') {
      const span = BANDS.siteEnter - BANDS.buildingExit;
      this._target = Math.min(1, Math.max(0, (dist - BANDS.buildingExit) / span));
    } else this._target = 1;

    const step = dt / FADE_SECONDS;
    if (this._shellFactor < this._target) this._shellFactor = Math.min(this._target, this._shellFactor + step);
    else if (this._shellFactor > this._target) this._shellFactor = Math.max(this._target, this._shellFactor - step);

    applyFade(this._shellMats, this._shellFactor);
    for (const part of this._shellParts) part.visible = this._shellFactor > 0.01;

    // Interior is the complement: fully on once the shell is at all open.
    const interiorFactor = 1 - this._shellFactor;
    this._interior.visible = interiorFactor > 0.01;
    if (this._interior.visible) applyFade(this._interiorMats, Math.min(1, interiorFactor * 1.6));
  }

  /** Restore every material to its authored state. */
  dispose(): void {
    applyFade(this._shellMats, 1);
    applyFade(this._interiorMats, 1);
    this._interior.visible = true;
    for (const part of this._shellParts) part.visible = true;
  }

  private _resolveBand(dist: number): WakefieldLodBand {
    // Hysteresis: only cross a boundary using the threshold for the
    // direction of travel, so sitting on a boundary cannot strobe.
    switch (this._band) {
      case 'region':
        return dist < BANDS.regionExit ? 'site' : 'region';
      case 'site':
        if (dist >= BANDS.regionEnter) return 'region';
        return dist < BANDS.siteExit ? 'building' : 'site';
      case 'building':
        if (dist >= BANDS.siteEnter) return 'site';
        return dist < BANDS.buildingExit ? 'process' : 'building';
      case 'process':
        return dist >= BANDS.buildingEnter ? 'building' : 'process';
    }
  }
}
