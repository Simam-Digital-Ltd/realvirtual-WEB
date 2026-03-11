/**
 * DriveChartOverlay — Draggable, resizable floating panel with a single
 * ECharts chart showing real-time drive positions and/or speeds.
 *
 * Uses MUI Paper for consistent glassmorphism dark styling.
 * Drag via title bar, resize via bottom-right corner handle.
 * Positions above the BottomBar search field.
 * Responds to drive filter events — only shows filtered drives.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Box, IconButton, Typography, ToggleButtonGroup, ToggleButton, Paper, Chip } from '@mui/material';
import { Close, UnfoldMore, UnfoldLess, DragIndicator, FilterAltOff } from '@mui/icons-material';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useViewer } from '../hooks/use-viewer';
import { useDriveChartOpen } from '../hooks/use-drive-chart';
import { useDrives } from '../hooks/use-drives';
import { useDriveFilter } from '../hooks/use-drive-filter';
import { BOTTOM_BAR_HEIGHT } from './BottomBar';

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer]);

const PALETTE = [
  '#4fc3f7', '#e94078', '#66bb6a', '#ffa726', '#ab47bc',
  '#26c6da', '#ef5350', '#ffee58', '#8d6e63', '#78909c',
  '#ec407a', '#7e57c2', '#29b6f6', '#9ccc65', '#ff7043',
  '#5c6bc0', '#26a69a', '#d4e157', '#f44336', '#42a5f5',
];

type ChartMode = 'position' | 'speed' | 'both';
type TimePeriod = 30 | 60 | 120 | 300;
const PERIOD_OPTIONS: TimePeriod[] = [30, 60, 120, 300];
const SAMPLE_RATE = 10; // Must match DriveDataRecorder sampleRate

const DEFAULT_W = 700;
const DEFAULT_H = 300;
const EXPANDED_H = Math.round(window.innerHeight * 0.55);
const MIN_W = 400;
const MIN_H = 200;
const REFRESH_INTERVAL = 200;

// Bottom margin to sit above the BottomBar search field
const BOTTOM_MARGIN = BOTTOM_BAR_HEIGHT + 12;

/** Tags that should NOT trigger drag when clicked. */
const INTERACTIVE_TAGS = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SVG', 'PATH']);

function isInteractive(el: HTMLElement): boolean {
  let cur: HTMLElement | null = el;
  while (cur) {
    if (INTERACTIVE_TAGS.has(cur.tagName)) return true;
    if (cur.getAttribute('role') === 'button') return true;
    if (cur.classList?.contains('MuiToggleButton-root')) return true;
    if (cur.classList?.contains('MuiIconButton-root')) return true;
    if (cur.classList?.contains('MuiChip-root')) return true;
    if (cur.dataset?.dragHandle === 'true') break; // reached the drag container
    cur = cur.parentElement;
  }
  return false;
}

// ─── Drag hook ───────────────────────────────────────────────────────────

function useDrag(
  ref: React.RefObject<HTMLDivElement | null>,
  pos: { x: number; y: number },
  setPos: (p: { x: number; y: number }) => void,
  active = true,
) {
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const posRef = useRef(pos);
  posRef.current = pos;

  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      if (isInteractive(e.target as HTMLElement)) return;
      dragging.current = true;
      offset.current = { x: e.clientX - posRef.current.x, y: e.clientY - posRef.current.y };
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      setPos({ x: e.clientX - offset.current.x, y: e.clientY - offset.current.y });
    };
    const onUp = () => {
      dragging.current = false;
    };

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, setPos, active]);
}

// ─── Resize hook ─────────────────────────────────────────────────────────

function useResize(
  ref: React.RefObject<HTMLDivElement | null>,
  size: { w: number; h: number },
  setSize: (s: { w: number; h: number }) => void,
  active = true,
) {
  const resizing = useRef(false);
  const start = useRef({ mx: 0, my: 0, w: 0, h: 0 });
  const sizeRef = useRef(size);
  sizeRef.current = size;

  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      resizing.current = true;
      start.current = { mx: e.clientX, my: e.clientY, w: sizeRef.current.w, h: sizeRef.current.h };
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    };
    const onMove = (e: PointerEvent) => {
      if (!resizing.current) return;
      const dw = e.clientX - start.current.mx;
      const dh = e.clientY - start.current.my;
      setSize({
        w: Math.max(MIN_W, start.current.w + dw),
        h: Math.max(MIN_H, start.current.h + dh),
      });
    };
    const onUp = () => {
      resizing.current = false;
    };

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, setSize, active]);
}

// ─── Component ───────────────────────────────────────────────────────────

