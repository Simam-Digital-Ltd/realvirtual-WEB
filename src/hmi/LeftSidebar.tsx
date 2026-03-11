import { Box, IconButton, Tooltip, Badge, Paper, Typography, Chip } from '@mui/material';
import { Speed, Sensors, Warning, Build, Visibility, Circle } from '@mui/icons-material';
import { useViewer } from '../hooks/use-viewer';
import { useDriveChartOpen } from '../hooks/use-drive-chart';

const navItems = [
  { icon: <Speed />, label: 'Drives', badge: 0, action: 'drives' as const },
  { icon: <Sensors />, label: 'Sensors', badge: 0, action: null },
  { icon: <Warning />, label: 'Alarms', badge: 3, action: null },
  { icon: <Build />, label: 'Maintenance', badge: 1, action: null },
  { icon: <Visibility />, label: 'Views', badge: 0, action: null },
];

export function LeftSidebar() {
  const viewer = useViewer();
  const driveChartOpen = useDriveChartOpen();

  const handleClick = (action: string | null) => {
    if (action === 'drives') {
      viewer.toggleDriveChart();
    }
  };

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

      {/* Nav buttons — vertically centered */}
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
          {navItems.map((item) => (
            <Tooltip key={item.label} title={item.label} placement="right">
              <IconButton
                size="medium"
                onClick={() => handleClick(item.action)}
                sx={{
                  color: item.action === 'drives' && driveChartOpen ? 'primary.main' : 'text.secondary',
                  bgcolor: item.action === 'drives' && driveChartOpen ? 'rgba(79, 195, 247, 0.12)' : 'transparent',
                  '&:hover': {
                    color: 'primary.main',
                    bgcolor: 'rgba(79, 195, 247, 0.08)',
                  },
                }}
              >
                <Badge badgeContent={item.badge || undefined} color="error" max={99}>
                  {item.icon}
                </Badge>
              </IconButton>
            </Tooltip>
          ))}
        </Paper>
      </Box>
    </Box>
  );
}
