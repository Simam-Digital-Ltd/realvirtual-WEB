// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { useEffect } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { useViewer } from '../hooks/use-viewer';

// Core HMI components
import { rvDarkTheme } from '../core/hmi/theme';
import { HMIShell, SlotRenderer } from '../core/hmi/HMIShell';
import { TopBar } from '../core/hmi/TopBar';
import { KpiBar } from '../core/hmi/KpiBar';
import { LogoBadge, ButtonPanel } from '../core/hmi/ButtonPanel';
import { MessagePanel } from '../core/hmi/MessagePanel';
import { BottomBar } from '../core/hmi/BottomBar';

import { loadVisualSettings } from '../core/hmi/visual-settings-store';
import { useHmiVisible } from '../core/hmi/hmi-visibility-store';
import { useUIVisible } from '../core/hmi/ui-context-store';

// Generic tooltip system (replaces former DriveTooltip)
import { TooltipLayer } from '../core/hmi/tooltip/TooltipLayer';
import { DriveTooltipController } from '../core/hmi/tooltip/DriveTooltipController';
// Import tooltip content providers to trigger self-registration in tooltipRegistry
import '../core/hmi/tooltip/DriveTooltipContent';
import '../core/hmi/tooltip/PipeTooltipContent';
import '../core/hmi/tooltip/TankTooltipContent';
import '../core/hmi/tooltip/PumpTooltipContent';
import '../core/hmi/tooltip/ProcessingUnitTooltipContent';
import { tooltipStore } from '../core/hmi/tooltip/tooltip-store';
import { PipelineTooltipController } from '../core/hmi/tooltip/PipelineTooltipController';
import { MetadataTooltipController } from '../core/hmi/tooltip/MetadataTooltipController';
// Import metadata tooltip content provider to trigger self-registration
import '../core/hmi/tooltip/MetadataTooltipContent';
// Import metadata field renderer to trigger self-registration
import '../core/hmi/rv-metadata-field-renderer';

// Context menu (plugin-extensible right-click / long-press menu)
import { ContextMenuLayer } from '../core/hmi/ContextMenuLayer';
import { SetPositionDialog } from '../core/hmi/SetPositionDialog';

// Annotation & Shared View overlays
import { AnnotationPanel } from '../core/hmi/AnnotationPanel';
import { SharedViewBanner } from '../core/hmi/SharedViewBanner';
import { AnnotationEditModal } from '../core/hmi/AnnotationEditModal';

// Demo chart overlays
import { DriveChartOverlay } from './DriveChartOverlay';

/** Apply persisted visual settings to the viewer on startup (batch — single recompile). */
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
  const hmiVisible = useHmiVisible();

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
        {hmiVisible && showViewsSlot && <SlotRenderer slot="views" />}
        <SharedViewBanner />
        {hmiVisible && <AnnotationPanel />}
        <AnnotationEditModal />
      </HMIShell>
      <DriveTooltipController />
      <PipelineTooltipController />
      <MetadataTooltipController />
      <DriveChartOverlay />
    </ThemeProvider>
  );
}
