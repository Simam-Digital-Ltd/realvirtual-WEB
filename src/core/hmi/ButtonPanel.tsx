import { Box, Paper, Typography, Chip } from '@mui/material';
import { Circle } from '@mui/icons-material';
import { useViewer } from '../../hooks/use-viewer';
import { useSlot } from '../../hooks/use-slot';

/** Core layout for the left sidebar: logo + status header, slot-driven button group. */
export function ButtonPanel() {
  const viewer = useViewer();
  const entries = useSlot('button-group');

  return (
    <Box
      sx={{
        position: 'fixed',
        left: 8,
        top: 8,
        bottom: 8,
        zIndex: 1200,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 1,
        pointerEvents: 'none',
      }}
    >
      {/* Logo + Status */}
      <Paper
        elevation={4}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.25,
          py: 0.5,
          borderRadius: 2,
          pointerEvents: 'auto',
        }}
      >
        <img src="./logo.png" alt="realvirtual" style={{ height: 18, width: 18 }} />
        <Typography sx={{ fontSize: 12, fontWeight: 500, letterSpacing: 0.5, color: 'text.primary' }}>
          realvirtual
        </Typography>
        <Chip
          icon={<Circle sx={{ fontSize: 6, color: '#66bb6a' }} />}
          label="ONLINE"
          size="small"
          variant="outlined"
          sx={{ borderColor: '#66bb6a', color: '#66bb6a', height: 20, fontSize: 10, '& .MuiChip-label': { px: 0.5 }, '& .MuiChip-icon': { ml: 0.5 } }}
        />
      </Paper>

      {/* Button group — vertically centered, rendered from 'button-group' slot */}
      {entries.length > 0 && (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
          <Paper
            elevation={4}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 0.25,
              p: 0.5,
              borderRadius: 2,
              pointerEvents: 'auto',
            }}
          >
            {entries.map((entry, i) => {
              const Comp = entry.component;
              return <Comp key={`btn-${i}`} viewer={viewer} />;
            })}
          </Paper>
        </Box>
      )}
    </Box>
  );
}
