import { Box } from '@mui/material';
import { useViewer } from '../../hooks/use-viewer';
import { useSlot } from '../../hooks/use-slot';

/** Core layout container for the KPI bar (top center). Renders 'kpi-bar' slot entries. */
export function KpiBar() {
  const viewer = useViewer();
  const entries = useSlot('kpi-bar');
  if (entries.length === 0) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 8,
        left: 0,
        right: 0,
        zIndex: 1200,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        gap: 1.5,
        pointerEvents: 'none',
      }}
    >
      {entries.map((entry, i) => {
        const Comp = entry.component;
        return <Comp key={`kpi-${i}`} viewer={viewer} />;
      })}
    </Box>
  );
}
