// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Simam design layer.
 *
 * Wraps upstream's `rvDarkTheme` rather than editing it, so the fork stays
 * mergeable (see CASE-STUDY.md §5). Everything here is applied on top.
 *
 * Three defects in the base theme this layer exists to correct:
 *
 * 1. FRACTIONAL TYPE. `typography.fontSize: 13` against the default
 *    `htmlFontSize: 16` makes MUI compute every variant as
 *    `size / 16 * (13 / 14) rem` — so body1 lands on 14.857px, h6 on 22.286px,
 *    caption on 11.143px. Fractional pixels are resampled by the rasteriser,
 *    which is why the UI reads as soft next to the rest of the portfolio.
 *    Every variant below is pinned to an integer px string, bypassing rem
 *    maths entirely.
 *
 * 2. NO SURFACE DEFINITION. Base uses Material's default drop shadows, which
 *    read as generic. The portfolio house style defines a surface with a 1px
 *    inset top highlight — the light-catching bevel that separates glass from
 *    a flat translucent rectangle.
 *
 * 3. UNBOUNDED RADII. 11 distinct radii in the shipped build, including 34
 *    fully-round (50%) icon buttons. The scale below is three values.
 */

import { createTheme, type Theme } from '@mui/material/styles';
import { rvDarkTheme } from './theme';

/** Type scale. Integers only — see note 1 above. */
export const SIMAM_TYPE = {
  /** Micro-labels: units, eyebrows, axis ticks. Always tracked, often upper. */
  micro: '10px',
  /** Secondary text, dense table cells, captions. */
  small: '11px',
  /** Default body. */
  body: '13px',
  /** Emphasised body, panel titles. */
  strong: '14px',
  /** Section headings. */
  heading: '18px',
  /** KPI readouts and display numerals. */
  display: '28px',
} as const;

/**
 * Radius scale. Three values, no exceptions.
 * `pill` is for status chips only; icon buttons use `control`, not 50%.
 */
export const SIMAM_RADIUS = {
  control: 8,
  panel: 12,
  pill: 999,
} as const;

/**
 * The signature surface treatment.
 *
 * The inset highlight is the whole trick: a 1px inner top edge at low alpha
 * reads as a bevel catching light, which is what separates a crafted panel
 * from a plain translucent box. Paired with a hairline border and a real
 * drop shadow for depth off the 3D viewport behind it.
 */
export const SIMAM_SURFACE = {
  hairline: 'rgba(255, 255, 255, 0.09)',
  insetHighlight: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.10)',
  lift: '0 16px 40px -12px rgba(0, 0, 0, 0.55)',
} as const;

/** Tracking for micro-labels. Small type needs air to stay legible. */
export const SIMAM_TRACKING = {
  micro: '0.08em',
  label: '0.04em',
  /** Display numerals tighten rather than open up. */
  display: '-0.02em',
} as const;

