// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Shift change — the AM packing crew arriving, signing in and taking their
 * stations.
 *
 * WHY THIS EXISTS
 * ---------------
 * Everything else in the twin is machines. A factory with no people in it
 * reads as a render, not a place, and the moment that makes a site feel alive
 * is the one every site manager knows: ten to seven, cars pulling in, the
 * badge reader beeping, crews filling up, the line cleared to start.
 *
 * Sign-in is also the one people-process with a hard safety reason to exist:
 * the fire roll. "Who is on site right now" is a question with a legal
 * answer, and it is the number the gamified layer is built around.
 *
 * PURITY
 * ------
 * No three.js, no React. Every function here is a pure function of the
 * roster and elapsed time `t` (seconds since the shift-change started), so:
 *   - the 3D layer poses each worker from `poseAt(route, t)`,
 *   - the UI reads the whole board from `shiftSnapshot(roster, t)`,
 *   - the film can scrub, replay and loop without any state to reset,
 *   - and all of it is testable in node.
 *
 * HONESTY
 * -------
 * The roster is simulated, and the UI says so. This codebase has a standing
 * rule against presenting invented numbers as measured; a simulated crew
 * walking through a simulated plant is the same kind of thing as the
 * simulated line, and is labelled the same way. What IS real is the
 * arithmetic: the fire-roll count is exactly the number of people the
 * simulation has signed in, never a separately-invented figure.
 *
 * COORDINATES
 * -----------
 * World metres, +Y up, matching `wakefield-exterior.ts` / `wakefield-interior.ts`:
 * hall 30 x 20 centred on (0, SITE_Z); office block on the east corner,
 * glazed entrance facing south onto the car park; 22 bays in two rows east of
 * the office. Routes were laid along measured clear floor so nobody walks
 * through steel:
 *   - north: the aisle under the mezzanine, between the machine line and the
 *     blue conveyor;
 *   - south: the 2.2 m strip between the third lime conveyor and the south
 *     wall, reached round the EAST ends of the conveyors.
 * The machine line's footprint was measured from the loaded GLB, not taken
 * from the "centred near origin" note in wakefield-interior: it spans
 * x -6.29..6.21, z -3.46..3.71 in WORLD space, i.e. it is centred on world
 * zero, not on the hall. An earlier draft trusted the note, put the packing
 * crew on a walkway at z = SITE_Z + 4.4, and walked them through the line.
 * `tests/wakefield-shift.node.test.ts` now checks every route against the
 * measured obstacles so that cannot come back.
 */

const SITE_Z = -1.15;
const cz = SITE_Z;

/* ------------------------------------------------------------------ *
 * Roster
 * ------------------------------------------------------------------ */

export type CrewId = 'packing' | 'robotics' | 'quality' | 'despatch' | 'maintenance' | 'management';

/**
 * What a person wears once they are through the door.
 *
 * This is a chilled-food plant, so production and QA kit up in whites and a
 * hairnet cap — not the hard hat a generic "factory" asset would reach for.
 * The yard crew wear hi-vis; engineers wear navy. Getting this right is the
 * difference between a site manager nodding and a site manager wincing.
 */
export type Kit = 'whites' | 'hivis' | 'engineer' | 'manager' | 'visitor';

export interface CrewDef {
  id: CrewId;
  label: string;
  /** Short label for tight UI. */
  short: string;
  kit: Kit;
}

export const CREWS: readonly CrewDef[] = [
  { id: 'packing', label: 'Packing line', short: 'Packing', kit: 'whites' },
  { id: 'robotics', label: 'Robot cell', short: 'Robotics', kit: 'whites' },
  { id: 'quality', label: 'Quality', short: 'QA', kit: 'whites' },
  { id: 'despatch', label: 'Despatch', short: 'Despatch', kit: 'hivis' },
  { id: 'maintenance', label: 'Maintenance', short: 'Maint.', kit: 'engineer' },
  { id: 'management', label: 'Shift management', short: 'Mgmt', kit: 'manager' },
] as const;

export interface Vec2 { x: number; z: number }

