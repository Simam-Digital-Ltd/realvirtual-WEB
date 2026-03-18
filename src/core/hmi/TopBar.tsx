import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { Vector3 } from 'three';
import { Typography, Box, IconButton, Paper, Button, CircularProgress, Tabs, Tab, Switch, Slider, Tooltip, Select, MenuItem, TextField } from '@mui/material';
import { Settings, Close, PlayArrow, CheckCircle, Error as ErrorIcon, RestartAlt, AccountTree, ViewInAr } from '@mui/icons-material';
import { useMobileLayout } from '../../hooks/use-mobile-layout';
import { useViewer } from '../../hooks/use-viewer';
import type { WebXRPlugin } from '../../plugins/webxr-plugin';
import { loadVisualSettings, saveVisualSettings, type VisualSettings, type CameraBookmark } from './visual-settings-store';
import { loadPhysicsSettings, savePhysicsSettings, type PhysicsSettings } from './physics-settings-store';
import { loadInterfaceSettings, saveInterfaceSettings, type InterfaceSettings, type InterfaceType, INTERFACE_DEFAULTS } from '../../interfaces/interface-settings-store';
import { InterfaceManager } from '../../interfaces/interface-manager';
import { ALL_RV_STORAGE_KEYS } from './rv-storage-keys';
import { RvExtrasEditorPlugin, HIERARCHY_DEFAULT_WIDTH } from './rv-extras-editor';
import { HierarchyBrowser } from './rv-hierarchy-browser';
import { PropertyInspector } from './rv-property-inspector';

