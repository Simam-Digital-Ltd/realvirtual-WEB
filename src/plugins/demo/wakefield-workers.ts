// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Low-poly workers — the people half of the shift change.
 *
 * Built in code from boxes and an icosahedron, flat-shaded, so they sit in
 * the same visual language as the hand-built estate and cost nothing to
 * download. Seventeen of them is ~150 meshes sharing a dozen geometries.
 *
 * WHAT THE OUTFITS SAY
 * --------------------
 * Arrival clothes are casual and varied. After the changing room, kit is by
 * role, the way a chilled-food plant actually dresses:
 *   - production, robotics and QA: whites, white wellies, a hairnet cap;
 *   - despatch: hi-vis vest with reflective bands, navy trousers;
 *   - maintenance: navy overalls;
 *   - the shift manager and visitor: whites, distinct cap.
 *
 * The CAP COLOUR encodes the crew, and the shift board uses the same colours
 * for its crew chips. One colour per crew, in both places, is what lets
 * someone glance from the panel to the floor and know who they are looking
 * at — the board and the scene read as one thing, not a legend and a guess.
 *
 * After badging in, a small teal lanyard badge appears on the chest. It is
 * the in-world version of the fire-roll tick: everyone wearing one is
 * someone the site knows is on the premises.
 */

import {
  BoxGeometry,
  CanvasTexture,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  type BufferGeometry,
  type Material,
} from 'three';
import { kitFor, type CrewId, type Kit, type Pose, type WorkerDef } from './wakefield-shift';

/* ------------------------------------------------------------------ *
 * Palette
 * ------------------------------------------------------------------ */

/** Cap colour per crew. Shared with the shift board's crew chips. */
export const CREW_COLOUR: Record<CrewId, number> = {
  packing: 0x5f9fe0,
  robotics: 0x9a7fe0,
  quality: 0x62b866,
  despatch: 0xd8f03a,
  maintenance: 0x2f6fb8,
  management: 0x2e8b57,
};

/** Visitors are flagged in orange whatever crew they shadow. */
export const VISITOR_COLOUR = 0xf08c2e;

const WHITES = 0xeef1f3;
const WHITES_TROUSER = 0xdde2e6;
const WELLIES = 0xf6f7f8;
const NAVY = 0x22344d;
const HIVIS = 0xd8f03a;
const BOOTS = 0x24272b;
const BADGE_TEAL = 0x2ed7c0;
const JEANS = [0x2e4466, 0x3a3a3a, 0x52463a, 0x23303f];
const HAIR = [0x1d1612, 0x3b2a1e, 0x6a4b2c, 0xb38b5a, 0x2b2b2b, 0x8c5a3a];

const _mats = new Map<string, MeshStandardMaterial>();
function mat(colour: number, opts: { emissive?: boolean; shiny?: boolean } = {}): MeshStandardMaterial {
  const key = `${colour}|${opts.emissive ? 1 : 0}|${opts.shiny ? 1 : 0}`;
  let m = _mats.get(key);
  if (!m) {
    m = new MeshStandardMaterial({
      color: colour,
      roughness: opts.shiny ? 0.3 : 0.86,
      metalness: opts.shiny ? 0.55 : 0,
      flatShading: true,
      emissive: opts.emissive ? colour : 0x000000,
      emissiveIntensity: opts.emissive ? 0.9 : 0,
    });
    _mats.set(key, m);
  }
  return m;
}

/* ------------------------------------------------------------------ *
 * Shared geometry
 * ------------------------------------------------------------------ */

interface Geos {
  leg: BufferGeometry; foot: BufferGeometry; torso: BufferGeometry; skirt: BufferGeometry;
  arm: BufferGeometry; hand: BufferGeometry; head: BufferGeometry; hair: BufferGeometry;
  cap: BufferGeometry; stripe: BufferGeometry; badge: BufferGeometry;
}

