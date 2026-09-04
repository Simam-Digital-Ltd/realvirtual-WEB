// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Spatial hotspot model — the anchor/connector/card triad.
 *
 * WHAT THIS IS
 * ------------
 * A hotspot is a point in the 3D world, a thin line, and a readout parked
 * clear of the geometry. Enough of those turn a rendered factory into a
 * command centre, because the numbers stop being a dashboard beside the
 * model and start being labels ON it.
 *
 * WHY IT IS PURE
 * --------------
 * No three.js and no React here. Projection needs a camera and cards need a
 * DOM, but neither the reading logic nor the collision resolution does — and
 * those are the two parts that can be wrong in ways a screenshot will not
 * show. Same split that worked for `guided-review.ts` and `wakefield-fleet.ts`.
 *
 * THE HONESTY RULE
 * ----------------
 * This model has drives, sensors and sinks. It does not have a power meter,
 * a hygrometer, an air-pressure transducer or a vision inspection station.
 * Hotspots for those exist — the physical plant has them, so the twin should
 * show where they are — but they report `unmetered` rather than a plausible
 * number.
 *
 * That is a deliberate product decision, not a limitation being hidden. A
 * buyer who catches one invented reading stops believing the other eleven,
 * and every reading on this screen is one an operator could contradict from
 * the floor. Rendering the gap also makes the twin its own instrumentation
 * survey: each dimmed tile is a meter that is not fitted yet.
 *
 * To trade that for a fuller-looking demo, set {@link SYNTHESISE_UNMETERED}
 * to true — one flag, one place.
 */

import type { ProductionSnapshot } from '../../core/production-metrics';
import type { FleetVehicle } from './wakefield-fleet';

/** Site centre, matching HALL / SITE_Z across the Wakefield layers. */
const SITE_Z = -1.15;

/**
 * Fill unmetered hotspots with modelled values instead of showing the gap.
 * Read the honesty rule above before flipping this.
 */
export const SYNTHESISE_UNMETERED = false;

/** Plain vector, so this module never imports three.js. */
export interface Vec3Like { x: number; y: number; z: number }

/** Icon key, resolved to a component by the React layer. */
export type HotspotIcon =
  | 'robot' | 'conveyor' | 'package' | 'quality'
  | 'power' | 'hvac' | 'air' | 'dock' | 'fleet' | 'safety';

/**
 * Reading state.
 *
 * `unmetered` is not a failure — it means no instrument reports this and we
 * decline to invent one. It renders dimmed, never red.
 */
export type HotspotStatus = 'optimal' | 'healthy' | 'attention' | 'fault' | 'unmetered';

/**
 * Detail band at which a hotspot earns its screen space.
 *
 * A hotspot declares the LOWEST zoom at which it should appear, so pulling
 * the camera back thins the layer to plant-level facts instead of stacking
 * nine cards into an unreadable wall.
 */
export type ZoomBand = 'far' | 'medium' | 'near';

const BAND_RANK: Record<ZoomBand, number> = { far: 0, medium: 1, near: 2 };

/** Camera distances (metres from site centre) that separate the bands. */
export const NEAR_BAND_M = 46;
export const MEDIUM_BAND_M = 135;

export interface HotspotDef {
  id: string;
  title: string;
  icon: HotspotIcon;
  /** Where the anchor dot sits, in scene metres. */
  anchor: Vec3Like;
  /** Which side of the anchor the card prefers. */
  side: 'left' | 'right';
  /** Lowest zoom band at which this hotspot is shown. */
  band: ZoomBand;
  /** Zone card this hotspot belongs to, for cross-highlighting. */
  zoneId?: string;
}

export interface HotspotReading {
  value: string;
  unit?: string;
  /** The supporting line under the value. */
  detail: string;
  status: HotspotStatus;
  /**
   * Where this number came from. Surfaced on the card's tooltip, so any
   * reading on screen can be traced back to the thing that produced it.
   */
  evidence: string;
}

/* ------------------------------------------------------------------ *
 * Hotspot placement
 *
 * Anchors sit on real geometry from `wakefield-exterior.ts` and
 * `wakefield-interior.ts` — the hall is 30 x 20 centred on (0, SITE_Z),
 * eaves at 9 m, Dock 4 on the south face at x = 9.5.
 *
 * Cards prefer whichever side keeps them off the building: the point of the
 * layer is to annotate the factory, not to cover it.
 * ------------------------------------------------------------------ */
