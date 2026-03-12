import { Box } from '@mui/material';
import { useViewer } from '../../hooks/use-viewer';
import { useSlot } from '../../hooks/use-slot';

/** Core layout container for messages (right side). Renders 'messages' slot entries. */
export function MessagePanel() {
  const viewer = useViewer();
  const entries = useSlot('messages');
  if (entries.length === 0) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        right: 8,
        top: 0,
        bottom: 0,
        width: 300,
        zIndex: 1200,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 1,
        overflow: 'auto',
      }}
    >
      {entries.map((entry, i) => {
        const Comp = entry.component;
        return <Comp key={`msg-${i}`} viewer={viewer} />;
      })}
    </Box>
  );
}
