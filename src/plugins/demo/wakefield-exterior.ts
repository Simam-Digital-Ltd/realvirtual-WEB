// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Wakefield exterior — low-poly site and estate context.
 *
 * Third layer of the Wakefield dressing, after the schematic overlay
 * (`wakefield-scene-dressing-plugin.ts`) and the physical interior
 * (`wakefield-interior.ts`).
 *
 * Built from the three aerial references. Observed typology, in the order it
 * carries recognition:
 *   1. Portal-frame shed, hipped roof, rows of DASHED linear rooflights —
 *      the strongest cue that this is a UK industrial estate and not a
 *      generic warehouse block.
 *   2. Two-storey brick office block with contrasting trim, pitched entrance
 *      canopy, bolted onto one corner of the shed.
 *   3. Dock elevation: doors at regular pitch with levellers and canopies,
 *      trailers stood off them.
 *   4. Concrete hardstanding, marked parking bays, mixed car/van fleet.
 *   5. Perimeter: palisade fence, hedgerow, scattered trees, fields beyond.
 *   6. Neighbouring units, one of them red-clad; a lattice pylon with lines.
 *
 * Brand constraint: the aerials show real operators (Stapletons, Eddie
 * Stobart). Only building and yard typology is taken. No livery, wordmark or
 * corporate colour is reproduced — trailers here are plain, in a neutral
 * fleet palette.
 *
 * Everything is deliberately low-poly: this is context seen from distance,
 * and it must not compete with the machine line for triangles. All
 * randomness is seeded so the site is identical on every load — an unseeded
 * layout would move the cars every reload and read as a bug.
 */

import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  type Material,
} from 'three';

/** Site centre, matching the interior hall so the two layers register. */
const SITE_Z = -1.15;
/** Our building footprint — identical to HALL in wakefield-interior.ts. */
const BLD = { halfW: 15, halfD: 10, eaves: 9, ridge: 11.5 } as const;

/**
 * Deterministic PRNG (mulberry32). Seeded so the yard layout is stable
 * across reloads — see the module note.
 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeMaterials() {
  return {
    tarmac: new MeshStandardMaterial({ color: 0x3e4246, roughness: 0.95, metalness: 0 }),
    concrete: new MeshStandardMaterial({ color: 0x8a8d8b, roughness: 0.92, metalness: 0 }),
    grass: new MeshStandardMaterial({ color: 0x5c7f42, roughness: 1, metalness: 0 }),
    field: new MeshStandardMaterial({ color: 0x6d9048, roughness: 1, metalness: 0 }),
    lineWhite: new MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.9, metalness: 0 }),
    // Profiled metal cladding, grey-silver, from the aerials.
    cladding: new MeshStandardMaterial({ color: 0xa7aeb2, roughness: 0.6, metalness: 0.55 }),
    claddingRed: new MeshStandardMaterial({ color: 0xb03a2a, roughness: 0.6, metalness: 0.4 }),
    claddingBlue: new MeshStandardMaterial({ color: 0x5d7f9c, roughness: 0.6, metalness: 0.45 }),
    roofDeck: new MeshStandardMaterial({ color: 0x9aa0a3, roughness: 0.75, metalness: 0.4 }),
    // Rooflight strips read brighter than the deck — the dashed pattern is
    // the single most recognisable feature of these roofs from above.
    rooflight: new MeshStandardMaterial({
      color: 0xd8e4ea, roughness: 0.35, metalness: 0,
      emissive: 0x2e4450, emissiveIntensity: 0.35,
    }),
    brick: new MeshStandardMaterial({ color: 0x8d5a44, roughness: 0.92, metalness: 0 }),
    trim: new MeshStandardMaterial({ color: 0x2f4d66, roughness: 0.6, metalness: 0.2 }),
    glazing: new MeshStandardMaterial({
      color: 0x9fc4d6, roughness: 0.12, metalness: 0.1,
      transparent: true, opacity: 0.55,
    }),
    dockDoor: new MeshStandardMaterial({ color: 0x6c7377, roughness: 0.7, metalness: 0.3 }),
    trailer: new MeshStandardMaterial({ color: 0xdfe2e4, roughness: 0.65, metalness: 0.1 }),
    tyre: new MeshStandardMaterial({ color: 0x1c1e20, roughness: 0.95, metalness: 0 }),
    glassCar: new MeshStandardMaterial({ color: 0x263238, roughness: 0.2, metalness: 0.3 }),
    trunk: new MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95, metalness: 0 }),
    canopyA: new MeshStandardMaterial({ color: 0x4a7a38, roughness: 1, metalness: 0, flatShading: true }),
    canopyB: new MeshStandardMaterial({ color: 0x3f6b32, roughness: 1, metalness: 0, flatShading: true }),
    hedge: new MeshStandardMaterial({ color: 0x40632f, roughness: 1, metalness: 0, flatShading: true }),
    fence: new MeshStandardMaterial({ color: 0x4a5257, roughness: 0.7, metalness: 0.6 }),
    pylon: new MeshStandardMaterial({ color: 0x767c80, roughness: 0.7, metalness: 0.7 }),
  };
}
type Materials = ReturnType<typeof makeMaterials>;

/** Fleet palette — deliberately mundane. A yard of bright cars reads as a toy. */
const CAR_COLOURS = [0xd8dadc, 0x2f3438, 0x8c9296, 0x1d3f6e, 0x7a1f24, 0xe8e9ea, 0x35506b];

