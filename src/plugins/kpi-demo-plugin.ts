/**
 * KpiDemoPlugin — Provides static dummy KPI data for OEE, Parts/H, and Cycle Time charts.
 *
 * Data is generated once at construction time. Patterns mimic realistic
 * 3-shift manufacturing with handovers, breaks, tool wear, etc.
 */

import type { RVViewerPlugin } from '../core/rv-plugin';

// ─── OEE Types ──────────────────────────────────────────────────────────

export interface OeeTimeBucket {
  /** Time label, e.g. "06:00" */
  time: string;
  production: number;
  waiting: number;
  blocked: number;
  loading: number;
  toolchange: number;
  downtime: number;
}

// ─── Parts/H Types ──────────────────────────────────────────────────────

export interface PartsHourBucket {
  /** Hour label, e.g. "08:00" */
  hour: string;
  parts: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────

/** Seeded PRNG for reproducible dummy data. */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Normalize an object's numeric values so they sum to 100. */
function normalizeTo100(obj: Record<string, number>): Record<string, number> {
  const sum = Object.values(obj).reduce((a, b) => a + b, 0);
  if (sum === 0) return obj;
  const result: Record<string, number> = {};
  let accumulated = 0;
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length - 1; i++) {
    const v = Math.round((obj[keys[i]] / sum) * 1000) / 10;
    result[keys[i]] = v;
    accumulated += v;
  }
  // Last one gets the remainder to guarantee sum = 100
  result[keys[keys.length - 1]] = Math.round((100 - accumulated) * 10) / 10;
  return result;
}

// ─── OEE Data Generator ────────────────────────────────────────────────

function generateOeeDummyData(): OeeTimeBucket[] {
  const rand = seededRandom(42);
  const buckets: OeeTimeBucket[] = [];

  for (let i = 0; i < 48; i++) {
    const hour = Math.floor(i / 2);
    const isHalf = i % 2 === 1;
    const time = `${String(hour).padStart(2, '0')}:${isHalf ? '30' : '00'}`;

    // Determine shift pattern
    let base: Record<string, number>;

    if ((hour === 6 && !isHalf) || (hour === 14 && !isHalf) || (hour === 22 && !isHalf)) {
      // Shift handover
      base = { production: 25, waiting: 40, blocked: 0, loading: 30, toolchange: 5, downtime: 0 };
    } else if (hour === 12 && !isHalf) {
      // Lunch break
      base = { production: 10, waiting: 60, blocked: 0, loading: 20, toolchange: 10, downtime: 0 };
    } else if (hour >= 22 || hour < 6) {
      // Night shift
      base = { production: 70, waiting: 10, blocked: 5, loading: 5, toolchange: 2, downtime: 8 };
    } else if (hour >= 6 && hour < 14) {
      // Day shift
      base = { production: 80, waiting: 5, blocked: 5, loading: 3, toolchange: 2, downtime: 5 };
    } else {
      // Afternoon shift
      base = { production: 75, waiting: 8, blocked: 6, loading: 3, toolchange: 2, downtime: 6 };
    }

    // Add ±5% jitter
    const jittered: Record<string, number> = {};
    for (const [key, val] of Object.entries(base)) {
      jittered[key] = Math.max(0, val + (rand() - 0.5) * 10);
    }

    const normalized = normalizeTo100(jittered);

    buckets.push({
      time,
      production: normalized.production,
      waiting: normalized.waiting,
      blocked: normalized.blocked,
      loading: normalized.loading,
      toolchange: normalized.toolchange,
      downtime: normalized.downtime,
    });
  }

  return buckets;
}

// ─── Parts/H Data Generator ────────────────────────────────────────────

function generatePartsDummyData(): PartsHourBucket[] {
  const rand = seededRandom(123);
  const baseParts = [
    24, 23, 22, 23, 23, 21,   // 00-05: night
    10, 17, 27, 30, 31, 30,   // 06-11: handover + day ramp
    11, 29, 31, 32, 32, 30,   // 12-17: lunch + afternoon
    10, 26, 29, 28, 25, 24,   // 18-23: break + night
  ];

  return baseParts.map((base, i) => ({
    hour: `${String(i).padStart(2, '0')}:00`,
    parts: Math.round(clamp(base + (rand() - 0.5) * 4, 0, 50)),
  }));
}

// ─── Cycle Time Data Generator ─────────────────────────────────────────

function generateCycleTimeDummyData(): number[] {
  const rand = seededRandom(777);
  const takt = 30000; // 30s in ms
  const cycles: number[] = [];

  for (let i = 0; i < 100; i++) {
    let ct = takt;

    // Normal noise ±0.8s
    ct += (rand() - 0.5) * 1600;

    // Warmup: first 5 cycles +25%
    if (i < 5) ct += takt * 0.25 * (1 - i / 5);

    // Gradual drift +1.5s over 100 cycles (tool wear)
    ct += (i / 100) * 1500;

    // 3% spike chance (+80% of takt)
    if (rand() < 0.03) ct += takt * 0.8;

    // Random variation ±1s
    ct += (rand() - 0.5) * 2000;

    cycles.push(Math.round(clamp(ct, 10000, 120000)));
  }

  return cycles;
}

// ─── Plugin ─────────────────────────────────────────────────────────────

export class KpiDemoPlugin implements RVViewerPlugin {
  readonly id = 'kpi-demo';

  readonly oeeData: OeeTimeBucket[];
  readonly partsData: PartsHourBucket[];
  readonly cycleTimeData: number[];

  /** Target parts per hour for the Parts/H chart. */
  readonly partsTarget = 30;
  /** Takt time in ms for the Cycle Time chart. */
  readonly taktTimeMs = 30000;

  constructor() {
    this.oeeData = generateOeeDummyData();
    this.partsData = generatePartsDummyData();
    this.cycleTimeData = generateCycleTimeDummyData();
  }
}