export interface WorkerDef {
  id: string;
  /** First name + initial. Fictional. */
  name: string;
  crew: CrewId;
  /** Overrides the crew kit — the visitor wears visitor hi-vis. */
  kit?: Kit;
  /** How they arrive. */
  via: 'car' | 'bus' | 'foot';
  /** Seconds after the shift-change starts that they appear. */
  spawnAt: number;
  /** Car bay they parked in (car arrivals only): row 0 or 1, index 0-10. */
  bay?: { row: 0 | 1; i: number };
  /** Where they end up, and which way they face once there (radians, about +Y). */
  station: Vec2;
  facing: number;
  /**
   * Waypoints from the hall door to the station, EXCLUDING both ends.
   *
   * Derived, not drawn: an A* search over a 20 cm grid built from the
   * measured bounding boxes of everything at body height in the loaded hall
   * (429 objects: the GLB line, guarding, conveyors, the mezzanine stairs,
   * stacked cases, the replica cells), then string-pulled to straight legs.
   * Hand-drawn aisles walked people through the stairs, a QA lab and a
   * replica palletiser. The same boxes ship as
   * `tests/fixtures/wakefield-hall-obstacles.json`, and the node test walks
   * every leg against them, so a re-dressed hall fails a test rather than a
   * demo.
   */
  hall: readonly Vec2[];
  /** Casual clothes on arrival, as a 0xRRGGBB colour. Seeded per worker. */
  casual: number;
  /** Skin tone, 0xRRGGBB. */
  skin: number;
}

/** Walking speed, m/s. A brisk start-of-shift walk, slightly stylised. */
export const WALK_SPEED = 1.55;
/** Seconds spent at the badge reader. Long enough to read as a beat. */
export const BADGE_PAUSE = 1.1;
/**
 * Real seconds to simulated seconds. The arrival window 06:30-07:00 plays
 * out in about a minute: long enough to read, short enough for a reel.
 */
export const CLOCK_SCALE = 30;
/** Shift-change window opens at 06:30. */
export const CLOCK_START_MIN = 6 * 60 + 30;

const STAND_FACING_SOUTH = 0; // facing +Z
const FACING_NORTH = Math.PI;

const CASUALS = [0x2f3e5c, 0x6b2d3a, 0x3f5f4a, 0x575757, 0x8a6a3a, 0x1f2a36, 0x7a4f8a, 0x4a6f8f, 0xa35a2c, 0x2b4d4d];
const SKINS = [0xf1c9a5, 0xe0ac7d, 0xc68b59, 0x8d5524, 0x5c3a21, 0xffdbac];

let _c = 0;
const casual = () => CASUALS[(_c++ * 7) % CASUALS.length];
let _s = 0;
const skin = () => SKINS[(_s++ * 5) % SKINS.length];

/**
 * The AM packing shift. Seventeen people — about what a single chilled line,
 * its cell, QA, despatch and maintenance cover would actually roster.
 *
 * Spawn times are staggered the way real arrivals are: a couple of early
 * birds, a bulge ten minutes before the hour, one person who makes it with
 * a minute to spare. Uniform spacing reads as a spawner; this reads as people.
 */
