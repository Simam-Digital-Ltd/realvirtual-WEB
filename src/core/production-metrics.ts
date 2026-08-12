// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * ProductionMetrics — derives genuine OEE-style KPIs from the running simulation.
 *
 * This is deliberately NOT mock data. Every value here is measured from the
 * engine itself:
 *
 *   - Cases packed  → counted from `RVSink.onConsumed` (a real MU leaving the line)
 *   - Availability   → time-weighted fraction of simulated time the line was moving
 *                      (at least one `RVDrive.isRunning`)
 *
 * All timing is accumulated from the fixed-timestep `dt` rather than wall clock,
 * so the metrics track *simulated* time and correctly freeze when the sim is paused.
 *
 * The module exposes a `useSyncExternalStore`-compatible store so React KPI cards
 * can subscribe without polling.
 */

import type { RVViewerPlugin } from './rv-plugin';
import type { RVViewer } from './rv-viewer';
import type { LoadResult } from './engine/rv-scene-loader';
import type { RVSink } from './engine/rv-sink';

export interface ProductionSnapshot {
  /** True when the model actually exposes drives — availability is real. */
  hasDrives: boolean;
  /** True when the model actually exposes sinks — throughput is real. */
  hasSinks: boolean;
  /** Units consumed by all sinks since the model loaded. */
  casesTotal: number;
  /** Throughput extrapolated to units/hour from a rolling simulated-time window. */
  casesPerHour: number;
  /** Percentage of simulated time the line was moving (0-100). */
  availabilityPct: number;
  /** Drives currently running / total drives. */
  drivesRunning: number;
  driveCount: number;
  sinkCount: number;
  /** Simulated seconds observed since load. */
  elapsedSec: number;
  /** Recent availability samples, for a sparkline. */
  availabilityTrend: number[];
  /** Recent throughput samples, for a sparkline. */
  throughputTrend: number[];
}

const EMPTY_SNAPSHOT: ProductionSnapshot = {
  hasDrives: false,
  hasSinks: false,
  casesTotal: 0,
  casesPerHour: 0,
  availabilityPct: 0,
  drivesRunning: 0,
  driveCount: 0,
  sinkCount: 0,
  elapsedSec: 0,
  availabilityTrend: [],
  throughputTrend: [],
};

let snapshot: ProductionSnapshot = EMPTY_SNAPSHOT;
const listeners = new Set<() => void>();

/** Subscribe to production metric changes (useSyncExternalStore contract). */
export function subscribeProduction(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Current immutable snapshot (useSyncExternalStore contract). */
export function getProductionSnapshot(): ProductionSnapshot {
  return snapshot;
}

function publish(next: ProductionSnapshot): void {
  snapshot = next;
  // Dev-only: surface the live snapshot for the debug API / console inspection.
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__RV_PRODUCTION__ = next;
  }
  for (const cb of listeners) cb();
}

/** Rolling window (in simulated seconds) used to extrapolate throughput. */
const RATE_WINDOW_SEC = 120;
/** How often (simulated seconds) to recompute + publish. */
const PUBLISH_INTERVAL_SEC = 0.25;
/** Max trend points retained for sparklines. */
const TREND_POINTS = 20;
/** Simulated seconds between trend samples. */
const TREND_INTERVAL_SEC = 5;

export class ProductionMetricsPlugin implements RVViewerPlugin {
  readonly id = 'production-metrics';
  readonly core = true;
  readonly order = 900;

  private _viewer: RVViewer | null = null;

  /** Simulated seconds since model load. */
  private _elapsed = 0;
  /** Simulated seconds during which at least one drive was running. */
  private _upTime = 0;
  private _casesTotal = 0;
  /** Simulated-time stamps of recent consume events, for rate extrapolation. */
  private _events: number[] = [];

  private _sincePublish = 0;
  private _sinceTrend = 0;
  private _availabilityTrend: number[] = [];
  private _throughputTrend: number[] = [];

