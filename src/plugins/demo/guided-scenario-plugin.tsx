// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Guided scenario — the "Welcome, site manager" walkthrough.
 *
 * Opens on a briefing, walks the manager through the things worth looking at,
 * flies the camera to each one, takes a decision on each, and closes with a
 * read on how the review was handled.
 *
 * WHY THIS PLUGIN EXISTS
 * ----------------------
 * The UI already claimed to do this. `AIAssistantPlugin.startDemo()` replies
 * "Started the guided 2-3 minute factory-to-yard demo narrator." and emits
 * `wpf-start-demo`. NOTHING LISTENED TO THAT EVENT — verified by grep across
 * src/: one emit, zero handlers. The button worked, the reply appeared, and
 * nothing happened. This plugin is the missing listener, so that reply becomes
 * true rather than being deleted.
 *
 * That is the seventh feature in this repository found shipping inert, and the
 * same class the plugin-reachability check was written for: the check proves a
 * PLUGIN is reachable, but it cannot see an event with no subscriber. Worth
 * teaching it that trick separately.
 *
 * WHAT IS REAL AND WHAT IS NOT
 * ----------------------------
 * Every item and every number comes from {@link buildReview}, which reads the
 * live `ProductionSnapshot` and the live alarm set. There is no scripted
 * incident list. If the line is stopped the review says the line is stopped;
 * if the model has no telemetry it says that instead of inventing a shift.
 *
 * The one thing this plugin does NOT do is claim a decision changed the plant.
 * Deciding "rebalance the line" here records the decision — it does not write
 * a signal, because nothing in the demo maps that intent onto the sim. The
 * closing score is explicitly a score of the REVIEW, not of the factory.
 *
 * Camera moves use `viewer.focusByPath`, which is the same call the site
 * manager and hierarchy browser already use, so the motion matches the rest
 * of the app rather than introducing a second camera language.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, Chip, Fade, IconButton, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import { Close, NavigateNext, PlayArrow, Verified } from '@mui/icons-material';
import type { RVViewerPlugin } from '../../core/rv-plugin';
import type { RVViewer } from '../../core/rv-viewer';
import type { UISlotEntry, UISlotProps } from '../../core/rv-ui-plugin';
import type { LoadResult } from '../../core/engine/rv-scene-loader';
import { EventEmitter } from '../../core/rv-events';
import { getProductionSnapshot, subscribeProduction } from '../../core/production-metrics';
import { SEVERITY_COLORS } from '../../core/hmi/severity-pulse';
import { WAKEFIELD_DEMO_PROFILE as PROFILE } from './demo-profile';
import {
  buildReview,
  scoreReview,
  type ReviewItem,
  type ReviewOutcome,
  type ReviewSeverity,
} from './guided-review';

/** Where the walkthrough currently is. */
type Phase = 'closed' | 'briefing' | 'reviewing' | 'debrief';

/** Severity → the message-system colour, so this agrees with alarm cards. */
const SEVERITY_COLOR: Record<ReviewSeverity, string> = {
  critical: SEVERITY_COLORS.error,
  warning: SEVERITY_COLORS.warning,
  watch: SEVERITY_COLORS.info,
};

// ─── Plugin ─────────────────────────────────────────────────────────────

export class GuidedScenarioPlugin extends EventEmitter implements RVViewerPlugin {
  readonly id = 'guided-scenario';
  readonly name = 'Guided Scenario';
  readonly order = 420;

  readonly slots: UISlotEntry[] = [
    { slot: 'overlay', order: 50, component: (p: UISlotProps) => <GuidedScenarioPanel {...p} /> },
  ];

  private _viewer: RVViewer | null = null;
  private _offStartDemo: (() => void) | null = null;

  init(viewer: RVViewer): void {
    this._viewer = viewer;
    // The listener `AIAssistantPlugin.startDemo()` never had.
    const handler = () => this.emit('guided-open', undefined);
    viewer.on('wpf-start-demo' as string, handler as never);
    this._offStartDemo = () => viewer.off('wpf-start-demo' as string, handler as never);
  }

  onModelLoaded(_result: LoadResult, viewer: RVViewer): void {
    this._viewer = viewer;
  }

  /** Open the walkthrough (also reachable from the copilot's "start demo"). */
  open(): void {
    this.emit('guided-open', undefined);
  }

  dispose(): void {
    this._offStartDemo?.();
    this._offStartDemo = null;
    this._viewer = null;
  }
}

// ─── UI ─────────────────────────────────────────────────────────────────

function useProductionSnapshot() {
  const [, force] = useState(0);
  useEffect(() => subscribeProduction(() => force((n) => n + 1)), []);
  return getProductionSnapshot();
}

