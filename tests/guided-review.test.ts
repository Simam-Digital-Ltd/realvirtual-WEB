// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Tests for the guided-review derivation.
 *
 * The point of these is the HONESTY rules, not the arithmetic: the demo is
 * only worth showing if the review refuses to invent findings when the
 * simulation has not produced any. Those rules are easy to regress silently
 * during a redesign, so they are pinned here.
 */

import { describe, it, expect } from 'vitest';
import type { ProductionSnapshot } from '../src/core/production-metrics';
import {
  buildReview,
  scoreReview,
  severityForShortfall,
  AVAILABILITY_TARGET_PCT,
  THROUGHPUT_TARGET_PER_HOUR,
  THROUGHPUT_SETTLE_SEC,
} from '../src/plugins/demo/guided-review';

function snap(over: Partial<ProductionSnapshot> = {}): ProductionSnapshot {
  return {
    hasDrives: true,
    hasSinks: true,
    casesTotal: 0,
    casesPerHour: 0,
    availabilityPct: 100,
    drivesRunning: 5,
    driveCount: 5,
    sinkCount: 1,
    elapsedSec: 600,
    availabilityTrend: [],
    throughputTrend: [],
    ...over,
  };
}

describe('severityForShortfall', () => {
  it('grades at the same ratios the logistics app uses', () => {
    expect(severityForShortfall(10, 100)).toBe('watch');    // 0.1
    expect(severityForShortfall(50, 100)).toBe('warning');  // 0.5
    expect(severityForShortfall(100, 100)).toBe('critical'); // 1.0
  });

  it('does not divide by a zero target', () => {
    expect(severityForShortfall(5, 0)).toBe('watch');
  });
});

describe('buildReview — the honesty rules', () => {
  it('says so when the model has no telemetry, instead of reporting all-clear', () => {
    const items = buildReview(snap({ hasDrives: false, hasSinks: false, driveCount: 0, drivesRunning: 0 }));
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('no-telemetry');
    expect(items[0].evidence).toContain('hasDrives: false');
  });

  it('leads with the stopped line, because every other number is meaningless then', () => {
    const items = buildReview(snap({ drivesRunning: 0, availabilityPct: 0, casesPerHour: 0 }));
    expect(items[0].id).toBe('line-stopped');
    expect(items[0].severity).toBe('critical');
  });

  it('does not ALSO raise availability while the line is stopped', () => {
    // Otherwise the manager gets two items describing one fact, the second
    // with a worse explanation than the first.
    const items = buildReview(snap({ drivesRunning: 0, availabilityPct: 0 }));
    expect(items.map((i) => i.id)).not.toContain('availability-short');
  });

  it('suppresses throughput until the rolling window has settled', () => {
    const early = buildReview(snap({ elapsedSec: THROUGHPUT_SETTLE_SEC - 1, casesPerHour: 0 }));
    expect(early.map((i) => i.id)).not.toContain('throughput-short');

    const settled = buildReview(snap({ elapsedSec: THROUGHPUT_SETTLE_SEC, casesPerHour: 0 }));
    expect(settled.map((i) => i.id)).toContain('throughput-short');
  });

  it('never reports throughput for a model with no sinks', () => {
    const items = buildReview(snap({ hasSinks: false, casesPerHour: 0 }));
    expect(items.map((i) => i.id)).not.toContain('throughput-short');
  });

  it('carries the numbers it was derived from on every item', () => {
    const items = buildReview(snap({ drivesRunning: 0 }), ['Line/Robot']);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(item.evidence.trim()).not.toBe('');
  });

  it('raises nothing when the line is healthy and on plan', () => {
    const items = buildReview(snap({
      availabilityPct: AVAILABILITY_TARGET_PCT,
      casesPerHour: THROUGHPUT_TARGET_PER_HOUR,
    }));
    expect(items).toHaveLength(0);
  });
});

describe('buildReview — alarms', () => {
  it('creates one flyable item per alarmed asset', () => {
    const items = buildReview(snap({ availabilityPct: 100, casesPerHour: THROUGHPUT_TARGET_PER_HOUR }), [
      'Line/Robot',
      'Line/Conveyor',
    ]);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.path)).toBe(true);
    expect(items[0].title).toContain('Robot');
  });

  it('sorts the worst thing first', () => {
    const items = buildReview(
      snap({ availabilityPct: 89, casesPerHour: THROUGHPUT_TARGET_PER_HOUR }), // watch
      ['Line/Robot'], // critical
    );
    expect(items[0].severity).toBe('critical');
  });
});

describe('scoreReview', () => {
  const items = buildReview(snap({ drivesRunning: 0 }), ['Line/Robot']);

  it('scores unreviewed items as open risk rather than as a pass', () => {
    const score = scoreReview(items, []);
    expect(score.reviewed).toBe(0);
    expect(score.efficiencyPct).toBe(0);
    expect(score.verdict).toContain('unreviewed');
  });

  it('gives full marks only when every item took the recommended action', () => {
    const all = items.map((i) => ({ itemId: i.id, decisionId: i.decisions[0].id }));
    expect(scoreReview(items, all).efficiencyPct).toBe(100);
  });

  it('does not credit the deferring decision', () => {
    const deferred = items.map((i) => ({ itemId: i.id, decisionId: i.decisions[i.decisions.length - 1].id }));
    const score = scoreReview(items, deferred);
    expect(score.reviewed).toBe(items.length);
    expect(score.effective).toBe(0);
  });

  it('treats an empty review as nothing raised, not as a failure', () => {
    expect(scoreReview([], []).efficiencyPct).toBe(100);
  });
});
