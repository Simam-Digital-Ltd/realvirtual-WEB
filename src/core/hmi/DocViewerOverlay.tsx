// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { useEffect } from 'react';
import { Box, Paper, IconButton, Typography } from '@mui/material';
import { Close } from '@mui/icons-material';

export interface DocViewerOverlayProps {
  url: string;
  title?: string;
  onClose: () => void;
}

export function DocViewerOverlay({ url, title, onClose }: DocViewerOverlayProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <Box
      onClick={onClose}
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'rgba(0,0,0,0.75)',
        pointerEvents: 'auto',
      }}
    >
      <Paper
        elevation={12}
        onClick={(e) => e.stopPropagation()}
        sx={{
          width: '90vw',
          height: '90vh',
          borderRadius: 2,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {/* Title bar */}
        <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {title && (
            <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
              {title}
            </Typography>
          )}
          <IconButton size="small" onClick={onClose} sx={{ ml: 'auto' }}>
            <Close />
          </IconButton>
        </Box>

        {/* PDF embed */}
        <Box
          component="object"
          data={url}
          type="application/pdf"
          sx={{ flex: 1, border: 'none', width: '100%', bgcolor: '#8A97A8' }}
        />
      </Paper>
    </Box>
  );
}
