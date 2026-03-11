import { useEffect } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { rvDarkTheme } from './theme';
import { HMIShell } from './HMIShell';
import { TopBar } from './TopBar';
import { LeftSidebar } from './LeftSidebar';
import { RightPanel } from './RightPanel';
import { BottomBar } from './BottomBar';
import { DriveTooltip } from './DriveTooltip';
import { DriveChartOverlay } from './DriveChartOverlay';
import { useViewer } from '../hooks/use-viewer';
import { loadVisualSettings } from './visual-settings-store';

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
        <TopBar />
        <LeftSidebar />
        <RightPanel />
        <BottomBar />
      </HMIShell>
      <DriveTooltip />
      <DriveChartOverlay />
    </ThemeProvider>
  );
}
