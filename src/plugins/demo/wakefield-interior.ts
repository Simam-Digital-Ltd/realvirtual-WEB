// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Wakefield interior — physical set dressing built from photographic reference.
 *
 * Companion to `wakefield-scene-dressing-plugin.ts`. That module draws the
 * SCHEMATIC layer (translucent zone plates, grid, floor labels) using unlit
 * MeshBasicMaterial. This module builds the PHYSICAL layer — walls, roof,
 * walkway, conveyors, cabinets, guarding, crane — in lit MeshStandardMaterial,
 * so it responds to the scene's PMREM environment and directional shadow.
 *
 * Evidence for every dimension and material is in
 * `wakefield-reference-analysis.md`. Read that before changing values here:
 * they are traceable to observations, not invented.
 *
 * Scale: measured from the running scene — the loaded GLB line is
 * 12.5 x 3.65 x 7.17 world units, so 1 unit = 1 metre.
 *
 * Brand constraint: the references include real companies. Only architectural
 * and equipment typology is taken from them; no logo, wordmark or livery is
 * reproduced. The site is our own fictional Wakefield Precision Foods.
 *
 * Every mesh is named so the assembly gate holds — the model must be
 * explodable AND clickable, and both need the same definition of "a part".
 */

import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
  type Material,
} from 'three';

/* ------------------------------------------------------------------ *
 * Hall dimensions
 *
 * Centred on the existing schematic floor (0, -1.15) so the two layers
 * register. The schematic slab is 24 x 16; the physical hall is 30 x 20,
 * which puts the walls just outside it rather than through it.
 * ------------------------------------------------------------------ */
const HALL = {
  halfWidth: 15,
  halfDepth: 10,
  centreZ: -1.15,
  /** Eaves height. Inferred 8-10 m from wall:cabinet ratio; 9 m taken. */
  height: 9,
  /** Insulated panel joint pitch, from the horizontal lines in the reference. */
  panelPitch: 1.2,
} as const;

const X0 = -HALL.halfWidth;
const X1 = HALL.halfWidth;
const Z0 = HALL.centreZ - HALL.halfDepth;
const Z1 = HALL.centreZ + HALL.halfDepth;

/* ------------------------------------------------------------------ *
 * Materials — values from reference-analysis Layer 5.
 *
 * Shared instances: a few hundred meshes referencing ~12 materials keeps
 * the draw-call count down and makes disposal a bounded list.
 * ------------------------------------------------------------------ */
function makeMaterials() {
  return {
    wallPanel: new MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.85, metalness: 0 }),
    panelJoint: new MeshStandardMaterial({ color: 0xb4babe, roughness: 0.8, metalness: 0 }),
    stainless: new MeshStandardMaterial({ color: 0x8d9296, roughness: 0.38, metalness: 1 }),
    galvanised: new MeshStandardMaterial({ color: 0x9ea4a8, roughness: 0.52, metalness: 1 }),
    steelStructure: new MeshStandardMaterial({ color: 0x6e7478, roughness: 0.6, metalness: 0.9 }),
    // The signature element. Vivid yellow-green modular belt.
    beltLime: new MeshStandardMaterial({ color: 0xb9d532, roughness: 0.6, metalness: 0 }),
    beltBlue: new MeshStandardMaterial({ color: 0x2f6fb5, roughness: 0.55, metalness: 0 }),
    safetyYellow: new MeshStandardMaterial({ color: 0xe3b019, roughness: 0.5, metalness: 0 }),
    cabinet: new MeshStandardMaterial({ color: 0xa9adb0, roughness: 0.55, metalness: 0.2 }),
    hmiScreen: new MeshStandardMaterial({
      color: 0x0d1b24, roughness: 0.25, metalness: 0,
      emissive: 0x123b4d, emissiveIntensity: 0.6,
    }),
    cardboard: new MeshStandardMaterial({ color: 0xa8815a, roughness: 0.95, metalness: 0 }),
    doorRed: new MeshStandardMaterial({ color: 0xb63a2f, roughness: 0.45, metalness: 0 }),
    // Polycarbonate guard infill. Approximated with opacity rather than
    // transmission — transmission needs a transmissive render pass and costs
    // far more than this reads as worth for background dressing.
    guardGlazing: new MeshStandardMaterial({
      color: 0xcfe0e6, roughness: 0.08, metalness: 0,
      transparent: true, opacity: 0.22, depthWrite: false,
    }),
    rooflight: new MeshStandardMaterial({
      color: 0xffffff, roughness: 1, metalness: 0,
      emissive: 0xdfeeff, emissiveIntensity: 0.85,
    }),
    highBay: new MeshStandardMaterial({
      color: 0xf2f6f8, roughness: 0.4, metalness: 0,
      emissive: 0xfff6e0, emissiveIntensity: 1.4,
    }),
    hazard: new MeshStandardMaterial({ color: 0xd8b020, roughness: 0.75, metalness: 0 }),
  };
}

