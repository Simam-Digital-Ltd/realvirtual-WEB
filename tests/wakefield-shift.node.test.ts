// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Shift change — routes, timing and the board.
 *
 * The route tests exist because of a real mistake. The first draft trusted a
 * comment saying the machine line was "centred near origin", assumed that
 * meant the hall centre, and laid the packing crew's walkway straight through
 * the line. Only measuring the loaded GLB caught it. These obstacles are the
 * MEASURED ones, so a future tweak to a waypoint that clips steel fails here
 * instead of on a site manager's screen.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  AM_SHIFT,
  CREWS,
  routeFor,
  timeRoute,
  timeRoster,
  poseAt,
  eventTime,
  shiftSnapshot,
  shiftDuration,
  formatClock,
  clockAt,
  type Waypoint,
} from '../src/plugins/demo/wakefield-shift';

const cz = -1.15;

interface Box { name: string; x0: number; x1: number; z0: number; z1: number }

/** The machine line's footprint, measured from the loaded GLB. */
const MACHINE: Box = { name: 'machine line (GLB)', x0: -6.29, x1: 6.21, z0: -3.46, z1: 3.71 };

/**
 * Every body-height object in the loaded hall, measured at runtime (see the
 * fixture's `source`). Padded by 20 cm of body clearance. This replaced a
 * hand-written list that knew about 8 obstacles; the real hall has 429, and
 * the hand-drawn routes were walking through the stairs and a QA lab.
 */
const FIXTURE = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/wakefield-hall-obstacles.json'), 'utf8')) as { boxes: Box[] };
const BODY = 0.2;
const INTERIOR: Box[] = FIXTURE.boxes.map((b) => ({ ...b, x0: b.x0 - BODY, x1: b.x1 + BODY, z0: b.z0 - BODY, z1: b.z1 + BODY }));

const EXTERIOR: Box[] = [
  // Car-park rows: 5 m cars centred on bayX, bays from SITE_Z-12 to SITE_Z+14.
  { name: 'car row 0', x0: 28.5, x1: 33.5, z0: cz - 12.9, z1: cz + 14.9 },
  { name: 'car row 1', x0: 40.5, x1: 45.5, z0: cz - 12.9, z1: cz + 14.9 },
  // Perimeter hedge, which has no gap for the approach road.
  { name: 'perimeter hedge', x0: -72, x1: 72, z0: cz + 45.1, z1: cz + 46.9 },
];

/** Does the segment a->b pass through the box? (Liang-Barsky clip.) */
function segmentHitsBox(a: { x: number; z: number }, b: { x: number; z: number }, box: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  return clip(-dx, a.x - box.x0) && clip(dx, box.x1 - a.x)
    && clip(-dz, a.z - box.z0) && clip(dz, box.z1 - a.z) && t0 < t1;
}

/** Segments split at the staff door: the part outside, and the part in the hall. */
function legs(points: Waypoint[]) {
  const enter = points.findIndex((p) => p.event === 'enter');
  const kit = points.findIndex((p) => p.event === 'kit-up');
  const outside: [Waypoint, Waypoint][] = [];
  const hall: [Waypoint, Waypoint][] = [];
  for (let i = 1; i < points.length; i++) {
    if (i <= enter) outside.push([points[i - 1], points[i]]);
    // From the hall door (the waypoint after the changing room) onwards.
    else if (i > kit + 1) hall.push([points[i - 1], points[i]]);
  }
  return { outside, hall };
}

describe('shift routes stay on clear floor', () => {
  for (const w of AM_SHIFT) {
    it(`${w.name} (${w.crew}) never walks through equipment`, () => {
      const { outside, hall } = legs(routeFor(w));
      for (const [a, b] of hall) {
        for (const box of INTERIOR) {
          expect(segmentHitsBox(a, b, box), `${box.name}: (${a.x},${a.z})->(${b.x},${b.z})`).toBe(false);
        }
      }
      for (const [a, b] of outside) {
        for (const box of EXTERIOR) {
          expect(segmentHitsBox(a, b, box), `${box.name}: (${a.x},${a.z})->(${b.x},${b.z})`).toBe(false);
        }
      }
    });
  }

  it('every station is inside the hall walls', () => {
    for (const w of AM_SHIFT) {
      expect(Math.abs(w.station.x)).toBeLessThan(15);
      expect(w.station.z).toBeGreaterThan(cz - 10);
      expect(w.station.z).toBeLessThan(cz + 10);
    }
  });

  it('the fixture is the real hall, not a stub', () => {
    expect(INTERIOR.length).toBeGreaterThan(300);
    expect(FIXTURE.boxes.some((b) => /stair/.test(b.name))).toBe(true);
  });

  it('the obstacle check itself works — the old south walkway is caught', () => {
    // The draft route that went through the line. If this ever passes, the
    // test above is not testing anything.
    const old = { x: -8, z: cz + 4.4 };
    const station = { x: 0.5, z: cz + 4.4 };
    expect(segmentHitsBox(old, station, MACHINE)).toBe(true);
  });
});