export function TopBar() {
  const viewer = useViewer();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState(0);
  const [vrOpen, setVrOpen] = useState(false);

  // Hierarchy panel state from plugin
  const plugin = viewer.getPlugin<RvExtrasEditorPlugin>('rv-extras-editor');
  const pluginState = useSyncExternalStore(
    plugin?.subscribe ?? (() => () => {}),
    plugin?.getSnapshot ?? (() => ({ panelOpen: false, panelWidth: HIERARCHY_DEFAULT_WIDTH, overlay: null, editableNodes: [], selectedNodePath: null, revealPath: null })),
  );
  const hierarchyOpen = pluginState.panelOpen;

  const toggleHierarchy = useCallback(() => {
    if (!plugin) return;
    plugin.togglePanel();
    setSettingsOpen(false);
    setVrOpen(false);
  }, [plugin]);

  const isMobile = useMobileLayout();

  // WebXR plugin for AR button on mobile
  const xrPlugin = viewer.getPlugin<WebXRPlugin>('webxr');
  const showMobileAR = isMobile && xrPlugin?.arSupported;

  return (
    <>
      {/* Hierarchy + VR + Settings buttons — fixed top-right */}
      <Paper elevation={4} sx={{ position: 'fixed', top: 8, right: 8, borderRadius: 2, pointerEvents: 'auto', zIndex: 9001, display: 'flex', gap: isMobile ? 0.5 : 0.25, px: isMobile ? 0.5 : 0.25 }}>
        {plugin && !isMobile && (
          <IconButton
            size="small"
            color={hierarchyOpen ? 'primary' : 'inherit'}
            sx={{ p: 0.75 }}
            onClick={toggleHierarchy}
          >
            {hierarchyOpen ? <Close fontSize="small" /> : <AccountTree fontSize="small" />}
          </IconButton>
        )}
        {!isMobile && (
          <IconButton
            size="small"
            color={vrOpen ? 'primary' : 'inherit'}
            sx={{ p: 0.75 }}
            onClick={() => { setVrOpen(!vrOpen); setSettingsOpen(false); if (hierarchyOpen) plugin?.togglePanel(); }}
          >
            {vrOpen ? <Close fontSize="small" /> : <Typography sx={{ fontSize: 11, fontWeight: 700, px: 0.25 }}>VR</Typography>}
          </IconButton>
        )}
        {showMobileAR && (
          <IconButton
            sx={{ p: 1, color: '#81c784' }}
            onClick={() => xrPlugin?.startAR()}
          >
            <ViewInAr />
          </IconButton>
        )}
        <IconButton
          size={isMobile ? 'medium' : 'small'}
          color={settingsOpen ? 'primary' : 'inherit'}
          sx={{ p: isMobile ? 1 : 0.75 }}
          onClick={() => { setSettingsOpen(!settingsOpen); setVrOpen(false); if (hierarchyOpen) plugin?.togglePanel(); }}
        >
          {settingsOpen ? <Close fontSize={isMobile ? 'medium' : 'small'} /> : <Settings fontSize={isMobile ? 'medium' : 'small'} />}
        </IconButton>
      </Paper>

      {/* Hierarchy browser panel (disabled on mobile) */}
      {!isMobile && hierarchyOpen && <HierarchyBrowser viewer={viewer} />}

      {/* Property inspector (disabled on mobile) */}
      {!isMobile && hierarchyOpen && pluginState.selectedNodePath && <PropertyInspector viewer={viewer} />}

      {/* VR/AR modal */}
      {vrOpen && <VRModal onClose={() => setVrOpen(false)} />}

      {/* Settings full-screen overlay */}
      {settingsOpen && (
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
          onClick={() => setSettingsOpen(false)}
        >
          <Paper
            elevation={12}
            sx={{
              borderRadius: 2,
              width: 560,
              maxWidth: '95vw',
              minHeight: { xs: 0, sm: 400 },
              maxHeight: '90dvh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Tabs
              value={settingsTab}
              onChange={(_, v) => setSettingsTab(v)}
              sx={{
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                minHeight: 40,
                '& .MuiTab-root': { minHeight: 40, py: 1, textTransform: 'none', fontSize: 13, minWidth: 0, px: { xs: 1.5, sm: 2 } },
              }}
            >
              <Tab label="Model" />
              <Tab label="Visual" />
              <Tab label="Physics" />
              <Tab label="Interfaces" />
              <Tab label="Dev Tools" />
              <Tab label="Tests" />
            </Tabs>

            <Box sx={{ p: { xs: 2, sm: 3 }, flex: 1 }}>
              {settingsTab === 0 && <ModelTab />}
              {settingsTab === 1 && <VisualTab />}
              {settingsTab === 2 && <PhysicsTab />}
              {settingsTab === 3 && <InterfacesTab />}
              {settingsTab === 4 && <DevToolsTab />}
              {settingsTab === 5 && <TestsTab />}
            </Box>
          </Paper>
        </Box>
      )}
    </>
  );
}

/* ─── VR/AR Modal ─── */

function VRModal({ onClose }: { onClose: () => void }) {
  const vrUrl = 'https://files.realvirtual.io/vr';
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

  const handleRendererChange = (value: string) => {
    localStorage.setItem('rv-webviewer-renderer', value);
    window.location.reload();
  };

  const handleModelChange = (url: string) => {
    if (url) viewer.loadModel(url);
  };

  const selectStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    color: '#4fc3f7',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 12,
    fontFamily: 'monospace',
    cursor: 'pointer',
    width: '100%',
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
        <Box sx={{ mt: 0.5 }}>
          <select style={selectStyle} value={currentRenderer} onChange={(e) => handleRendererChange(e.target.value)}>
            <option value="webgl">WebGL</option>
            <option value="webgpu">WebGPU</option>
          </select>
        </Box>
      </Box>
      <Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
          Model
        </Typography>
        <Box sx={{ mt: 0.5 }}>
          <select style={selectStyle} value={currentUrl ?? ''} onChange={(e) => handleModelChange(e.target.value)}>
            <option value="">-- Select Model --</option>
            {models.map((m) => (
              <option key={m.url} value={m.url}>{m.label}</option>
            ))}
          </select>
        </Box>
      </Box>

      {/* Reset all settings */}
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
    </Box>
  );
}

/* ─── Tab: Visual ─── */

function VisualTab() {
  const viewer = useViewer();
  const settingsRef = useRef(loadVisualSettings());
  const [shadows, setShadows] = useState(settingsRef.current.shadows);
  const [shadowStr, setShadowStr] = useState(settingsRef.current.shadowStrength);
  const [lightInt, setLightInt] = useState(settingsRef.current.lightIntensity);
  const [cameras, setCameras] = useState<(CameraBookmark | null)[]>(settingsRef.current.cameras);

  const persist = (patch: Partial<VisualSettings>) => {
    Object.assign(settingsRef.current, patch);
    saveVisualSettings(settingsRef.current);
  };

  const updateShadows = (_: unknown, v: boolean) => {
    viewer.shadowsEnabled = v; setShadows(v); persist({ shadows: v });
  };
  const updateShadowStr = (_: unknown, v: number | number[]) => {
    const val = v as number; viewer.shadowStrength = val; setShadowStr(val); persist({ shadowStrength: val });
  };
  const updateLightInt = (_: unknown, v: number | number[]) => {
    const val = v as number; viewer.lightIntensity = val; setLightInt(val); persist({ lightIntensity: val });
  };

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);
  const [savedIdx, setSavedIdx] = useState<number | null>(null);

  const saveCamera = (idx: number) => {
    const p = viewer.camera.position;
    const t = viewer.controls.target;
    const bm: CameraBookmark = { px: p.x, py: p.y, pz: p.z, tx: t.x, ty: t.y, tz: t.z };
    const next = [...cameras];
    next[idx] = bm;
    setCameras(next);
    settingsRef.current.cameras = next;
    persist({ cameras: next });
    setSavedIdx(idx);
    setTimeout(() => setSavedIdx(null), 800);
  };

  const restoreCamera = (idx: number) => {
    const bm = cameras[idx];
    if (!bm) return;
    viewer.animateCameraTo(
      new Vector3(bm.px, bm.py, bm.pz),
      new Vector3(bm.tx, bm.ty, bm.tz),
    );
  };

  const handlePointerDown = (idx: number) => {
    didLongPress.current = false;
    pressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      saveCamera(idx);
    }, 500);
  };

  const handlePointerUp = (idx: number) => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
    if (!didLongPress.current) restoreCamera(idx);
  };

  const handlePointerLeave = () => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Shadows on/off */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="body2" sx={{ color: 'text.primary' }}>Shadows</Typography>
        <Switch size="small" checked={shadows} onChange={updateShadows} />
      </Box>

      {/* Shadow Strength */}
      <Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
          Shadow Strength
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5 }}>
          <Slider size="small" min={0} max={1} step={0.05} value={shadowStr} disabled={!shadows} onChange={updateShadowStr} sx={{ flex: 1 }} />
          <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace', minWidth: 32, textAlign: 'right' }}>
            {shadowStr.toFixed(2)}
          </Typography>
        </Box>
      </Box>

      {/* Global Lighting */}
      <Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
          Global Lighting
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5 }}>
          <Slider size="small" min={0} max={2} step={0.05} value={lightInt} onChange={updateLightInt} sx={{ flex: 1 }} />
          <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace', minWidth: 32, textAlign: 'right' }}>
            {lightInt.toFixed(2)}
          </Typography>
        </Box>
      </Box>

      {/* Camera Bookmarks */}
      <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.08)', pt: 2 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1, mb: 1, display: 'block' }}>
          Camera Positions
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1, fontSize: 11 }}>
          Click to restore, hold to save current view
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          {[0, 1, 2].map((i) => {
            const isSaved = savedIdx === i;
            const hasBookmark = !!cameras[i];
            return (
              <Tooltip key={i} title={hasBookmark ? 'Click: restore | Hold: save' : 'Hold to save current view'} placement="top">
                <Button
                  size="small"
                  variant={hasBookmark ? 'contained' : 'outlined'}
                  onPointerDown={() => handlePointerDown(i)}
                  onPointerUp={() => handlePointerUp(i)}
                  onPointerLeave={handlePointerLeave}
                  sx={{
                    minWidth: 0, px: 1.5, py: 0.5,
                    fontSize: 12, fontWeight: hasBookmark ? 700 : 400, fontFamily: 'monospace',
                    borderColor: isSaved ? '#66bb6a' : hasBookmark ? undefined : 'rgba(255,255,255,0.2)',
                    color: isSaved ? '#66bb6a' : undefined,
                    bgcolor: isSaved ? 'rgba(102,187,106,0.15)' : undefined,
                    transition: 'all 0.2s',
                  }}
                >
                  {isSaved ? 'Saved' : `CAM ${i + 1}`}
                </Button>
              </Tooltip>
            );
          })}
        </Box>
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
      setConnectionState(active?.connectionState ?? 'disconnected');
      setSignalCount(active?.discoveredSignals.length ?? 0);
    }, 500);
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
    }, 500);
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
