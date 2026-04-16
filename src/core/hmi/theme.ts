// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { createTheme } from '@mui/material/styles';

export const rvDarkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary:    { main: '#20a1b1' }, // Simam Teal
    secondary:  { main: '#7b52ee' }, // Simam Purple
    success:    { main: '#66bb6a' },
    warning:    { main: '#ffa726' },
    error:      { main: '#ef5350' },
    background: {
      default: 'transparent',
      paper: 'rgba(10, 10, 10, 0.6)', // Darker glass
    },
  },
  typography: {
    fontFamily: '"Roboto", "Jost", "Inter", sans-serif',
    fontSize: 13,
    h1: { fontFamily: '"Jost", sans-serif', fontWeight: 700 },
    h2: { fontFamily: '"Jost", sans-serif', fontWeight: 600 },
    h3: { fontFamily: '"Jost", sans-serif', fontWeight: 600 },
  },
  shape: {
    borderRadius: 4,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: 'transparent' },
        // Increase base font size on touch devices so UI is readable on phones
        '@media (hover: none) and (pointer: coarse)': {
          html: { fontSize: '16px' },
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backdropFilter: 'blur(12px) saturate(180%)',
          backgroundImage: 'none !important',
          backgroundColor: 'rgba(10, 10, 10, 0.6) !important',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          // Reduce blur on touch devices for GPU performance
          '@media (hover: none) and (pointer: coarse)': {
            backdropFilter: 'blur(8px)',
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          // Touch-friendly targets on coarse-pointer devices (Apple HIG: 44px)
          '@media (pointer: coarse)': {
            minWidth: 44,
            minHeight: 44,
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          '@media (pointer: coarse)': {
            minHeight: 44,
          },
        },
      },
    },
  },
});
