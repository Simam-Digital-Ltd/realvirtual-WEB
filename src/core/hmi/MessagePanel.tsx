import { useState } from 'react';
import { Box, useMediaQuery } from '@mui/material';
import { useViewer } from '../../hooks/use-viewer';
import { useSlot } from '../../hooks/use-slot';
import { MOBILE_BREAKPOINT } from '../../hooks/use-mobile-layout';

/** Core layout container for messages (right side). Renders 'messages' slot entries. */
export function MessagePanel() {
  const viewer = useViewer();
  const entries = useSlot('messages');
  const isMobile = useMediaQuery(`(max-width:${MOBILE_BREAKPOINT - 1}px)`);
  const [expandedIdx, setExpandedIdx] = useState(-1);

  if (entries.length === 0) return null;

  // ── Desktop: vertical centered column on the right ──
  if (!isMobile) {
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

  // ── Mobile: peek tabs at right edge, slide-in on tap ──
  // Each card renders fully but is shifted off-screen via translateX.
  // Only the left ~36px (colored border + icon) peeks from the right edge.
  // Tapping slides the full card into view.
  return (
    <Box
      sx={{
        position: 'fixed',
        right: 0,
        top: 0,
        bottom: 0,
        zIndex: 1200,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 0.5,
        pointerEvents: 'none',
      }}
    >
      {entries.map((entry, i) => {
        const Comp = entry.component;
        const isOpen = expandedIdx === i;
        return (
          <Box
            key={`msg-${i}`}
            onClick={() => setExpandedIdx(isOpen ? -1 : i)}
            sx={{
              pointerEvents: 'auto',
              width: 300,
              transform: isOpen ? 'translateX(0)' : 'translateX(calc(100% - 36px))',
              transition: 'transform 0.25s ease',
              cursor: 'pointer',
            }}
          >
            <Comp viewer={viewer} />
          </Box>
        );
      })}
    </Box>
  );
}
