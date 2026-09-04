// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Pins the two things about the hotspot layer that a screenshot cannot show:
 * that unmeasured quantities stay unmeasured, and that the card layout keeps
 * its connectors untangled.
 */

import { describe, it, expect } from 'vitest';
import type { ProductionSnapshot } from '../src/core/production-metrics';
import type { FleetVehicle } from '../src/plugins/demo/wakefield-fleet';
import {
  WAKEFIELD_HOTSPOTS,
  readHotspot,
  readHotspots,
  zoomBand,
  hotspotsForBand,
  layoutCards,
  chooseSide,
  connectorPath,
  ndcToScreen,
  projectionChanged,
  NEAR_BAND_M,
  MEDIUM_BAND_M,
  CARD_GUTTER_PX,
  VIEWPORT_MARGIN_PX,
  type CardBox,
  type HotspotDef,
} from '../src/plugins/demo/wakefield-hotspots';

function snapshot(over: Partial<ProductionSnapshot> = {}): ProductionSnapshot {
  return {
    hasDrives: true,
    hasSinks: true,
    casesTotal: 480,
    casesPerHour: 1240,
    availabilityPct: 92,
    drivesRunning: 19,
    driveCount: 21,
    elapsedSec: 1394,
    ...over,
  } as ProductionSnapshot;
}

function vehicle(over: Partial<FleetVehicle> = {}): FleetVehicle {
  return {
    id: 'hgv-01',
    name: 'HGV-01',
    type: 'HGV',
    progress: 0,
    status: 'loading',
    cases: 130,
    capacity: 260,
    cargo: 'Ambient palletised',
    etaMinutes: null,
    ...over,
  };
}

const def = (id: string): HotspotDef => {
  const found = WAKEFIELD_HOTSPOTS.find((d) => d.id === id);
  if (!found) throw new Error(`no hotspot ${id}`);
  return found;
};

describe('hotspot readings — the honesty rule', () => {
  it('reports unmetered quantities as unmetered, never as a number', () => {
    const ctx = { snapshot: snapshot(), fleet: [vehicle()] };
    for (const id of ['power', 'hvac', 'compressed-air', 'quality']) {
      const r = readHotspot(def(id), ctx);
      expect(r.status, id).toBe('unmetered');
      expect(r.value, id).toBe('—');
      // Anything numeric here would be an invented reading.
      expect(Number.isNaN(Number(r.value)), id).toBe(true);
    }
  });

  it('never grades an unmetered hotspot as a fault', () => {
    const ctx = { snapshot: snapshot(), fleet: [] };
    // A dimmed "no meter" tile must not read as an alarm — the plant is not
    // broken, it is uninstrumented, and confusing the two trains operators
    // to ignore real alarms.
    expect(readHotspot(def('power'), ctx).status).not.toBe('fault');
  });

  it('says so when the model has no sinks rather than showing zero output', () => {
    const r = readHotspot(def('line-throughput'), {
      snapshot: snapshot({ hasSinks: false, casesTotal: 0, casesPerHour: 0 }),
      fleet: [],
    });
    expect(r.status).toBe('unmetered');
    expect(r.detail).toMatch(/no sinks/i);
  });

  it('says so when the model has no drives rather than showing 0% availability', () => {
    const r = readHotspot(def('line-availability'), {
      snapshot: snapshot({ hasDrives: false, drivesRunning: 0, driveCount: 0, availabilityPct: 0 }),
      fleet: [],
    });
    expect(r.status).toBe('unmetered');
    expect(r.detail).toMatch(/no drives/i);
  });

  it('grades availability on the same thresholds as the guided review', () => {
    const at = (pct: number) =>
      readHotspot(def('line-availability'), { snapshot: snapshot({ availabilityPct: pct }), fleet: [] }).status;
    expect(at(92)).toBe('optimal');
    expect(at(90)).toBe('optimal');
    expect(at(75)).toBe('attention');
    expect(at(59)).toBe('fault');
  });

  it('gives every reading traceable evidence', () => {
    const readings = readHotspots(WAKEFIELD_HOTSPOTS, {
      snapshot: snapshot(),
      fleet: [vehicle()],
    });
    expect(readings.size).toBe(WAKEFIELD_HOTSPOTS.length);
    for (const [id, r] of readings) {
      expect(r.evidence.length, id).toBeGreaterThan(20);
    }
  });

  it('reads the dock from the trailer actually on the bay', () => {
    const r = readHotspot(def('outbound-dock'), {
      snapshot: snapshot(),
      fleet: [vehicle({ cases: 130, capacity: 260 })],
    });
    expect(r.value).toBe('50');
    expect(r.detail).toContain('130 / 260');
  });

  it('does not claim a dock reading when no trailer is loading', () => {
    const r = readHotspot(def('outbound-dock'), {
      snapshot: snapshot(),
      fleet: [vehicle({ status: 'moving', progress: 0.4 })],
    });
    expect(r.value).toBe('—');
    expect(r.detail).toMatch(/no trailer/i);
  });

  it('reports the soonest departure among moving vehicles', () => {
    const r = readHotspot(def('yard-fleet'), {
      snapshot: snapshot(),
      fleet: [
        vehicle({ id: 'a', name: 'HGV-A', status: 'moving', etaMinutes: 6 }),
        vehicle({ id: 'b', name: 'HGV-B', status: 'moving', etaMinutes: 2 }),
        vehicle({ id: 'c', name: 'HGV-C', status: 'loading' }),
      ],
    });
    expect(r.value).toBe('2');
    expect(r.detail).toContain('HGV-B');
  });
});