describe('route order', () => {
  it('badge -> enter -> kit-up -> station, in that order, once each', () => {
    for (const w of AM_SHIFT) {
      const events = routeFor(w).map((p) => p.event).filter(Boolean);
      expect(events).toEqual(['badge', 'enter', 'kit-up', 'station']);
    }
  });

  it('ends exactly on the station', () => {
    for (const w of AM_SHIFT) {
      const pts = routeFor(w);
      expect(pts[pts.length - 1]).toMatchObject({ x: w.station.x, z: w.station.z });
    }
  });
});

describe('timing and poses', () => {
  it('arrival times never go backwards', () => {
    for (const r of timeRoster()) {
      for (let i = 1; i < r.arrive.length; i++) expect(r.arrive[i]).toBeGreaterThanOrEqual(r.leave[i - 1]);
    }
  });

  it('nobody is visible before they arrive', () => {
    const r = timeRoute(AM_SHIFT[3]);
    expect(poseAt(r, r.worker.spawnAt - 0.01)).toMatchObject({ phase: 'not-arrived', hidden: true });
  });

  it('stands still at the badge reader, facing it', () => {
    const r = timeRoute(AM_SHIFT[0]);
    const p = poseAt(r, eventTime(r, 'badge') + 0.3);
    expect(p.phase).toBe('badging');
    expect(p.moving).toBe(false);
    expect(p.heading).toBeCloseTo(Math.PI, 5);
  });

  it('kits up out of sight, and comes out of the office already kitted', () => {
    const r = timeRoute(AM_SHIFT[0]);
    const kit = eventTime(r, 'kit-up');
    expect(poseAt(r, kit - 0.01)).toMatchObject({ hidden: true, kitted: false });
    expect(poseAt(r, kit + 0.01)).toMatchObject({ hidden: true, kitted: true });
    // First visible moment inside the hall: kit on.
    const hallIdx = r.points.findIndex((p) => p.event === 'kit-up') + 1;
    expect(poseAt(r, r.arrive[hallIdx] + 0.01)).toMatchObject({ hidden: false, kitted: true });
  });

  it('ends at the station facing the work', () => {
    for (const r of timeRoster()) {
      const end = r.arrive[r.arrive.length - 1];
      const p = poseAt(r, end + 5);
      expect(p.phase).toBe('at-station');
      expect(p.x).toBeCloseTo(r.worker.station.x, 6);
      expect(p.z).toBeCloseTo(r.worker.station.z, 6);
      expect(p.heading).toBe(r.worker.facing);
    }
  });

  it('pose is continuous — no teleports mid-walk', () => {
    const r = timeRoute(AM_SHIFT[5]);
    const end = r.arrive[r.arrive.length - 1];
    let prev = poseAt(r, r.worker.spawnAt);
    for (let t = r.worker.spawnAt + 0.05; t < end; t += 0.05) {
      const p = poseAt(r, t);
      // 0.05 s at walking pace is under 8 cm; allow a little slack.
      expect(Math.hypot(p.x - prev.x, p.z - prev.z)).toBeLessThan(0.12);
      prev = p;
    }
  });
});

describe('the board', () => {
  const routes = timeRoster();
  const end = shiftDuration(routes);

  it('the fire roll is exactly the number signed in', () => {
    for (let t = 0; t <= end + 1; t += 0.5) {
      const s = shiftSnapshot(routes, t);
      const signed = s.events.filter((e) => e.kind === 'signed-in').length;
      expect(s.onSite).toBe(signed);
      expect(s.crews.reduce((n, c) => n + c.signedIn, 0)).toBe(signed);
    }
  });

  it('starts empty and finishes with everyone at their station', () => {
    expect(shiftSnapshot(routes, 0).onSite).toBe(0);
    const done = shiftSnapshot(routes, end);
    expect(done.onSite).toBe(AM_SHIFT.length);
    expect(done.atStation).toBe(AM_SHIFT.length);
    expect(done.ready).toBe(true);
    expect(shiftSnapshot(routes, end - 0.01).ready).toBe(false);
  });

  it('each crew completes exactly once, and "everyone on site" fires once', () => {
    const ev = shiftSnapshot(routes, end).events;
    for (const c of CREWS) {
      expect(ev.filter((e) => e.kind === 'crew-complete' && e.crew === c.id)).toHaveLength(1);
    }
    expect(ev.filter((e) => e.kind === 'all-in')).toHaveLength(1);
    expect(ev.filter((e) => e.kind === 'first-in')).toHaveLength(1);
  });

  it('first in is the shift manager', () => {
    const first = shiftSnapshot(routes, end).events.find((e) => e.kind === 'first-in');
    expect(first?.workerId).toBe('w-mgr');
  });

  it('is a pure function of t — replay gives identical events', () => {
    const a = shiftSnapshot(routes, end * 0.6).events.map((e) => e.text + e.t);
    shiftSnapshot(routes, end); // jump ahead
    const b = shiftSnapshot(routes, end * 0.6).events.map((e) => e.text + e.t);
    expect(b).toEqual(a);
  });

  it('everyone is signed in before 07:00', () => {
    const lastBadge = Math.max(...routes.map((r) => eventTime(r, 'badge')));
    expect(clockAt(lastBadge)).toBeLessThan(7 * 60);
  });

  it('formats the clock as a site would', () => {
    expect(formatClock(6 * 60 + 41.9)).toBe('06:41');
    expect(formatClock(7 * 60)).toBe('07:00');
  });
});