export const AM_SHIFT: readonly WorkerDef[] = [
  // Early birds — the shift manager is always first in.
  { id: 'w-mgr', name: 'Sarah K.', crew: 'management', via: 'car', bay: { row: 0, i: 5 }, spawnAt: 0.0, station: { x: 6.5, z: -5.65 }, facing: STAND_FACING_SOUTH, hall: [{ x: 10.7, z: -5.45 }, { x: 8.9, z: -5.65 }], casual: casual(), skin: skin() },
  { id: 'w-mnt1', name: 'Dev P.', crew: 'maintenance', via: 'car', bay: { row: 1, i: 2 }, spawnAt: 2.2, station: { x: 12.4, z: -6.15 }, facing: FACING_NORTH, hall: [], casual: casual(), skin: skin() },
  { id: 'w-qa1', name: 'Amira H.', crew: 'quality', via: 'car', bay: { row: 0, i: 8 }, spawnAt: 5.5, station: { x: -7.6, z: -5.65 }, facing: STAND_FACING_SOUTH, hall: [{ x: 10.7, z: -5.45 }, { x: -2.3, z: -7.85 }, { x: -5.3, z: -7.85 }], casual: casual(), skin: skin() },
  // The bulge.
  { id: 'w-pk1', name: 'Tom B.', crew: 'packing', via: 'bus', spawnAt: 8.0, station: { x: -4.5, z: 7.3 }, facing: FACING_NORTH, hall: [{ x: 12.9, z: 8.15 }], casual: casual(), skin: skin() },
  { id: 'w-pk2', name: 'Priya S.', crew: 'packing', via: 'bus', spawnAt: 8.6, station: { x: -2.0, z: 7.3 }, facing: FACING_NORTH, hall: [{ x: 12.9, z: 8.15 }], casual: casual(), skin: skin() },
  { id: 'w-rb1', name: 'Marek W.', crew: 'robotics', via: 'car', bay: { row: 1, i: 6 }, spawnAt: 10.5, station: { x: 0.7, z: -5.65 }, facing: STAND_FACING_SOUTH, hall: [{ x: 10.7, z: -5.45 }, { x: 2.9, z: -6.65 }, { x: 0.7, z: -6.65 }], casual: casual(), skin: skin() },
  { id: 'w-dsp1', name: 'Gary L.', crew: 'despatch', via: 'car', bay: { row: 0, i: 2 }, spawnAt: 12.0, station: { x: 10.6, z: -9.75 }, facing: FACING_NORTH, hall: [], casual: casual(), skin: skin() },
  { id: 'w-pk3', name: 'Joy A.', crew: 'packing', via: 'car', bay: { row: 1, i: 9 }, spawnAt: 13.4, station: { x: 0.5, z: 7.3 }, facing: FACING_NORTH, hall: [{ x: 12.9, z: 8.15 }, { x: 0.7, z: 7.55 }], casual: casual(), skin: skin() },
  { id: 'w-dsp2', name: 'Kasia N.', crew: 'despatch', via: 'car', bay: { row: 0, i: 0 }, spawnAt: 15.0, station: { x: 12.2, z: -9.55 }, facing: FACING_NORTH, hall: [{ x: 12.5, z: -7.25 }], casual: casual(), skin: skin() },
  { id: 'w-pk4', name: 'Ravi M.', crew: 'packing', via: 'bus', spawnAt: 16.0, station: { x: 3.0, z: 7.3 }, facing: FACING_NORTH, hall: [{ x: 12.9, z: 8.15 }, { x: 3.5, z: 7.75 }], casual: casual(), skin: skin() },
  { id: 'w-qa2', name: 'Ellie R.', crew: 'quality', via: 'foot', spawnAt: 18.2, station: { x: -9.2, z: -5.65 }, facing: STAND_FACING_SOUTH, hall: [{ x: 10.7, z: -5.45 }, { x: -2.3, z: -7.85 }, { x: -7.1, z: -7.65 }], casual: casual(), skin: skin() },
  { id: 'w-rb2', name: 'Femi O.', crew: 'robotics', via: 'car', bay: { row: 0, i: 10 }, spawnAt: 20.0, station: { x: 3.7, z: -5.65 }, facing: STAND_FACING_SOUTH, hall: [{ x: 10.7, z: -5.45 }, { x: 8.9, z: -5.65 }], casual: casual(), skin: skin() },
  { id: 'w-vis', name: 'Visitor (J. Chen)', crew: 'management', kit: 'visitor', via: 'car', bay: { row: 1, i: 0 }, spawnAt: 22.0, station: { x: 7.7, z: -6.35 }, facing: STAND_FACING_SOUTH, hall: [{ x: 10.7, z: -5.45 }], casual: casual(), skin: skin() },
  { id: 'w-dsp3', name: 'Liam C.', crew: 'despatch', via: 'bus', spawnAt: 24.5, station: { x: 11.4, z: -10.35 }, facing: FACING_NORTH, hall: [], casual: casual(), skin: skin() },
  { id: 'w-mnt2', name: 'Nadia F.', crew: 'maintenance', via: 'car', bay: { row: 1, i: 4 }, spawnAt: 27.0, station: { x: 11.0, z: -6.75 }, facing: FACING_NORTH, hall: [], casual: casual(), skin: skin() },
  { id: 'w-pk5', name: 'Sam D.', crew: 'packing', via: 'bus', spawnAt: 29.0, station: { x: -6.9, z: 7.3 }, facing: FACING_NORTH, hall: [{ x: 12.9, z: 8.15 }], casual: casual(), skin: skin() },
  // Made it with a minute to spare.
  { id: 'w-pk6', name: 'Chloe V.', crew: 'packing', via: 'car', bay: { row: 0, i: 4 }, spawnAt: 32.5, station: { x: 5.5, z: 7.3 }, facing: FACING_NORTH, hall: [{ x: 12.9, z: 8.15 }, { x: 5.9, z: 7.75 }], casual: casual(), skin: skin() },
] as const;

