// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Low-poly articulated HGV for the outbound fleet.
 *
 * Matches the exterior's budget and language: flat colours, no textures, every
 * mesh named so the tractor unit and trailer stay inspectable in the hierarchy
 * browser like the rest of the dressing.
 *
 * Built facing +Z, because `sampleRoute` returns a heading as
 * `atan2(dx, dz)` — the two have to agree on which way is forward or every
 * lorry on site drives sideways.
 *
 * BRAND CONSTRAINT (same as wakefield-exterior): the site references show
 * real operators. Trailers here are plain white with no livery, wordmark or
 * corporate colour.
 *
 * The load bar on the trailer flank is the one deliberate piece of fiction —
 * a real trailer does not display its fill level. It is there because the
 * whole point of this fleet is to make "cases packed" visible as "a lorry
 * filling up", and a viewer 60 m away cannot read a number panel.
 */

import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Material,
} from 'three';

/** Shared materials — one set per fleet, not per lorry. */
export function makeFleetMaterials() {
  return {
    cab: new MeshStandardMaterial({ color: 0x2f4d66, roughness: 0.5, metalness: 0.35 }),
    trailer: new MeshStandardMaterial({ color: 0xe4e7e9, roughness: 0.7, metalness: 0.05 }),
    chassis: new MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.8, metalness: 0.3 }),
    tyre: new MeshStandardMaterial({ color: 0x1c1e20, roughness: 0.95, metalness: 0 }),
    glass: new MeshStandardMaterial({ color: 0x243038, roughness: 0.15, metalness: 0.4 }),
    /** Fill indicator — emissive so it reads at distance without a light on it. */
    load: new MeshStandardMaterial({
      color: 0x17d0d8, roughness: 0.4, metalness: 0,
      emissive: 0x0e6f74, emissiveIntensity: 0.9,
    }),
  };
}
export type FleetMaterials = ReturnType<typeof makeFleetMaterials>;

function box(
  name: string, mat: Material, w: number, h: number, d: number, x: number, y: number, z: number,
): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), mat);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function wheel(name: string, mat: Material, x: number, z: number): Mesh {
  const mesh = new Mesh(new CylinderGeometry(0.52, 0.52, 0.34, 10), mat);
  mesh.name = name;
  // Cylinders stand up the Y axis by default; a wheel spins about X.
  mesh.rotation.z = Math.PI / 2;
  mesh.position.set(x, 0.52, z);
  mesh.castShadow = true;
  return mesh;
}

/** Trailer length, exported so the fleet plugin can offset the follow camera. */
export const HGV_LENGTH = 15.5;

/**
 * Build one articulated lorry.
 *
 * Returns the group plus a direct handle to the load bar, so per-frame fill
 * updates do not have to search the subtree by name every tick.
 */
export function createHgv(id: string, M: FleetMaterials): { group: Group; loadBar: Mesh } {
  const group = new Group();
  group.name = `wpf-fleet-${id}`;

  // --- Tractor unit, at the front (+Z) ---
  group.add(box(`wpf-fleet-${id}-cab`, M.cab, 2.5, 2.5, 5.4, 0, 1.85, 5.1));
  group.add(box(`wpf-fleet-${id}-windscreen`, M.glass, 2.2, 1.05, 0.16, 0, 2.55, 7.72));
  group.add(box(`wpf-fleet-${id}-tractor-chassis`, M.chassis, 2.3, 0.5, 5.6, 0, 0.75, 5.0));
  group.add(wheel(`wpf-fleet-${id}-wheel-fl`, M.tyre, -1.15, 6.6));
  group.add(wheel(`wpf-fleet-${id}-wheel-fr`, M.tyre, 1.15, 6.6));
  group.add(wheel(`wpf-fleet-${id}-wheel-ml`, M.tyre, -1.15, 3.5));
  group.add(wheel(`wpf-fleet-${id}-wheel-mr`, M.tyre, 1.15, 3.5));

  // --- Trailer, behind (-Z) ---
  group.add(box(`wpf-fleet-${id}-trailer`, M.trailer, 2.55, 3.1, 9.6, 0, 2.55, -2.6));
  group.add(box(`wpf-fleet-${id}-trailer-chassis`, M.chassis, 2.3, 0.35, 9.6, 0, 0.9, -2.6));
  group.add(wheel(`wpf-fleet-${id}-wheel-rl`, M.tyre, -1.15, -6.2));
  group.add(wheel(`wpf-fleet-${id}-wheel-rr`, M.tyre, 1.15, -6.2));
  group.add(wheel(`wpf-fleet-${id}-wheel-r2l`, M.tyre, -1.15, -4.9));
  group.add(wheel(`wpf-fleet-${id}-wheel-r2r`, M.tyre, 1.15, -4.9));

  // --- Load bar on the nearside flank ---
  // Anchored at its -Z end so scaling it along Z fills from the front of the
  // trailer backwards, rather than growing out of the middle.
  const loadBar = new Mesh(new BoxGeometry(0.12, 0.38, 9.0), M.load);
  loadBar.name = `wpf-fleet-${id}-load-bar`;
  loadBar.geometry.translate(0, 0, 4.5);
  loadBar.position.set(-1.33, 1.5, -7.1);
  loadBar.scale.z = 0.001; // empty
  group.add(loadBar);

  return { group, loadBar };
}

/** Set the fill bar from a 0..1 ratio. */
export function setHgvLoad(loadBar: Mesh, ratio: number): void {
  loadBar.scale.z = Math.max(0.001, Math.min(1, ratio));
}
