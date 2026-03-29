import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { useEditorPlugin } from '../../hooks/use-editor-plugin';
import { Typography, Box, IconButton, Paper, Button, CircularProgress, Tabs, Tab, Switch, Slider, Tooltip, Select, MenuItem, TextField } from '@mui/material';
import { Settings, Close, PlayArrow, CheckCircle, Error as ErrorIcon, RestartAlt, AccountTree, ViewInAr, People } from '@mui/icons-material';
import { useMobileLayout } from '../../hooks/use-mobile-layout';
import { useViewer } from '../../hooks/use-viewer';
import type { WebXRPluginAPI } from '../types/plugin-types';
import { loadVisualSettings, saveVisualSettings, LIGHTING_MODES, TONE_MAPPING_OPTIONS, SHADOW_QUALITY_OPTIONS, type VisualSettings, type LightingMode, type ToneMappingType, type ShadowQuality, type ProjectionType } from './visual-settings-store';
import { loadPhysicsSettings, savePhysicsSettings, type PhysicsSettings } from './physics-settings-store';
import { loadInterfaceSettings, saveInterfaceSettings, type InterfaceSettings, type InterfaceType, INTERFACE_DEFAULTS } from '../../interfaces/interface-settings-store';
import { InterfaceManager } from '../../interfaces/interface-manager';
import { ALL_RV_STORAGE_KEYS } from './rv-storage-keys';
import { isSettingsLocked, isTabLocked } from './rv-app-config';
import { HierarchyBrowser } from './rv-hierarchy-browser';
import { PropertyInspector } from './rv-property-inspector';
import { LeftPanel } from './LeftPanel';
import { SETTINGS_PANEL_WIDTH } from './layout-constants';
import { MachineControlPanel } from './MachineControlPanel';
import { MultiuserPanel } from './MultiuserPanel';
import { SlotRenderer } from './HMIShell';
import { useMcpBridge } from '../../hooks/use-mcp-bridge';
import { useMultiuser } from '../../hooks/use-multiuser';
import { loadMultiuserSettings, saveMultiuserSettings, type MultiuserSettings } from './multiuser-settings-store';
import type { McpBridgePluginAPI, MultiuserPluginAPI } from '../types/plugin-types';

export function TopBar() {
  const viewer = useViewer();
  const [settingsTab, setSettingsTab] = useState(0);
  const [vrOpen, setVrOpen] = useState(false);
  const [muOpen, setMuOpen] = useState(false);

  // Hierarchy panel state from plugin
  const { plugin, state: pluginState } = useEditorPlugin();
  const hierarchyOpen = pluginState.panelOpen;
  const settingsOpen = pluginState.settingsOpen;

  const lpm = viewer.leftPanelManager;

  const setSettingsOpen = useCallback((open: boolean) => {
    plugin?.setSettingsOpen(open);
    // Sync with leftPanelManager so MachineControlPanel knows to close
    if (open) {
      lpm.open('settings', SETTINGS_PANEL_WIDTH);
    } else if (lpm.isOpen('settings')) {
      lpm.close('settings');
    }
  }, [plugin, lpm]);

  const toggleHierarchy = useCallback(() => {
    if (!plugin) return;
    plugin.togglePanel();
    setSettingsOpen(false);
    setVrOpen(false);
    // Sync with leftPanelManager
    if (!plugin.panelOpen) {
      // Was closed, now opening (togglePanel already flipped)
      lpm.open('hierarchy', pluginState.panelWidth);
    } else {
      lpm.close('hierarchy');
    }
  }, [plugin, setSettingsOpen, lpm, pluginState.panelWidth]);

  // Listen to leftPanelManager changes — if another panel opens, close settings/hierarchy
  const panelSnapshot = useSyncExternalStore(lpm.subscribe, lpm.getSnapshot);
  useEffect(() => {
    if (panelSnapshot.activePanel && panelSnapshot.activePanel !== 'settings' && panelSnapshot.activePanel !== 'hierarchy') {
      // Another panel opened (e.g. machine-control) — close our panels
      if (settingsOpen) plugin?.setSettingsOpen(false);
      if (hierarchyOpen) plugin?.togglePanel();
    }
  }, [panelSnapshot.activePanel]); // eslint-disable-line react-hooks/exhaustive-deps

  const isMobile = useMobileLayout();

  // WebXR plugin for AR button on mobile
  const xrPlugin = viewer.getPlugin<WebXRPluginAPI>('webxr');
  const showMobileAR = isMobile && xrPlugin?.arSupported;

  // Multiuser plugin — only show button when enabled in settings
  const muPlugin = viewer.getPlugin<MultiuserPluginAPI>('multiuser');
  const muState = useMultiuser();
  const [muEnabled, setMuEnabled] = useState(() => loadMultiuserSettings().enabled);
  const showMultiuser = !!muPlugin && muEnabled;

  return (
    <>
      {/* Hierarchy + VR + Settings buttons — fixed top-right */}
      <Paper elevation={4} data-ui-panel sx={{ position: 'fixed', top: 8, right: 8, borderRadius: 2, pointerEvents: 'auto', zIndex: 9001, display: 'flex', gap: isMobile ? 0.5 : 0.25, px: isMobile ? 0.5 : 0.25 }}>
        {plugin && !isMobile && (
          <Tooltip title={hierarchyOpen ? 'Close Hierarchy' : 'Hierarchy'} placement="bottom">
            <IconButton
              size="small"
              color={hierarchyOpen ? 'primary' : 'inherit'}
              sx={{ p: 0.75 }}
              onClick={toggleHierarchy}
            >
              {hierarchyOpen ? <Close fontSize="small" /> : <AccountTree fontSize="small" />}
            </IconButton>
          </Tooltip>
        )}
        <SlotRenderer slot="toolbar-button" />
        {showMultiuser && !isMobile && (
          <Tooltip title={muOpen ? 'Close Multiuser' : 'Multiuser'} placement="bottom">
            <IconButton
              size="small"
              color={muOpen ? 'primary' : 'inherit'}
              sx={{ p: 0.75, position: 'relative' }}
              onClick={() => { setMuOpen(!muOpen); setVrOpen(false); setSettingsOpen(false); if (hierarchyOpen) plugin?.togglePanel(); }}
            >
              {muOpen ? <Close fontSize="small" /> : <People fontSize="small" />}
              {muState.connected && !muOpen && (
                <Box sx={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: '50%', bgcolor: '#66bb6a' }} />
              )}
            </IconButton>
          </Tooltip>
        )}
        {!isMobile && (
          <Tooltip title={vrOpen ? 'Close VR/AR' : 'VR / AR'} placement="bottom">
            <IconButton
              size="small"
              color={vrOpen ? 'primary' : 'inherit'}
              sx={{ p: 0.75 }}
              onClick={() => { setVrOpen(!vrOpen); setMuOpen(false); setSettingsOpen(false); if (hierarchyOpen) plugin?.togglePanel(); }}
            >
              {vrOpen ? <Close fontSize="small" /> : <Typography sx={{ fontSize: 11, fontWeight: 700, px: 0.25 }}>VR</Typography>}
            </IconButton>
          </Tooltip>
        )}
        {showMobileAR && (
          <Tooltip title="Start AR" placement="bottom">
            <IconButton
              sx={{ p: 1, color: '#81c784' }}
              onClick={() => xrPlugin?.startAR()}
            >
              <ViewInAr />
            </IconButton>
          </Tooltip>
        )}
        {!isSettingsLocked() && (
          <Tooltip title={settingsOpen ? 'Close Settings' : 'Settings'} placement="bottom">
            <IconButton
              size={isMobile ? 'medium' : 'small'}
              color={settingsOpen ? 'primary' : 'inherit'}
              sx={{ p: isMobile ? 1 : 0.75 }}
              onClick={() => { setSettingsOpen(!settingsOpen); setVrOpen(false); setMuOpen(false); if (hierarchyOpen) plugin?.togglePanel(); }}
            >
              {settingsOpen ? <Close fontSize={isMobile ? 'medium' : 'small'} /> : <Settings fontSize={isMobile ? 'medium' : 'small'} />}
            </IconButton>
          </Tooltip>
        )}
      </Paper>

      {/* Hierarchy browser panel (disabled on mobile, hidden when settings open) */}
      {!isMobile && hierarchyOpen && !settingsOpen && <HierarchyBrowser viewer={viewer} />}

      {/* Property inspector (disabled on mobile, hidden when settings open) */}
      {!isMobile && hierarchyOpen && !settingsOpen && pluginState.showInspector && pluginState.selectedNodePath && <PropertyInspector viewer={viewer} />}

      {/* Machine Control Panel */}
      <MachineControlPanel />

      {/* Slot-based overlay panels (Layout Planner, etc.) */}
      <SlotRenderer slot="overlay" />

      {/* Multiuser popup */}
      {muOpen && <MultiuserPanel onClose={() => setMuOpen(false)} />}

      {/* VR/AR modal */}
      {vrOpen && <VRModal onClose={() => setVrOpen(false)} />}

      {/* Settings side panel */}
      {settingsOpen && (
        <LeftPanel
          title={<Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>Settings</Typography>}
          onClose={() => setSettingsOpen(false)}
          width={SETTINGS_PANEL_WIDTH}
          headerSx={{ px: 1.5, py: 0.75 }}
        >
          {/* Tabs - scrollable for 360px width */}
          <Tabs
            value={settingsTab}
            onChange={(_, v) => setSettingsTab(v)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              minHeight: 40,
              flexShrink: 0,
              '& .MuiTab-root': { minHeight: 40, py: 1, textTransform: 'none', fontSize: 13, minWidth: 0, px: { xs: 1.5, sm: 2 } },
            }}
          >
            {!isTabLocked('model') && <Tab label="Model" value={0} />}
            {!isTabLocked('visual') && <Tab label="Visual" value={1} />}
            {!isTabLocked('physics') && <Tab label="Physics" value={2} />}
            {!isTabLocked('interfaces') && <Tab label="Interfaces" value={3} />}
            {!isTabLocked('multiuser') && muPlugin && <Tab label="Multiuser" value={4} />}
            {!isTabLocked('mcp') && viewer.getPlugin('mcp-bridge') && <Tab label="AI" value={5} />}
            {!isTabLocked('devtools') && <Tab label="Dev Tools" value={6} />}
            {!isTabLocked('tests') && <Tab label="Tests" value={7} />}
          </Tabs>

          {/* Tab content - minHeight: 0 for correct flexbox scrolling */}
          <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0, px: { xs: 1.5, sm: 2 }, py: 1.5 }}>
            {settingsTab === 0 && !isTabLocked('model') && <ModelTab />}
            {settingsTab === 1 && !isTabLocked('visual') && <VisualTab />}
            {settingsTab === 2 && !isTabLocked('physics') && <PhysicsTab />}
            {settingsTab === 3 && !isTabLocked('interfaces') && <InterfacesTab />}
            {settingsTab === 4 && !isTabLocked('multiuser') && muPlugin && <MultiuserTab muEnabled={muEnabled} onMuEnabledChange={setMuEnabled} />}
            {settingsTab === 5 && !isTabLocked('mcp') && viewer.getPlugin('mcp-bridge') && <McpTab />}
            {settingsTab === 6 && !isTabLocked('devtools') && <DevToolsTab />}
            {settingsTab === 7 && !isTabLocked('tests') && <TestsTab />}
          </Box>
        </LeftPanel>
      )}
    </>
  );
}

