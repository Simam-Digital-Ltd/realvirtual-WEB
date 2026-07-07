// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { useEffect } from 'react';
import { Box, Button } from '@mui/material';
import { Visibility } from '@mui/icons-material';
import { ThemeProvider } from '@mui/material/styles';
import { useViewer } from '../../hooks/use-viewer';

// Core HMI components
import { rvDarkTheme } from './theme';
import { HMIShell, SlotRenderer } from './HMIShell';
import { TopBar } from './TopBar';
import { KpiBar } from './KpiBar';
import { LogoBadge, ButtonPanel } from './ButtonPanel';
import { MessagePanel } from './MessagePanel';
import { BottomBar } from './BottomBar';

import { loadVisualSettings } from './visual-settings-store';
import { setHmiVisible, useHmiVisible } from './hmi-visibility-store';
import { useUIVisible } from './ui-context-store';

// Generic tooltip system (replaces former DriveTooltip)
import { TooltipLayer } from './tooltip/TooltipLayer';
import { DriveTooltipController } from './tooltip/DriveTooltipController';
// Import tooltip content providers to trigger self-registration in tooltipRegistry
import './tooltip/DriveTooltipContent';
import './tooltip/PipeTooltipContent';
import './tooltip/TankTooltipContent';
import './tooltip/PumpTooltipContent';
import './tooltip/ProcessingUnitTooltipContent';
import { tooltipStore } from './tooltip/tooltip-store';
import { PipelineTooltipController } from './tooltip/PipelineTooltipController';
import { MetadataTooltipController } from './tooltip/MetadataTooltipController';
// Import metadata tooltip content provider to trigger self-registration
import './tooltip/MetadataTooltipContent';
// Import metadata field renderer to trigger self-registration
import './rv-metadata-field-renderer';

// Context menu (plugin-extensible right-click / long-press menu)
import { ContextMenuLayer } from './ContextMenuLayer';
import { SetPositionDialog } from './SetPositionDialog';

// Annotation & Shared View overlays
import { AnnotationPanel } from './AnnotationPanel';
import { SharedViewBanner } from './SharedViewBanner';
import { AnnotationEditModal } from './AnnotationEditModal';
import { TrendOverlayChart } from './TrendOverlayChart';


/** Apply persisted visual settings to the viewer on startup (batch — single recompile). */

function HmiRestorePill() {
  return (
    <Box
      sx={{
        position: 'fixed',
        left: 16,
        top: 16,
        zIndex: 1400,
        pointerEvents: 'auto',
      }}
    >
      <Button
        size="small"
        variant="contained"
        startIcon={<Visibility sx={{ fontSize: 16 }} />}
        onClick={() => setHmiVisible(true)}
        sx={{
          height: 30,
          px: 1.25,
          borderRadius: 1.5,
          fontSize: 10,
          fontWeight: 900,
          color: '#071013',
          bgcolor: '#20a1b1',
          boxShadow: '0 10px 24px rgba(0,0,0,0.35)',
          '&:hover': { bgcolor: '#2db8ca' },
        }}
      >
        Show UI
      </Button>
    </Box>
  );
}

function useApplyPersistedSettings() {
  const viewer = useViewer();
  useEffect(() => {
    const s = loadVisualSettings();
    viewer.applyVisualSettings(s);
  }, [viewer]);
}

/** Connect tooltip store to viewer for model-cleared cleanup. */
function useTooltipStoreConnection() {
  const viewer = useViewer();
  useEffect(() => {
    tooltipStore.connectViewer(viewer);
  }, [viewer]);
}

export function App() {
  useApplyPersistedSettings();
  useTooltipStoreConnection();
  const hmiVisible = true;

  // Context-aware visibility: each area declares its default hiddenIn rule.
  // These defaults can be overridden by settings.json `ui.visibilityOverrides`.
  const showKpiBar = useUIVisible('kpi-bar', { hiddenIn: ['fpv', 'planner', 'xr'] });
  const showTopBar = useUIVisible('top-bar', { hiddenIn: ['xr'] });
  const showButtonPanel = useUIVisible('button-panel', { hiddenIn: ['fpv', 'planner', 'xr'] });
  const showMessagePanel = useUIVisible('message-panel', { hiddenIn: ['fpv', 'planner', 'xr'] });
  const showViewsSlot = useUIVisible('views-slot', { hiddenIn: ['fpv', 'planner', 'xr'] });

  return (
    <ThemeProvider theme={rvDarkTheme}>
      <HMIShell>
        <TooltipLayer />
        <ContextMenuLayer />
        <SetPositionDialog />
        {hmiVisible && showKpiBar && <KpiBar />}
        {hmiVisible && showTopBar && <TopBar />}
        {hmiVisible && <LogoBadge />}
        {hmiVisible && showButtonPanel && <ButtonPanel />}
        {hmiVisible && showMessagePanel && <MessagePanel />}
        <BottomBar />
        {!hmiVisible && <HmiRestorePill />}
        {hmiVisible && showViewsSlot && <SlotRenderer slot="views" />}
        <SharedViewBanner />
        {hmiVisible && <AnnotationPanel />}
        <AnnotationEditModal />
        {hmiVisible && <TrendOverlayChart />}
      </HMIShell>
      <DriveTooltipController />
      <PipelineTooltipController />
      <MetadataTooltipController />
    </ThemeProvider>
  );
}