export function kitFor(w: WorkerDef): Kit {
  if (w.kit) return w.kit;
  return CREWS.find((c) => c.id === w.crew)!.kit;
}

/* ------------------------------------------------------------------ *
 * Routes
 * ------------------------------------------------------------------ */

/** What happens when a worker reaches a waypoint. */
export type WaypointEvent = 'badge' | 'enter' | 'kit-up' | 'station';

export interface Waypoint extends Vec2 {
  event?: WaypointEvent;
  /** Seconds to stand still on arrival (badge reader). */
  pause?: number;
}

/** Car park geometry, from `wakefield-exterior.ts` (bayX = halfW + 16). */
const BAY_X = [31, 43] as const;
const bayZ = (i: number) => cz - 12 + i * 2.6;
/** The aisle between the two rows of bays. */
const CAR_AISLE_X = 37;

// Office and entrance, from `officeBlock()`: body 13 x 9 centred
// (halfW + 6.5, SITE_Z + 4.5), glazed entrance on the south face.
const CANOPY: Vec2 = { x: 22.6, z: cz + 12.7 };
/**
 * Where every arrival joins the footway: past the south end of the car-park
 * rows (the last bay ends at about SITE_Z + 15), so nobody threads between
 * parked cars to get there.
 */
const FOOTWAY: Vec2 = { x: 27.6, z: cz + 16.5 };
export const BADGE_READER: Vec2 = { x: 22.6, z: cz + 10.2 };
const DOOR: Vec2 = { x: 21.5, z: cz + 9.2 };
const LOBBY: Vec2 = { x: 21.5, z: cz + 5.0 };
const CHANGING: Vec2 = { x: 16.4, z: cz + 0.6 };
/** Inside the hall, just through the staff door in the east wall. */
const HALL_DOOR: Vec2 = { x: 14.0, z: cz + 0.6 };

/**
 * The full walk for one worker: arrival point -> badge reader -> through the
 * office (where they kit up, out of sight) -> into the hall -> station.
 *
 * Kit-up happens on the waypoint INSIDE the office on purpose: a costume
 * change in the open reads as a glitch; one that happens behind a brick wall
 * reads as "they went to the changing room", which is what really happens.
 */
export function routeFor(w: WorkerDef): Waypoint[] {
  const out: Waypoint[] = [];

  if (w.via === 'car' && w.bay) {
    const bx = BAY_X[w.bay.row];
    const z = bayZ(w.bay.i);
    // Step out of the car on the aisle side.
    const sx = w.bay.row === 0 ? bx + 3.0 : bx - 3.0;
    out.push({ x: sx, z });
    out.push({ x: CAR_AISLE_X, z });
    // Round the end of the row rather than between bumpers.
    out.push({ x: CAR_AISLE_X, z: FOOTWAY.z });
  } else if (w.via === 'bus') {
    // Off the bus on the approach road. The stop sits inside the perimeter
    // hedge: the hedge in wakefield-exterior has no gap for the road, so a
    // stop outside it would have people walking through a hedge.
    out.push({ x: FOOTWAY.x, z: cz + 42 });
  } else {
    // Walked in from the estate road to the east.
    out.push({ x: 60, z: FOOTWAY.z });
  }

  out.push(FOOTWAY);
  out.push(CANOPY);
  out.push({ ...BADGE_READER, event: 'badge', pause: BADGE_PAUSE });
  out.push({ ...DOOR, event: 'enter' });
  out.push(LOBBY);
  out.push({ ...CHANGING, event: 'kit-up' });
  out.push(HALL_DOOR);
  for (const q of w.hall) out.push(q);
  out.push({ ...w.station, event: 'station' });
  return out;
}

/* ------------------------------------------------------------------ *
 * Timing
 * ------------------------------------------------------------------ */

export interface TimedRoute {
  worker: WorkerDef;
  points: Waypoint[];
  /**
   * Absolute time (s since shift-change start) at which the worker ARRIVES at
   * each waypoint. `arrive[0] === spawnAt`.
   */
  arrive: number[];
  /** Absolute time at which they LEAVE each waypoint (arrive + pause). */
  leave: number[];
}