export const WAKEFIELD_HOTSPOTS: readonly HotspotDef[] = [
  {
    id: 'line-throughput',
    title: 'Packing Line',
    icon: 'conveyor',
    anchor: { x: -4, y: 4.2, z: SITE_Z + 2 },
    side: 'right',
    band: 'far',
    zoneId: 'zone-packing',
  },
  {
    id: 'line-availability',
    title: 'Line Availability',
    icon: 'safety',
    anchor: { x: 4.5, y: 6.5, z: SITE_Z + 6 },
    side: 'right',
    band: 'far',
    zoneId: 'zone-packing',
  },
  {
    id: 'robot-cell',
    title: 'Robot Cell A',
    icon: 'robot',
    anchor: { x: 0.5, y: 2.6, z: SITE_Z - 1 },
    side: 'right',
    band: 'medium',
    zoneId: 'zone-robotics',
  },
  {
    id: 'outbound-dock',
    title: 'Outbound Dock 4',
    icon: 'dock',
    anchor: { x: 9.5, y: 3.4, z: SITE_Z - 9.8 },
    side: 'right',
    band: 'far',
    zoneId: 'zone-warehouse',
  },
  {
    id: 'yard-fleet',
    title: 'Yard / Fleet',
    icon: 'fleet',
    anchor: { x: 40, y: 3, z: SITE_Z - 26 },
    side: 'right',
    band: 'far',
    zoneId: 'zone-yard',
  },
  {
    id: 'quality',
    title: 'Quality Inspection',
    icon: 'quality',
    anchor: { x: -7.5, y: 2.8, z: SITE_Z - 4 },
    side: 'left',
    band: 'near',
    zoneId: 'zone-quality',
  },
  {
    id: 'power',
    title: 'Power Distribution',
    icon: 'power',
    anchor: { x: -17.5, y: 2.4, z: SITE_Z - 2 },
    side: 'left',
    band: 'medium',
    zoneId: 'zone-utilities',
  },
  {
    id: 'hvac',
    title: 'HVAC / Environment',
    icon: 'hvac',
    anchor: { x: -6, y: 10.4, z: SITE_Z - 5 },
    side: 'left',
    band: 'medium',
    zoneId: 'zone-utilities',
  },
  {
    id: 'compressed-air',
    title: 'Compressed Air',
    icon: 'air',
    anchor: { x: -17.5, y: 2.4, z: SITE_Z + 5 },
    side: 'left',
    band: 'near',
    zoneId: 'zone-utilities',
  },
] as const;

/** Which band the camera is in, from its distance to site centre. */
export function zoomBand(distanceM: number): ZoomBand {
  if (distanceM <= NEAR_BAND_M) return 'near';
  if (distanceM <= MEDIUM_BAND_M) return 'medium';
  return 'far';
}

/** The hotspots that earn screen space at this zoom. */
export function hotspotsForBand(
  defs: readonly HotspotDef[],
  band: ZoomBand,
): readonly HotspotDef[] {
  return defs.filter((d) => BAND_RANK[band] >= BAND_RANK[d.band]);
}

/* ------------------------------------------------------------------ *
 * Readings
 * ------------------------------------------------------------------ */

export interface HotspotContext {
  snapshot: ProductionSnapshot;
  fleet: readonly FleetVehicle[];
}

/** The reading used wherever no instrument reports the quantity. */
function unmetered(what: string, wouldNeed: string): HotspotReading {
  return {
    value: '—',
    detail: `No ${wouldNeed} on this site`,
    status: 'unmetered',
    evidence: `${what} is not instrumented in this model. Nothing is being `
      + 'measured, so nothing is being reported.',
  };
}

/**
 * Availability grading, matching the thresholds the guided review already
 * uses, so the two never disagree on screen about the same plant.
 */
function gradeAvailability(pct: number): HotspotStatus {
  if (pct >= 90) return 'optimal';
  if (pct >= 60) return 'attention';
  return 'fault';
}

/** Minutes to a short human string. Null while a trailer is still loading. */
export function formatEta(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 1) return 'under a minute';
  return `${Math.round(minutes)} min`;
}

