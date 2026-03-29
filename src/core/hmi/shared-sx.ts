/**
 * Shared MUI sx prop factories for dark-theme styled components.
 *
 * Used by chart overlays, hierarchy browser, and other HMI components
 * for consistent dark-theme styling. Parameterized by accent color or state.
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

/**
 * Returns sx for a small filter Chip that toggles between active/inactive.
 * Used in hierarchy browser type filters, signal sort chips, etc.
 *
 * @param isActive  Whether the chip is currently selected.
 * @param height    Chip height in px (default 18).
 * @param fontSize  Font size in px (default 9).
 */
export function filterChipSx(
  isActive: boolean,
  height = 18,
  fontSize = 9,
): SxProps<Theme> {
  return {
    height,
    fontSize,
    fontWeight: isActive ? 700 : 400,
    bgcolor: isActive ? 'rgba(79, 195, 247, 0.2)' : 'transparent',
    color: isActive ? 'primary.main' : 'text.secondary',
    border: `1px solid ${isActive ? 'rgba(79, 195, 247, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
    '& .MuiChip-label': { px: 0.5 },
    cursor: 'pointer',
    '&:hover': {
      bgcolor: isActive ? 'rgba(79, 195, 247, 0.25)' : 'rgba(255, 255, 255, 0.06)',
    },
  };
}
