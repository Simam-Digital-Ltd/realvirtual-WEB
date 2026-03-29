import { useState, useEffect, useCallback, useRef } from 'react';
import { Typography, Box, Button, CircularProgress, Switch } from '@mui/material';
import { PlayArrow } from '@mui/icons-material';
import { useViewer } from '../../../hooks/use-viewer';
import { StatRow, BudgetRow, budgetPct } from './settings-helpers';

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

export function DevToolsTab() {
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