function box(name: string, mat: Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0): Mesh {
  const m = new Mesh(new BoxGeometry(w, h, d), mat);
  m.name = name;
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function plane(name: string, mat: Material, w: number, d: number, x: number, y: number, z: number): Mesh {
  const m = new Mesh(new PlaneGeometry(w, d), mat);
  m.name = name;
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}

/* ------------------------------------------------------------------ *
 * Ground
 * ------------------------------------------------------------------ */

function ground(M: Materials): Group {
  const g = new Group();
  g.name = 'wpf-ext-ground';

  // Fields beyond the estate — the aerials are ringed by open farmland, and
  // without it the estate reads as floating in a void.
  g.add(plane('wpf-ext-fields', M.field, 400, 400, 0, -0.06, SITE_Z));
  // Estate hardstanding.
  g.add(plane('wpf-ext-hardstanding', M.concrete, 180, 130, 0, -0.03, SITE_Z));
  // Service road ring.
  g.add(plane('wpf-ext-road-n', M.tarmac, 180, 9, 0, -0.01, SITE_Z - 52));
  g.add(plane('wpf-ext-road-e', M.tarmac, 9, 130, 78, -0.01, SITE_Z));
  g.add(plane('wpf-ext-road-approach', M.tarmac, 9, 46, 26, -0.01, SITE_Z + 34));

  // Road centre dashes.
  for (let x = -84; x <= 84; x += 7) {
    g.add(box(`wpf-ext-roadmark-${x}`, M.lineWhite, 3, 0.02, 0.24, x, 0.005, SITE_Z - 52));
  }

  // Grass verges.
  g.add(plane('wpf-ext-verge-n', M.grass, 180, 14, 0, -0.02, SITE_Z - 62));
  return g;
}

/* ------------------------------------------------------------------ *
 * Our building — shell, roof, dock elevation, office
 * ------------------------------------------------------------------ */

function buildingShell(M: Materials): Group {
  const g = new Group();
  g.name = 'wpf-ext-shell';
  const { halfW, halfD, eaves } = BLD;

  // Clad walls, sat just outside the interior walls so the two never z-fight.
  const t = 0.3;
  g.add(box('wpf-ext-clad-n', M.cladding, halfW * 2 + t, eaves, t, 0, eaves / 2, SITE_Z - halfD - t / 2));
  g.add(box('wpf-ext-clad-s', M.cladding, halfW * 2 + t, eaves, t, 0, eaves / 2, SITE_Z + halfD + t / 2));
  g.add(box('wpf-ext-clad-w', M.cladding, t, eaves, halfD * 2, -halfW - t / 2, eaves / 2, SITE_Z));
  g.add(box('wpf-ext-clad-e', M.cladding, t, eaves, halfD * 2, halfW + t / 2, eaves / 2, SITE_Z));

  // Brick plinth — the aerials show brick to about 2 m before the cladding starts.
  g.add(box('wpf-ext-plinth-n', M.brick, halfW * 2 + t, 2, t + 0.06, 0, 1, SITE_Z - halfD - t / 2));
  g.add(box('wpf-ext-plinth-s', M.brick, halfW * 2 + t, 2, t + 0.06, 0, 1, SITE_Z + halfD + t / 2));

  return g;
}

function roof(M: Materials): Group {
  const g = new Group();
  g.name = 'wpf-ext-roof';
  const { halfW, halfD, eaves } = BLD;

  // Shallow hipped deck, approximated as a slab. A true hip needs custom
  // geometry; at the distance this layer is read from, the slab plus the
  // rooflight pattern carries the recognition and the hip does not.
  g.add(box('wpf-ext-roof-deck', M.roofDeck, halfW * 2 + 0.8, 0.35, halfD * 2 + 0.8, 0, eaves + 0.18, SITE_Z));

  // Dashed linear rooflights in rows — identity feature #1 from the aerials.
  let n = 0;
  for (let z = SITE_Z - halfD + 2.2; z <= SITE_Z + halfD - 2.2; z += 3.1) {
    for (let x = -halfW + 2; x <= halfW - 3.4; x += 4.6) {
      g.add(box(`wpf-ext-rooflight-${n++}`, M.rooflight, 3.2, 0.08, 0.9, x + 1.6, eaves + 0.38, z));
    }
  }

  // Roof-mounted plant — the aerials show units clustered near one end.
  g.add(box('wpf-ext-roof-plant-1', M.cladding, 3.2, 1.1, 2.4, -9, eaves + 0.9, SITE_Z + 6));
  g.add(box('wpf-ext-roof-plant-2', M.cladding, 2.4, 0.9, 2.0, -5.2, eaves + 0.8, SITE_Z + 6.4));
  return g;
}

function dockElevation(M: Materials): Group {
  const g = new Group();
  g.name = 'wpf-ext-dock';
  const z = SITE_Z + BLD.halfD + 0.5;

  // Doors at regular pitch with a canopy over each — observed configuration.
  for (let i = 0; i < 6; i++) {
    const x = -11 + i * 4.2;
    g.add(box(`wpf-ext-dock-door-${i}`, M.dockDoor, 3.0, 3.8, 0.18, x, 1.9, z));
    g.add(box(`wpf-ext-dock-canopy-${i}`, M.cladding, 3.6, 0.16, 1.5, x, 4.1, z + 0.7));
    // Leveller lip at floor level.
    g.add(box(`wpf-ext-dock-leveller-${i}`, M.concrete, 3.0, 0.12, 1.1, x, 0.06, z + 0.75));
  }
  return g;
}

function officeBlock(M: Materials): Group {
  const g = new Group();
  g.name = 'wpf-ext-office';
  // Two storeys, bolted to the east corner as in the aerials.
  const x = BLD.halfW + 6.5;
  const z = SITE_Z + 4.5;
  const w = 13, d = 9, h = 7.2;

  g.add(box('wpf-ext-office-body', M.brick, w, h, d, x, h / 2, z));
  g.add(box('wpf-ext-office-roof', M.trim, w + 0.6, 0.4, d + 0.6, x, h + 0.2, z));

  // Window bands, both floors, all four visible elevations.
  for (const [f, y] of [[0, 2.0], [1, 5.0]] as const) {
    g.add(box(`wpf-ext-office-glz-s-${f}`, M.glazing, w - 1.6, 1.5, 0.1, x, y, z + d / 2 + 0.05));
    g.add(box(`wpf-ext-office-glz-e-${f}`, M.glazing, 0.1, 1.5, d - 1.6, x + w / 2 + 0.05, y, z));
    g.add(box(`wpf-ext-office-band-s-${f}`, M.trim, w - 1.4, 0.18, 0.12, x, y + 0.9, z + d / 2 + 0.06));
  }

  // Pitched entrance canopy.
  g.add(box('wpf-ext-office-canopy', M.trim, 5.4, 0.3, 2.4, x, 3.3, z + d / 2 + 1.2));
  g.add(box('wpf-ext-office-entrance', M.glazing, 3.2, 2.6, 0.12, x, 1.3, z + d / 2 + 0.06));
  return g;
}

/* ------------------------------------------------------------------ *
 * Yard population
 * ------------------------------------------------------------------ */

function car(M: Materials, name: string, x: number, z: number, ry: number, colour: number, isVan: boolean): Group {
  const g = new Group();
  g.name = name;
  const body = new MeshStandardMaterial({ color: colour, roughness: 0.45, metalness: 0.25 });
  const len = isVan ? 5.2 : 4.3;
  const wid = isVan ? 2.0 : 1.8;

  g.add(box(`${name}-body`, body, len, isVan ? 1.5 : 0.85, wid, x, isVan ? 1.05 : 0.62, z, ry));
  if (isVan) {
    // Van: cab lower than the box body.
    g.add(box(`${name}-cab`, body, 1.5, 1.0, wid - 0.1, x + Math.cos(ry) * (len / 2 - 0.6), 0.75, z - Math.sin(ry) * (len / 2 - 0.6), ry));
  } else {
    g.add(box(`${name}-cabin`, M.glassCar, len * 0.48, 0.62, wid - 0.22, x, 1.32, z, ry));
  }
  // Two wheel blocks rather than four cylinders — this is distance geometry.
  for (const s of [-1, 1]) {
    g.add(box(`${name}-wheels-${s}`, M.tyre, len * 0.7, 0.34, 0.22,
      x - Math.sin(ry) * s * (wid / 2), 0.17, z - Math.cos(ry) * s * (wid / 2), ry));
  }
  return g;
}

function trailer(M: Materials, name: string, x: number, z: number, ry: number): Group {
  const g = new Group();
  g.name = name;
  g.add(box(`${name}-box`, M.trailer, 13.6, 3.0, 2.6, x, 2.3, z, ry));
  g.add(box(`${name}-chassis`, M.tyre, 13.6, 0.25, 2.2, x, 0.75, z, ry));
  for (const off of [-4.6, 4.2, 5.2]) {
    g.add(box(`${name}-axle-${off}`, M.tyre, 0.6, 0.9, 2.5,
      x + Math.cos(ry) * off, 0.45, z - Math.sin(ry) * off, ry));
  }
  // Landing legs.
  g.add(box(`${name}-legs`, M.fence, 0.3, 0.9, 2.2, x - Math.cos(ry) * 4.0, 0.45, z + Math.sin(ry) * 4.0, ry));
  return g;
}

function tree(M: Materials, name: string, x: number, z: number, scale: number, alt: boolean): Group {
  const g = new Group();
  g.name = name;
  const h = 3.2 * scale;
  const trunk = new Mesh(new CylinderGeometry(0.16 * scale, 0.22 * scale, h, 6), M.trunk);
  trunk.name = `${name}-trunk`;
  trunk.position.set(x, h / 2, z);
  trunk.castShadow = true;
  g.add(trunk);

  // Two offset icosahedra read as a canopy far more cheaply than a sphere,
  // and flatShading keeps the low-poly facets legible.
  const c1 = new Mesh(new IcosahedronGeometry(1.5 * scale, 0), alt ? M.canopyB : M.canopyA);
  c1.name = `${name}-canopy-1`;
  c1.position.set(x, h + 0.7 * scale, z);
  c1.castShadow = true;
  g.add(c1);
  const c2 = new Mesh(new IcosahedronGeometry(1.05 * scale, 0), alt ? M.canopyA : M.canopyB);
  c2.name = `${name}-canopy-2`;
  c2.position.set(x + 0.7 * scale, h + 1.5 * scale, z - 0.5 * scale);
  c2.castShadow = true;
  g.add(c2);
  return g;
}

function yard(M: Materials): Group {
  const g = new Group();
  g.name = 'wpf-ext-yard';
  const rand = rng(0x5147a1); // fixed seed — see module note

  // Marked parking bays plus their cars, east of the office.
  const bayX = BLD.halfW + 16;
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 11; i++) {
      const z = SITE_Z - 12 + i * 2.6;
      const x = bayX + row * 12;
      g.add(box(`wpf-ext-bay-${row}-${i}`, M.lineWhite, 5.0, 0.02, 0.12, x, 0.01, z + 1.3));
      // Leave roughly one bay in four empty — a full car park reads as staged.
      if (rand() > 0.26) {
        const colour = CAR_COLOURS[Math.floor(rand() * CAR_COLOURS.length)];
        g.add(car(M, `wpf-ext-car-${row}-${i}`, x, z, 0, colour, rand() > 0.78));
      }
    }
  }

  // Trailers stood off the dock doors.
  for (let i = 0; i < 4; i++) {
    g.add(trailer(M, `wpf-ext-trailer-${i}`, -11 + i * 4.2 + 0.2, SITE_Z + BLD.halfD + 9.5, Math.PI / 2));
  }
  // Trailers parked up on the far side of the yard.
  for (let i = 0; i < 5; i++) {
    g.add(trailer(M, `wpf-ext-trailer-park-${i}`, -46, SITE_Z - 16 + i * 4.0, 0));
  }

  // Perimeter trees and hedge.
  for (let i = 0; i < 16; i++) {
    const t = i / 16;
    g.add(tree(M, `wpf-ext-tree-n-${i}`, -78 + t * 156, SITE_Z - 44 + rand() * 3, 0.8 + rand() * 0.6, i % 2 === 0));
  }
  for (let i = 0; i < 10; i++) {
    const t = i / 10;
    g.add(tree(M, `wpf-ext-tree-e-${i}`, 66 + rand() * 4, SITE_Z - 40 + t * 84, 0.75 + rand() * 0.5, i % 3 === 0));
  }
  for (let x = -70; x <= 70; x += 4) {
    const hedge = new Mesh(new BoxGeometry(4, 1.6, 1.8), M.hedge);
    hedge.name = `wpf-ext-hedge-${x}`;
    hedge.position.set(x, 0.8, SITE_Z + 46);
    hedge.castShadow = true;
    g.add(hedge);
  }

  // Palisade fence along the approach.
  for (let x = -70; x <= 70; x += 2.4) {
    g.add(box(`wpf-ext-fence-${x}`, M.fence, 0.08, 2.2, 0.08, x, 1.1, SITE_Z - 40));
  }
  g.add(box('wpf-ext-fence-rail', M.fence, 140, 0.08, 0.06, 0, 2.0, SITE_Z - 40));

  return g;
}

