import { useState, useEffect, useCallback, useRef } from 'react';
import { Vector3 } from 'three';
import { Typography, Box, IconButton, Paper, Button, CircularProgress, Tabs, Tab, Switch, Slider, Tooltip } from '@mui/material';
import { Settings, Close, PlayArrow, CheckCircle, Error as ErrorIcon } from '@mui/icons-material';
import { KpiCard } from './KpiCard';
import { useViewer } from '../hooks/use-viewer';
import { loadVisualSettings, saveVisualSettings, type VisualSettings, type CameraBookmark } from './visual-settings-store';

export function TopBar() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState(0);

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 8,
        left: 0,
        right: 0,
        zIndex: 1200,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        gap: 1.5,
        pointerEvents: 'none',
      }}
    >
      {/* KPI cards — horizontally centered */}
      <KpiCard label="OEE" value="87" unit="%" color="#66bb6a" secondary="Target: 90%" />
      <KpiCard label="Parts/h" value="312" unit="p/h" color="#4fc3f7" secondary="Shift total: 2,480" />
      <KpiCard label="Cycle Time" value="4.2" unit="s" color="#ffa726" secondary="Avg last hour" />

      {/* Settings button — fixed top-right */}
      <Paper elevation={4} sx={{ position: 'fixed', top: 8, right: 8, borderRadius: 2, pointerEvents: 'auto', zIndex: 1200 }}>
        <IconButton
          size="small"
          color={settingsOpen ? 'primary' : 'inherit'}
          sx={{ p: 0.75 }}
          onClick={() => setSettingsOpen(!settingsOpen)}
        >
          {settingsOpen ? <Close fontSize="small" /> : <Settings fontSize="small" />}
        </IconButton>
      </Paper>

      {/* Settings full-screen overlay */}
      {settingsOpen && (
        <Box
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: 1300,
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
              minHeight: 400,
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Tabs
              value={settingsTab}
              onChange={(_, v) => setSettingsTab(v)}
              sx={{
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                minHeight: 40,
                '& .MuiTab-root': { minHeight: 40, py: 1, textTransform: 'none', fontSize: 13 },
              }}
            >
              <Tab label="Model" />
              <Tab label="Visual" />
              <Tab label="Dev Tools" />
              <Tab label="Tests" />
            </Tabs>

            <Box sx={{ p: 3, flex: 1 }}>
              {settingsTab === 0 && <ModelTab />}
              {settingsTab === 1 && <VisualTab />}
              {settingsTab === 2 && <DevToolsTab />}
              {settingsTab === 3 && <TestsTab />}
            </Box>
          </Paper>
        </Box>
      )}
    </Box>
  );
}

/* ─── Tab: Model ─── */

function ModelTab() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
          Renderer
        </Typography>
        <Box sx={{ mt: 0.5 }}>
          <StyledSelect
            settingsId="settings-renderer-select"
            origId="renderer-select"
            fallbackOptions={[
              { value: 'webgl', label: 'WebGL' },
              { value: 'webgpu', label: 'WebGPU' },
            ]}
          />
        </Box>
      </Box>
      <Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
          Model
        </Typography>
        <Box sx={{ mt: 0.5 }}>
          <StyledSelect
            settingsId="settings-model-select"
            origId="model-select"
            fallbackOptions={[{ value: '', label: '-- Select Model --' }]}
          />
        </Box>
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
      <Box>
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

function StyledSelect({ settingsId, origId, fallbackOptions }: {
  settingsId: string;
  origId: string;
  fallbackOptions: Array<{ value: string; label: string }>;
}) {
  const [options, setOptions] = useState(fallbackOptions);

  // Sync options from the hidden original select
  useEffect(() => {
    const sync = () => {
      const orig = document.getElementById(origId) as HTMLSelectElement | null;
      if (orig && orig.options.length > 0) {
        const opts = Array.from(orig.options).map((o) => ({ value: o.value, label: o.textContent || o.value }));
        setOptions(opts);
      }
    };
    sync();
    const interval = setInterval(sync, 1000);
    return () => clearInterval(interval);
  }, [origId]);

  return (
    <select
      id={settingsId}
      style={{
        background: 'rgba(255,255,255,0.06)',
        color: '#4fc3f7',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 6,
        padding: '6px 10px',
        fontSize: 12,
        fontFamily: 'monospace',
        cursor: 'pointer',
        width: '100%',
      }}
      onChange={(e) => {
        const orig = document.getElementById(origId) as HTMLSelectElement;
        if (orig) { orig.value = e.target.value; orig.dispatchEvent(new Event('change')); }
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

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
