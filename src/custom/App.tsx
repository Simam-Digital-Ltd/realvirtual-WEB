import { useEffect } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { useViewer } from '../hooks/use-viewer';

// Core HMI components
import { rvDarkTheme } from '../core/hmi/theme';
import { HMIShell } from '../core/hmi/HMIShell';
import { TopBar } from '../core/hmi/TopBar';
import { KpiBar } from '../core/hmi/KpiBar';
import { ButtonPanel } from '../core/hmi/ButtonPanel';
import { MessagePanel } from '../core/hmi/MessagePanel';
import { BottomBar } from '../core/hmi/BottomBar';
import { DriveTooltip } from '../core/hmi/DriveTooltip';
import { WelcomeModal } from '../core/hmi/WelcomeModal';
import { loadVisualSettings } from '../core/hmi/visual-settings-store';

// Custom chart overlay (rendered at App level, toggled by button)
import { DriveChartOverlay } from './DriveChartOverlay';

/** Apply persisted visual settings to the viewer on startup. */
function useApplyPersistedSettings() {
  const viewer = useViewer();
  useEffect(() => {
    const s = loadVisualSettings();
    viewer.shadowsEnabled = s.shadows;
    viewer.shadowStrength = s.shadowStrength;
    viewer.lightIntensity = s.lightIntensity;
  }, [viewer]);
}

export function App() {
  useApplyPersistedSettings();

  return (
    <ThemeProvider theme={rvDarkTheme}>
      <HMIShell>
        <KpiBar />
        <TopBar />
        <ButtonPanel />
        <MessagePanel />
        <BottomBar />
      </HMIShell>
      <DriveTooltip />
      <DriveChartOverlay />
      <WelcomeModal />
    </ThemeProvider>
  );
}