let _geos: Geos | null = null;
function geos(): Geos {
  if (_geos) return _geos;
  // Limbs hang from a pivot at their top, so the walk cycle is a rotation.
  const leg = new BoxGeometry(0.15, 0.8, 0.17).translate(0, -0.4, 0);
  const foot = new BoxGeometry(0.16, 0.09, 0.27).translate(0, -0.845, 0.045);
  const arm = new BoxGeometry(0.12, 0.6, 0.13).translate(0, -0.3, 0);
  const hand = new BoxGeometry(0.1, 0.1, 0.1).translate(0, -0.65, 0);
  _geos = {
    leg, foot, arm, hand,
    torso: new BoxGeometry(0.44, 0.6, 0.25),
    // Coat skirt: whites come down over the thigh. Static; legs swing under it.
    skirt: new BoxGeometry(0.46, 0.34, 0.27),
    head: new IcosahedronGeometry(0.125, 1),
    hair: new SphereGeometry(0.133, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.52),
    // The hairnet mob-cap sits a touch proud of the hair it replaces.
    cap: new SphereGeometry(0.15, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1, 0.72, 1),
    stripe: new BoxGeometry(0.455, 0.05, 0.262),
    badge: new BoxGeometry(0.075, 0.095, 0.012),
  };
  return _geos;
}

/* ------------------------------------------------------------------ *
 * Rig
 * ------------------------------------------------------------------ */