export function timeRoute(worker: WorkerDef, points = routeFor(worker), speed = WALK_SPEED): TimedRoute {
  const arrive: number[] = [];
  const leave: number[] = [];
  let t = worker.spawnAt;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) {
      const a = points[i - 1];
      const b = points[i];
      t += Math.hypot(b.x - a.x, b.z - a.z) / speed;
    }
    arrive.push(t);
    t += points[i].pause ?? 0;
    leave.push(t);
  }
  return { worker, points, arrive, leave };
}

/** Time the worker reaches the first waypoint carrying `event`, or Infinity. */
export function eventTime(r: TimedRoute, event: WaypointEvent): number {
  const i = r.points.findIndex((p) => p.event === event);
  return i < 0 ? Infinity : r.arrive[i];
}

export type Phase = 'not-arrived' | 'walking' | 'badging' | 'inside' | 'at-station';

export interface Pose {
  x: number;
  z: number;
  /** Heading about +Y, radians; 0 faces +Z. */
  heading: number;
  phase: Phase;
  /** True once through the changing room — render the kit, not casuals. */
  kitted: boolean;
  /** True while hidden inside the office block. */
  hidden: boolean;
  /** 0..1 stride phase, for the walk cycle. Constant when standing. */
  stride: number;
  moving: boolean;
}

/**
 * Where a worker is at time t, and what they are doing.
 *
 * Linear segments between waypoints at constant speed; heading follows the
 * segment. Deliberately no easing: people walk at a constant pace, and eased
 * stops are what make crowd sims look like puppets.
 */
export function poseAt(r: TimedRoute, t: number): Pose {
  const { points, arrive, leave, worker } = r;
  const enterT = eventTime(r, 'enter');
  const kitT = eventTime(r, 'kit-up');
  const badgeT = eventTime(r, 'badge');
  // Visible again once through the staff door into the hall — the waypoint
  // straight after the changing room.
  const kitIdx = points.findIndex((p) => p.event === 'kit-up');
  const hallT = kitIdx >= 0 && kitIdx + 1 < points.length ? arrive[kitIdx + 1] : kitT;

  if (t < worker.spawnAt) {
    return { x: points[0].x, z: points[0].z, heading: 0, phase: 'not-arrived', kitted: false, hidden: true, stride: 0, moving: false };
  }

  const last = points.length - 1;
  if (t >= arrive[last]) {
    const p = points[last];
    return { x: p.x, z: p.z, heading: worker.facing, phase: 'at-station', kitted: true, hidden: false, stride: 0, moving: false };
  }

  // Find the segment we are on.
  let i = 0;
  while (i < last && t >= arrive[i + 1]) i++;

  const a = points[i];
  const b = points[i + 1];
  const segHeading = Math.atan2(b.x - a.x, b.z - a.z);

  // Standing at a waypoint during its pause (the badge reader).
  if (t < leave[i]) {
    const facingReader = a.event === 'badge' ? FACING_NORTH : segHeading;
    return {
      x: a.x, z: a.z, heading: facingReader,
      phase: a.event === 'badge' ? 'badging' : 'walking',
      kitted: t >= kitT, hidden: t >= enterT && t < hallT, stride: 0, moving: false,
    };
  }

  const span = arrive[i + 1] - leave[i];
  const u = span > 0 ? (t - leave[i]) / span : 1;
  const x = a.x + (b.x - a.x) * u;
  const z = a.z + (b.z - a.z) * u;
  // Two strides per metre-and-a-half is a natural cadence at this speed.
  const travelled = (t - leave[i]) * WALK_SPEED;
  const stride = (travelled / 1.5) % 1;

  let phase: Phase = 'walking';
  if (t >= enterT && t < hallT) phase = 'inside';
  else if (t < badgeT) phase = 'walking';

  return {
    x, z, heading: segHeading, phase,
    kitted: t >= kitT,
    hidden: t >= enterT && t < hallT,
    stride, moving: true,
  };
}

/* ------------------------------------------------------------------ *
 * The board — what the gamified layer reads
 * ------------------------------------------------------------------ */

export interface CrewStatus {
  crew: CrewDef;
  rostered: number;
  signedIn: number;
  atStation: number;
  /** Sim-clock minute the crew became complete (all signed in), or null. */
  completeAt: number | null;
}

export type ShiftEventKind = 'signed-in' | 'first-in' | 'crew-complete' | 'all-in' | 'at-station';

export interface ShiftEvent {
  kind: ShiftEventKind;
  /** Real time (s since start) it happened. */
  t: number;
  /** Sim clock, minutes since midnight. */
  clock: number;
  workerId?: string;
  name?: string;
  crew?: CrewId;
  text: string;
}