/* ─── VR/AR Modal ─── */

function VRModal({ onClose }: { onClose: () => void }) {
  const vrUrl = window.location.origin + window.location.pathname;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&bgcolor=121212&color=ffffff&data=${encodeURIComponent(vrUrl)}`;

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'rgba(0,0,0,0.5)',
        pointerEvents: 'auto',
      }}
      onClick={onClose}
    >
      <Paper
        elevation={12}
        sx={{ borderRadius: 2, width: 420, maxWidth: '95vw', p: { xs: 2.5, sm: 4 }, display: 'flex', flexDirection: 'column', gap: 2.5, alignItems: 'center', maxHeight: '90dvh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <Typography variant="h6" sx={{ fontWeight: 700, color: '#4fc3f7' }}>
          VR / AR
        </Typography>

        <Box
          component="img"
          src={qrUrl}
          alt="QR Code"
          sx={{ width: 200, height: 200, borderRadius: 1, border: '1px solid rgba(255,255,255,0.1)' }}
        />

        <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', lineHeight: 1.7 }}>
          Scan this QR code with your phone or enter the URL in your <strong style={{ color: '#fff' }}>Meta Quest</strong> browser.
        </Typography>

        <Box
          sx={{
            width: '100%',
            bgcolor: 'rgba(0,0,0,0.3)',
            borderRadius: 1,
            p: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            cursor: 'pointer',
            '&:hover': { bgcolor: 'rgba(79,195,247,0.1)' },
          }}
          onClick={() => navigator.clipboard.writeText(vrUrl)}
          title="Click to copy URL"
        >
          <Typography
            variant="body2"
            sx={{
              color: '#4fc3f7',
              fontFamily: 'monospace',
              fontSize: '0.85rem',
              flex: 1,
              textAlign: 'center',
              wordBreak: 'break-all',
              userSelect: 'all',
            }}
          >
            {vrUrl}
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>
            COPY
          </Typography>
        </Box>

        <Box sx={{ width: '100%', borderTop: '1px solid rgba(255,255,255,0.08)', pt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
            How to start
          </Typography>
          <StepRow n={1} text="Put on your headset and open the browser" />
          <StepRow n={2} text="Enter the URL above or scan the QR code with your phone" />
          <StepRow n={3} text="Wait for the scene to load, then tap 'Enter VR'" />
        </Box>

        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>
          WebXR requires WebGL renderer. WebGPU does not support VR/AR sessions.
        </Typography>
      </Paper>
    </Box>
  );
}

function StepRow({ n, text }: { n: number; text: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Box sx={{
        width: 22, height: 22, borderRadius: '50%', bgcolor: 'rgba(79,195,247,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Typography variant="caption" sx={{ color: '#4fc3f7', fontWeight: 700, fontSize: 11 }}>{n}</Typography>
      </Box>
      <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 13 }}>{text}</Typography>
    </Box>
  );
}

/* ─── Tab: Model ─── */

function ModelTab() {
  const viewer = useViewer();
  const models = viewer.availableModels;
  const currentUrl = viewer.currentModelUrl;
  const currentRenderer = viewer.isWebGPU ? 'webgpu' : 'webgl';
  // Clamp to known options so MUI Select doesn't warn about out-of-range values (e.g. blob: URLs)
  const modelValue = models.some((m) => m.url === currentUrl) ? currentUrl! : '';

  const handleRendererChange = (value: string) => {
    localStorage.setItem('rv-webviewer-renderer', value);
    window.location.reload();
  };

  const handleModelChange = (url: string) => {
    if (url) viewer.loadModel(url);
  };

  const handleResetAll = () => {
    ALL_RV_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    window.location.reload();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
          Renderer
        </Typography>
        <Select
          size="small"
          fullWidth
          value={currentRenderer}
          onChange={(e) => handleRendererChange(e.target.value as string)}
          sx={{ mt: 0.5, fontSize: 13, '& .MuiSelect-select': { py: 0.75 } }}
        >
          <MenuItem value="webgl" sx={{ fontSize: 13 }}>WebGL</MenuItem>
          <MenuItem value="webgpu" disabled={!navigator.gpu} sx={{ fontSize: 13 }}>
            WebGPU (experimental)
            {!navigator.gpu && (
              <Typography component="span" sx={{ ml: 1, fontSize: 10, color: 'text.disabled' }}>not available</Typography>
            )}
          </MenuItem>
        </Select>
      </Box>
      <Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
          Model
        </Typography>
        <Select
          size="small"
          fullWidth
          value={modelValue}
          onChange={(e) => handleModelChange(e.target.value as string)}
          displayEmpty
          sx={{ mt: 0.5, fontSize: 13, '& .MuiSelect-select': { py: 0.75 } }}
        >
          <MenuItem value="" sx={{ fontSize: 13, color: 'text.secondary' }}>-- Select Model --</MenuItem>
          {models.map((m) => (
            <MenuItem key={m.url} value={m.url} sx={{ fontSize: 13 }}>{m.label}</MenuItem>
          ))}
        </Select>
      </Box>

      {/* Reset all settings (hidden when locked) */}
      {!isSettingsLocked() && (
        <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.08)', pt: 2 }}>
          <Button
            variant="outlined"
            size="small"
            color="warning"
            startIcon={<RestartAlt sx={{ fontSize: 14 }} />}
            onClick={handleResetAll}
            sx={{ fontSize: 11, textTransform: 'none' }}
          >
            Reset All Settings to Defaults
          </Button>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, fontSize: 10 }}>
            Clears all saved browser settings and reloads the page.
          </Typography>
        </Box>
      )}
    </Box>
  );
}

/* ─── Tab: Visual ─── */

function VisualTab() {
  const viewer = useViewer();
  const settingsRef = useRef(loadVisualSettings());
  const initMs = settingsRef.current.modeSettings[settingsRef.current.lightingMode];
  const [mode, setMode] = useState<LightingMode>(settingsRef.current.lightingMode);
  const [lightInt, setLightInt] = useState(initMs.lightIntensity);
  const [toneMap, setToneMap] = useState<ToneMappingType>(initMs.toneMapping);
  const [exposure, setExposure] = useState(initMs.toneMappingExposure);
  const [ambColor, setAmbColor] = useState(initMs.ambientColor);
  const [ambInt, setAmbInt] = useState(initMs.ambientIntensity);
  const [dirEnabled, setDirEnabled] = useState(initMs.dirLightEnabled);
  const [dirColor, setDirColor] = useState(initMs.dirLightColor);
  const [dirInt, setDirInt] = useState(initMs.dirLightIntensity);
  const [shadowOn, setShadowOn] = useState(initMs.shadowEnabled);
  const [shadowInt, setShadowInt] = useState(initMs.shadowIntensity);
  const [shadowQual, setShadowQual] = useState<ShadowQuality>(initMs.shadowQuality);

  const [proj, setProj] = useState<ProjectionType>(settingsRef.current.projection);
  const [fov, setFov] = useState(settingsRef.current.fov);
  const [antialiasDesired, setAntialiasDesired] = useState<boolean>(settingsRef.current.antialias);
  const [shadowMapSize, setShadowMapSize] = useState<number>(settingsRef.current.shadowMapSize);
  const [shadowRadiusVal, setShadowRadiusVal] = useState<number>(settingsRef.current.shadowRadius);
  const [maxDpr, setMaxDpr] = useState<number>(settingsRef.current.maxDpr);

  const persist = (patch: Partial<VisualSettings>) => {
    Object.assign(settingsRef.current, patch);
    saveVisualSettings(settingsRef.current);
  };
  const persistMode = () => persist({ modeSettings: { ...settingsRef.current.modeSettings } });

  const updateMode = (newMode: LightingMode) => {
    // Save current values into old mode
    const old = settingsRef.current.modeSettings[mode];
    old.lightIntensity = lightInt; old.toneMapping = toneMap; old.toneMappingExposure = exposure;
    old.ambientColor = ambColor; old.ambientIntensity = ambInt;
    old.dirLightEnabled = dirEnabled; old.dirLightColor = dirColor; old.dirLightIntensity = dirInt;
    old.shadowEnabled = shadowOn; old.shadowIntensity = shadowInt; old.shadowQuality = shadowQual;
    // Switch mode — apply settings before lightingMode to avoid applyLightingMode resetting them
    setMode(newMode);
    const ms = settingsRef.current.modeSettings[newMode];
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
    viewer.lightingMode = newMode;
    viewer.lightIntensity = ms.lightIntensity;
    setLightInt(ms.lightIntensity); setToneMap(ms.toneMapping); setExposure(ms.toneMappingExposure);
    setAmbColor(ms.ambientColor); setAmbInt(ms.ambientIntensity);
    setDirEnabled(ms.dirLightEnabled); setDirColor(ms.dirLightColor); setDirInt(ms.dirLightIntensity);
    setShadowOn(ms.shadowEnabled); setShadowInt(ms.shadowIntensity); setShadowQual(ms.shadowQuality);
    persist({ lightingMode: newMode });
  };

  const updateLightInt = (_: unknown, v: number | number[]) => {
    const val = v as number; viewer.lightIntensity = val; setLightInt(val);
    settingsRef.current.modeSettings[mode].lightIntensity = val; persistMode();
  };
  const updateToneMap = (v: ToneMappingType) => {
    viewer.toneMapping = v; setToneMap(v);
    settingsRef.current.modeSettings[mode].toneMapping = v; persistMode();
  };
  const updateExposure = (_: unknown, v: number | number[]) => {
    const val = v as number; viewer.toneMappingExposure = val; setExposure(val);
    settingsRef.current.modeSettings[mode].toneMappingExposure = val; persistMode();
  };
  const updateAmbColor = (hex: string) => {
    viewer.ambientColor = hex; setAmbColor(hex);
    settingsRef.current.modeSettings[mode].ambientColor = hex; persistMode();
  };
  const updateAmbInt = (_: unknown, v: number | number[]) => {
    const val = v as number; viewer.ambientIntensity = val; setAmbInt(val);
    settingsRef.current.modeSettings[mode].ambientIntensity = val; persistMode();
  };
  const updateDirEnabled = (_: unknown, v: boolean) => {
    viewer.dirLightEnabled = v; setDirEnabled(v);
    if (!v) { viewer.shadowEnabled = false; setShadowOn(false); settingsRef.current.modeSettings[mode].shadowEnabled = false; }
    settingsRef.current.modeSettings[mode].dirLightEnabled = v; persistMode();
  };
  const updateDirColor = (hex: string) => {
    viewer.dirLightColor = hex; setDirColor(hex);
    settingsRef.current.modeSettings[mode].dirLightColor = hex; persistMode();
  };
  const updateDirInt = (_: unknown, v: number | number[]) => {
    const val = v as number; viewer.dirLightIntensity = val; setDirInt(val);
    settingsRef.current.modeSettings[mode].dirLightIntensity = val; persistMode();
  };
  const updateShadowOn = (_: unknown, v: boolean) => {
    viewer.shadowEnabled = v; setShadowOn(v);
    settingsRef.current.modeSettings[mode].shadowEnabled = v; persistMode();
  };
  const updateShadowInt = (_: unknown, v: number | number[]) => {
    const val = v as number; viewer.shadowIntensity = val; setShadowInt(val);
    settingsRef.current.modeSettings[mode].shadowIntensity = val; persistMode();
  };
  const updateShadowQual = (v: ShadowQuality) => {
    viewer.shadowQuality = v; setShadowQual(v);
    settingsRef.current.modeSettings[mode].shadowQuality = v; persistMode();
  };
  const updateAntialiasDesired = (_: unknown, v: boolean) => {
    setAntialiasDesired(v);
    persist({ antialias: v });
  };
  const updateShadowMapSize = (v: number) => {
    setShadowMapSize(v);
    viewer.shadowMapSize = v;
    persist({ shadowMapSize: v });
  };
  const updateShadowRadius = (_: unknown, v: number | number[]) => {
    const val = v as number;
    setShadowRadiusVal(val);
    viewer.shadowRadius = val;
    persist({ shadowRadius: val });
  };
  const updateMaxDpr = (_: unknown, v: number | number[]) => {
    const val = v as number;
    setMaxDpr(val);
    viewer.maxDpr = val;
    persist({ maxDpr: val });
  };

  const updateProj = (v: ProjectionType) => {
    viewer.projection = v; setProj(v); persist({ projection: v });
  };
  const updateFov = (_: unknown, v: number | number[]) => {
    const val = v as number; viewer.fov = val; setFov(val); persist({ fov: val });
  };


  const antialiasMismatch = antialiasDesired !== viewer.antialiasActive;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Antialiasing */}
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="body2" sx={{ color: 'text.primary' }}>Antialiasing (MSAA)</Typography>
          <Switch size="small" checked={antialiasDesired} onChange={updateAntialiasDesired} />
        </Box>
        {antialiasMismatch && (
          <Box sx={{ mt: 0.5 }}>
            <Typography variant="caption" sx={{ color: '#ffb74d', display: 'block', mb: 0.5, fontSize: 11 }}>
              Antialiasing change requires page reload
            </Typography>
            <Button
              size="small"
              variant="outlined"
              onClick={() => window.location.reload()}
              startIcon={<RestartAlt />}
              sx={{ fontSize: 11, textTransform: 'none', borderColor: '#ffb74d', color: '#ffb74d' }}
            >
              Reload now
            </Button>
          </Box>
        )}
      </Box>

      {/* Shadow Map Size */}
      <Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
          Shadow Map Size
        </Typography>
        <Select
          size="small"
          fullWidth
          value={shadowMapSize}
          onChange={(e) => updateShadowMapSize(Number(e.target.value))}
          sx={{ mt: 0.5 }}
        >
          {[512, 1024, 2048].map((s) => (
            <MenuItem key={s} value={s}>{s}</MenuItem>
          ))}
        </Select>
      </Box>

      {/* Shadow Radius */}
      <Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
          Shadow Radius
        </Typography>
        <Slider size="small" min={1} max={5} step={1} value={shadowRadiusVal} onChange={updateShadowRadius} valueLabelDisplay="auto" sx={{ mt: 1 }} />
      </Box>

      {/* Render Resolution (DPR) */}
      <Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
          Render Resolution
        </Typography>
        <Slider size="small" min={0.5} max={2} step={0.25} value={maxDpr} onChange={updateMaxDpr}
          valueLabelDisplay="auto" valueLabelFormat={(v) => v >= 2 ? 'Native' : `${v}x`}
          marks={[{ value: 0.5, label: '0.5x' }, { value: 1, label: '1x' }, { value: 1.5, label: '1.5x' }, { value: 2, label: 'Native' }]}
          sx={{ mt: 1 }} />
      </Box>

      {/* Lighting Mode */}
      <Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
          Lighting Mode
        </Typography>
        <Select
          size="small"
          fullWidth
          value={mode}
          onChange={(e) => updateMode(e.target.value as LightingMode)}
          sx={{ mt: 0.5 }}
        >
          {LIGHTING_MODES.map((m) => (
            <MenuItem key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</MenuItem>
          ))}
        </Select>
      </Box>

      {/* Ambient Light */}
      <Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
          Ambient Light
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5 }}>
          <Slider size="small" min={0} max={2} step={0.05} value={ambInt} onChange={updateAmbInt} sx={{ flex: 1 }} />
          <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace', minWidth: 32, textAlign: 'right' }}>
            {ambInt.toFixed(2)}
          </Typography>
          <input
            type="color"
            value={ambColor}
            onChange={(e) => updateAmbColor(e.target.value)}
            style={{ width: 28, height: 28, border: 'none', borderRadius: 4, padding: 0, cursor: 'pointer', background: 'none' }}
          />
        </Box>
      </Box>

      {/* Global Lighting */}
      <Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
          {mode === 'default' ? 'Environment Intensity' : 'Global Lighting'}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5 }}>
          <Slider size="small" min={0} max={2} step={0.05} value={lightInt} onChange={updateLightInt} sx={{ flex: 1 }} />
          <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace', minWidth: 32, textAlign: 'right' }}>
            {lightInt.toFixed(2)}
          </Typography>
        </Box>
      </Box>

      {/* Tone Mapping (default mode only) */}
      {mode === 'default' && (
        <>
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
              Tone Mapping
            </Typography>
            <Select
              size="small"
              fullWidth
              value={toneMap}
              onChange={(e) => updateToneMap(e.target.value as ToneMappingType)}
              sx={{ mt: 0.5 }}
            >
              {TONE_MAPPING_OPTIONS.map((t) => (
                <MenuItem key={t} value={t}>{t === 'aces' ? 'ACES Filmic' : t === 'agx' ? 'AgX' : t.charAt(0).toUpperCase() + t.slice(1)}</MenuItem>
              ))}
            </Select>
          </Box>

          {toneMap !== 'none' && (
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
                Exposure
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5 }}>
                <Slider size="small" min={0} max={3} step={0.05} value={exposure} onChange={updateExposure} sx={{ flex: 1 }} />
                <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace', minWidth: 32, textAlign: 'right' }}>
                  {exposure.toFixed(2)}
                </Typography>
              </Box>
            </Box>
          )}
        </>
      )}

      {/* Directional Light (default mode only) */}
      {mode === 'default' && (
        <>
          <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.08)', pt: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" sx={{ color: 'text.primary' }}>Directional Light</Typography>
              <Switch size="small" checked={dirEnabled} onChange={updateDirEnabled} />
            </Box>
          </Box>

          {dirEnabled && (
            <>
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
                  Light Intensity
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5 }}>
                  <Slider size="small" min={0} max={3} step={0.05} value={dirInt} onChange={updateDirInt} sx={{ flex: 1 }} />
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace', minWidth: 32, textAlign: 'right' }}>
                    {dirInt.toFixed(2)}
                  </Typography>
                  <input
                    type="color"
                    value={dirColor}
                    onChange={(e) => updateDirColor(e.target.value)}
                    style={{ width: 28, height: 28, border: 'none', borderRadius: 4, padding: 0, cursor: 'pointer', background: 'none' }}
                  />
                </Box>
              </Box>

              {/* Shadows */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" sx={{ color: 'text.primary' }}>Shadows</Typography>
                <Switch size="small" checked={shadowOn} onChange={updateShadowOn} />
              </Box>

              {shadowOn && (
                <>
                  <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
                      Shadow Intensity
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5 }}>
                      <Slider size="small" min={0} max={3} step={0.05} value={shadowInt} onChange={updateShadowInt} sx={{ flex: 1 }} />
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace', minWidth: 32, textAlign: 'right' }}>
                        {shadowInt.toFixed(2)}
                      </Typography>
                    </Box>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
                      Shadow Quality
                    </Typography>
                    <Select
                      size="small"
                      fullWidth
                      value={shadowQual}
                      onChange={(e) => updateShadowQual(e.target.value as ShadowQuality)}
                      sx={{ mt: 0.5 }}
                    >
                      {SHADOW_QUALITY_OPTIONS.map((q) => (
                        <MenuItem key={q} value={q}>{q.charAt(0).toUpperCase() + q.slice(1)}</MenuItem>
                      ))}
                    </Select>
                  </Box>
                </>
              )}
            </>
          )}
        </>
      )}

      {/* Camera Projection & FOV */}
      <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.08)', pt: 2 }}>
        <Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
            Projection
          </Typography>
          <Select
            size="small"
            fullWidth
            value={proj}
            onChange={(e) => updateProj(e.target.value as ProjectionType)}
            sx={{ mt: 0.5 }}
          >
            <MenuItem value="perspective">Perspective</MenuItem>
            <MenuItem value="orthographic">Orthographic</MenuItem>
          </Select>
        </Box>

        {proj === 'perspective' && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
              Field of View
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5 }}>
              <Slider size="small" min={10} max={120} step={1} value={fov} onChange={updateFov} sx={{ flex: 1 }} />
              <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace', minWidth: 32, textAlign: 'right' }}>
                {fov}°
              </Typography>
            </Box>
          </Box>
        )}
      </Box>

    </Box>
  );
}

/* ─── Tab: Physics ─── */

function PhysicsTab() {
  const viewer = useViewer();
  const settingsRef = useRef(loadPhysicsSettings());
  const [enabled, setEnabled] = useState(settingsRef.current.enabled);
  const [gravity, setGravity] = useState(settingsRef.current.gravity);
  const [friction, setFriction] = useState(settingsRef.current.friction);
  const [debugVis, setDebugVis] = useState(settingsRef.current.debugWireframes);
  const [substeps, setSubsteps] = useState(settingsRef.current.substeps);
  const [reloading, setReloading] = useState(false);

  const persist = (patch: Partial<PhysicsSettings>) => {
    Object.assign(settingsRef.current, patch);
    savePhysicsSettings(settingsRef.current);
  };

  /** Save settings and reload model to apply physics changes. */
  const persistAndReload = (patch: Partial<PhysicsSettings>) => {
    persist(patch);
    if (!viewer.currentModelUrl) return;
    setReloading(true);
    viewer.reloadModel().then(() => setReloading(false)).catch(() => setReloading(false));
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Physics on/off */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="body2" sx={{ color: 'text.primary' }}>Rapier.js Physics</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
            Replaces kinematic transport with rigid-body physics
          </Typography>
        </Box>
        <Switch size="small" checked={enabled} disabled={reloading} onChange={(_, v) => { setEnabled(v); persistAndReload({ enabled: v }); }} />
      </Box>

      {/* Gravity */}
      <Box sx={{ opacity: enabled ? 1 : 0.4, pointerEvents: enabled ? 'auto' : 'none' }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
          Gravity (m/s²)
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5 }}>
          <Slider size="small" min={0} max={20} step={0.1} value={gravity} onChange={(_, v) => { const val = v as number; setGravity(val); persist({ gravity: val }); }} onChangeCommitted={(_, v) => { persistAndReload({ gravity: v as number }); }} sx={{ flex: 1 }} />
          <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace', minWidth: 40, textAlign: 'right' }}>
            {gravity.toFixed(1)}
          </Typography>
        </Box>
      </Box>

      {/* Friction */}
      <Box sx={{ opacity: enabled ? 1 : 0.4, pointerEvents: enabled ? 'auto' : 'none' }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
          Surface Friction
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5 }}>
          <Slider size="small" min={0} max={3} step={0.1} value={friction} onChange={(_, v) => { const val = v as number; setFriction(val); persist({ friction: val }); }} onChangeCommitted={(_, v) => { persistAndReload({ friction: v as number }); }} sx={{ flex: 1 }} />
          <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace', minWidth: 32, textAlign: 'right' }}>
            {friction.toFixed(1)}
          </Typography>
        </Box>
      </Box>

      {/* Substeps */}
      <Box sx={{ opacity: enabled ? 1 : 0.4, pointerEvents: enabled ? 'auto' : 'none' }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
          Substeps
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5 }}>
          <Slider size="small" min={1} max={4} step={1} marks value={substeps} onChange={(_, v) => { const val = v as number; setSubsteps(val); persist({ substeps: val }); }} onChangeCommitted={(_, v) => { persistAndReload({ substeps: v as number }); }} sx={{ flex: 1 }} />
          <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace', minWidth: 16, textAlign: 'right' }}>
            {substeps}
          </Typography>
        </Box>
      </Box>

      {/* Debug visualization */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: enabled ? 1 : 0.4, pointerEvents: enabled ? 'auto' : 'none' }}>
        <Box>
          <Typography variant="body2" sx={{ color: 'text.primary' }}>Debug Wireframes</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
            Show collider shapes as wireframes
          </Typography>
        </Box>
        <Switch size="small" checked={debugVis} disabled={reloading} onChange={(_, v) => { setDebugVis(v); persistAndReload({ debugWireframes: v }); }} />
      </Box>

      {/* Status */}
      <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.08)', pt: 1.5 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
          Status
        </Typography>
        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <StatRow label="Engine" value={enabled ? 'Rapier.js (WASM)' : 'Kinematic'} color={enabled ? '#66bb6a' : '#4fc3f7'} />
          <StatRow label="MU Bodies" value="—" />
          <StatRow label="Conveyors" value="—" />
        </Box>
      </Box>

      {reloading && (
        <Typography variant="caption" sx={{ color: '#ffa726', fontStyle: 'italic' }}>
          Reloading model to apply physics settings...
        </Typography>
      )}
    </Box>
  );
}

/* ─── Tab: Interfaces ─── */

const INTERFACE_OPTIONS: { value: InterfaceType; label: string; available: boolean }[] = [
  { value: 'none', label: 'None', available: true },
  { value: 'websocket-realtime', label: 'WebSocket Realtime', available: true },
  { value: 'ctrlx', label: 'ctrlX (Bosch Rexroth)', available: true },
  { value: 'twincat-hmi', label: 'TwinCAT HMI', available: false },
  { value: 'mqtt', label: 'MQTT', available: false },
  { value: 'keba', label: 'KEBA', available: false },
];

/** Shared sx for compact MUI TextFields in settings tabs. */
const tfSx = {
  '& .MuiInputBase-root': { fontSize: 12, fontFamily: 'monospace', bgcolor: 'rgba(255,255,255,0.04)' },
  '& .MuiInputBase-input': { py: 0.75, px: 1.25 },
  '& .MuiInputLabel-root': { fontSize: 12 },
} as const;

function InterfacesTab() {
  const viewer = useViewer();
  const manager = viewer.getPlugin<InterfaceManager>('interface-manager');
  const [settings, setSettings] = useState<InterfaceSettings>(loadInterfaceSettings);
  const [connectionState, setConnectionState] = useState<string>(
    manager?.getActive()?.connectionState ?? 'disconnected',
  );
  const [signalCount, setSignalCount] = useState(
    manager?.getActive()?.discoveredSignals.length ?? 0,
  );
  const [connecting, setConnecting] = useState(false);

  // Poll connection state
  useEffect(() => {
    const interval = setInterval(() => {
      const active = manager?.getActive();
      setConnectionState(prev => {
        const next = active?.connectionState ?? 'disconnected';
        return prev === next ? prev : next;
      });
      setSignalCount(prev => {
        const next = active?.discoveredSignals.length ?? 0;
        return prev === next ? prev : next;
      });
    }, 200);
    return () => clearInterval(interval);
  }, [manager]);

  const persist = (patch: Partial<InterfaceSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveInterfaceSettings(next);
  };

  const isWsBased = settings.activeType === 'websocket-realtime'
    || settings.activeType === 'ctrlx'
    || settings.activeType === 'twincat-hmi'
    || settings.activeType === 'keba';

  const isMqtt = settings.activeType === 'mqtt';
  const isConnected = connectionState === 'connected';
  const showSettings = settings.activeType !== 'none';

  const handleConnect = async () => {
    if (!manager) return;
    setConnecting(true);
    try {
      await manager.activate(settings.activeType, settings);
    } catch {
      // Error already handled via state
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    if (!manager) return;
    manager.deactivate();
    setConnectionState('disconnected');
    setSignalCount(0);
  };

  const stateColor = connectionState === 'connected' ? '#66bb6a'
    : connectionState === 'connecting' ? '#ffa726'
    : connectionState === 'error' ? '#ef5350'
    : 'rgba(255,255,255,0.5)';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Interface selector */}
      <Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
          Interface Protocol
        </Typography>
        <Select
          size="small"
          fullWidth
          value={settings.activeType}
          onChange={(e) => {
            const type = e.target.value as InterfaceType;
            if (isConnected) handleDisconnect();
            persist({ activeType: type });
          }}
          sx={{ mt: 0.5, fontSize: 13, '& .MuiSelect-select': { py: 0.75 } }}
        >
          {INTERFACE_OPTIONS.map((opt) => (
            <MenuItem key={opt.value} value={opt.value} disabled={!opt.available} sx={{ fontSize: 13 }}>
              {opt.label}
              {!opt.available && (
                <Typography component="span" sx={{ ml: 1, fontSize: 10, color: 'text.disabled' }}>coming soon</Typography>
              )}
            </MenuItem>
          ))}
        </Select>
      </Box>

      {/* WebSocket-based settings */}
      {showSettings && isWsBased && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
            Connection
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              label="Address"
              size="small"
              fullWidth
              value={settings.wsAddress}
              onChange={(e) => persist({ wsAddress: e.target.value })}
              placeholder="localhost"
              sx={tfSx}
            />
            <TextField
              label="Port"
              size="small"
              type="number"
              value={settings.wsPort}
              onChange={(e) => persist({ wsPort: Number(e.target.value) || INTERFACE_DEFAULTS.wsPort })}
              sx={{ ...tfSx, width: 90, flexShrink: 0 }}
            />
          </Box>
          <TextField
            label="Path"
            size="small"
            fullWidth
            value={settings.wsPath}
            onChange={(e) => persist({ wsPath: e.target.value })}
            placeholder="/"
            sx={tfSx}
          />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2" sx={{ color: 'text.primary', fontSize: 13 }}>Use SSL (wss://)</Typography>
            <Switch size="small" checked={settings.wsUseSSL} onChange={(_, v) => persist({ wsUseSSL: v })} />
          </Box>
          {(settings.wsUseSSL || settings.activeType === 'ctrlx') && (
            <TextField
              label="Auth Token"
              size="small"
              fullWidth
              type="password"
              value={settings.wsAuthToken}
              onChange={(e) => persist({ wsAuthToken: e.target.value })}
              placeholder="Bearer token (ctrlX SSL)"
              sx={tfSx}
            />
          )}
        </Box>
      )}

      {/* MQTT settings */}
      {showSettings && isMqtt && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
            MQTT Broker
          </Typography>
          <TextField
            label="Broker URL"
            size="small"
            fullWidth
            value={settings.mqttBrokerUrl}
            onChange={(e) => persist({ mqttBrokerUrl: e.target.value })}
            placeholder="ws://localhost:8080/mqtt"
            sx={tfSx}
          />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              label="Username"
              size="small"
              fullWidth
              value={settings.mqttUsername}
              onChange={(e) => persist({ mqttUsername: e.target.value })}
              sx={tfSx}
            />
            <TextField
              label="Password"
              size="small"
              fullWidth
              type="password"
              value={settings.mqttPassword}
              onChange={(e) => persist({ mqttPassword: e.target.value })}
              sx={tfSx}
            />
          </Box>
          <TextField
            label="Topic Prefix"
            size="small"
            fullWidth
            value={settings.mqttTopicPrefix}
            onChange={(e) => persist({ mqttTopicPrefix: e.target.value })}
            placeholder="rv/"
            sx={tfSx}
          />
        </Box>
      )}

      {/* Auto-connect toggle */}
      {showSettings && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="body2" sx={{ color: 'text.primary', fontSize: 13 }}>Auto-Connect</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: 10 }}>
              Connect automatically when a model is loaded
            </Typography>
          </Box>
          <Switch size="small" checked={settings.autoConnect} onChange={(_, v) => persist({ autoConnect: v })} />
        </Box>
      )}

      {/* Connect / Disconnect button */}
      {showSettings && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {isConnected ? (
            <Button
              variant="outlined"
              size="small"
              color="warning"
              onClick={handleDisconnect}
              sx={{ fontSize: 11, textTransform: 'none' }}
            >
              Disconnect
            </Button>
          ) : (
            <Button
              variant="contained"
              size="small"
              onClick={handleConnect}
              disabled={connecting || !manager}
              startIcon={connecting ? <CircularProgress size={12} color="inherit" /> : undefined}
              sx={{ fontSize: 11, textTransform: 'none' }}
            >
              {connecting ? 'Connecting...' : 'Connect'}
            </Button>
          )}
        </Box>
      )}

      {/* Status */}
      {showSettings && (
        <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.08)', pt: 1.5 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
            Status
          </Typography>
          <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <StatRow label="State" value={connectionState} color={stateColor} />
            <StatRow label="Signals" value={isConnected ? String(signalCount) : '--'} />
            <StatRow label="Protocol" value={INTERFACE_OPTIONS.find(o => o.value === settings.activeType)?.label ?? '--'} />
          </Box>
        </Box>
      )}

      {!manager && (
        <Typography variant="caption" sx={{ color: '#ef5350' }}>
          InterfaceManager not registered. Add it to the viewer plugins in main.ts.
        </Typography>
      )}
    </Box>
  );
}

/* ─── Tab: Dev Tools ─── */

interface DevStats {
  fps: number;
  frameTime: number;
  triangles: number;
  drawCalls: number;
  geometries: number;
  textures: number;
  programs: number;
  heapMB: string;
  renderer: string;
  drives: number;
  glbSize: string;
  loadTime: string;
}

const PERF_BUDGETS = {
  triangles: 2_000_000,
  drawCalls: 500,
  frameTime: 33.33, // 30fps floor — 60fps (16.7ms) shows ~50% green
  textures: 200,
  geometries: 500,
  heapMB: 512,
};

function budgetPct(value: number, budget: number): { pct: number; color: string } {
  const pct = Math.min(Math.round((value / budget) * 100), 100);
  const color = pct < 60 ? '#66bb6a' : pct < 85 ? '#ffa726' : '#ef5350';
  return { pct, color };
}

function DevToolsTab() {
  const viewer = useViewer();
  const [stats, setStats] = useState<DevStats | null>(null);
  const [benchRunning, setBenchRunning] = useState(false);
  const [benchResult, setBenchResult] = useState<{ uncappedFps: number; avgFrameMs: number; headroom: number } | null>(null);
  const [showStats, setShowStats] = useState(viewer.showStats);
  const [infoLogging, setInfoLogging] = useState(viewer.rendererInfoLogging);
  const prevStatsHashRef = useRef('');

  const runBenchmark = useCallback(async () => {
    setBenchRunning(true);
    setBenchResult(null);
    // Small delay so the UI updates before the blocking render loop
    await new Promise((r) => setTimeout(r, 50));
    const result = await viewer.runBenchmark(120);
    setBenchResult(result);
    setBenchRunning(false);
  }, [viewer]);

  useEffect(() => {
    const interval = setInterval(() => {
      const info = viewer.getRendererInfo();
      const mem = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
      const heapMB = mem?.usedJSHeapSize ? (mem.usedJSHeapSize / (1024 * 1024)).toFixed(0) : '--';
      const hash = `${viewer.currentFps}|${info.triangles}|${info.drawCalls}|${heapMB}|${viewer.drives.length}`;
      if (hash === prevStatsHashRef.current) return;
      prevStatsHashRef.current = hash;
      setStats({
        fps: viewer.currentFps,
        frameTime: viewer.currentFrameTime,
        triangles: info.triangles,
        drawCalls: info.drawCalls,
        geometries: info.geometries,
        textures: info.textures,
        programs: info.programs,
        heapMB,
        renderer: viewer.isWebGPU ? 'WebGPU' : 'WebGL',
        drives: viewer.drives.length,
        glbSize: viewer.lastLoadInfo?.glbSize ?? '--',
        loadTime: viewer.lastLoadInfo?.loadTime ?? '--',
      });
    }, 200);
    return () => clearInterval(interval);
  }, [viewer]);

  const s = stats;
  const heapNum = s ? parseFloat(s.heapMB) || 0 : 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Profiler toggles */}
      <Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
          Profiler
        </Typography>
        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2" sx={{ color: 'text.primary' }}>FPS / GPU Overlay</Typography>
            <Switch size="small" checked={showStats} onChange={(_, v) => { viewer.showStats = v; setShowStats(v); }} />
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2" sx={{ color: 'text.primary' }}>Console Perf Log</Typography>
            <Switch size="small" checked={infoLogging} onChange={(_, v) => { viewer.rendererInfoLogging = v; setInfoLogging(v); }} />
          </Box>
        </Box>
      </Box>

      <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.08)', pt: 1.5 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
          Stats
        </Typography>
        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <StatRow label="FPS" value={s ? String(s.fps) : '--'} />
          <StatRow label="Frame" value={s ? `${s.frameTime} ms` : '--'} />
          <StatRow label="Triangles" value={s ? s.triangles.toLocaleString() : '--'} />
          <StatRow label="Draw Calls" value={s ? String(s.drawCalls) : '--'} />
          <StatRow label="Geometries" value={s ? String(s.geometries) : '--'} />
          <StatRow label="Textures" value={s ? String(s.textures) : '--'} />
          <StatRow label="Programs" value={s ? String(s.programs) : '--'} />
          <StatRow label="JS Heap" value={s ? `${s.heapMB} MB` : '--'} />
          <StatRow label="Renderer" value={s?.renderer ?? '--'} />
        </Box>
      </Box>

      <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.08)', pt: 1.5 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
          Scene
        </Typography>
        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <StatRow label="Drives" value={s ? String(s.drives) : '--'} />
          <StatRow label="GLB Size" value={s?.glbSize ?? '--'} />
          <StatRow label="Load Time" value={s?.loadTime ?? '--'} />
        </Box>
      </Box>

      <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.08)', pt: 1.5 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
          Performance Budget
        </Typography>
        <Box sx={{ mt: 1, fontSize: 12, color: 'text.secondary' }}>
          {s && <>
            <BudgetRow label="Triangles" {...budgetPct(s.triangles, PERF_BUDGETS.triangles)} />
            <BudgetRow label="Draw Calls" {...budgetPct(s.drawCalls, PERF_BUDGETS.drawCalls)} />
            <BudgetRow label="Frame Time" {...budgetPct(s.frameTime, PERF_BUDGETS.frameTime)} />
            <BudgetRow label="Textures" {...budgetPct(s.textures, PERF_BUDGETS.textures)} />
            <BudgetRow label="Geometries" {...budgetPct(s.geometries, PERF_BUDGETS.geometries)} />
            <BudgetRow label="JS Heap" {...budgetPct(heapNum, PERF_BUDGETS.heapMB)} />
          </>}
        </Box>
      </Box>

      {/* GPU Benchmark */}
      <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.08)', pt: 1.5 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
          GPU Benchmark
        </Typography>
        <Box sx={{ mt: 1 }}>
          <Button
            variant="outlined"
            size="small"
            onClick={runBenchmark}
            disabled={benchRunning}
            startIcon={benchRunning ? <CircularProgress size={12} /> : <PlayArrow sx={{ fontSize: 14 }} />}
            sx={{ fontSize: 11, textTransform: 'none', borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)' }}
          >
            {benchRunning ? 'Running...' : 'Run Benchmark (120 frames)'}
          </Button>
          {benchResult && (
            <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <StatRow label="Uncapped FPS" value={String(benchResult.uncappedFps)} color="#4fc3f7" />
              <StatRow label="Avg Frame" value={`${benchResult.avgFrameMs} ms`} />
              <StatRow
                label="Headroom"
                value={`${benchResult.headroom}%`}
                color={benchResult.headroom > 200 ? '#66bb6a' : benchResult.headroom > 120 ? '#ffa726' : '#ef5350'}
              />
              <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', mt: 0.5 }}>
                {benchResult.headroom > 200 ? 'Plenty of GPU headroom' :
                 benchResult.headroom > 120 ? 'Moderate headroom — watch complexity' :
                 'Near GPU limit — optimize scene'}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

/* ─── Tab: Tests ─── */

interface TestResult {
  numPassedTests?: number;
  numFailedTests?: number;
  numTotalTests?: number;
  testResults?: Array<{
    name: string;
    status: string;
    assertionResults?: Array<{ fullName: string; status: string; failureMessages?: string[] }>;
  }>;
}

function TestsTab() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTests = useCallback(async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/__api/tests/run', { method: 'POST' });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        setResult(json);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }, []);

  const passed = result?.numPassedTests ?? 0;
  const failed = result?.numFailedTests ?? 0;
  const total = result?.numTotalTests ?? 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Button
          variant="contained"
          size="small"
          startIcon={running ? <CircularProgress size={14} color="inherit" /> : <PlayArrow />}
          disabled={running}
          onClick={runTests}
          sx={{ textTransform: 'none', fontWeight: 600 }}
        >
          {running ? 'Running...' : 'Run Tests'}
        </Button>
        {result && !error && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {failed === 0 ? (
              <CheckCircle sx={{ fontSize: 16, color: '#66bb6a' }} />
            ) : (
              <ErrorIcon sx={{ fontSize: 16, color: '#ef5350' }} />
            )}
            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
              {passed}/{total} passed
              {failed > 0 && <span style={{ color: '#ef5350' }}> ({failed} failed)</span>}
            </Typography>
          </Box>
        )}
      </Box>

      {error && (
        <Typography variant="caption" sx={{ color: '#ef5350', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
          {error}
        </Typography>
      )}

      {result?.testResults && result.testResults.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {result.testResults.map((suite) =>
            suite.assertionResults?.map((t, i) => (
              <Box key={`${suite.name}-${i}`} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                {t.status === 'passed' ? (
                  <CheckCircle sx={{ fontSize: 12, color: '#66bb6a' }} />
                ) : (
                  <ErrorIcon sx={{ fontSize: 12, color: '#ef5350' }} />
                )}
                <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 11, color: t.status === 'passed' ? 'text.secondary' : '#ef5350' }}>
                  {t.fullName}
                </Typography>
              </Box>
            ))
          )}
        </Box>
      )}

      {!result && !error && !running && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Click "Run Tests" to execute vitest browser tests. Only available on the Vite dev server.
        </Typography>
      )}
    </Box>
  );
}

/* ─── MCP Tab ─── */

function McpTab() {
  const viewer = useViewer();
  const mcp = useMcpBridge();
  const mcpPlugin = viewer.getPlugin<McpBridgePluginAPI>('mcp-bridge');
  const [portInput, setPortInput] = useState(mcp.port);
  const [portError, setPortError] = useState(false);

  // Sync portInput when mcp.port changes externally
  useEffect(() => { setPortInput(mcp.port); }, [mcp.port]);

  const stateColor = mcp.connected ? '#66bb6a'
    : mcp.reconnectAttempt > 0 ? '#ffa726'
    : mcp.enabled ? '#ef5350'
    : 'rgba(255,255,255,0.5)';

  const stateLabel = mcp.connected ? 'Connected'
    : mcp.reconnectAttempt > 0 ? `Reconnecting (${mcp.reconnectAttempt})...`
    : mcp.enabled ? 'Disconnected'
    : 'Disabled';

  const validatePort = (val: string): boolean => {
    const n = Number(val);
    return Number.isInteger(n) && n >= 1 && n <= 65535;
  };

  const handlePortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPortInput(val);
    setPortError(val !== '' && !validatePort(val));
  };

  const handlePortBlur = () => {
    if (portInput !== mcp.port && validatePort(portInput)) {
      mcpPlugin?.reconnect(portInput);
    } else if (!validatePort(portInput)) {
      setPortInput(mcp.port);
      setPortError(false);
    }
  };

  const handlePortKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Enable toggle */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>AI Bridge</Typography>
        <Switch size="small" checked={mcp.enabled}
          onChange={(_, v) => mcpPlugin?.setEnabled(v)} />
      </Box>

      {/* Status */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <StatRow label="State" value={stateLabel} color={stateColor} />
        <StatRow label="Tools" value={String(mcp.toolCount)} />
        <StatRow label="Port" value={mcp.port} />
      </Box>

      {/* Port config */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <TextField
          label="Port"
          size="small"
          type="number"
          value={portInput}
          onChange={handlePortChange}
          onBlur={handlePortBlur}
          onKeyDown={handlePortKeyDown}
          error={portError}
          helperText={portError ? '1-65535' : undefined}
          disabled={!mcp.enabled}
          slotProps={{ htmlInput: { min: 1, max: 65535 } }}
          sx={{ width: 110, '& input': { fontFamily: 'monospace', fontSize: 13 } }}
        />
      </Box>

      {/* Retry button */}
      {mcp.enabled && !mcp.connected && (
        <Button size="small" variant="outlined" onClick={() => mcpPlugin?.reconnect()}
          sx={{ alignSelf: 'flex-start', textTransform: 'none' }}>
          Retry Now
        </Button>
      )}

      {/* Tool list */}
      {mcp.toolNames.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
            Registered Tools ({mcp.toolNames.length})
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, pl: 1 }}>
            {mcp.toolNames.map(name => (
              <Typography key={name} variant="caption"
                sx={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
                {name}
              </Typography>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}

/* ─── Multiuser Tab ─── */

function MultiuserTab({ muEnabled, onMuEnabledChange }: { muEnabled: boolean; onMuEnabledChange: (v: boolean) => void }) {
  const viewer = useViewer();
  const mu = useMultiuser();
  const muPlugin = viewer.getPlugin<MultiuserPluginAPI>('multiuser');

  // Load persisted settings
  const settingsRef = useRef(loadMultiuserSettings());
  const [serverUrl, setServerUrl] = useState(settingsRef.current.serverUrl);
  const [role, setRole] = useState<string>(settingsRef.current.role);
  const [name, setName] = useState(settingsRef.current.displayName);
  const [joinCode, setJoinCode] = useState(settingsRef.current.joinCode);

  const persist = useCallback((patch: Partial<MultiuserSettings>) => {
    Object.assign(settingsRef.current, patch);
    saveMultiuserSettings(settingsRef.current);
  }, []);

  // Keep in sync when connected
  useEffect(() => {
    if (mu.connected) {
      setServerUrl(mu.serverUrl);
      setName(mu.localName);
      setRole(mu.localRole);
    }
  }, [mu.connected, mu.serverUrl, mu.localName, mu.localRole]);

  const stateColor = mu.connected ? '#66bb6a' : 'rgba(255,255,255,0.5)';
  const stateLabel = mu.connected ? `Connected (${mu.playerCount + 1} users)` : 'Disconnected';

  const handleConnect = () => {
    muPlugin?.joinSession(serverUrl, name, undefined, role, joinCode || undefined);
  };

  const handleDisconnect = () => {
    muPlugin?.leaveSession();
  };

  const handleEnabledToggle = (_: unknown, v: boolean) => {
    persist({ enabled: v });
    onMuEnabledChange(v);
    if (!v && mu.connected) muPlugin?.leaveSession();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Enable toggle */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 500 }}>Multiuser</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: 10 }}>
            Show multiuser button in toolbar
          </Typography>
        </Box>
        <Switch size="small" checked={muEnabled} onChange={handleEnabledToggle} />
      </Box>

      {/* Status */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <StatRow label="State" value={stateLabel} color={stateColor} />
        {mu.connected && <StatRow label="Server" value={mu.serverUrl} />}
        {mu.connected && <StatRow label="Role" value={mu.localRole} />}
      </Box>

      {/* Server URL */}
      <Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, mb: 0.5, display: 'block' }}>
          Server URL
        </Typography>
        <TextField
          fullWidth size="small"
          placeholder="ws://192.168.1.5:7000"
          value={serverUrl}
          onChange={(e) => { setServerUrl(e.target.value); persist({ serverUrl: e.target.value }); }}
          disabled={mu.connected}
          sx={{ '& input': { fontFamily: 'monospace', fontSize: 12 } }}
        />
      </Box>

      {/* Join Code (optional session/room identifier) */}
      <Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, mb: 0.5, display: 'block' }}>
          Join Code (optional)
        </Typography>
        <TextField
          fullWidth size="small"
          placeholder="e.g. ABC123"
          value={joinCode}
          onChange={(e) => { setJoinCode(e.target.value); persist({ joinCode: e.target.value }); }}
          disabled={mu.connected}
          sx={{ '& input': { fontFamily: 'monospace', fontSize: 12, textTransform: 'uppercase' } }}
        />
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25, fontSize: 10 }}>
          Identifies the session on a relay server hosting multiple models
        </Typography>
      </Box>

      {/* Display Name */}
      <Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, mb: 0.5, display: 'block' }}>
          Display Name
        </Typography>
        <TextField
          fullWidth size="small"
          placeholder="Browser"
          value={name}
          onChange={(e) => { setName(e.target.value); persist({ displayName: e.target.value }); }}
          disabled={mu.connected}
          sx={{ '& input': { fontSize: 12 } }}
        />
      </Box>

      {/* Role */}
      <Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, mb: 0.5, display: 'block' }}>
          Role
        </Typography>
        <Select
          fullWidth size="small"
          value={role}
          onChange={(e) => { setRole(e.target.value); persist({ role: e.target.value as 'observer' | 'operator' }); }}
          disabled={mu.connected}
          sx={{ fontSize: 12 }}
        >
          <MenuItem value="observer" sx={{ fontSize: 12 }}>Observer (watch only)</MenuItem>
          <MenuItem value="operator" sx={{ fontSize: 12 }}>Operator (full control)</MenuItem>
        </Select>
      </Box>

      {/* Connect / Disconnect */}
      {!mu.connected ? (
        <Button size="small" variant="contained" onClick={handleConnect}
          disabled={!serverUrl.trim()}
          sx={{ alignSelf: 'flex-start', textTransform: 'none', bgcolor: '#1565c0', '&:hover': { bgcolor: '#1976d2' } }}>
          Connect
        </Button>
      ) : (
        <Button size="small" variant="outlined" onClick={handleDisconnect}
          sx={{
            alignSelf: 'flex-start', textTransform: 'none',
            borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.65)',
            '&:hover': { borderColor: '#ef5350', color: '#ef5350', bgcolor: 'rgba(239,83,80,0.06)' },
          }}>
          Disconnect
        </Button>
      )}

      {/* Connected players */}
      {mu.connected && mu.players.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
            Connected Users ({mu.players.length + 1})
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, pl: 1 }}>
            {mu.players.map(p => (
              <Box key={p.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: p.color, flexShrink: 0 }} />
                <Typography variant="caption" sx={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
                  {p.name}
                </Typography>
                <Typography variant="caption" sx={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', ml: 'auto' }}>
                  {p.role}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}

/* ─── Shared Components ─── */

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{label}</Typography>
      <Typography variant="caption" sx={{ color: color ?? '#4fc3f7', fontWeight: 600, fontFamily: 'monospace' }}>
        {value}
      </Typography>
    </Box>
  );
}

function BudgetRow({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, my: 0.25 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', width: 72, flexShrink: 0, fontSize: 11 }}>
        {label}
      </Typography>
      <Box sx={{ flex: 1, height: 6, bgcolor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
        <Box sx={{ height: '100%', width: `${pct}%`, bgcolor: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </Box>
      <Typography variant="caption" sx={{ color: 'text.secondary', width: 36, textAlign: 'right', fontSize: 11, fontFamily: 'monospace' }}>
        {pct}%
      </Typography>
    </Box>
  );
}
