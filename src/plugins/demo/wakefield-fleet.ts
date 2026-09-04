// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Wakefield outbound fleet — the dock boundary, as a mechanism.
 *
 * THE POINT OF THIS FILE
 * ----------------------
 * The factory and the logistics SaaS are the same operation at two scales, and
 * the seam between them is the loading dock: cases packed on the line go into a
 * trailer, the trailer leaves, and from that moment it is a fleet problem.
 * Until now that was a sentence in a case study. This makes it a mechanism.
 *
 * A trailer standing on Dock 4 fills from `ProductionSnapshot.casesTotal` —
 * the REAL count of units consumed by the model's sinks, not a scripted timer.
 * When it reaches capacity it departs, follows the site roads, and leaves the
 * estate. Stop the line and loading stops with it; that is the honest
 * behaviour and it is the whole reason to wire it to live telemetry rather
 * than to a clock.
 *
 * VOCABULARY
 * ----------
 * Field names deliberately mirror `Vehicle` in the logistics SaaS (now
 * @simam/ops-core): `progress` 0..1 along a route, `status` of
 * 'loading' | 'moving' | 'delayed', `cargo`, `eta`. The two products should
 * describe the same lorry the same way, so the eventual merge is a swap of
 * import path rather than a translation layer.
 *
 * This module does NOT import ops-core. realvirtual WEB has to stay
 * buildable on its own — a file: dependency on a sibling folder would break
 * every other machine — so the shape is mirrored and the adoption is staged.
 * See the ops-core README: the SaaS migrates first, being the origin of the
 * code, then this follows.
 *
 * PURITY
 * ------
 * No three.js here. Waypoints are plain {x, z} so the whole departure model
 * can be tested without a canvas, the same split that worked for
 * `guided-review.ts`. The mesh lives in `wakefield-fleet-model.ts`.
 */

/** A point on the yard/road network, in metres, in scene space. */
export interface Waypoint {
  x: number;
  z: number;
}

/** Movement state, matching the SaaS `Vehicle['status']` union. */
export type FleetStatus = 'loading' | 'moving' | 'delayed';

/** One outbound lorry. A deliberate subset of the SaaS `Vehicle`. */
export interface FleetVehicle {
  id: string;
  name: string;
  type: 'HGV';
  /** 0..1 along {@link OUTBOUND_ROUTE}. Only meaningful while `moving`. */
  progress: number;
  status: FleetStatus;
  /** Cases loaded so far. */
  cases: number;
  /** Cases this trailer holds when full. */
  capacity: number;
  /** Human-readable cargo line, for the fleet list. */
  cargo: string;
  /** Minutes until it clears the estate, or null while still loading. */
  etaMinutes: number | null;
}

/** Site centre, matching HALL / SITE_Z across the Wakefield layers. */
const SITE_Z = -1.15;

/**
 * The departure route, laid on the roads that actually exist in
 * `wakefield-exterior.ts` — the dock apron, then the eastern service road
 * (x = 78), then the northern road (z = SITE_Z - 52) heading west off site.
 *
 * Driving a lorry over the grass because the waypoints were invented
 * independently of the geometry is exactly the kind of detail that makes a
 * demo feel fake, so these are tied to the road centrelines.
 */
export const OUTBOUND_ROUTE: readonly Waypoint[] = [
  { x: 9.5, z: SITE_Z - 8.5 },   // trailer stood on Dock 4
  { x: 30, z: SITE_Z - 8.5 },    // pull off the apron
  { x: 60, z: SITE_Z - 12 },     // curve onto the yard exit
  { x: 78, z: SITE_Z - 24 },     // join the eastern service road
  { x: 78, z: SITE_Z - 52 },     // north to the junction
  { x: 30, z: SITE_Z - 52 },     // west on the northern road
  { x: -90, z: SITE_Z - 52 },    // off site
] as const;

/** Cases a trailer holds before it departs. */
export const TRAILER_CAPACITY = 260;
/** Road speed in metres per second (~40 km/h on an estate). */
export const ROAD_SPEED_MS = 11;
/** Progress past which the lorry has left and is recycled. */
const DESPATCHED = 1;

/** Sequential vehicle numbering, so names read like a real fleet. */
let _sequence = 0;

function nextVehicle(): FleetVehicle {
  _sequence += 1;
  return {
    id: `hgv-${String(_sequence).padStart(2, '0')}`,
    name: `HGV-${String(_sequence).padStart(2, '0')}`,
    type: 'HGV',
    progress: 0,
    status: 'loading',
    cases: 0,
    capacity: TRAILER_CAPACITY,
    cargo: 'Ambient palletised — Wakefield WPF-41',
    etaMinutes: null,
  };
}