/** Single easing curve across the app — motion should feel like one system. */
export const SIMAM_MOTION = {
  fast: '120ms cubic-bezier(0.4, 0, 0.2, 1)',
  base: '180ms cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

/**
 * Reusable eyebrow style: the tracked micro-label that gives instrument
 * panels their character. Use above every readout.
 */
export const simamEyebrowSx = {
  fontSize: SIMAM_TYPE.micro,
  fontWeight: 700,
  letterSpacing: SIMAM_TRACKING.micro,
  textTransform: 'uppercase' as const,
  lineHeight: 1.4,
};

/** Reusable panel surface. */
export const simamPanelSx = {
  borderRadius: `${SIMAM_RADIUS.panel}px`,
  border: `1px solid ${SIMAM_SURFACE.hairline}`,
  boxShadow: `${SIMAM_SURFACE.insetHighlight}, ${SIMAM_SURFACE.lift}`,
};

/**
 * Apply the Simam layer to any base theme.
 * Kept as a function so `createBrandedTheme` output can be wrapped too.
 */
export function applySimamLayer(base: Theme): Theme {
  return createTheme(base, {
    typography: {
      // Neutralise the 13/14 multiplier so any variant we do NOT pin below
      // still resolves to a whole pixel.
      fontSize: 14,
      // Systemic fix rather than a per-component sweep: MUI internals (Chip,
      // InputBase, SvgIcon, Alert…) size themselves by calling `pxToRem`
      // directly, which is what leaks fractional values back in. Replacing the
      // function makes every one of those call sites land on a whole pixel.
      pxToRem: (size: number) => `${Math.round(size)}px`,
      fontFamily: '"Inter", "Inter var", system-ui, -apple-system, sans-serif',
      // Two weights carry the hierarchy: 400 for prose, 700 for everything
      // that must be read at a glance. Mid weights blur the distinction.
      h1: { fontSize: SIMAM_TYPE.display, fontWeight: 700, letterSpacing: SIMAM_TRACKING.display },
      h2: { fontSize: SIMAM_TYPE.heading, fontWeight: 700, letterSpacing: SIMAM_TRACKING.display },
      h3: { fontSize: SIMAM_TYPE.heading, fontWeight: 700 },
      h4: { fontSize: SIMAM_TYPE.strong, fontWeight: 700 },
      h5: { fontSize: SIMAM_TYPE.strong, fontWeight: 700 },
      h6: { fontSize: SIMAM_TYPE.strong, fontWeight: 700 },
      subtitle1: { fontSize: SIMAM_TYPE.body, fontWeight: 700 },
      subtitle2: { fontSize: SIMAM_TYPE.small, fontWeight: 700 },
      body1: { fontSize: SIMAM_TYPE.body, fontWeight: 400 },
      body2: { fontSize: SIMAM_TYPE.small, fontWeight: 400 },
      button: {
        fontSize: SIMAM_TYPE.small,
        fontWeight: 700,
        letterSpacing: SIMAM_TRACKING.label,
        textTransform: 'none' as const,
      },
      caption: { fontSize: SIMAM_TYPE.micro, fontWeight: 400, letterSpacing: SIMAM_TRACKING.label },
      overline: { ...simamEyebrowSx },
    },
    shape: { borderRadius: SIMAM_RADIUS.control },
    components: {
      MuiPaper: {
        styleOverrides: {
          root: {
            borderRadius: `${SIMAM_RADIUS.panel}px`,
            boxShadow: `${SIMAM_SURFACE.insetHighlight}, ${SIMAM_SURFACE.lift}`,
            border: `1px solid ${SIMAM_SURFACE.hairline}`,
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          // Squircle, not circle. 34 round buttons scattered over a viewport
          // is the single loudest "assembled from a component library" tell.
          root: {
            borderRadius: `${SIMAM_RADIUS.control}px`,
            transition: `background-color ${SIMAM_MOTION.fast}`,
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: `${SIMAM_RADIUS.control}px`,
            transition: `background-color ${SIMAM_MOTION.fast}`,
          },
        },
      },
      MuiSvgIcon: {
        styleOverrides: {
          // MUI bakes `pxToRem` into the theme at creation time, so it keeps
          // using the base theme's 13/14 multiplier no matter what we set
          // `typography.fontSize` to — leaving every icon on 22.2857px.
          // Pin the three sizes to integers directly.
          fontSizeSmall: { fontSize: '18px' },
          root: { fontSize: '20px' },
          fontSizeLarge: { fontSize: '28px' },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            fontSize: SIMAM_TYPE.micro,
            fontWeight: 600,
            letterSpacing: SIMAM_TRACKING.label,
            borderRadius: `${SIMAM_RADIUS.control}px`,
          },
        },
      },
    },
  });
}

/** The Simam-layered dark theme. Drop-in replacement for `rvDarkTheme`. */
export const simamDarkTheme = applySimamLayer(rvDarkTheme);