type Materials = ReturnType<typeof makeMaterials>;

/** Named box helper — every part gets a name so picking and explode agree. */
function box(
  name: string, mat: Material,
  w: number, h: number, d: number,
  x: number, y: number, z: number,
): Mesh {
  const m = new Mesh(new BoxGeometry(w, h, d), mat);
  m.name = name;
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function tube(
  name: string, mat: Material,
  radius: number, length: number,
  x: number, y: number, z: number,
  axis: 'x' | 'y' | 'z' = 'y',
): Mesh {
  const m = new Mesh(new CylinderGeometry(radius, radius, length, 10), mat);
  m.name = name;
  m.position.set(x, y, z);
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  m.castShadow = true;
  return m;
}

/* ------------------------------------------------------------------ *
 * Envelope
 * ------------------------------------------------------------------ */

function hallEnvelope(M: Materials): Group {
  const g = new Group();
  g.name = 'wpf-int-envelope';
  const t = 0.15;
  const midZ = HALL.centreZ;
  const h = HALL.height;

  // Four walls. Panels face inward; the hall is only ever viewed from inside
  // or from above, so single-sided boxes are sufficient.
  g.add(box('wpf-int-wall-north', M.wallPanel, HALL.halfWidth * 2, h, t, 0, h / 2, Z0));
  g.add(box('wpf-int-wall-south', M.wallPanel, HALL.halfWidth * 2, h, t, 0, h / 2, Z1));
  g.add(box('wpf-int-wall-west', M.wallPanel, t, h, HALL.halfDepth * 2, X0, h / 2, midZ));
  g.add(box('wpf-int-wall-east', M.wallPanel, t, h, HALL.halfDepth * 2, X1, h / 2, midZ));

  // Horizontal panel joints — the regular banding that reads as insulated
  // panel rather than as a blank box. Cheap: thin boxes at a fixed pitch.
  for (let y = HALL.panelPitch; y < h; y += HALL.panelPitch) {
    g.add(box(`wpf-int-joint-n-${y.toFixed(1)}`, M.panelJoint, HALL.halfWidth * 2, 0.03, 0.02, 0, y, Z0 + t / 2));
    g.add(box(`wpf-int-joint-s-${y.toFixed(1)}`, M.panelJoint, HALL.halfWidth * 2, 0.03, 0.02, 0, y, Z1 - t / 2));
  }

  // Fire doors on the far elevation — observed as a red pair in the reference.
  for (const [i, x] of [7.5, 9.4].entries()) {
    g.add(box(`wpf-int-firedoor-${i}`, M.doorRed, 1.6, 2.4, 0.06, x, 1.2, Z0 + t / 2 + 0.02));
  }

  return g;
}

function roofStructure(M: Materials): Group {
  const g = new Group();
  g.name = 'wpf-int-roof';
  const y = HALL.height;

  // Portal frames across the short span at 3 m centres. NOT observed — the
  // reference has no view of the roof from beneath. Inferred from the span
  // and UK portal-frame convention; see analysis "What the references do not show".
  for (let x = X0 + 1.5; x <= X1 - 1.5; x += 3) {
    g.add(box(`wpf-int-truss-${x.toFixed(0)}`, M.steelStructure, 0.18, 0.5, HALL.halfDepth * 2, x, y - 0.25, HALL.centreZ));
  }

  // Longitudinal purlins tie the frames together.
  for (let z = Z0 + 2; z <= Z1 - 2; z += 4) {
    g.add(box(`wpf-int-purlin-${z.toFixed(0)}`, M.steelStructure, HALL.halfWidth * 2, 0.14, 0.14, 0, y - 0.6, z));
  }

  // Linear rooflight strips, from the aerial references — rows of dashed
  // glazing running with the roof slope. Emissive, so they read as the
  // daylight source without adding real lights to the sim scene.
  for (let z = Z0 + 3; z <= Z1 - 3; z += 5) {
    for (let x = X0 + 2; x <= X1 - 4; x += 6) {
      g.add(box(`wpf-int-rooflight-${x.toFixed(0)}-${z.toFixed(0)}`, M.rooflight, 4, 0.08, 1.1, x + 2, y - 0.05, z));
    }
  }

  return g;
}

/* ------------------------------------------------------------------ *
 * Elevated walkway — identity feature #2
 * ------------------------------------------------------------------ */

function mezzanineWalkway(M: Materials): Group {
  const g = new Group();
  g.name = 'wpf-int-walkway';
  const deckY = 3.6;
  const z = HALL.centreZ - 5.6;
  const from = X0 + 1;
  const to = X1 - 4;
  const width = 1.4;
  const len = to - from;
  const midX = (from + to) / 2;

  g.add(box('wpf-int-walkway-deck', M.galvanised, len, 0.08, width, midX, deckY, z));

  // Support posts at 3 m centres.
  for (let x = from + 1; x < to; x += 3) {
    g.add(tube(`wpf-int-walkway-post-${x.toFixed(0)}`, M.steelStructure, 0.07, deckY, x, deckY / 2, z + width / 2 - 0.1));
    g.add(tube(`wpf-int-walkway-post-b-${x.toFixed(0)}`, M.steelStructure, 0.07, deckY, x, deckY / 2, z - width / 2 + 0.1));
  }

  // Two-rail tubular handrail with toe board, both sides — the observed
  // configuration. Toe board is what stops it reading as a bare plank.
  for (const side of [-1, 1]) {
    const zs = z + side * (width / 2);
    g.add(tube(`wpf-int-rail-top-${side}`, M.galvanised, 0.028, len, midX, deckY + 1.1, zs, 'x'));
    g.add(tube(`wpf-int-rail-mid-${side}`, M.galvanised, 0.024, len, midX, deckY + 0.55, zs, 'x'));
    g.add(box(`wpf-int-toeboard-${side}`, M.galvanised, len, 0.15, 0.03, midX, deckY + 0.11, zs));
    for (let x = from + 1.5; x < to; x += 2.4) {
      g.add(tube(`wpf-int-stanchion-${side}-${x.toFixed(0)}`, M.galvanised, 0.026, 1.1, x, deckY + 0.55, zs));
    }
  }

  // Stair down to the process floor at the east end.
  const steps = 12;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    g.add(box(`wpf-int-stair-${i}`, M.galvanised, 0.28, 0.04, 1.0, to + 0.3 + i * 0.28, deckY - t * deckY + 0.1, z));
  }

  return g;
}