export interface WorkerRig {
  def: WorkerDef;
  root: Group;
  body: Group;
  armL: Group; armR: Group; legL: Group; legR: Group;
  torso: Mesh; skirt: Mesh; armMeshL: Mesh; armMeshR: Mesh;
  legMeshL: Mesh; legMeshR: Mesh; footL: Mesh; footR: Mesh;
  hair: Mesh; cap: Mesh; stripes: Mesh[]; badge: Mesh;
  /** Per-worker phase so idle breathing is not in lock-step. */
  seed: number;
  kitted: boolean | null;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mesh(name: string, g: BufferGeometry, m: Material, shadow = true): Mesh {
  const o = new Mesh(g, m);
  o.name = name;
  o.castShadow = shadow;
  o.receiveShadow = false;
  return o;
}

export function createWorkerRig(def: WorkerDef): WorkerRig {
  const G = geos();
  const h = hash(def.id);
  const root = new Group();
  root.name = `wpf-worker-${def.id}`;
  root.userData.workerId = def.id;

  const body = new Group();
  body.name = `${root.name}-body`;
  root.add(body);

  const skin = mat(def.skin);
  const torso = mesh(`${root.name}-torso`, G.torso, skin);
  torso.position.y = 1.2;
  const skirt = mesh(`${root.name}-coat`, G.skirt, skin);
  skirt.position.y = 0.79;
  const head = mesh(`${root.name}-head`, G.head, skin);
  head.position.y = 1.66;
  const hair = mesh(`${root.name}-hair`, G.hair, mat(HAIR[h % HAIR.length]), false);
  hair.position.y = 1.675;
  const cap = mesh(`${root.name}-cap`, G.cap, skin, false);
  cap.position.y = 1.69;
  const stripes = [1.06, 1.3].map((y, i) => {
    const s = mesh(`${root.name}-band-${i}`, G.stripe, mat(0xc9cdd1, { shiny: true }), false);
    s.position.y = y;
    return s;
  });
  const badge = mesh(`${root.name}-badge`, G.badge, mat(BADGE_TEAL, { emissive: true }), false);
  badge.position.set(-0.12, 1.32, 0.13);

  const limb = (side: -1 | 1, kind: 'arm' | 'leg') => {
    const g = new Group();
    g.name = `${root.name}-${kind}-${side < 0 ? 'l' : 'r'}`;
    if (kind === 'arm') g.position.set(side * 0.285, 1.47, 0);
    else g.position.set(side * 0.11, 0.9, 0);
    const m = mesh(`${g.name}-mesh`, kind === 'arm' ? G.arm : G.leg, skin);
    const end = mesh(`${g.name}-${kind === 'arm' ? 'hand' : 'foot'}`, kind === 'arm' ? G.hand : G.foot, skin, kind === 'leg');
    g.add(m, end);
    return { g, m, end };
  };
  const aL = limb(-1, 'arm');
  const aR = limb(1, 'arm');
  const lL = limb(-1, 'leg');
  const lR = limb(1, 'leg');

  body.add(torso, skirt, head, hair, cap, ...stripes, badge, aL.g, aR.g, lL.g, lR.g);
  root.visible = false;

  const rig: WorkerRig = {
    def, root, body,
    armL: aL.g, armR: aR.g, legL: lL.g, legR: lR.g,
    torso, skirt, armMeshL: aL.m, armMeshR: aR.m, legMeshL: lL.m, legMeshR: lR.m,
    footL: lL.end, footR: lR.end,
    hair, cap, stripes, badge,
    seed: (h % 1000) / 1000,
    kitted: null,
  };
  // Hands stay skin in every outfit.
  aL.end.material = skin;
  aR.end.material = skin;
  setOutfit(rig, false);
  return rig;
}

/** Swap between arrival clothes and work kit. Cheap: material assignments only. */
export function setOutfit(rig: WorkerRig, kitted: boolean): void {
  if (rig.kitted === kitted) return;
  rig.kitted = kitted;
  const { def } = rig;
  const h = hash(def.id);

  let top: number, sleeves: number, trousers: number, feet: number;
  let coat = false, cap: number | null = null, hivis = false;

  if (!kitted) {
    top = def.casual; sleeves = def.casual; trousers = JEANS[h % JEANS.length]; feet = BOOTS;
  } else {
    const kit: Kit = kitFor(def);
    switch (kit) {
      case 'whites':
      case 'manager':
      case 'visitor':
        top = WHITES; sleeves = WHITES; trousers = WHITES_TROUSER; feet = WELLIES; coat = true;
        cap = kit === 'visitor' ? VISITOR_COLOUR : CREW_COLOUR[def.crew];
        break;
      case 'hivis':
        top = HIVIS; sleeves = NAVY; trousers = NAVY; feet = BOOTS; hivis = true;
        break;
      case 'engineer':
      default:
        top = NAVY; sleeves = NAVY; trousers = NAVY; feet = BOOTS;
        cap = CREW_COLOUR[def.crew];
        break;
    }
  }

  rig.torso.material = mat(top);
  rig.skirt.material = mat(top);
  rig.skirt.visible = coat;
  rig.armMeshL.material = mat(sleeves);
  rig.armMeshR.material = mat(sleeves);
  rig.legMeshL.material = mat(trousers);
  rig.legMeshR.material = mat(trousers);
  rig.footL.material = mat(feet);
  rig.footR.material = mat(feet);
  rig.cap.visible = cap !== null;
  if (cap !== null) rig.cap.material = mat(cap);
  rig.hair.visible = cap === null;
  for (const s of rig.stripes) s.visible = hivis;
}

/**
 * Pose a rig for this frame.
 *
 * `time` is a free-running clock used only for idle motion, so standing
 * workers breathe and shift their weight instead of freezing like mannequins.
 */
export function poseRig(rig: WorkerRig, pose: Pose, time: number, signedIn: boolean): void {
  rig.root.visible = !pose.hidden;
  if (pose.hidden) return;

  setOutfit(rig, pose.kitted);
  rig.badge.visible = signedIn;
  rig.root.position.set(pose.x, 0, pose.z);
  rig.root.rotation.y = pose.heading;

  if (pose.moving) {
    const s = Math.sin(pose.stride * Math.PI * 2);
    rig.legL.rotation.x = s * 0.5;
    rig.legR.rotation.x = -s * 0.5;
    rig.armL.rotation.x = -s * 0.42;
    rig.armR.rotation.x = s * 0.42;
    rig.body.position.y = Math.abs(s) * 0.035;
  } else if (pose.phase === 'badging') {
    // Right arm out to the reader, the rest still.
    rig.legL.rotation.x = 0;
    rig.legR.rotation.x = 0;
    rig.armL.rotation.x = 0.05;
    rig.armR.rotation.x = -1.15;
    rig.body.position.y = 0;
  } else {
    const b = Math.sin(time * 1.7 + rig.seed * 6.28);
    rig.legL.rotation.x = 0;
    rig.legR.rotation.x = 0;
    // At a station: hands slightly forward, working the line.
    const working = pose.phase === 'at-station' ? -0.35 : 0;
    rig.armL.rotation.x = working + b * 0.04;
    rig.armR.rotation.x = working - b * 0.04;
    rig.body.position.y = b * 0.006;
  }
}

/* ------------------------------------------------------------------ *
 * Sign-in pop
 * ------------------------------------------------------------------ */

/**
 * The "badge accepted" pill that floats up over someone's head.
 *
 * Teal tick, name, crew colour on the edge. This is the beat a viewer's eye
 * follows in the film, so it is deliberately bigger than a HUD label would
 * be: it has to read at phone size.
 */
export function createSignInPop(name: string, crewColour: number): Sprite {
  const W = 512, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const r = 56;
  g.fillStyle = 'rgba(7,16,20,0.94)';
  g.beginPath();
  g.roundRect(8, 8, W - 16, H - 16, r);
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = `#${crewColour.toString(16).padStart(6, '0')}`;
  g.stroke();
  // Tick disc.
  g.fillStyle = '#2ed7c0';
  g.beginPath();
  g.arc(68, H / 2, 34, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#06201c';
  g.lineWidth = 9;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(52, H / 2 + 1);
  g.lineTo(64, H / 2 + 13);
  g.lineTo(86, H / 2 - 13);
  g.stroke();
  g.fillStyle = '#ffffff';
  g.font = '600 46px system-ui, -apple-system, Segoe UI, sans-serif';
  g.textBaseline = 'middle';
  let label = name;
  while (g.measureText(label).width > W - 150 && label.length > 4) label = label.slice(0, -2) + '…';
  g.fillText(label, 118, H / 2 + 2);

  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const sm = new SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new Sprite(sm);
  s.name = `wpf-signin-${name}`;
  s.scale.set(2.2, 0.55, 1);
  s.renderOrder = 20;
  return s;
}

export function disposeSprite(s: Sprite): void {
  s.removeFromParent();
  (s.material as SpriteMaterial).map?.dispose();
  (s.material as SpriteMaterial).dispose();
}

/* ------------------------------------------------------------------ *
 * Badge reader
 * ------------------------------------------------------------------ */

export interface BadgeReader {
  root: Group;
  screen: MeshStandardMaterial;
}

/**
 * The post by the door everyone taps. Its screen flashes on every badge, so
 * the moment registers even when the name pop is out of frame.
 */
export function createBadgeReader(x: number, z: number): BadgeReader {
  const root = new Group();
  root.name = 'wpf-badge-reader';
  const post = new Mesh(new BoxGeometry(0.11, 1.12, 0.11), mat(0x30363c));
  post.position.set(x, 0.56, z);
  post.castShadow = true;
  const head = new Mesh(new BoxGeometry(0.24, 0.3, 0.09), mat(0x1c2126));
  head.position.set(x, 1.24, z);
  head.rotation.x = -0.35;
  head.castShadow = true;
  const screen = new MeshStandardMaterial({ color: 0x0c3b36, emissive: BADGE_TEAL, emissiveIntensity: 0.25, roughness: 0.4 });
  const glass = new Mesh(new BoxGeometry(0.17, 0.2, 0.012), screen);
  glass.position.set(x, 1.25, z + 0.05);
  glass.rotation.x = -0.35;
  root.add(post, head, glass);
  return { root, screen };
}
