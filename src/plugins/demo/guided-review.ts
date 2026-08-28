// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Guided review — what the site manager is asked to look at, and why.
 *
 * This is the DERIVATION half of the guided walkthrough: given a production
 * snapshot and the live alarm set, decide which items are worth a manager's
 * attention, rank them, and explain each one in a sentence. It is deliberately
 * pure — no React, no viewer, no three.js — so the judgement can be tested
 * without a browser and reused anywhere.
 *
 * THE SEVERITY MODEL is lifted from the sister logistics app
 * (`services/insightsService.ts` at simam-digital-logistics), which scores a
 * stage against its SLA and grades by how far past it you are:
 *
 *     ratio = overdue / target     >= 1 critical · >= 0.5 warning · else watch
 *
 * That app measures box-and-item stages; this one measures a production line.
 * Same shape, same vocabulary, so the two products can eventually share one
 * `Bottleneck` type instead of inventing a second one.
 *
 * ─── The honesty rule ───────────────────────────────────────────────────
 *
 * Every item carries `evidence`: the actual numbers it was derived from. A
 * review that says "throughput is low" without saying low-against-what is
 * theatre, and this demo has enough of that already — the shift-brief text in
 * ai-assistant-plugin is hardcoded, and MachineControlPlugin's Start button
 * writes no signals.
 *
 * So: when the simulation has not produced real data, `buildReview` says so in
 * an item of its own rather than inventing plausible numbers. `ProductionSnapshot`
 * exposes `hasDrives`/`hasSinks` precisely so a consumer can tell measured from
 * assumed, and this is the consumer that has to care.
 */

import type { ProductionSnapshot } from '../../core/production-metrics';

/** Attention level. Same three grades the logistics app uses. */
export type ReviewSeverity = 'watch' | 'warning' | 'critical';

/** One thing the manager is asked to look at. */
export interface ReviewItem {
  id: string;
  /** Short headline, e.g. "Line is not running". */
  title: string;
  /** One sentence saying what is wrong and against what target. */
  detail: string;
  /** The numbers this was derived from — shown in the UI, never omitted. */
  evidence: string;
  severity: ReviewSeverity;
  /** Scene path to fly the camera to, when the item has a physical location. */
  path?: string;
  /** The choices offered. The FIRST is the recommended one. */
  decisions: ReviewDecision[];
}

export interface ReviewDecision {
  id: string;
  label: string;
  /** What this decision does, in the manager's words. */
  outcome: string;
  /**
   * Whether picking this is expected to improve the operation.
   * Drives the closing efficiency read — see {@link scoreReview}.
   */
  effective: boolean;
}

/** A decision the manager actually made, for the debrief. */
export interface ReviewOutcome {
  itemId: string;
  decisionId: string;
}

/** Availability below this (%) is worth flagging. Shift target is 90. */
export const AVAILABILITY_TARGET_PCT = 90;
/** Below this, availability is a critical finding rather than a warning. */
export const AVAILABILITY_CRITICAL_PCT = 60;
/** Cases/hour the AM packing shift is planned around. */
export const THROUGHPUT_TARGET_PER_HOUR = 1500;
/** Ignore throughput until the sim has run this long — early rates are noise. */
export const THROUGHPUT_SETTLE_SEC = 60;

/** Grade a shortfall the way the logistics app grades an overdue stage. */
export function severityForShortfall(shortfall: number, target: number): ReviewSeverity {
  if (target <= 0) return 'watch';
  const ratio = shortfall / target;
  if (ratio >= 1) return 'critical';
  if (ratio >= 0.5) return 'warning';
  return 'watch';
}

const SEVERITY_RANK: Record<ReviewSeverity, number> = { critical: 0, warning: 1, watch: 2 };

/**
 * Build the review list from live state.
 *
 * `alarmPaths` are scene paths of currently-alarmed assets (the Alarm Radar
 * set). Order of the returned list is severity first, then insertion, so the
 * walkthrough always opens on the worst thing.
 */
