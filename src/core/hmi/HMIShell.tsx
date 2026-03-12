import { Box } from '@mui/material';
import { useViewer } from '../../hooks/use-viewer';
import type { UISlot } from '../rv-ui-plugin';

interface HMIShellProps {
  children: React.ReactNode;
}

/**
 * SlotRenderer — Renders all UI plugin components registered for a given slot.
 * Use alongside (or instead of) hardcoded children in HMIShell.
 */
export function SlotRenderer({ slot }: { slot: UISlot }) {
  const viewer = useViewer();
  const entries = viewer.uiRegistry.getSlotComponents(slot);
  if (entries.length === 0) return null;
  return (
    <>
      {entries.map((entry, i) => {
        const Comp = entry.component;
        return <Comp key={`${slot}-${i}`} viewer={viewer} />;
      })}
    </>
  );
}

export function HMIShell({ children }: HMIShellProps) {
  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 1000,
        '& > *': {
          pointerEvents: 'auto',
        },
      }}
    >
      {children}
    </Box>
  );
}
