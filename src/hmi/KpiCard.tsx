import { Box, Typography, Paper } from '@mui/material';

interface KpiCardProps {
  label: string;
  value: string;
  unit: string;
  secondary?: string;
  color?: string;
  sparkline?: number[];
}

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const w = 120;
  const h = 28;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);

  const points = data
    .map((v, i) => `${i * step},${h - ((v - min) / range) * (h - 4) - 2}`)
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{
        position: 'absolute',
        bottom: 4,
        left: 0,
        width: '100%',
        height: '50%',
        opacity: 0.5,
      }}
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Static dummy sparkline data per KPI
const SPARKLINES: Record<string, number[]> = {
  OEE: [82, 84, 81, 86, 87, 85, 88, 87, 86, 87, 89, 87, 86, 88, 87],
  'Parts/h': [290, 305, 298, 310, 315, 308, 320, 312, 318, 312, 315, 312, 310, 314, 312],
  'Cycle Time': [4.5, 4.3, 4.4, 4.1, 4.2, 4.3, 4.1, 4.2, 4.3, 4.2, 4.1, 4.2, 4.3, 4.2, 4.2],
};

export function KpiCard({ label, value, unit, secondary, color = '#4fc3f7' }: KpiCardProps) {
  const sparkData = SPARKLINES[label] || [];

  return (
    <Paper
      elevation={4}
      sx={{
        position: 'relative',
        overflow: 'hidden',
        minWidth: 130,
        px: 1.5,
        py: 1,
        borderRadius: 2,
        pointerEvents: 'auto',
        cursor: 'default',
      }}
    >
      <MiniSparkline data={sparkData} color={color} />
      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <Typography
          sx={{
            color: 'text.secondary',
            textTransform: 'uppercase',
            letterSpacing: 1,
            fontSize: 10,
            lineHeight: 1,
            mb: 0.25,
          }}
        >
          {label}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
          <Typography
            sx={{
              fontWeight: 700,
              color,
              lineHeight: 1.1,
              fontSize: '1.75rem',
              fontFamily: '"Inter", "Roboto", sans-serif',
            }}
          >
            {value}
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 12 }}>
            {unit}
          </Typography>
        </Box>
        {secondary && (
          <Typography
            sx={{
              color: 'text.secondary',
              fontSize: 10,
              mt: 0.25,
              lineHeight: 1,
            }}
          >
            {secondary}
          </Typography>
        )}
      </Box>
    </Paper>
  );
}
