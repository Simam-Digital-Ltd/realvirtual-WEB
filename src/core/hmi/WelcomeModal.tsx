// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { Box, Paper, Typography, Button } from '@mui/material';

interface WelcomeModalProps {
  open: boolean;
  onClose: () => void;
}

export function WelcomeModal({ open, onClose }: WelcomeModalProps) {
  if (!open) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'rgba(0,0,0,0.6)',
        pointerEvents: 'auto',
      }}
      onClick={onClose}
    >
      <Paper
        elevation={12}
        sx={{
          borderRadius: 2,
          width: 520,
          maxWidth: '95vw',
          p: { xs: 2.5, sm: 4 },
          display: 'flex',
          flexDirection: 'column',
          gap: 2.5,
          maxHeight: '90dvh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Typography variant="h6" sx={{ fontWeight: 700, color: '#4fc3f7' }}>
          realvirtual WEB
        </Typography>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', letterSpacing: 2, textTransform: 'uppercase', fontSize: 10, mt: -1 }}>
          Open. Light. Industrial. Anywhere.
        </Typography>

        <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
          Browser-based <strong style={{ color: '#fff' }}>3D HMI, Machine Information System, and Digital Twin Viewer</strong> for
          industrial automation. Load GLB models and run transport simulation, drive animation,
          sensor collision, and LogicStep sequencing — no installation required.
        </Typography>

        <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
          Connect to real PLCs via WebSocket or MQTT for live signal visualization,
          KPI dashboards, and alarm monitoring. Attach documents, maintenance guides,
          and technical drawings directly to 3D components.
        </Typography>

        <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
          Open source under the <strong style={{ color: '#fff' }}>AGPL-3.0 license</strong>.
          Built with Three.js, React, Material UI, Rapier.js, Apache ECharts, and Vite.
          Part of the{' '}
          <a href="https://realvirtual.io" target="_blank" rel="noopener noreferrer" style={{ color: '#4fc3f7', textDecoration: 'none' }}>
            realvirtual.io
          </a>{' '}
          industrial digital twin platform.
        </Typography>

        <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
          <a href="https://github.com/game4automation/realvirtual-WEB" target="_blank" rel="noopener noreferrer" style={{ color: '#4fc3f7', textDecoration: 'none' }}>
            github.com/game4automation/realvirtual-WEB
          </a>
        </Typography>

        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)' }}>
          &copy; 2025 realvirtual GmbH
        </Typography>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
          <Button variant="contained" size="small" onClick={onClose} sx={{ textTransform: 'none', fontWeight: 600 }}>
            Got it
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
