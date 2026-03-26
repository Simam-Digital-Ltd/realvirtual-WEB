import { useEffect } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { useViewer } from '../hooks/use-viewer';

// Core HMI components
import { rvDarkTheme } from '../core/hmi/theme';
import { HMIShell, SlotRenderer } from '../core/hmi/HMIShell';
import { TopBar } from '../core/hmi/TopBar';
import { KpiBar } from '../core/hmi/KpiBar';
import { ButtonPanel } from '../core/hmi/ButtonPanel';
import { MessagePanel } from '../core/hmi/MessagePanel';
import { BottomBar } from '../core/hmi/BottomBar';

import { loadVisualSettings } from '../core/hmi/visual-settings-store';
import { useHmiVisible } from '../core/hmi/hmi-visibility-store';

// Generic tooltip system (replaces former DriveTooltip)
import { TooltipLayer } from '../core/hmi/tooltip/TooltipLayer';
import { DriveTooltipController } from '../core/hmi/tooltip/DriveTooltipController';
// Import DriveTooltipContent to trigger self-registration in tooltipRegistry
import '../core/hmi/tooltip/DriveTooltipContent';
import { tooltipStore } from '../core/hmi/tooltip/tooltip-store';

// Custom chart overlay (rendered at App level, toggled by button)
import { DriveChartOverlay } from './DriveChartOverlay';

/** Apply persisted visual settings to the viewer on startup. */
function useApplyPersistedSettings() {
  const viewer = useViewer();
  useEffect(() => {
    const s = loadVisualSettings();
    const ms = s.modeSettings[s.lightingMode];
    viewer.toneMapping = ms.toneMapping;
    viewer.toneMappingExposure = ms.toneMappingExposure;
    viewer.ambientColor = ms.ambientColor;
    viewer.ambientIntensity = ms.ambientIntensity;
    viewer.dirLightColor = ms.dirLightColor;
    viewer.dirLightIntensity = ms.dirLightIntensity;
    viewer.shadowIntensity = ms.shadowIntensity;
    viewer.shadowQuality = ms.shadowQuality;
    viewer.dirLightEnabled = ms.dirLightEnabled;
    viewer.shadowEnabled = ms.shadowEnabled;
    viewer.lightingMode = s.lightingMode;
    viewer.lightIntensity = ms.lightIntensity;
    viewer.fov = s.fov;
    viewer.projection = s.projection;
    // Apply individual rendering settings (antialias already set at construction)
    viewer.shadowMapSize = s.shadowMapSize ?? 1024;
    viewer.shadowRadius = s.shadowRadius ?? 2;
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

  return (
    <ThemeProvider theme={rvDarkTheme}>
      <HMIShell>
        <TooltipLayer />
        {hmiVisible && <KpiBar />}
        {hmiVisible && <TopBar />}
        {hmiVisible && <ButtonPanel />}
        {hmiVisible && <MessagePanel />}
        <BottomBar />
        {hmiVisible && <SlotRenderer slot="views" />}
      </HMIShell>
      <DriveTooltipController />
      <DriveChartOverlay />
    </ThemeProvider>
  );
}
