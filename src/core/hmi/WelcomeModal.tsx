import { useState, useEffect } from 'react';
import { Box, Paper, Typography, Button } from '@mui/material';
import { useViewer } from '../../hooks/use-viewer';
import { getAppConfig } from './rv-app-config';

const LS_KEY = 'rv-welcome-shown';

export function WelcomeModal() {
  const viewer = useViewer();
  const shouldShow = !getAppConfig().hideWelcomeModal && !localStorage.getItem(LS_KEY);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!shouldShow) return;
    const show = () => {
      const timer = setTimeout(() => setVisible(true), 2000);
      return () => clearTimeout(timer);
    };
    // If a model is already loaded, start the 2s timer immediately
    if (viewer.currentModelUrl && viewer.scene.children.length > 0) {
      return show();
    }
    // Otherwise wait for model-loaded event
    const handler = () => {
      const timer = setTimeout(() => setVisible(true), 2000);
      cleanup = () => clearTimeout(timer);
    };
    let cleanup: (() => void) | undefined;
    viewer.on('model-loaded', handler);
    return () => {
      viewer.off('model-loaded', handler);
      cleanup?.();
    };
  }, [shouldShow, viewer]);

  if (!visible) return null;

  const handleClose = () => {
    localStorage.setItem(LS_KEY, '1');
    setVisible(false);
  };

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
      >
        <Typography variant="h6" sx={{ fontWeight: 700, color: '#4fc3f7' }}>
          realvirtual Web — 3D HMI
        </Typography>

        <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
          This is a <strong style={{ color: '#fff' }}>prototype</strong> demonstrating
          the 3D HMI possibilities of a{' '}
          <strong style={{ color: '#4fc3f7' }}>realvirtual.io Professional</strong> Web
          export. Think of this kind of model connected to a real system.
        </Typography>

        <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
          Exports in seconds from Unity Editor — using modern web standards like
          Three.js, React and glTF/GLB. realvirtual Web includes WebSocket, MQTT,
          Beckhoff, Bosch Rexroth and KEBA interfaces out of the box.
          Robot kinematics may not move correctly in this preview.
        </Typography>

        <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
          Fully open source under the{' '}
          <strong style={{ color: '#fff' }}>AGPL license</strong>. Built with
          Three.js, React, Material UI, Rapier.js, ECharts and Vite.
        </Typography>

        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)' }}>
          &copy; realvirtual GmbH
        </Typography>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
          <Button variant="contained" size="small" onClick={handleClose} sx={{ textTransform: 'none', fontWeight: 600 }}>
            Got it
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