/** Derive one hotspot's reading from live telemetry. */
export function readHotspot(def: HotspotDef, ctx: HotspotContext): HotspotReading {
  const { snapshot: s, fleet } = ctx;

  switch (def.id) {
    case 'line-throughput': {
      if (!s.hasSinks) {
        return {
          value: '—',
          detail: 'No sinks in this model',
          status: 'unmetered',
          evidence: 'Throughput is counted at the sinks. This model has none, '
            + 'so no case has been measured leaving the line.',
        };
      }
      return {
        value: Math.round(s.casesPerHour).toLocaleString('en-GB'),
        unit: 'cases/h',
        detail: `${s.casesTotal.toLocaleString('en-GB')} this run`,
        status: s.casesPerHour > 0 ? 'optimal' : 'attention',
        evidence: `Counted at the model's sinks: ${s.casesTotal} units over `
          + `${Math.round(s.elapsedSec)} s of run time.`,
      };
    }

    case 'line-availability': {
      if (!s.hasDrives) {
        return {
          value: '—',
          detail: 'No drives in this model',
          status: 'unmetered',
          evidence: 'Availability is derived from drive run time. This model '
            + 'exposes no drives.',
        };
      }
      const pct = Math.round(s.availabilityPct);
      return {
        value: String(pct),
        unit: '%',
        detail: `${s.drivesRunning} / ${s.driveCount} drives running`,
        status: gradeAvailability(pct),
        evidence: `${s.drivesRunning} of ${s.driveCount} drives are turning `
          + `right now; availability is their run time over ${Math.round(s.elapsedSec)} s.`,
      };
    }

    case 'robot-cell': {
      if (!s.hasDrives) return unmetered('Cell motion', 'drives');
      const running = s.drivesRunning > 0;
      return {
        value: running ? 'Running' : 'Stopped',
        detail: `${s.drivesRunning} / ${s.driveCount} axes in motion`,
        status: running ? 'optimal' : 'attention',
        evidence: 'Read from the drive states in the loaded model. The cell '
          + 'reports as running whenever any of its axes is turning.',
      };
    }

    case 'outbound-dock': {
      const loading = fleet.find((v) => v.status === 'loading');
      if (!loading) {
        return {
          value: '—',
          detail: 'No trailer on the bay',
          status: 'attention',
          evidence: 'The outbound fleet reports no vehicle in the loading state.',
        };
      }
      const pct = Math.round((loading.cases / loading.capacity) * 100);
      return {
        value: String(pct),
        unit: '% full',
        detail: `${loading.name} · ${loading.cases} / ${loading.capacity} cases`,
        status: pct > 0 ? 'optimal' : 'attention',
        evidence: `${loading.name} has taken ${loading.cases} of the `
          + `${loading.capacity} cases the trailer holds. The count comes from `
          + "the line's sinks, so it stops when the line stops.",
      };
    }

    case 'yard-fleet': {
      const moving = fleet.filter((v) => v.status === 'moving');
      if (moving.length === 0) {
        return {
          value: '0',
          unit: 'moving',
          detail: `${fleet.length} on site, none despatched`,
          status: 'healthy',
          evidence: 'No vehicle has reached its trailer capacity yet, so none '
            + 'has departed the estate.',
        };
      }
      const soonest = moving.reduce((a, b) =>
        (a.etaMinutes ?? Infinity) <= (b.etaMinutes ?? Infinity) ? a : b);
      return {
        value: String(moving.length),
        unit: moving.length === 1 ? 'vehicle' : 'vehicles',
        detail: `${soonest.name} clears site in ${formatEta(soonest.etaMinutes)}`,
        status: 'optimal',
        evidence: `${moving.length} despatched trailer(s) are on the site roads. `
          + 'ETA is the remaining route length at estate speed.',
      };
    }

    case 'quality':
      return unmetered('Inspection pass rate', 'vision inspection station');
    case 'power':
      return unmetered('Electrical load', 'energy meter');
    case 'hvac':
      return unmetered('Hall temperature and humidity', 'environment sensor');
    case 'compressed-air':
      return unmetered('Ring-main pressure', 'pressure transducer');

    default:
      return unmetered(def.title, 'instrument');
  }
}

/** Read every visible hotspot in one pass. */
export function readHotspots(
  defs: readonly HotspotDef[],
  ctx: HotspotContext,
): Map<string, HotspotReading> {
  const out = new Map<string, HotspotReading>();
  for (const d of defs) out.set(d.id, readHotspot(d, ctx));
  return out;
}

