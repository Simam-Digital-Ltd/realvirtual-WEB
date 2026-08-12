// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Simam design tokens — the "Instrument" direction.
 *
 * Design thesis: this is a control room, not a dashboard. Every other digital
 * twin on the market reaches for high-saturation glowing cyan; that reads as a
 * trade-show demo. Here the chrome is near-monochrome graphite and *the data is
 * the only thing that carries colour*. Restraint is the differentiator.
 *
 * Rules — these are what keep the UI quiet:
 *
 *   1. Colour encodes STATE, never identity. A panel does not get a colour
 *      because it is "the cold chain panel"; it gets colour when it needs the
 *      operator's attention.
 *   2. `accent` marks live / interactive affordances ONLY. If everything is
 *      accented, nothing is.
 *   3. Everything else is a neutral. Neutral is the default, not the exception.
 *
 * Before this file the HMI carried 78 distinct hex literals — 16 blues, 11
 * ambers, 10 greens, 5 reds — which accumulated one plugin at a time rather
 * than being chosen. Colour therefore carried no information and the eye had
 * nowhere to land.
 */

/** Surface + text neutrals. The UI is built almost entirely from these. */
export const RV_NEUTRAL = {
  /** Deepest ground — scene letterbox, app background. */
  ink: '#0B0F14',
  /** Standard panel surface. */
  surface: '#12171E',
  /** Raised surface — nested cards, hovered rows. */
  raised: '#1A212B',
  /** Hairline borders and dividers. Never use a bright colour for structure. */
  line: '#263040',
  /** Primary text. */
  text: '#E4E9F0',
  /** Secondary text, labels, units. */
  textDim: '#8A97A8',
  /** Disabled / tertiary. */
  textMuted: '#5A6675',
} as const;

/**
 * The single brand accent. Reserved for live data and interactive affordances.
 * Deliberately desaturated relative to the Material cyans it replaces — the
 * muting is the point.
 */
export const RV_ACCENT = '#3FB8C4';

/** State colours. These are the only other hues permitted in the UI. */
export const RV_STATE = {
  ok: '#5FB37A',
  warn: '#D9A441',
  critical: '#D9534F',
  /** Rare, non-semantic distinction (e.g. per-user multiuser cursors). */
  alt: '#8B7BC7',
} as const;

/** Flat convenience export. */
export const RV = {
  ...RV_NEUTRAL,
  accent: RV_ACCENT,
  ...RV_STATE,
} as const;

/**
 * Map a live value to a state colour by threshold.
 * Keeps "when is this amber?" in one place instead of scattered ternaries.
 */
export function stateColor(
  value: number,
  { warnBelow, criticalBelow }: { warnBelow: number; criticalBelow: number },
): string {
  if (value < criticalBelow) return RV_STATE.critical;
  if (value < warnBelow) return RV_STATE.warn;
  return RV_STATE.ok;
}

/** Standard translucent panel surface used across HMI overlays. */
export const rvPanelSx = {
  bgcolor: 'rgba(18, 23, 30, 0.92)',
  border: `1px solid ${RV_NEUTRAL.line}`,
  borderRadius: '10px',
  backdropFilter: 'blur(14px)',
  color: RV_NEUTRAL.text,
} as const;

/**
 * Eyebrow label styling. Uppercase is reserved for short labels (<= 2 words);
 * everything longer should be sentence case at weight 500-600.
 */
export const rvEyebrowSx = {
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: 0.8,
  textTransform: 'uppercase',
  color: RV_NEUTRAL.textDim,
} as const;