/** Live alarm paths, read from the Alarm Radar plugin if it is present. */
function useAlarmPaths(viewer: RVViewer): string[] {
  const [paths, setPaths] = useState<string[]>([]);
  useEffect(() => {
    const plugin = viewer.getPlugin<EventEmitter & { activeAlarms?: { path: string }[] }>('alarm-radar');
    if (!plugin) return;
    const sync = () => setPaths((plugin.activeAlarms ?? []).map((a) => a.path));
    sync();
    plugin.on('alarms-changed', sync as never);
    return () => plugin.off('alarms-changed', sync as never);
  }, [viewer]);
  return paths;
}

const GuidedScenarioPanel: React.FC<UISlotProps> = ({ viewer }) => {
  const [phase, setPhase] = useState<Phase>('closed');
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<ReviewOutcome[]>([]);
  const [lastOutcome, setLastOutcome] = useState<string | null>(null);
  /** Frozen at open: the review must not reshuffle underneath the manager. */
  const [items, setItems] = useState<ReviewItem[]>([]);

  const snapshot = useProductionSnapshot();
  const alarmPaths = useAlarmPaths(viewer);

  // Open on the copilot's "start demo", which is what wpf-start-demo means.
  useEffect(() => {
    const plugin = viewer.getPlugin<EventEmitter>('guided-scenario');
    if (!plugin) return;
    const onOpen = () => {
      setItems(buildReview(getProductionSnapshot(), alarmPaths));
      setOutcomes([]);
      setLastOutcome(null);
      setIndex(0);
      setPhase('briefing');
    };
    plugin.on('guided-open', onOpen as never);
    return () => plugin.off('guided-open', onOpen as never);
  }, [viewer, alarmPaths]);

  const current = items[index];

  const flyTo = useCallback((path?: string) => {
    if (path) viewer.focusByPath(path);
  }, [viewer]);

  const begin = useCallback(() => {
    // Rebuild at the moment of starting so the list reflects the newest state.
    const fresh = buildReview(snapshot, alarmPaths);
    setItems(fresh);
    setIndex(0);
    setPhase(fresh.length ? 'reviewing' : 'debrief');
    flyTo(fresh[0]?.path);
  }, [snapshot, alarmPaths, flyTo]);

  const decide = useCallback((decisionId: string) => {
    if (!current) return;
    const decision = current.decisions.find((d) => d.id === decisionId);
    setOutcomes((prev) => [...prev, { itemId: current.id, decisionId }]);
    setLastOutcome(decision?.outcome ?? null);

    const next = index + 1;
    if (next >= items.length) { setPhase('debrief'); return; }
    setIndex(next);
    flyTo(items[next]?.path);
  }, [current, index, items, flyTo]);

  const score = useMemo(() => scoreReview(items, outcomes), [items, outcomes]);

  if (phase === 'closed') return null;

  return (
    <Fade in>
      <Paper
        elevation={0}
        sx={{
          position: 'absolute', left: 24, bottom: 24, width: 420, maxWidth: 'calc(100vw - 48px)',
          p: 2.5, zIndex: 1200, borderRadius: 3,
          bgcolor: 'rgba(8, 12, 14, 0.94)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.09)',
          boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.10), 0 18px 48px rgba(0,0,0,0.55)',
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
          <Typography sx={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: '#17d0d8' }}>
            {PROFILE.client.siteCode} · GUIDED REVIEW
          </Typography>
          <IconButton size="small" onClick={() => setPhase('closed')} aria-label="Close guided review">
            <Close sx={{ fontSize: 16 }} />
          </IconButton>
        </Stack>

        {phase === 'briefing' && (
          <BriefingBody snapshot={snapshot} count={items.length} onStart={begin} />
        )}

        {phase === 'reviewing' && current && (
          <>
            <LinearProgress
              variant="determinate"
              value={(index / Math.max(1, items.length)) * 100}
              sx={{ mb: 2, height: 3, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.07)' }}
            />
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <Chip
                label={current.severity.toUpperCase()}
                size="small"
                sx={{
                  height: 18, fontSize: 9, fontWeight: 800, letterSpacing: '0.06em',
                  color: SEVERITY_COLOR[current.severity],
                  bgcolor: `${SEVERITY_COLOR[current.severity]}1a`,
                  border: `1px solid ${SEVERITY_COLOR[current.severity]}40`,
                }}
              />
              <Typography sx={{ fontSize: 10, color: '#7b8186' }}>
                {index + 1} of {items.length}
              </Typography>
            </Stack>

            <Typography sx={{ fontSize: 15, fontWeight: 700, color: '#eff2f4', mb: 0.5 }}>
              {current.title}
            </Typography>
            <Typography sx={{ fontSize: 12, color: '#adb2b6', lineHeight: 1.6, mb: 1.25 }}>
              {current.detail}
            </Typography>
            <Typography
              sx={{
                fontSize: 10, color: '#7b8186', fontVariantNumeric: 'tabular-nums',
                mb: 2, pl: 1.25, borderLeft: '2px solid rgba(255,255,255,0.12)',
              }}
            >
              {current.evidence}
            </Typography>

            <Stack spacing={1}>
              {current.decisions.map((d, i) => (
                <Button
                  key={d.id}
                  onClick={() => decide(d.id)}
                  variant={i === 0 ? 'contained' : 'outlined'}
                  size="small"
                  endIcon={i === 0 ? <NavigateNext sx={{ fontSize: 16 }} /> : undefined}
                  sx={{ justifyContent: 'space-between', fontSize: 12, fontWeight: 700, textTransform: 'none', borderRadius: 2 }}
                >
                  {d.label}
                </Button>
              ))}
            </Stack>
          </>
        )}

        {phase === 'debrief' && (
          <DebriefBody
            score={score}
            lastOutcome={lastOutcome}
            onClose={() => setPhase('closed')}
          />
        )}
      </Paper>
    </Fade>
  );
};

const BriefingBody: React.FC<{
  snapshot: ReturnType<typeof getProductionSnapshot>;
  count: number;
  onStart: () => void;
}> = ({ snapshot, count, onStart }) => (
  <>
    <Typography sx={{ fontSize: 18, fontWeight: 700, color: '#eff2f4', mb: 0.5 }}>
      Welcome, site manager
    </Typography>
    <Typography sx={{ fontSize: 12, color: '#adb2b6', lineHeight: 1.6, mb: 2 }}>
      {PROFILE.client.name} · {PROFILE.copy.shiftName} shift. Here is where the line
      stands right now, measured from the running simulation.
    </Typography>

    <Stack spacing={0.75} sx={{ mb: 2 }}>
      <MetricLine label="Drives running" value={`${snapshot.drivesRunning} / ${snapshot.driveCount}`} />
      <MetricLine label="Availability" value={snapshot.hasDrives ? `${snapshot.availabilityPct.toFixed(0)}%` : 'not measured'} />
      <MetricLine label="Cases packed" value={snapshot.hasSinks ? `${snapshot.casesTotal}` : 'not measured'} />
      <MetricLine label="Observed" value={`${snapshot.elapsedSec.toFixed(0)}s`} />
    </Stack>

    <Typography sx={{ fontSize: 12, color: '#adb2b6', lineHeight: 1.6, mb: 2 }}>
      {count === 0
        ? 'Nothing is currently flagged for review.'
        : `${count} item${count === 1 ? '' : 's'} need${count === 1 ? 's' : ''} your attention. I will take you to each one.`}
    </Typography>

    <Button
      onClick={onStart}
      variant="contained"
      fullWidth
      startIcon={<PlayArrow sx={{ fontSize: 18 }} />}
      sx={{ fontSize: 12, fontWeight: 700, textTransform: 'none', borderRadius: 2 }}
    >
      {count === 0 ? 'Close out the shift' : 'Begin the walkthrough'}
    </Button>
  </>
);

const DebriefBody: React.FC<{
  score: ReturnType<typeof scoreReview>;
  lastOutcome: string | null;
  onClose: () => void;
}> = ({ score, lastOutcome, onClose }) => (
  <>
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
      <Verified sx={{ fontSize: 18, color: '#5ac576' }} />
      <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#eff2f4' }}>Shift review closed</Typography>
    </Stack>

    {lastOutcome && (
      <Typography sx={{ fontSize: 12, color: '#adb2b6', lineHeight: 1.6, mb: 1.5 }}>{lastOutcome}</Typography>
    )}

    <Typography sx={{ fontSize: 28, fontWeight: 700, color: '#eff2f4', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
      {score.efficiencyPct}%
    </Typography>
    <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: '#7b8186', mb: 1.5 }}>
      ITEMS CLOSED WITH THE RECOMMENDED ACTION
    </Typography>

    <Typography sx={{ fontSize: 12, color: '#adb2b6', lineHeight: 1.6, mb: 0.75 }}>{score.verdict}</Typography>
    {/* Stated plainly: this scores the review, not the plant. Nothing here
        wrote a signal, so claiming an OEE movement would be a fabrication. */}
    <Typography sx={{ fontSize: 10, color: '#53595d', lineHeight: 1.6, mb: 2 }}>
      This measures how the review was handled — {score.effective} of {score.total} items actioned.
      It is not a measurement of plant performance.
    </Typography>

    <Button onClick={onClose} variant="outlined" fullWidth sx={{ fontSize: 12, fontWeight: 700, textTransform: 'none', borderRadius: 2 }}>
      Done
    </Button>
  </>
);

const MetricLine: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <Stack direction="row" justifyContent="space-between" alignItems="baseline">
    <Typography sx={{ fontSize: 11, color: '#7b8186' }}>{label}</Typography>
    <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#eff2f4', fontVariantNumeric: 'tabular-nums' }}>
      {value}
    </Typography>
  </Stack>
);