/* ------------------------------------------------------------------ *
 * Projection
 * ------------------------------------------------------------------ */

/** One anchor, projected to screen. `x`/`y` are always finite. */
export interface Projection {
  x: number;
  y: number;
  /** False when the anchor is behind the camera, off-screen, or unprojectable. */
  visible: boolean;
}

/** The canvas geometry a projection is measured against, in client pixels. */
export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Convert a projected NDC point to client pixels.
 *
 * NON-FINITE INPUT IS THE WHOLE REASON THIS IS A SEPARATE FUNCTION.
 *
 * `camera.aspect` becomes NaN whenever the canvas is measured at zero size —
 * a collapsed pane, a hidden tab, a resize race on startup — and that NaN
 * propagates through the projection matrix into every projected point. If a
 * NaN is allowed to reach the cache, the hotspot is stuck forever: the
 * staleness check is a set of comparisons against the previous value, and
 * EVERY comparison against NaN is false, so the entry can never be judged
 * stale and never gets replaced. The layer silently loses those callouts for
 * the rest of the session, with no error anywhere.
 *
 * So the guard lives here, on the boundary, and unprojectable points come
 * back as a finite (0, 0) marked invisible — a value the cache can compare
 * and recover from on the next good frame.
 */
export function ndcToScreen(
  ndcX: number,
  ndcY: number,
  ndcZ: number,
  rect: ScreenRect,
): Projection {
  // ndcZ > 1 means the point is behind the camera. Projecting it yields a
  // mirrored position that would put a card on the wrong side of the screen
  // with a connector reaching backwards across the viewport.
  const inFront = ndcZ < 1;
  const x = rect.left + (ndcX * 0.5 + 0.5) * rect.width;
  const y = rect.top + (-ndcY * 0.5 + 0.5) * rect.height;

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { x: 0, y: 0, visible: false };
  }

  const onScreen = inFront
    && x >= rect.left && x <= rect.left + rect.width
    && y >= rect.top && y <= rect.top + rect.height;

  return { x, y, visible: onScreen };
}

/**
 * Whether a newly projected point is different enough from the cached one to
 * be worth a re-render.
 *
 * A missing previous value always counts as changed. Both values are
 * guaranteed finite by {@link ndcToScreen}, so the comparisons below cannot
 * be silently swallowed the way a NaN comparison would.
 */
export function projectionChanged(
  prev: Projection | undefined,
  next: Projection,
  epsilonPx: number,
): boolean {
  if (!prev) return true;
  if (prev.visible !== next.visible) return true;
  return Math.abs(prev.x - next.x) > epsilonPx
    || Math.abs(prev.y - next.y) > epsilonPx;
}

/* ------------------------------------------------------------------ *
 * Screen-space layout
 * ------------------------------------------------------------------ */

/** A card the layout pass has to place, in CSS pixels. */
export interface CardBox {
  id: string;
  /** Projected anchor position. */
  anchorX: number;
  anchorY: number;
  side: 'left' | 'right';
  width: number;
  height: number;
}

/** Where a card ended up. `x`,`y` is the card's top-left corner. */
export interface PlacedCard {
  id: string;
  x: number;
  y: number;
  side: 'left' | 'right';
}

/** Gap between an anchor and the near edge of its card. */
export const CARD_STANDOFF_PX = 58;
/** Minimum vertical gap between two cards. */
export const CARD_GUTTER_PX = 10;
/** Keep-out margin at the viewport edge. */
export const VIEWPORT_MARGIN_PX = 16;

function clamp(v: number, lo: number, hi: number): number {
  if (hi < lo) return lo;
  return Math.max(lo, Math.min(hi, v));
}

/**
 * The side a card actually gets.
 *
 * Preference wins unless it would push the card off the viewport, in which
 * case it flips. A card that fits on neither side keeps its preference and
 * gets clamped by {@link layoutCards} — better a crowded edge than a card
 * that silently vanishes.
 */
export function chooseSide(
  box: CardBox,
  viewport: { width: number; height: number },
): 'left' | 'right' {
  const fitsRight =
    box.anchorX + CARD_STANDOFF_PX + box.width <= viewport.width - VIEWPORT_MARGIN_PX;
  const fitsLeft =
    box.anchorX - CARD_STANDOFF_PX - box.width >= VIEWPORT_MARGIN_PX;

  if (box.side === 'right') return fitsRight || !fitsLeft ? 'right' : 'left';
  return fitsLeft || !fitsRight ? 'left' : 'right';
}

