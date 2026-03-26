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
          This is a <strong style={{ color: '#fff' }}>prototype</strong> demonstrating
          the 3D HMI possibilities of a{' '}
          <strong style={{ color: '#4fc3f7' }}>realvirtual.io Professional</strong> Web
          export. Think of this kind of model connected to a real system.
        </Typography>

        <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
          Exports in seconds from Unity Editor — using modern web standards like
          Three.js, React and glTF/GLB. realvirtual WEB includes WebSocket, MQTT,
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
          <Button variant="contained" size="small" onClick={onClose} sx={{ textTransform: 'none', fontWeight: 600 }}>
            Got it
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