describe('zoom bands', () => {
  it('thins the layer as the camera pulls back', () => {
    expect(zoomBand(20)).toBe('near');
    expect(zoomBand(NEAR_BAND_M)).toBe('near');
    expect(zoomBand(NEAR_BAND_M + 1)).toBe('medium');
    expect(zoomBand(MEDIUM_BAND_M)).toBe('medium');
    expect(zoomBand(MEDIUM_BAND_M + 1)).toBe('far');
  });

  it('shows strictly more hotspots the closer the camera gets', () => {
    const far = hotspotsForBand(WAKEFIELD_HOTSPOTS, 'far').length;
    const med = hotspotsForBand(WAKEFIELD_HOTSPOTS, 'medium').length;
    const near = hotspotsForBand(WAKEFIELD_HOTSPOTS, 'near').length;
    expect(far).toBeGreaterThan(0);
    expect(med).toBeGreaterThan(far);
    expect(near).toBeGreaterThan(med);
    expect(near).toBe(WAKEFIELD_HOTSPOTS.length);
  });
});

describe('card layout', () => {
  const VIEWPORT = { width: 1600, height: 900 };
  const box = (id: string, anchorX: number, anchorY: number, side: 'left' | 'right'): CardBox =>
    ({ id, anchorX, anchorY, side, width: 190, height: 92 });

  it('never overlaps two cards in the same column', () => {
    // Five anchors stacked within a few pixels — the worst case.
    const boxes = [0, 1, 2, 3, 4].map((i) => box(`h${i}`, 700, 400 + i * 3, 'right'));
    const placed = layoutCards(boxes, VIEWPORT);
    const sorted = [...placed].sort((a, b) => a.y - b.y);
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i]!.y - (sorted[i - 1]!.y + 92);
      expect(gap).toBeGreaterThanOrEqual(CARD_GUTTER_PX - 0.001);
    }
  });

  it('keeps every card inside the viewport', () => {
    const boxes = [
      box('off-right', 1580, 100, 'right'),
      box('off-left', 12, 300, 'left'),
      box('off-bottom', 800, 895, 'right'),
      box('off-top', 800, -40, 'right'),
    ];
    for (const p of layoutCards(boxes, VIEWPORT)) {
      expect(p.x, p.id).toBeGreaterThanOrEqual(VIEWPORT_MARGIN_PX);
      expect(p.x + 190, p.id).toBeLessThanOrEqual(VIEWPORT.width - VIEWPORT_MARGIN_PX);
      expect(p.y, p.id).toBeGreaterThanOrEqual(VIEWPORT_MARGIN_PX);
      expect(p.y + 92, p.id).toBeLessThanOrEqual(VIEWPORT.height - VIEWPORT_MARGIN_PX);
    }
  });

  it('preserves vertical order, so connectors cannot cross', () => {
    // Anchors given out of order; the placement must still run top to bottom.
    const boxes = [
      box('c', 700, 600, 'right'),
      box('a', 700, 100, 'right'),
      box('b', 700, 350, 'right'),
    ];
    const placed = layoutCards(boxes, VIEWPORT);
    const y = (id: string) => placed.find((p) => p.id === id)!.y;
    expect(y('a')).toBeLessThan(y('b'));
    expect(y('b')).toBeLessThan(y('c'));
  });

  it('flips a card to the other side rather than letting it leave the screen', () => {
    // Anchor hard against the right edge: a right-side card cannot fit.
    expect(chooseSide(box('x', 1560, 400, 'right'), VIEWPORT)).toBe('left');
    // ...and the mirror case.
    expect(chooseSide(box('x', 40, 400, 'left'), VIEWPORT)).toBe('right');
  });

  it('honours the preferred side when it fits', () => {
    expect(chooseSide(box('x', 700, 400, 'right'), VIEWPORT)).toBe('right');
    expect(chooseSide(box('x', 700, 400, 'left'), VIEWPORT)).toBe('left');
  });

  it('resolves the two columns independently', () => {
    // A left card and a right card at the same height must not push each
    // other down — they cannot overlap, so treating them as one column
    // would waste vertical space and drag cards away from their anchors.
    const placed = layoutCards(
      [box('l', 400, 400, 'left'), box('r', 1000, 400, 'right')],
      VIEWPORT,
    );
    expect(placed.find((p) => p.id === 'l')!.y).toBe(placed.find((p) => p.id === 'r')!.y);
  });
});