/* ------------------------------------------------------------------ *
 * Conveyor runs — identity feature #1
 * ------------------------------------------------------------------ */

interface ConveyorSpec {
  id: string;
  z: number;
  from: number;
  to: number;
  belt: 'lime' | 'blue';
  /** Belt top height. Observed ~0.9 m working height. */
  y?: number;
}

function conveyorRun(M: Materials, spec: ConveyorSpec): Group {
  const g = new Group();
  g.name = `wpf-int-conveyor-${spec.id}`;
  const y = spec.y ?? 0.92;
  const len = spec.to - spec.from;
  const midX = (spec.from + spec.to) / 2;
  const belt = spec.belt === 'lime' ? M.beltLime : M.beltBlue;
  const width = 0.42;

  g.add(box(`${g.name}-belt`, belt, len, 0.05, width, midX, y, spec.z));

  // Side guides — stainless rails either side of the belt.
  for (const side of [-1, 1]) {
    g.add(box(`${g.name}-guide-${side}`, M.stainless, len, 0.09, 0.03,
      midX, y + 0.07, spec.z + side * (width / 2 + 0.02)));
  }

  // Legs at 2 m centres, cross-braced.
  for (let x = spec.from + 1; x < spec.to; x += 2) {
    for (const side of [-1, 1]) {
      g.add(tube(`${g.name}-leg-${x.toFixed(0)}-${side}`, M.stainless, 0.028, y,
        x, y / 2, spec.z + side * (width / 2 - 0.02)));
    }
    g.add(box(`${g.name}-brace-${x.toFixed(0)}`, M.stainless, 0.05, 0.04, width, x, y * 0.35, spec.z));
  }

  // Drive motor / gearbox at the discharge end — observed at conveyor ends.
  g.add(box(`${g.name}-drive`, M.steelStructure, 0.34, 0.28, 0.3, spec.to - 0.2, y - 0.22, spec.z));
  // End roller.
  g.add(tube(`${g.name}-roller`, M.stainless, 0.06, width, spec.to, y, spec.z, 'z'));

  return g;
}

