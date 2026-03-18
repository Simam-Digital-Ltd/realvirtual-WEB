import { useSyncExternalStore } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { Circle } from '@mui/icons-material';
import { useViewer } from '../../hooks/use-viewer';
import { useSlot } from '../../hooks/use-slot';
import { RvExtrasEditorPlugin, HIERARCHY_DEFAULT_WIDTH } from './rv-extras-editor';
import { useMobileLayout } from '../../hooks/use-mobile-layout';

import logoUrl from '/logo.png?url';

const EMPTY_SNAPSHOT = { panelOpen: false, panelWidth: HIERARCHY_DEFAULT_WIDTH, overlay: null, editableNodes: [], selectedNodePath: null, revealPath: null };
const NOOP_UNSUB = () => () => {};

/** Core layout for the left sidebar: logo + status header, slot-driven button group. */
export function ButtonPanel() {
  const viewer = useViewer();
  const entries = useSlot('button-group');

  // Check if hierarchy panel is open (and its width) to shift the button group right
  const plugin = viewer.getPlugin<RvExtrasEditorPlugin>('rv-extras-editor');
  const editorState = useSyncExternalStore(
    plugin?.subscribe ?? NOOP_UNSUB,
    plugin?.getSnapshot ?? (() => EMPTY_SNAPSHOT),
  );

  const isMobile = useMobileLayout();
  // Shift right for hierarchy panel + property inspector (320px + gap when a node is selected)
  const inspectorExtra = editorState.panelOpen && editorState.selectedNodePath ? 328 : 0;
  const buttonLeftOffset = editorState.panelOpen ? 8 + editorState.panelWidth + 8 + inspectorExtra : 8;

  return (
    <>
      {/* Logo + Status — always fixed at top-left */}
      <Paper
        elevation={4}
        sx={{
          position: 'fixed',
          left: 8,
          top: 8,
          zIndex: 1200,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.25,
          py: 0.5,
          borderRadius: 2,
          pointerEvents: 'auto',
        }}
      >
        <img src={logoUrl} alt="realvirtual" style={{ height: 18, width: 18 }} />
        {!isMobile && (
          <Typography sx={{ fontSize: 12, fontWeight: 500, letterSpacing: 0.5, color: 'text.primary' }}>
            realvirtual
          </Typography>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Circle sx={{ fontSize: 6, color: '#66bb6a' }} />
          {!isMobile && (
            <Typography sx={{ fontSize: 10, fontWeight: 500, color: 'rgba(102,187,106,0.85)', letterSpacing: 0.3 }}>
              online
            </Typography>
          )}
        </Box>
      </Paper>

      {/* Button group — vertical sidebar on desktop, horizontal bottom bar on mobile */}
      {entries.length > 0 && (
        <Box
          sx={isMobile ? {
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1200,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
            pb: 'env(safe-area-inset-bottom, 0px)',
          } : {
            position: 'fixed',
            left: buttonLeftOffset,
            top: 44,
            bottom: 8,
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            pointerEvents: 'none',
            transition: 'left 0.2s ease',
          }}
        >
          <Paper
            elevation={4}
            sx={{
              display: 'flex',
              flexDirection: isMobile ? 'row' : 'column',
              gap: 0.25,
              p: 0.5,
              borderRadius: isMobile ? '12px 12px 0 0' : 2,
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
    </>
  );
}