export interface ShiftSnapshot {
  t: number;
  /** Sim clock, minutes since midnight. */
  clock: number;
  /**
   * People on site — the fire roll. Exactly the number signed in: this is
   * the one figure the layer exists to get right.
   */
  onSite: number;
  rostered: number;
  atStation: number;
  crews: CrewStatus[];
  /** Every event up to and including t, oldest first. */
  events: ShiftEvent[];
  /** True once every rostered worker is at their station. */
  ready: boolean;
}

export function clockAt(t: number): number {
  return CLOCK_START_MIN + (t * CLOCK_SCALE) / 60;
}

export function formatClock(minutes: number): string {
  const m = Math.floor(minutes);
  const hh = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Pre-compute every route once; the board and the poses both read these. */
export function timeRoster(roster: readonly WorkerDef[] = AM_SHIFT): TimedRoute[] {
  return roster.map((w) => timeRoute(w));
}

/** Last moment anything happens — the film uses this to know when to cut. */
export function shiftDuration(routes: readonly TimedRoute[]): number {
  let end = 0;
  for (const r of routes) end = Math.max(end, r.arrive[r.arrive.length - 1]);
  return end;
}

/**
 * The whole board at time t.
 *
 * Events are derived, not accumulated: replaying from zero, scrubbing, or
 * jumping straight to the end all produce exactly the same list, because
 * there is no state to drift.
 */
export function shiftSnapshot(routes: readonly TimedRoute[], t: number): ShiftSnapshot {
  type Raw = { t: number; kind: ShiftEventKind; r?: TimedRoute; crew?: CrewId };
  const raw: Raw[] = [];

  for (const r of routes) {
    const b = eventTime(r, 'badge');
    if (b <= t) raw.push({ t: b, kind: 'signed-in', r });
    const s = r.arrive[r.arrive.length - 1];
    if (s <= t) raw.push({ t: s, kind: 'at-station', r });
  }
  raw.sort((a, b) => a.t - b.t);

  const events: ShiftEvent[] = [];
  const signedByCrew = new Map<CrewId, number>();
  const rosterByCrew = new Map<CrewId, number>();
  for (const r of routes) rosterByCrew.set(r.worker.crew, (rosterByCrew.get(r.worker.crew) ?? 0) + 1);
  const completeAt = new Map<CrewId, number>();
  let signedTotal = 0;

  for (const e of raw) {
    const w = e.r!.worker;
    const clock = clockAt(e.t);
    if (e.kind === 'signed-in') {
      signedTotal++;
      if (signedTotal === 1) {
        events.push({ kind: 'first-in', t: e.t, clock, workerId: w.id, name: w.name, crew: w.crew, text: `First in — ${w.name}` });
      }
      events.push({ kind: 'signed-in', t: e.t, clock, workerId: w.id, name: w.name, crew: w.crew, text: `${w.name} signed in` });
      const n = (signedByCrew.get(w.crew) ?? 0) + 1;
      signedByCrew.set(w.crew, n);
      if (n === rosterByCrew.get(w.crew)) {
        completeAt.set(w.crew, clock);
        const label = CREWS.find((c) => c.id === w.crew)!.label;
        events.push({ kind: 'crew-complete', t: e.t, clock, crew: w.crew, text: `${label} crew complete` });
      }
      if (signedTotal === routes.length) {
        events.push({ kind: 'all-in', t: e.t, clock, text: 'Everyone on site' });
      }
    } else {
      events.push({ kind: 'at-station', t: e.t, clock, workerId: w.id, name: w.name, crew: w.crew, text: `${w.name} at station` });
    }
  }

  const crews: CrewStatus[] = CREWS
    .filter((c) => rosterByCrew.has(c.id))
    .map((c) => ({
      crew: c,
      rostered: rosterByCrew.get(c.id) ?? 0,
      signedIn: signedByCrew.get(c.id) ?? 0,
      atStation: routes.filter((r) => r.worker.crew === c.id && r.arrive[r.arrive.length - 1] <= t).length,
      completeAt: completeAt.get(c.id) ?? null,
    }));

  const atStation = crews.reduce((n, c) => n + c.atStation, 0);
  return {
    t,
    clock: clockAt(t),
    onSite: signedTotal,
    rostered: routes.length,
    atStation,
    crews,
    events,
    ready: atStation === routes.length,
  };
}
