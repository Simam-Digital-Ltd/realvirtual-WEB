// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Shared chart constants — used by DriveChartOverlay, SensorChartOverlay,
 * and any future real-time chart overlays.
 *
 * Note: Palettes are intentionally separate per chart type (different ordering).
 */

/** Time period durations for real-time chart overlays (seconds). */
export type TimePeriod = 30 | 60 | 120 | 300;
export const PERIOD_OPTIONS: readonly TimePeriod[] = [30, 60, 120, 300] as const;

/** Data sampling rate (points per second). */
export const CHART_SAMPLE_RATE = 10;

/** Chart data refresh interval (ms). */
export const CHART_REFRESH_INTERVAL = 200;

/** Default chart overlay width (px). */
export const CHART_DEFAULT_WIDTH = 700;

/** Drive chart color palette (cyan-first). */
export const DRIVE_PALETTE = [
  '#3FB8C4', '#8B7BC7', '#5FB37A', '#D9A441', '#8B7BC7',
  '#3FB8C4', '#D9534F', '#D9A441', '#8d6e63', '#8A97A8',
  '#8B7BC7', '#8B7BC7', '#3FB8C4', '#5FB37A', '#D9A441',
  '#3FB8C4', '#3FB8C4', '#5FB37A', '#D9534F', '#3FB8C4',
] as const;

/** Sensor chart color palette (green-first). */
export const SENSOR_PALETTE = [
  '#5FB37A', '#3FB8C4', '#D9A441', '#D9534F', '#8B7BC7',
  '#3FB8C4', '#8B7BC7', '#D9A441', '#8d6e63', '#8A97A8',
  '#8B7BC7', '#8B7BC7', '#3FB8C4', '#5FB37A', '#D9A441',
  '#3FB8C4', '#3FB8C4', '#5FB37A', '#D9534F', '#3FB8C4',
] as const;