/**
 * Place cards so none overlaps another and none leaves the viewport.
 *
 * Each card starts beside its anchor on its chosen side, then the column is
 * swept top-to-bottom and each card pushed clear of the one above it.
 *
 * Sweeping in projected-Y order is the part that matters: it keeps the
 * vertical ordering of the cards the same as the vertical ordering of the
 * things they label, which is what stops the connectors crossing. Resolving
 * collisions in definition order instead produces a technically valid layout
 * whose lines are woven together and unreadable.
 */
export function layoutCards(
  boxes: readonly CardBox[],
  viewport: { width: number; height: number },
): PlacedCard[] {
  const placed: PlacedCard[] = [];
  const sided = boxes.map((box) => ({ box, side: chooseSide(box, viewport) }));

  for (const side of ['left', 'right'] as const) {
    const column = sided
      .filter((c) => c.side === side)
      .sort((a, b) => a.box.anchorY - b.box.anchorY);

    let floor = VIEWPORT_MARGIN_PX;

    for (const { box } of column) {
      const rawX = side === 'right'
        ? box.anchorX + CARD_STANDOFF_PX
        : box.anchorX - CARD_STANDOFF_PX - box.width;

      // Centre on the anchor, then push down past anything already placed.
      let y = box.anchorY - box.height / 2;
      if (y < floor) y = floor;
      y = Math.min(y, viewport.height - VIEWPORT_MARGIN_PX - box.height);
      y = Math.max(y, VIEWPORT_MARGIN_PX);

      placed.push({
        id: box.id,
        x: clamp(rawX, VIEWPORT_MARGIN_PX, viewport.width - VIEWPORT_MARGIN_PX - box.width),
        y,
        side,
      });

      floor = y + box.height + CARD_GUTTER_PX;
    }
  }

  return placed;
}

/**
 * Connector geometry: vertical run, 45-degree knee, horizontal arrival.
 *
 * Every segment is vertical, horizontal, or exactly 45 degrees. That is the
 * whole rule, and it is what makes the layer read as technical drawing rather
 * than as a consumer app — the spec forbids Bezier curves here for the same
 * reason.
 *
 * The naive version (diagonal straight out of the anchor, then horizontal
 * into the card) only works while the card is further away horizontally than
 * vertically. Collision resolution routinely pushes a card further down than
 * across, and then the diagonal runs out of horizontal room and the last
 * segment comes out VERTICAL — the line drops onto the top of the card
 * instead of arriving at its edge.
 *
 * Putting the knee in the middle fixes both cases with one path: spend the
 * excess vertical distance first, turn 45 degrees, then run in flat. When the
 * card is mostly sideways the vertical leg is zero-length and this collapses
 * to exactly the intended "diagonal then horizontal"; when it is mostly
 * below, the horizontal leg collapses instead. Neither degenerate case bends.
 *
 * Returned as an SVG path in the same pixel space as the placement.
 */
export function connectorPath(
  anchorX: number,
  anchorY: number,
  card: PlacedCard,
  cardWidth: number,
  cardHeight: number,
): string {
  const targetX = card.side === 'right' ? card.x : card.x + cardWidth;
  const targetY = card.y + cardHeight / 2;

  const dx = targetX - anchorX;
  const dy = targetY - anchorY;
  // The knee is a 45-degree turn, so it covers the same distance on both
  // axes: as much as the shorter of the two will allow.
  const run = Math.min(Math.abs(dx), Math.abs(dy));
  const sx = Math.sign(dx) || 1;
  const sy = Math.sign(dy);

  const kneeStartX = anchorX;
  const kneeStartY = targetY - sy * run;
  const kneeEndX = anchorX + sx * run;
  const kneeEndY = targetY;

  return `M ${r(anchorX)} ${r(anchorY)}`
    + ` L ${r(kneeStartX)} ${r(kneeStartY)}`
    + ` L ${r(kneeEndX)} ${r(kneeEndY)}`
    + ` L ${r(targetX)} ${r(targetY)}`;
}

function r(n: number): number { return Math.round(n * 10) / 10; }