export function DriveChartOverlay() {
  const viewer = useViewer();
  const open = useDriveChartOpen();
  const drives = useDrives();
  const { filter, filteredDrives, setFilter } = useDriveFilter();

  // Active drives: filtered if filter is set, otherwise all
  const activeDrives = filter ? filteredDrives : drives;

  const [mode, setMode] = useState<ChartMode>('position');
  const [period, setPeriod] = useState<TimePeriod>(60);
  const [expanded, setExpanded] = useState(false);
  const [pos, setPos] = useState({ x: 64, y: window.innerHeight - DEFAULT_H - BOTTOM_MARGIN });
  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });

  const dragRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  useDrag(dragRef, pos, setPos, open);
  useResize(resizeRef, size, setSize, open);

  // Snap to bottom-full-width when expanding (above bottom bar)
  useEffect(() => {
    if (expanded) {
      setPos({ x: 64, y: window.innerHeight - EXPANDED_H - BOTTOM_MARGIN });
      setSize({ w: window.innerWidth - 80, h: EXPANDED_H });
    } else {
      setSize({ w: DEFAULT_W, h: DEFAULT_H });
      setPos({ x: 64, y: window.innerHeight - DEFAULT_H - BOTTOM_MARGIN });
    }
  }, [expanded]);

  // Handle clicking a series -> focus drive
  const handleDriveClick = useCallback(
    (driveName: string) => {
      const cleanName = driveName.replace(/ \((pos|spd)\)$/, '');
      const drive = drives.find((d) => d.name === cleanName);
      if (!drive) return;
      const pathParts: string[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let cur: any = drive.node;
      while (cur && cur.name) {
        pathParts.unshift(cur.name);
        cur = cur.parent;
      }
      if (pathParts[0] === 'Scene' || pathParts[0] === '') pathParts.shift();
      const path = pathParts.join('/');
      viewer.highlightByPath(path, true);
      viewer.focusByPath(path);
    },
    [drives, viewer],
  );

  // Init ECharts — only once when opened, use ref for handleDriveClick
  const handleDriveClickRef = useRef(handleDriveClick);
  handleDriveClickRef.current = handleDriveClick;

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      if (!chartInstance.current && chartRef.current) {
        chartInstance.current = echarts.init(chartRef.current, undefined, { renderer: 'canvas' });
        // Click on a series line -> focus drive
        chartInstance.current.on('click', (params: unknown) => {
          const p = params as { seriesName?: string };
          if (p.seriesName) handleDriveClickRef.current(p.seriesName);
        });
        // Click on legend -> focus drive, but keep all series visible
        chartInstance.current.on('legendselectchanged', (params: unknown) => {
          const p = params as { name: string; selected: Record<string, boolean> };
          // Re-select all legends (prevent ECharts from toggling visibility)
          const allSelected: Record<string, boolean> = {};
          for (const key of Object.keys(p.selected)) allSelected[key] = true;
          chartInstance.current!.dispatchAction({ type: 'legendSelect', name: p.name });
          // Focus the clicked drive
          handleDriveClickRef.current(p.name);
        });
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [open]);

  // Dispose on close
  useEffect(() => {
    if (open) return;
    chartInstance.current?.dispose();
    chartInstance.current = null;
  }, [open]);

  // Resize chart on size/expand changes
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => chartInstance.current?.resize(), 30);
    return () => clearTimeout(timer);
  }, [open, size, expanded]);

  // Window resize
  useEffect(() => {
    if (!open) return;
    const onResize = () => chartInstance.current?.resize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open]);

  // Periodic data refresh — uses activeDrives (filtered or all)
  useEffect(() => {
    if (!open) return;

    const update = () => {
      const chart = chartInstance.current;
      if (!chart) return;
      const recorder = viewer.driveRecorder;
      if (recorder.timeBuffer.count === 0) return;

      // Only fetch the last N samples for the selected time period
      const samplesToShow = period * SAMPLE_RATE;
      const timeData = recorder.timeBuffer.lastN(samplesToShow);
      if (timeData.length === 0) return;

      // Build a set of active drive names for filtering
      const activeDriveNames = new Set(activeDrives.map((d) => d.name));

      const xData = timeData.map((t) => t.toFixed(1));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const series: any[] = [];
      const legendData: string[] = [];

      const dualAxis = mode === 'both';

      for (let i = 0; i < recorder.series.length; i++) {
        const s = recorder.series[i];
        const driveName = s.drive.name;

        // Skip drives not matching the filter
        if (!activeDriveNames.has(driveName)) continue;

        const color = PALETTE[i % PALETTE.length];
        const unit = s.drive.isRotary ? '\u00B0' : 'mm';

        if (mode === 'position' || mode === 'both') {
          const name = dualAxis ? `${driveName} (pos)` : driveName;
          legendData.push(name);
          series.push({
            type: 'line',
            name,
            yAxisIndex: 0,
            data: s.position.lastN(samplesToShow),
            symbol: 'none',
            lineStyle: { width: 1.5, color },
            itemStyle: { color },
            emphasis: { lineStyle: { width: 3 } },
            tooltip: { valueFormatter: (v: number) => `${v.toFixed(1)} ${unit}` },
          });
        }

        if (mode === 'speed' || mode === 'both') {
          const name = dualAxis ? `${driveName} (spd)` : driveName;
          legendData.push(name);
          series.push({
            type: 'line',
            name,
            yAxisIndex: dualAxis ? 1 : 0,
            data: s.speed.lastN(samplesToShow),
            symbol: 'none',
            lineStyle: { width: 1.5, color, type: dualAxis ? 'dashed' : 'solid' },
            itemStyle: { color },
            emphasis: { lineStyle: { width: 3 } },
            tooltip: { valueFormatter: (v: number) => `${v.toFixed(1)} ${unit}/s` },
          });
        }
      }

      const titleText = mode === 'position' ? 'Position' : mode === 'speed' ? 'Speed' : 'Position & Speed';
      const filterInfo = filter ? ` (filter: "${filter}")` : '';

      // Y-axis config: single axis for position-only or speed-only, dual for both
      const yAxisStyle = {
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
        axisLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const yAxis: any[] = dualAxis
        ? [
            {
              type: 'value',
              name: 'Position',
              nameTextStyle: { color: 'rgba(255,255,255,0.35)', fontSize: 10 },
              ...yAxisStyle,
            },
            {
              type: 'value',
              name: 'Speed',
              nameTextStyle: { color: 'rgba(255,255,255,0.35)', fontSize: 10 },
              ...yAxisStyle,
              splitLine: { show: false },
            },
          ]
        : [{ type: 'value', ...yAxisStyle }];

      chart.setOption(
        {
          backgroundColor: 'transparent',
          textStyle: { fontFamily: 'Inter, Roboto, Arial, sans-serif', color: 'rgba(255,255,255,0.7)' },
          title: {
            text: titleText + filterInfo,
            left: 8,
            top: 2,
            textStyle: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 500 },
          },
          legend: {
            data: legendData,
            bottom: 0,
            textStyle: { color: 'rgba(255,255,255,0.5)', fontSize: 10 },
            pageTextStyle: { color: 'rgba(255,255,255,0.5)' },
            pageIconColor: 'rgba(255,255,255,0.4)',
            pageIconInactiveColor: 'rgba(255,255,255,0.12)',
            type: 'scroll',
            itemWidth: 14,
            itemHeight: 8,
          },
          tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(10,10,10,0.92)',
            borderColor: 'rgba(255,255,255,0.06)',
            textStyle: { color: '#fff', fontSize: 11 },
            axisPointer: { lineStyle: { color: 'rgba(255,255,255,0.12)' } },
          },
          grid: { left: 50, right: dualAxis ? 50 : 12, top: 24, bottom: 42 },
          xAxis: {
            type: 'category',
            data: xData,
            axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
            axisLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 10 },
            splitLine: { show: false },
          },
          yAxis,
          series,
        },
        { notMerge: true, lazyUpdate: true },
      );
    };

    const initTimer = setTimeout(update, 100);
    const interval = setInterval(update, REFRESH_INTERVAL);
    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, [open, viewer, mode, period, filter, activeDrives]);

  if (!open) return null;

  const driveCount = filter ? `${activeDrives.length}/${drives.length} drives` : `${drives.length} drives`;

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
        zIndex: 1500,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 2,
        border: '1px solid rgba(255,255,255,0.08)',
        overflow: 'hidden',
        pointerEvents: 'auto',
        transition: expanded ? 'all 0.25s ease' : undefined,
      }}
    >
      {/* ── Draggable title bar ── */}
      <Box
        ref={dragRef}
        data-drag-handle="true"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1,
          py: 0.25,
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          flexShrink: 0,
          minHeight: 30,
          cursor: 'grab',
          userSelect: 'none',
          '&:active': { cursor: 'grabbing' },
        }}
      >
        <DragIndicator sx={{ fontSize: 14, color: 'rgba(255,255,255,0.2)' }} />
        <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#4fc3f7', letterSpacing: 0.3 }}>
          Drive Monitor
        </Typography>
        <Typography sx={{ fontSize: 10, color: filter ? '#ffa726' : 'rgba(255,255,255,0.3)' }}>
          {driveCount}
        </Typography>

        {/* Clear filter chip — only shown when filter is active */}
        {filter && (
          <Chip
            label="Clear Filter"
            size="small"
            icon={<FilterAltOff sx={{ fontSize: 12 }} />}
            onClick={() => setFilter('')}
            onDelete={() => setFilter('')}
            sx={{
              height: 20,
              fontSize: 10,
              color: '#ffa726',
              borderColor: 'rgba(255,167,38,0.3)',
              '& .MuiChip-icon': { color: '#ffa726', ml: 0.5 },
              '& .MuiChip-deleteIcon': { color: '#ffa726', fontSize: 14 },
            }}
            variant="outlined"
          />
        )}

        {/* Period selector */}
        <ToggleButtonGroup
          value={period}
          exclusive
          onChange={(_, v) => { if (v) setPeriod(v as TimePeriod); }}
          size="small"
          sx={{
            ml: 'auto',
            height: 22,
            '& .MuiToggleButtonGroup-grouped': {
              border: '1px solid rgba(255,255,255,0.1) !important',
            },
            '& .MuiToggleButton-root': {
              color: 'rgba(255,255,255,0.4)',
              bgcolor: 'transparent',
              borderColor: 'rgba(255,255,255,0.1)',
              fontSize: 10,
              lineHeight: 1,
              px: 0.6,
              py: 0,
              minWidth: 0,
              textTransform: 'none',
              '&.Mui-selected': {
                color: '#66bb6a',
                bgcolor: 'rgba(102,187,106,0.12)',
                borderColor: 'rgba(102,187,106,0.3) !important',
              },
              '&.Mui-selected:hover': {
                bgcolor: 'rgba(102,187,106,0.18)',
              },
              '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
            },
          }}
        >
          {PERIOD_OPTIONS.map((p) => (
            <ToggleButton key={p} value={p}>
              {p >= 60 ? `${p / 60}m` : `${p}s`}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {/* Mode toggle */}
        <ToggleButtonGroup
          value={mode}
          exclusive
          onChange={(_, v) => { if (v) setMode(v as ChartMode); }}
          size="small"
          sx={{
            height: 22,
            '& .MuiToggleButtonGroup-grouped': {
              border: '1px solid rgba(255,255,255,0.1) !important',
            },
            '& .MuiToggleButton-root': {
              color: 'rgba(255,255,255,0.4)',
              bgcolor: 'transparent',
              borderColor: 'rgba(255,255,255,0.1)',
              fontSize: 10,
              lineHeight: 1,
              px: 0.8,
              py: 0,
              minWidth: 0,
              textTransform: 'none',
              '&.Mui-selected': {
                color: '#4fc3f7',
                bgcolor: 'rgba(79,195,247,0.12)',
                borderColor: 'rgba(79,195,247,0.3) !important',
              },
              '&.Mui-selected:hover': {
                bgcolor: 'rgba(79,195,247,0.18)',
              },
              '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
            },
          }}
        >
          <ToggleButton value="position">Position</ToggleButton>
          <ToggleButton value="speed">Speed</ToggleButton>
          <ToggleButton value="both">Both</ToggleButton>
        </ToggleButtonGroup>

        <IconButton
          size="small"
          onClick={() => setExpanded((e) => !e)}
          sx={{ color: 'rgba(255,255,255,0.35)', p: 0.3, '&:hover': { color: '#fff' } }}
        >
          {expanded ? <UnfoldLess sx={{ fontSize: 16 }} /> : <UnfoldMore sx={{ fontSize: 16 }} />}
        </IconButton>

        <IconButton
          size="small"
          onClick={() => viewer.toggleDriveChart(false)}
          sx={{ color: 'rgba(255,255,255,0.35)', p: 0.3, '&:hover': { color: '#fff' } }}
        >
          <Close sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>

      {/* ── Chart area ── */}
      <Box ref={chartRef} sx={{ flex: 1, minHeight: 0 }} />

      {/* ── Resize handle (bottom-right corner) ── */}
      <Box
        ref={resizeRef}
        sx={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 16,
          height: 16,
          cursor: 'nwse-resize',
          '&::after': {
            content: '""',
            position: 'absolute',
            right: 3,
            bottom: 3,
            width: 8,
            height: 8,
            borderRight: '2px solid rgba(255,255,255,0.15)',
            borderBottom: '2px solid rgba(255,255,255,0.15)',
            borderRadius: '0 0 2px 0',
          },
        }}
      />
    </Paper>
  );
}
