// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Simam micro-typography primitives.
 *
 * The measured gap between this app and the rest of the portfolio was not
 * colour or layout — it was texture. The reference builds carry 200-460
 * tracked micro-labels per screen; this one carried 15. That density of small,
 * quiet, precisely-set type is what makes a panel read as an instrument
 * rather than as a card with a number on it.
 *
 * These are deliberately tiny components. The point is that using them is
 * cheaper than hand-rolling `sx` at each call site, so the texture actually
 * ends up applied consistently instead of drifting.
 */

import { Box, type BoxProps } from '@mui/material';
import type { ReactNode } from 'react';
import { SIMAM_TYPE, SIMAM_TRACKING } from './simam-theme';

/* ------------------------------------------------------------------ */
/* Eyebrow                                                             */
/* ------------------------------------------------------------------ */

export interface EyebrowProps extends Omit<BoxProps, 'children'> {
  children: ReactNode;
  /** Optional trailing status dot — omit for plain labels. */
  tone?: 'ok' | 'warn' | 'critical' | 'accent' | 'none';
}

const TONE_VAR: Record<string, string> = {
  ok: 'var(--sim-ok)',
  warn: 'var(--sim-warn)',
  critical: 'var(--sim-critical)',
  accent: 'var(--sim-accent)',
};

/**
 * The tracked uppercase caption that titles a readout.
 * Use one above every value in the HMI — that is the texture.
 */
export function Eyebrow({ children, tone = 'none', sx, ...rest }: EyebrowProps) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        fontSize: SIMAM_TYPE.micro,
        fontWeight: 700,
        letterSpacing: SIMAM_TRACKING.micro,
        textTransform: 'uppercase',
        lineHeight: 1.4,
        color: 'var(--sim-text-dim)',
        ...sx,
      }}
      {...rest}
    >
      {tone !== 'none' && (
        <Box
          component="span"
          sx={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            flex: '0 0 auto',
            bgcolor: TONE_VAR[tone],
            // A live indicator should look live; a static one should not.
            boxShadow: tone === 'accent' ? '0 0 0 3px var(--sim-accent-wash)' : 'none',
          }}
        />
      )}
      {children}
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/* Readout                                                             */
/* ------------------------------------------------------------------ */

export interface ReadoutProps {
  value: string | number;
  unit?: string;
  /** Visual weight. `display` for headline KPIs, `inline` inside dense rows. */
  size?: 'display' | 'inline';
  tone?: 'default' | 'ok' | 'warn' | 'critical' | 'accent';
}

const READOUT_TONE: Record<string, string> = {
  default: 'var(--sim-text)',
  ok: 'var(--sim-ok)',
  warn: 'var(--sim-warn)',
  critical: 'var(--sim-critical)',
  accent: 'var(--sim-accent)',
};

/**
 * A numeric readout.
 *
 * Tabular figures are the reason this exists: with proportional digits a live
 * value visibly reflows every time it ticks, because `1` is narrower than `8`.
 * Tabular numerals give every digit the same advance width, so the number
 * updates in place and the layout stops twitching.
 */
export function Readout({ value, unit, size = 'display', tone = 'default' }: ReadoutProps) {
  const display = size === 'display';
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, minWidth: 0 }}>
      <Box
        component="span"
        sx={{
          fontSize: display ? SIMAM_TYPE.display : SIMAM_TYPE.strong,
          fontWeight: display ? 800 : 700,
          letterSpacing: display ? SIMAM_TRACKING.display : 'normal',
          lineHeight: 1.05,
          color: READOUT_TONE[tone],
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: '"tnum" 1',
        }}
      >
        {value}
      </Box>
      {unit && (
        <Box
          component="span"
          sx={{
            fontSize: display ? SIMAM_TYPE.small : SIMAM_TYPE.micro,
            fontWeight: 600,
            letterSpacing: SIMAM_TRACKING.label,
            color: 'var(--sim-text-muted)',
            lineHeight: 1,
          }}
        >
          {unit}
        </Box>
      )}
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export interface PanelProps extends BoxProps {
  children: ReactNode;
  /** Glass floats over the 3D viewport; solid is for docked chrome. */
  variant?: 'glass' | 'solid';
}

/** A floating surface carrying the bevel treatment. */
export function Panel({ children, variant = 'glass', sx, ...rest }: PanelProps) {
  return (
    <Box
      sx={{
        borderRadius: 'var(--sim-radius-panel)',
        border: '1px solid var(--sim-line)',
        background: variant === 'glass' ? 'var(--sim-glass)' : 'var(--sim-surface)',
        backdropFilter: variant === 'glass' ? 'blur(16px) saturate(140%)' : 'none',
        boxShadow: 'var(--sim-bevel), var(--sim-lift-2)',
        ...sx,
      }}
      {...rest}
    >
      {children}
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/* MetricRow                                                           */
/* ------------------------------------------------------------------ */

export interface MetricRowProps {
  label: string;
  value: string | number;
  unit?: string;
  tone?: 'default' | 'ok' | 'warn' | 'critical' | 'accent';
}

/**
 * Dense label/value pair — the workhorse of a detail panel.
 * Label left, value right, hairline between rows. Ten of these stacked is
 * what a real instrument panel looks like.
 */
export function MetricRow({ label, value, unit, tone = 'default' }: MetricRowProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        py: 0.75,
        borderBottom: '1px solid var(--sim-line)',
        '&:last-of-type': { borderBottom: 0 },
      }}
    >
      <Eyebrow sx={{ color: 'var(--sim-text-muted)' }}>{label}</Eyebrow>
      <Readout value={value} unit={unit} size="inline" tone={tone} />
    </Box>
  );
}
