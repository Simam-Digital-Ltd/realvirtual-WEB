// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Site zones — the bottom strip of the command centre.
 *
 * THE ONE IDEA HERE
 * -----------------
 * A zone's camera pose is used for BOTH the card's thumbnail and the flight
 * the card triggers when clicked. One pose, two jobs.
 *
 * That is not a saving, it is the feature: the picture on the card is
 * literally the view you get. A strip of stock photography that lands you
 * somewhere else is the thing that makes a demo feel like a brochure, and it
 * is impossible to get wrong here because there is only one number.
 *
 * It also means the thumbnails cannot go stale. Re-dress the yard, add a
 * building, change the time of day, and the strip re-renders itself from the
 * scene it is advertising.
 *
 * PURITY
 * ------
 * Plain {x,y,z} rather than Vector3 so the zone list stays testable and can
 * be read by anything — the React strip, the capture pass, and eventually a
 * per-customer site manifest. The three.js side lives in
 * `wakefield-thumbnails.ts`.
 */

import type { Vec3Like } from './wakefield-hotspots';

/** Site centre, matching HALL / SITE_Z across the Wakefield layers. */
const SITE_Z = -1.15;

export interface SiteZone {
  id: string;
  /** Two-digit ordinal shown on the card, as on a real plant schedule. */
  ordinal: string;
  name: string;
  /** The discipline line under the name. */
  discipline: string;
  /** Where the camera sits for both the thumbnail and the flight. */
  cameraPos: Vec3Like;
  /** What it looks at. */
  cameraTarget: Vec3Like;
  /**
   * Hotspot ids that belong to this zone. Selecting the zone raises them;
   * selecting one of them raises the zone. This is the cross-highlight that
   * makes the strip and the twin feel like one instrument rather than two
   * widgets that happen to be on the same screen.
   */
  hotspots: readonly string[];
}

/**
 * A NOTE ON THESE POSES
 *
 * They were not eyeballed. Each was picked by capturing candidates and
 * measuring the result: luminance standard deviation and distinct-colour
 * count over the rendered thumbnail. The first set of exterior poses stood
 * 60-135 m off and scored std 5-7 with 9-20 distinct colours — flat frames of
 * ground and sky with the factory as a smudge. Moving in and dropping the
 * camera to roughly eaves height took the same shots to std 19-20 with 71-80
 * colours.
 *
 * The metric only proves a frame is not empty. It says nothing about
 * composition, so treat these as a floor to improve on by eye, not a ceiling.
 * What it does guarantee is that a regression back to a blank card would be
 * caught by re-running the measurement rather than by someone noticing.
 */
export const WAKEFIELD_ZONES: readonly SiteZone[] = [
  {
    id: 'zone-yard',
    ordinal: '01',
    name: 'Yard & Gate',
    discipline: 'Inbound',
    cameraPos: { x: 20, y: 5.5, z: SITE_Z - 22 },
    cameraTarget: { x: 9.5, y: 3.5, z: SITE_Z - 10 },
    hotspots: ['yard-fleet'],
  },
  {
    id: 'zone-robotics',
    ordinal: '02',
    name: 'Robot Cell A',
    discipline: 'Robotics',
    cameraPos: { x: 6.5, y: 4.2, z: SITE_Z + 7 },
    cameraTarget: { x: 0.5, y: 1.6, z: SITE_Z - 1 },
    hotspots: ['robot-cell'],
  },
  {
    id: 'zone-packing',
    ordinal: '03',
    name: 'Packing Hall',
    discipline: 'Conveyors',
    cameraPos: { x: -10, y: 6.5, z: SITE_Z + 13 },
    cameraTarget: { x: -2, y: 1.8, z: SITE_Z + 1 },
    hotspots: ['line-throughput', 'line-availability'],
  },
  {
    id: 'zone-quality',
    ordinal: '04',
    name: 'Quality Lab',
    discipline: 'Inspection',
    cameraPos: { x: -12, y: 3.6, z: SITE_Z + 1 },
    cameraTarget: { x: -7.5, y: 1.6, z: SITE_Z - 4 },
    hotspots: ['quality'],
  },
  {
    id: 'zone-warehouse',
    ordinal: '05',
    name: 'Outbound Docks',
    discipline: 'Despatch',
    cameraPos: { x: 20, y: 7, z: SITE_Z - 24 },
    cameraTarget: { x: 9.5, y: 2.5, z: SITE_Z - 11 },
    hotspots: ['outbound-dock'],
  },
  {
    id: 'zone-utilities',
    ordinal: '06',
    name: 'Utilities',
    discipline: 'Plant Room',
    cameraPos: { x: -30, y: 9, z: SITE_Z + 6 },
    cameraTarget: { x: -17.5, y: 2, z: SITE_Z + 1 },
    hotspots: ['power', 'hvac', 'compressed-air'],
  },
  {
    id: 'zone-site',
    ordinal: '07',
    name: 'Whole Site',
    discipline: 'Overview',
    cameraPos: { x: 24, y: 9, z: SITE_Z + 22 },
    cameraTarget: { x: 0, y: 7, z: SITE_Z - 4 },
    hotspots: [],
  },
] as const;

/** The zone a hotspot belongs to, or undefined if it is unzoned. */
export function zoneForHotspot(hotspotId: string): SiteZone | undefined {
  return WAKEFIELD_ZONES.find((z) => z.hotspots.includes(hotspotId));
}

/** Look up one zone. */
export function zoneById(id: string): SiteZone | undefined {
  return WAKEFIELD_ZONES.find((z) => z.id === id);
}

/**
 * Thumbnail size in device pixels.
 *
 * Cards render at 160 x 98 CSS px; capturing at 2x keeps them crisp on a
 * retina panel without paying for a full-resolution frame per zone.
 */
export const THUMB_W = 320;
export const THUMB_H = 196;