describe('connector geometry', () => {
  const points = (path: string): Array<[number, number]> => {
    const n = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
    const out: Array<[number, number]> = [];
    for (let i = 0; i < n.length; i += 2) out.push([n[i]!, n[i + 1]!]);
    return out;
  };

  /** Every leg must be vertical, horizontal, or exactly 45 degrees. */
  const assertTechnical = (path: string) => {
    const pts = points(path);
    for (let i = 1; i < pts.length; i++) {
      const dx = Math.abs(pts[i]![0] - pts[i - 1]![0]);
      const dy = Math.abs(pts[i]![1] - pts[i - 1]![1]);
      const ok = dx < 0.15 || dy < 0.15 || Math.abs(dx - dy) < 0.15;
      expect(ok, `leg ${i} of ${path} is ${dx} x ${dy}`).toBe(true);
    }
  };

  it('lands on the card edge at its vertical centre', () => {
    const path = connectorPath(500, 300, { id: 'x', x: 600, y: 360, side: 'right' }, 190, 92);
    const pts = points(path);
    expect(pts[pts.length - 1]).toEqual([600, 406]);
  });

  it('stays technical when the card is mostly sideways', () => {
    assertTechnical(connectorPath(500, 300, { id: 'x', x: 900, y: 320, side: 'right' }, 190, 92));
  });

  it('stays technical when the card is pushed further down than across', () => {
    // The case that used to emit a vertical final leg: collision resolution
    // has shoved the card well below its anchor but only just to the side.
    assertTechnical(connectorPath(500, 300, { id: 'x', x: 600, y: 360, side: 'right' }, 190, 92));
    assertTechnical(connectorPath(500, 700, { id: 'x', x: 570, y: 100, side: 'right' }, 190, 92));
  });

  it('stays technical for left-side cards in both directions', () => {
    assertTechnical(connectorPath(900, 300, { id: 'x', x: 300, y: 620, side: 'left' }, 190, 92));
    assertTechnical(connectorPath(900, 700, { id: 'x', x: 700, y: 100, side: 'left' }, 190, 92));
  });

  it('lands on the right-hand edge when the card sits to the left', () => {
    const pts = points(connectorPath(900, 300, { id: 'x', x: 600, y: 300, side: 'left' }, 190, 92));
    expect(pts[pts.length - 1]![0]).toBe(790); // 600 + 190
  });

  it('emits only straight segments — no curves', () => {
    const path = connectorPath(500, 300, { id: 'x', x: 700, y: 400, side: 'right' }, 190, 92);
    expect(path).not.toContain('C');
    expect(path).not.toContain('Q');
    expect(path).not.toContain('A');
    expect(path.match(/L/g)).toHaveLength(3);
  });
});