/** Neighbouring units — the estate context, incl. the red-clad unit observed. */
function neighbours(M: Materials): Group {
  const g = new Group();
  g.name = 'wpf-ext-neighbours';
  const units: Array<[string, number, number, number, number, number, Material]> = [
    ['n-west',   -52,  SITE_Z - 6,  30, 8.5, 22, M.cladding],
    ['n-red',     46,  SITE_Z - 26, 34, 9.5, 20, M.claddingRed],
    ['n-blue',   -34,  SITE_Z + 34, 26, 7.5, 18, M.claddingBlue],
    ['n-far-1',  -66,  SITE_Z - 34, 24, 8.0, 16, M.cladding],
    ['n-far-2',   14,  SITE_Z - 40, 40, 8.5, 18, M.cladding],
  ];
  for (const [id, x, z, w, h, d, mat] of units) {
    g.add(box(`wpf-ext-unit-${id}`, mat, w, h, d, x, h / 2, z));
    g.add(box(`wpf-ext-unit-${id}-roof`, M.roofDeck, w + 0.5, 0.3, d + 0.5, x, h + 0.15, z));
    // Same dashed rooflight signature at lower density.
    for (let rx = -w / 2 + 3; rx < w / 2 - 3; rx += 5) {
      for (let rz = -d / 2 + 3; rz < d / 2 - 3; rz += 5) {
        g.add(box(`wpf-ext-unit-${id}-rl-${rx.toFixed(0)}-${rz.toFixed(0)}`, M.rooflight, 3, 0.06, 0.7, x + rx, h + 0.32, z + rz));
      }
    }
  }

  // Lattice pylon with catenary lines — present in two of the three aerials.
  const px = -74, pz = SITE_Z + 18;
  for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [1.4, 1.4], [-1.4, 1.4]]) {
    const leg = new Mesh(new CylinderGeometry(0.12, 0.2, 22, 5), M.pylon);
    leg.name = `wpf-ext-pylon-leg-${dx}-${dz}`;
    leg.position.set(px + dx, 11, pz + dz);
    leg.rotation.z = -dx * 0.03;
    leg.rotation.x = dz * 0.03;
    g.add(leg);
  }
  for (const y of [14, 18, 21.4]) {
    g.add(box(`wpf-ext-pylon-arm-${y}`, M.pylon, 9, 0.18, 0.18, px, y, pz));
  }
  return g;
}

/* ------------------------------------------------------------------ *
 * Assembly
 * ------------------------------------------------------------------ */

/**
 * Build the exterior.
 *
 * Returns a group whose children are tagged for the LOD controller:
 * `userData.wpfLod` is `'shell'` for the parts that must disappear when the
 * camera goes inside (roof, cladding) and `'context'` for everything that
 * stays visible at every range.
 */
export function createWakefieldExterior(): Group {
  const root = new Group();
  root.name = 'wpf-exterior';
  const M = makeMaterials();

  const shell = buildingShell(M);
  const rf = roof(M);
  shell.userData.wpfLod = 'shell';
  rf.userData.wpfLod = 'shell';

  for (const part of [ground(M), neighbours(M), yard(M), dockElevation(M), officeBlock(M)]) {
    part.userData.wpfLod = 'context';
    root.add(part);
  }
  root.add(shell);
  root.add(rf);

  // Same rule as the interior: a transparent material casts an opaque shadow,
  // so office glazing and rooflight strips must not be casters.
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (mats.some((m) => (m as MeshStandardMaterial)?.transparent)) mesh.castShadow = false;
  });

  return root;
}
