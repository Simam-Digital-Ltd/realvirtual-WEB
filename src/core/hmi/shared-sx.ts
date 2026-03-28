/**
 * Shared MUI sx prop factories for dark-theme styled components.
 *
 * Used by DriveChartOverlay and SensorChartOverlay for period/mode
 * ToggleButtonGroup styling. Parameterized by accent color.
 */

import type { SxProps, Theme } from '@mui/material';

/**
 * Returns sx for a compact dark-theme ToggleButtonGroup.
 * Parameterize accent color for per-chart theming.
 */
export function compactToggleGroupSx(
  accentColor: string,
  accentRgb: string,
  extraSx?: SxProps<Theme>,
): SxProps<Theme> {
  return [
    {
      height: 22,
      '& .MuiToggleButtonGroup-grouped': {
        border: '1px solid rgba(255,255,255,0.1) !important',
      },
      '& .MuiToggleButton-root': {
        color: 'rgba(255,255,255,0.4)',
        bgcolor: 'transparent',
        borderColor: 'rgba(255,255,255,0.1)',
        fontSize: 10,
        lineHeight: 1,
        px: 0.6,
        py: 0,
        minWidth: 0,
        textTransform: 'none',
        '&.Mui-selected': {
          color: accentColor,
          bgcolor: `rgba(${accentRgb},0.12)`,
          borderColor: `rgba(${accentRgb},0.3) !important`,
        },
        '&.Mui-selected:hover': {
          bgcolor: `rgba(${accentRgb},0.18)`,
        },
        '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
      },
    },
    ...(Array.isArray(extraSx) ? extraSx : extraSx ? [extraSx] : []),
  ];
}
