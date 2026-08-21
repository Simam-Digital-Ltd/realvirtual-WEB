// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Simam KPI card.
 *
 * Drop-in replacement for upstream's `KpiCard` with the same props, kept in
 * our layer rather than patched into theirs (CASE-STUDY.md §5).
 *
 * Three differences that matter:
 *
 * 1. NO FROZEN VALUES. Upstream seeds its display value once via
 *    `useState(baseValue)` and never follows prop changes, so any live value
 *    passed with the default `animate` sticks at its first reading. This
 *    renders the prop directly — a live KPI is the entire point of the card.
 *
 * 2. TABULAR FIGURES. Proportional digits make a ticking number reflow on
 *    every update because `1` is narrower than `8`. `Readout` pins the advance
 *    width so the value updates in place.
 *
 * 3. LIVE IS A STATE, NOT A STRING. Upstream shows provenance by writing
 *    "LIVE ·" into the secondary text. Here it is a pulsing accent dot driven
 *    by the `live` prop, so a glance is enough — and demo data cannot
 *    accidentally claim to be live.
 */

import { Box } from '@mui/material';
import { Eyebrow, Readout, Panel } from './simam-primitives';
import { SIMAM_TYPE, SIMAM_TRACKING, SIMAM_MOTION } from './simam-theme';

export interface SimamKpiCardProps {
  label: string;
  value: string;
  unit?: string;
  secondary?: string;
  /** Sparkline history, oldest first. Fewer than 2 points hides the trace. */
  sparkline?: number[];
  /** Drives the pulsing provenance dot and the accent trace colour. */
  live?: boolean;
  tone?: 'default' | 'ok' | 'warn' | 'critical' | 'accent';
  onClick?: () => void;
}

const TRACE_TONE: Record<string, string> = {
  default: 'var(--sim-text-dim)',
  ok: 'var(--sim-ok)',
  warn: 'var(--sim-warn)',
  critical: 'var(--sim-critical)',
  accent: 'var(--sim-accent)',
};

/**
 * Area-filled sparkline.
 *
 * `preserveAspectRatio="none"` lets it stretch to whatever width the card
 * gets, so the trace always spans the full card regardless of breakpoint.
 */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const w = 100;
  const h = 32;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => [i * step, h - ((v - min) / range) * (h - 6) - 3] as const);
  const line = pts.map(([x, y]) => `${x},${y}`).join(' ');
  const area = `0,${h} ${line} ${w},${h}`;
  const gid = `sim-spark-${color.replace(/[^a-z0-9]/gi, '')}`;

  return (
    <Box
      component="svg"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden
      sx={{
        position: 'absolute',
        inset: 'auto 0 0 0',
        width: '100%',
        height: 32,
        opacity: 0.5,
        pointerEvents: 'none',
      }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="1.25"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </Box>
  );
}

export function SimamKpiCard({
  label, value, unit, secondary, sparkline, live = false, tone = 'default', onClick,
}: SimamKpiCardProps) {
  const trace = TRACE_TONE[live ? 'accent' : tone] ?? TRACE_TONE.default;

  return (
    <Panel
      onClick={onClick}
      sx={{
        position: 'relative',
        overflow: 'hidden',
        minWidth: { xs: 0, sm: 148 },
        flexShrink: 1,
        px: 1.5,
        pt: 1,
        pb: 1.25,
        pointerEvents: 'auto',
        cursor: onClick ? 'pointer' : 'default',
        transition: `border-color ${SIMAM_MOTION.fast}, transform ${SIMAM_MOTION.fast}`,
        '&:hover': onClick
          ? { borderColor: 'var(--sim-line-strong)', transform: 'translateY(-1px)' }
          : undefined,
      }}
    >
      <Sparkline data={sparkline ?? []} color={trace} />

      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <Eyebrow tone={live ? 'accent' : 'none'} sx={{ mb: 0.5 }}>
          {label}
        </Eyebrow>

        <Readout value={value} unit={unit} size="display" tone={live ? 'accent' : tone} />

        {secondary && (
          <Box
            sx={{
              mt: 0.5,
              fontSize: SIMAM_TYPE.micro,
              letterSpacing: SIMAM_TRACKING.label,
              lineHeight: 1.3,
              color: 'var(--sim-text-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {secondary}
          </Box>
        )}
      </Box>
    </Panel>
  );
}