describe('projection', () => {
  const RECT = { left: 0, top: 0, width: 1600, height: 900 };

  it('maps NDC centre to the middle of the canvas', () => {
    expect(ndcToScreen(0, 0, 0.5, RECT)).toEqual({ x: 800, y: 450, visible: true });
  });

  it('flips the Y axis, because NDC is up and screens are down', () => {
    expect(ndcToScreen(0, 1, 0.5, RECT).y).toBe(0);
    expect(ndcToScreen(0, -1, 0.5, RECT).y).toBe(900);
  });

  it('offsets by the canvas position, not just its size', () => {
    const inset = { left: 216, top: 62, width: 1000, height: 600 };
    expect(ndcToScreen(0, 0, 0.5, inset)).toEqual({ x: 716, y: 362, visible: true });
  });

  it('hides points behind the camera', () => {
    // ndcZ > 1 projects to a mirrored position that would draw the card on
    // the wrong side of the screen.
    expect(ndcToScreen(0, 0, 1.4, RECT).visible).toBe(false);
  });

  it('hides points outside the canvas', () => {
    expect(ndcToScreen(1.5, 0, 0.5, RECT).visible).toBe(false);
    expect(ndcToScreen(0, -1.5, 0.5, RECT).visible).toBe(false);
  });

  it('returns finite coordinates even for an unprojectable point', () => {
    // camera.aspect goes NaN whenever the canvas is measured at zero size,
    // and that NaN reaches here through the projection matrix.
    for (const p of [
      ndcToScreen(NaN, 0, 0.5, RECT),
      ndcToScreen(0, NaN, 0.5, RECT),
      ndcToScreen(Infinity, 0, 0.5, RECT),
      ndcToScreen(0, 0, 0.5, { ...RECT, width: NaN }),
    ]) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      expect(p.visible).toBe(false);
    }
  });
});

describe('projection staleness', () => {
  const at = (x: number, y: number, visible = true) => ({ x, y, visible });

  it('treats a missing previous value as changed', () => {
    expect(projectionChanged(undefined, at(10, 10), 0.6)).toBe(true);
  });

  it('ignores sub-pixel drift', () => {
    expect(projectionChanged(at(10, 10), at(10.3, 10.2), 0.6)).toBe(false);
  });

  it('notices real movement on either axis', () => {
    expect(projectionChanged(at(10, 10), at(12, 10), 0.6)).toBe(true);
    expect(projectionChanged(at(10, 10), at(10, 12), 0.6)).toBe(true);
  });

  it('notices a visibility flip even when the point has not moved', () => {
    expect(projectionChanged(at(10, 10, true), at(10, 10, false), 0.6)).toBe(true);
  });

  it('recovers from a cached NaN instead of freezing forever', () => {
    // The bug this pins: every comparison against NaN is false, so a cached
    // NaN would never be judged stale and the hotspot would be lost for the
    // rest of the session. `ndcToScreen` is what guarantees the cache only
    // ever holds finite values, so the two must be checked together.
    const poisoned = ndcToScreen(NaN, NaN, 0.5, { left: 0, top: 0, width: 1600, height: 900 });
    expect(Number.isFinite(poisoned.x)).toBe(true);
    expect(projectionChanged(poisoned, at(800, 450), 0.6)).toBe(true);
  });
});