/** Reset numbering. Called when the model reloads so ids do not creep. */
export function resetFleetSequence(): void {
  _sequence = 0;
}

/** Total route length in metres. Cached — the route is a constant. */
export const ROUTE_LENGTH_M = (() => {
  let total = 0;
  for (let i = 1; i < OUTBOUND_ROUTE.length; i++) {
    const a = OUTBOUND_ROUTE[i - 1]!;
    const b = OUTBOUND_ROUTE[i]!;
    total += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return total;
})();

/**
 * Position and heading at a point along the route.
 *
 * Heading is returned as a Y rotation in radians so the caller can orient a
 * mesh without recomputing the segment. `atan2(dx, dz)` (not the usual
 * `dz, dx`) because the lorry model faces +Z.
 */
export function sampleRoute(progress: number): { x: number; z: number; heading: number } {
  const clamped = Math.min(1, Math.max(0, progress));
  let remaining = clamped * ROUTE_LENGTH_M;

  for (let i = 1; i < OUTBOUND_ROUTE.length; i++) {
    const a = OUTBOUND_ROUTE[i - 1]!;
    const b = OUTBOUND_ROUTE[i]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const segment = Math.hypot(dx, dz);
    if (remaining <= segment || i === OUTBOUND_ROUTE.length - 1) {
      const t = segment === 0 ? 0 : Math.min(1, remaining / segment);
      return { x: a.x + dx * t, z: a.z + dz * t, heading: Math.atan2(dx, dz) };
    }
    remaining -= segment;
  }

  const last = OUTBOUND_ROUTE[OUTBOUND_ROUTE.length - 1]!;
  return { x: last.x, z: last.z, heading: 0 };
}

/** What the fleet needs to know from the production line each tick. */
export interface FleetInput {
  /** Cumulative cases produced since load. Monotonic. */
  casesTotal: number;
  /** True when the model actually has sinks — otherwise nothing is measured. */
  hasSinks: boolean;
}

/**
 * The outbound fleet.
 *
 * Deliberately a small state machine rather than a physics sim: one trailer
 * loads at a time, departs when full, and a fresh one backs onto the bay.
 * That is how a single-dock operation actually behaves, and it keeps the
 * relationship between "cases packed" and "lorries leaving" legible — which
 * is the entire point of showing it.
 */
export class OutboundFleet {
  private _vehicles: FleetVehicle[] = [];
  /** casesTotal at the moment the current trailer started loading. */
  private _loadBaseline = 0;
  /** Last casesTotal seen, to detect a sim reset. */
  private _lastCasesTotal = 0;

  constructor() {
    this._vehicles.push(nextVehicle());
  }

  /** Every vehicle currently on site, loading or moving. */
  get vehicles(): readonly FleetVehicle[] {
    return this._vehicles;
  }

  /** The trailer currently on the bay, if any. */
  get loading(): FleetVehicle | undefined {
    return this._vehicles.find((v) => v.status === 'loading');
  }

  /**
   * Advance by `dt` seconds against the current production reading.
   *
   * Returns the ids of vehicles that left the estate on this tick, so the
   * caller can retire their meshes without diffing the whole list.
   */
  update(dt: number, input: FleetInput): string[] {
    // A sim reset drops casesTotal back to zero. Without this the baseline
    // would sit above the counter and the trailer would never fill again —
    // silently, which is the worst way for a demo to break.
    if (input.casesTotal < this._lastCasesTotal) {
      this._loadBaseline = 0;
    }
    this._lastCasesTotal = input.casesTotal;

    const departed: string[] = [];

    for (const vehicle of this._vehicles) {
      if (vehicle.status === 'loading') {
        // Only count real output. With no sinks there is nothing to load, and
        // filling the trailer anyway would be inventing throughput.
        vehicle.cases = input.hasSinks
          ? Math.max(0, Math.min(vehicle.capacity, input.casesTotal - this._loadBaseline))
          : 0;
        if (vehicle.cases >= vehicle.capacity) {
          vehicle.status = 'moving';
          this._loadBaseline = input.casesTotal;
        }
        continue;
      }

      vehicle.progress += (ROAD_SPEED_MS * dt) / ROUTE_LENGTH_M;
      const remainingM = Math.max(0, (1 - vehicle.progress) * ROUTE_LENGTH_M);
      vehicle.etaMinutes = remainingM / ROAD_SPEED_MS / 60;

      if (vehicle.progress >= DESPATCHED) departed.push(vehicle.id);
    }

    if (departed.length > 0) {
      this._vehicles = this._vehicles.filter((v) => !departed.includes(v.id));
    }
    // Always keep a trailer on the bay, so the dock is never empty on screen.
    if (!this._vehicles.some((v) => v.status === 'loading')) {
      this._vehicles.push(nextVehicle());
    }

    return departed;
  }
}