export function buildReview(
  snapshot: ProductionSnapshot,
  alarmPaths: readonly string[] = [],
): ReviewItem[] {
  const items: ReviewItem[] = [];

  // ─── 1. Is the line even moving? ──────────────────────────────────────
  // Checked first because every downstream number is meaningless if it is
  // not, and because it is the state the demo actually loads in.
  if (snapshot.hasDrives && snapshot.driveCount > 0 && snapshot.drivesRunning === 0) {
    items.push({
      id: 'line-stopped',
      title: 'Line is not running',
      detail:
        'No drive is moving, so availability and throughput are both reading zero. '
        + 'Nothing else in this review can be judged until the line is started.',
      evidence: `${snapshot.drivesRunning} of ${snapshot.driveCount} drives running · ${snapshot.elapsedSec.toFixed(0)}s observed`,
      severity: 'critical',
      decisions: [
        {
          id: 'start-line',
          label: 'Start the line',
          outcome: 'Line started. Availability and throughput begin accumulating from now.',
          effective: true,
        },
        {
          id: 'hold-line',
          label: 'Hold — investigate first',
          outcome: 'Line left stopped. Every production figure in this review stays at zero.',
          effective: false,
        },
      ],
    });
  }

  // ─── 2. Availability against the shift target ─────────────────────────
  // Only meaningful once drives exist AND something has actually run;
  // otherwise this duplicates the item above with a worse explanation.
  if (snapshot.hasDrives && snapshot.drivesRunning > 0 && snapshot.availabilityPct < AVAILABILITY_TARGET_PCT) {
    const shortfall = AVAILABILITY_TARGET_PCT - snapshot.availabilityPct;
    items.push({
      id: 'availability-short',
      title: 'Availability below shift target',
      detail:
        `The line has been moving ${snapshot.availabilityPct.toFixed(0)}% of observed time `
        + `against a ${AVAILABILITY_TARGET_PCT}% target — a ${shortfall.toFixed(0)} point shortfall.`,
      evidence: `${snapshot.availabilityPct.toFixed(1)}% availability · ${snapshot.drivesRunning}/${snapshot.driveCount} drives running`,
      severity:
        snapshot.availabilityPct < AVAILABILITY_CRITICAL_PCT
          ? 'critical'
          : severityForShortfall(shortfall, AVAILABILITY_TARGET_PCT - AVAILABILITY_CRITICAL_PCT),
      decisions: [
        {
          id: 'inspect-constraint',
          label: 'Walk the constraint',
          outcome: 'Reviewed the slowest station. Cause recorded against the shift.',
          effective: true,
        },
        {
          id: 'accept-availability',
          label: 'Accept for this shift',
          outcome: 'Shortfall accepted. Target carried into the next shift unchanged.',
          effective: false,
        },
      ],
    });
  }

  // ─── 3. Throughput against plan ───────────────────────────────────────
  // Gated on settle time: a rolling rate extrapolated from the first seconds
  // after load is an artefact of the window, not a real shortfall.
  if (
    snapshot.hasSinks
    && snapshot.elapsedSec >= THROUGHPUT_SETTLE_SEC
    && snapshot.casesPerHour < THROUGHPUT_TARGET_PER_HOUR
  ) {
    const shortfall = THROUGHPUT_TARGET_PER_HOUR - snapshot.casesPerHour;
    items.push({
      id: 'throughput-short',
      title: 'Throughput behind plan',
      detail:
        `Packing is extrapolating to ${Math.round(snapshot.casesPerHour)} cases/h against a `
        + `${THROUGHPUT_TARGET_PER_HOUR} plan. At this rate the shift finishes short.`,
      evidence: `${Math.round(snapshot.casesPerHour)} cases/h · ${snapshot.casesTotal} packed in ${(snapshot.elapsedSec / 60).toFixed(1)} min`,
      severity: severityForShortfall(shortfall, THROUGHPUT_TARGET_PER_HOUR),
      decisions: [
        {
          id: 'rebalance',
          label: 'Rebalance the line',
          outcome: 'Rebalance requested. Expect the rate to recover over the next cycles.',
          effective: true,
        },
        {
          id: 'accept-throughput',
          label: 'Accept the shortfall',
          outcome: 'Shortfall accepted. Dispatch will be short against plan.',
          effective: false,
        },
      ],
    });
  }

  // ─── 4. Live alarms ───────────────────────────────────────────────────
  // One item per alarmed asset. These are the only items with a scene path,
  // so they are the ones the camera can actually fly to.
  for (const path of alarmPaths) {
    const name = path.split('/').pop() || path;
    items.push({
      id: `alarm-${path}`,
      title: `Alarm on ${name}`,
      detail: `${name} is reporting an active alarm and is highlighted in the 3D view.`,
      evidence: `signal path ${path}`,
      severity: 'critical',
      path,
      decisions: [
        {
          id: 'acknowledge',
          label: 'Acknowledge and dispatch',
          outcome: `Maintenance dispatched to ${name}. Alarm acknowledged against this shift.`,
          effective: true,
        },
        {
          id: 'defer',
          label: 'Defer to next shift',
          outcome: `${name} left alarmed. Risk carried into the next shift.`,
          effective: false,
        },
      ],
    });
  }

  // ─── 5. Nothing measurable ────────────────────────────────────────────
  // Deliberately NOT silent, and deliberately not a fake "all clear". If the
  // model exposes no drives and no sinks there is nothing to review, and
  // saying so is more useful than a green tick that means nothing.
  if (items.length === 0 && !snapshot.hasDrives && !snapshot.hasSinks) {
    items.push({
      id: 'no-telemetry',
      title: 'No production telemetry in this model',
      detail:
        'This model exposes neither drives nor sinks, so availability and throughput '
        + 'cannot be measured. The review has nothing to score.',
      evidence: 'hasDrives: false · hasSinks: false',
      severity: 'watch',
      decisions: [
        {
          id: 'acknowledge-empty',
          label: 'Understood',
          outcome: 'Review closed. Load a model with drives to score a shift.',
          effective: true,
        },
      ],
    });
  }

  return items.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

/** The closing read handed back to the manager. */
export interface ReviewScore {
  reviewed: number;
  total: number;
  effective: number;
  /** 0-100. The share of raised items closed with the effective decision. */
  efficiencyPct: number;
  verdict: string;
}

/**
 * Score the walkthrough on what the manager actually decided.
 *
 * This scores DECISIONS, not the plant: it is a measure of how the review was
 * handled, and the verdict says so. Claiming a decision moved OEE would be a
 * fabrication — the sim has not run forward yet, and nothing here writes a
 * signal that would make it true.
 */
export function scoreReview(items: readonly ReviewItem[], outcomes: readonly ReviewOutcome[]): ReviewScore {
  const total = items.length;
  const byItem = new Map(outcomes.map((o) => [o.itemId, o.decisionId]));

  let effective = 0;
  let reviewed = 0;
  for (const item of items) {
    const chosen = byItem.get(item.id);
    if (!chosen) continue;
    reviewed++;
    if (item.decisions.find((d) => d.id === chosen)?.effective) effective++;
  }

  const efficiencyPct = total === 0 ? 100 : Math.round((effective / total) * 100);

  let verdict: string;
  if (total === 0) verdict = 'Nothing was raised this shift.';
  else if (reviewed < total) verdict = `${total - reviewed} item(s) left unreviewed — the shift closes with open risk.`;
  else if (efficiencyPct === 100) verdict = 'Every item was closed with the recommended action.';
  else if (efficiencyPct >= 50) verdict = 'Most items were actioned; the deferred ones carry into the next shift.';
  else verdict = 'Most items were deferred or accepted — expect the same review tomorrow.';

  return { reviewed, total, effective, efficiencyPct, verdict };
}