/* ------------------------------------------------------------------ *
 * Control cabinets — identity feature #3
 * ------------------------------------------------------------------ */

function cabinetRow(M: Materials): Group {
  const g = new Group();
  g.name = 'wpf-int-cabinet-row';
  const z = Z0 + 0.6;
  const h = 2.0;
  const w = 0.9;

  for (let i = 0; i < 9; i++) {
    const x = X0 + 1.4 + i * (w + 0.04);
    g.add(box(`wpf-int-cabinet-${i}`, M.cabinet, w, h, 0.55, x, h / 2 + 0.1, z));
    // Plinth.
    g.add(box(`wpf-int-cabinet-plinth-${i}`, M.steelStructure, w, 0.1, 0.55, x, 0.05, z));
    // HMI panel on every third door — matches the observed spacing.
    if (i % 3 === 1) {
      g.add(box(`wpf-int-cabinet-hmi-${i}`, M.hmiScreen, 0.3, 0.22, 0.03, x, 1.5, z + 0.29));
    }
    // Hazard label plate.
    g.add(box(`wpf-int-cabinet-label-${i}`, M.hazard, 0.16, 0.11, 0.02, x + 0.28, 1.82, z + 0.29));
  }

  return g;
}

/* ------------------------------------------------------------------ *
 * Guarded cell — identity feature #4
 * ------------------------------------------------------------------ */

function guardEnclosure(M: Materials, id: string, x0: number, z0: number, x1: number, z1: number): Group {
  const g = new Group();
  g.name = `wpf-int-guard-${id}`;
  const h = 2.1;
  const posts: Array<[number, number]> = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

  for (const [i, [px, pz]] of posts.entries()) {
    g.add(box(`${g.name}-post-${i}`, M.stainless, 0.06, h, 0.06, px, h / 2, pz));
  }

  // Infill panels on three sides; the fourth is the access opening.
  const runs: Array<[number, number, number, number, string]> = [
    [x0, z0, x1, z0, 'n'],
    [x1, z0, x1, z1, 'e'],
    [x0, z1, x1, z1, 's'],
  ];
  for (const [ax, az, bx, bz, tag] of runs) {
    const len = Math.hypot(bx - ax, bz - az);
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    const vertical = Math.abs(bz - az) > Math.abs(bx - ax);
    const panel = new Mesh(
      new BoxGeometry(vertical ? 0.02 : len, h - 0.25, vertical ? len : 0.02),
      M.guardGlazing,
    );
    panel.name = `${g.name}-panel-${tag}`;
    panel.position.set(mx, h / 2, mz);
    g.add(panel);
    // Top rail caps the glazing — without it the panels read as floating sheets.
    g.add(box(`${g.name}-rail-${tag}`, M.stainless,
      vertical ? 0.05 : len, 0.05, vertical ? len : 0.05, mx, h, mz));
  }

  return g;
}