  /** Sink callbacks we wrapped, so we can restore them on teardown. */
  private _restore: Array<() => void> = [];
  private _sinkCount = 0;

  onModelLoaded(result: LoadResult, viewer: RVViewer): void {
    this._viewer = viewer;
    // Undo any wrapping from a previous model before re-attaching.
    this._detachSinks();
    this._reset();
    this._attachSinks(result.transportManager?.sinks ?? []);
    this._publishNow();
  }

  onModelCleared(): void {
    this._detachSinks();
    this._reset();
    this._publishNow();
  }

  onFixedUpdatePost(dt: number): void {
    const viewer = this._viewer;
    if (!viewer) return;

    this._elapsed += dt;

    const drives = viewer.drives;
    let running = 0;
    for (const d of drives) {
      if (d.isRunning) running++;
    }
    // "Line availability": the line counts as up whenever anything is moving.
    if (running > 0) this._upTime += dt;

    this._sinceTrend += dt;
    if (this._sinceTrend >= TREND_INTERVAL_SEC) {
      this._sinceTrend = 0;
      this._availabilityTrend = trimTrend([...this._availabilityTrend, this._availability()]);
      this._throughputTrend = trimTrend([...this._throughputTrend, this._ratePerHour()]);
    }

    this._sincePublish += dt;
    if (this._sincePublish < PUBLISH_INTERVAL_SEC) return;
    this._sincePublish = 0;

    this._publish(drives.length, running);
  }

  dispose(): void {
    this._detachSinks();
    this._viewer = null;
  }

  // ── internals ──

  private _reset(): void {
    this._elapsed = 0;
    this._upTime = 0;
    this._casesTotal = 0;
    this._events = [];
    this._sincePublish = 0;
    this._sinceTrend = 0;
    this._availabilityTrend = [];
    this._throughputTrend = [];
  }

  /**
   * Wrap every sink's `onConsumed` so we count real throughput without
   * clobbering any callback the model or another plugin already installed.
   */
  private _attachSinks(sinks: readonly RVSink[]): void {
    this._sinkCount = sinks.length;
    for (const sink of sinks) {
      const previous = sink.onConsumed;
      sink.onConsumed = (mu, s) => {
        previous?.(mu, s);
        this._casesTotal++;
        this._events.push(this._elapsed);
      };
      this._restore.push(() => { sink.onConsumed = previous; });
    }
  }

  private _detachSinks(): void {
    for (const undo of this._restore) undo();
    this._restore = [];
    this._sinkCount = 0;
  }

  private _availability(): number {
    if (this._elapsed <= 0) return 0;
    return Math.min(100, (this._upTime / this._elapsed) * 100);
  }

  /** Extrapolate units/hour from consume events inside the rolling window. */
  private _ratePerHour(): number {
    const window = Math.min(this._elapsed, RATE_WINDOW_SEC);
    if (window <= 0) return 0;
    const cutoff = this._elapsed - window;
    // Drop events that fell out of the window.
    while (this._events.length > 0 && this._events[0] < cutoff) this._events.shift();
    return (this._events.length / window) * 3600;
  }

  private _publish(driveCount: number, running: number): void {
    const sinkCount = this._sinkCount;
    publish({
      hasDrives: driveCount > 0,
      hasSinks: sinkCount > 0,
      casesTotal: this._casesTotal,
      casesPerHour: this._ratePerHour(),
      availabilityPct: this._availability(),
      drivesRunning: running,
      driveCount,
      sinkCount,
      elapsedSec: this._elapsed,
      availabilityTrend: this._availabilityTrend,
      throughputTrend: this._throughputTrend,
    });
  }

  private _publishNow(): void {
    const drives = this._viewer?.drives ?? [];
    let running = 0;
    for (const d of drives) if (d.isRunning) running++;
    this._publish(drives.length, running);
  }
}

function trimTrend(values: number[]): number[] {
  return values.length > TREND_POINTS ? values.slice(values.length - TREND_POINTS) : values;
}