/* ------------------------------------------------------------------ *
 * Pillar jib crane — identity feature #5
 * ------------------------------------------------------------------ */

function jibCrane(M: Materials, x: number, z: number): Group {
  const g = new Group();
  g.name = 'wpf-int-jib-crane';
  const colH = 4.0;
  const reach = 3.2;

  g.add(box('wpf-int-jib-base', M.steelStructure, 0.8, 0.12, 0.8, x, 0.06, z));
  g.add(tube('wpf-int-jib-column', M.safetyYellow, 0.14, colH, x, colH / 2, z));
  // Boom, swung 35 deg off the hall axis so it does not read as axis-aligned.
  const angle = -Math.PI / 5;
  const boom = box('wpf-int-jib-boom', M.safetyYellow, reach, 0.22, 0.16,
    x + Math.cos(angle) * reach / 2, colH - 0.35, z + Math.sin(angle) * reach / 2);
  boom.rotation.y = -angle;
  g.add(boom);
  // Tie rod back to the column head.
  const tie = box('wpf-int-jib-tie', M.steelStructure, reach * 0.75, 0.05, 0.05,
    x + Math.cos(angle) * reach * 0.38, colH - 0.02, z + Math.sin(angle) * reach * 0.38);
  tie.rotation.y = -angle;
  tie.rotation.z = 0.16;
  g.add(tie);
  // Hoist block hanging from the boom tip.
  const hx = x + Math.cos(angle) * reach * 0.82;
  const hz = z + Math.sin(angle) * reach * 0.82;
  g.add(box('wpf-int-jib-hoist', M.steelStructure, 0.22, 0.3, 0.22, hx, colH - 0.7, hz));
  const hook = new Mesh(new TorusGeometry(0.08, 0.02, 6, 12), M.steelStructure);
  hook.name = 'wpf-int-jib-hook';
  hook.position.set(hx, colH - 1.05, hz);
  g.add(hook);

  return g;
}

/* ------------------------------------------------------------------ *
 * Lighting, palletised goods, floor markings
 * ------------------------------------------------------------------ */

function highBayLights(M: Materials): Group {
  const g = new Group();
  g.name = 'wpf-int-high-bay';
  for (let x = X0 + 4; x <= X1 - 4; x += 5.5) {
    for (let z = Z0 + 4; z <= Z1 - 3; z += 5) {
      g.add(box(`wpf-int-luminaire-${x.toFixed(0)}-${z.toFixed(0)}`, M.highBay, 1.5, 0.1, 0.22, x, HALL.height - 1.4, z));
      g.add(tube(`wpf-int-luminaire-drop-${x.toFixed(0)}-${z.toFixed(0)}`, M.steelStructure, 0.015, 0.7, x, HALL.height - 0.95, z));
    }
  }
  return g;
}

function palletStack(M: Materials, id: string, x: number, z: number, tiers: number): Group {
  const g = new Group();
  g.name = `wpf-int-stack-${id}`;
  g.add(box(`${g.name}-pallet`, M.cardboard, 1.2, 0.14, 1.0, x, 0.07, z));
  for (let i = 0; i < tiers; i++) {
    const y = 0.14 + 0.42 * i + 0.21;
    // Alternate the case orientation per tier, as a real interlocked stack does.
    const flip = i % 2 === 1;
    g.add(box(`${g.name}-case-${i}`, M.cardboard, flip ? 1.0 : 1.14, 0.4, flip ? 1.14 : 0.96, x, y, z));
  }
  return g;
}

function hazardMarkings(M: Materials): Group {
  const g = new Group();
  g.name = 'wpf-int-hazard';
  // Walkway edging along the main process aisle.
  for (const z of [HALL.centreZ - 3.9, HALL.centreZ + 3.9]) {
    for (let x = X0 + 2; x <= X1 - 2; x += 0.8) {
      g.add(box(`wpf-int-hazard-${x.toFixed(0)}-${z.toFixed(0)}`, M.hazard, 0.45, 0.008, 0.12, x, 0.006, z));
    }
  }
  return g;
}

/* ------------------------------------------------------------------ *
 * Assembly
 * ------------------------------------------------------------------ */

/**
 * Build the whole physical interior.
 * Returns a single group; caller owns adding it to the scene and calling
 * `disposeWakefieldInterior` on teardown.
 */
/**
 * Transparent materials cast FULLY OPAQUE shadows in three.js unless given a
 * custom depth material. Leaving `castShadow` on the glazing produced large
 * black parallelograms across the floor and the schematic zone plates.
 *
 * Wafer-thin decorative geometry (panel joints, hazard tape, rooflights) is
 * stripped too: it contributes nothing readable to the shadow map and thin
 * casters are the classic source of shadow acne.
 */
function pruneShadowCasters(root: Group): void {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const transparent = mats.some((m) => (m as MeshStandardMaterial)?.transparent);
    if (transparent) { mesh.castShadow = false; return; }
    const p = mesh.geometry?.attributes?.position;
    if (!p) return;
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    if (!bb) return;
    const thinnest = Math.min(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
    if (thinnest < 0.06) mesh.castShadow = false;
  });
}

export function createWakefieldInterior(): Group {
  const root = new Group();
  root.name = 'wpf-interior';
  const M = makeMaterials();
  // Disposal is the host plugin's job: WakefieldSceneDressingPlugin._clear
  // traverses the whole dressing group and disposes geometry + materials.
  // Three.js dispose() is safe to call more than once, so the shared material
  // instances here are handled correctly by that single path.

  root.add(hallEnvelope(M));
  root.add(roofStructure(M));
  root.add(mezzanineWalkway(M));
  root.add(cabinetRow(M));
  root.add(highBayLights(M));
  root.add(hazardMarkings(M));

  // Conveyor runs. Three lime runs at 1.2 m lateral pitch is the observed
  // arrangement; the blue run sits on the opposite side of the aisle.
  const runs: ConveyorSpec[] = [
    { id: 'lime-1', z: HALL.centreZ + 5.0, from: X0 + 2, to: X1 - 3, belt: 'lime' },
    { id: 'lime-2', z: HALL.centreZ + 6.2, from: X0 + 2, to: X1 - 3, belt: 'lime' },
    { id: 'lime-3', z: HALL.centreZ + 7.4, from: X0 + 4, to: X1 - 3, belt: 'lime' },
    { id: 'blue-1', z: HALL.centreZ - 7.4, from: X0 + 3, to: X1 - 6, belt: 'blue', y: 0.78 },
  ];
  for (const spec of runs) root.add(conveyorRun(M, spec));

  // Guarded cells flanking the machine line, clear of the GLB footprint
  // (measured 12.5 x 7.17 centred near origin).
  root.add(guardEnclosure(M, 'palletiser', X0 + 1.8, HALL.centreZ + 1.4, X0 + 5.4, HALL.centreZ + 4.2));
  root.add(guardEnclosure(M, 'case-packer', X1 - 6.2, HALL.centreZ + 1.6, X1 - 2.4, HALL.centreZ + 4.4));

  root.add(jibCrane(M, X1 - 4.6, HALL.centreZ - 3.4));

  root.add(palletStack(M, 'a', X0 + 2.2, HALL.centreZ + 8.6, 3));
  root.add(palletStack(M, 'b', X0 + 3.7, HALL.centreZ + 8.6, 4));
  root.add(palletStack(M, 'c', X0 + 5.2, HALL.centreZ + 8.6, 2));
  root.add(palletStack(M, 'd', X1 - 3.0, HALL.centreZ + 8.4, 3));

  pruneShadowCasters(root);
  return root;
}

