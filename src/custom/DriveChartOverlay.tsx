/**
 * DriveChartOverlay — Floating panel with a real-time ECharts chart
 * showing drive positions and/or speeds.
 *
 * Uses ChartPanel for the reusable drag/resize/title-bar infrastructure.
 * Responds to drive filter events — only shows filtered drives.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Box, ToggleButtonGroup, ToggleButton, Chip } from '@mui/material';
import { FilterAltOff } from '@mui/icons-material';
import { echarts } from '../core/hmi/echarts-setup';
import { useViewer } from '../hooks/use-viewer';
import { useDriveChartOpen } from '../hooks/use-drive-chart';
import { useDrives } from '../hooks/use-drives';
import { useDriveFilter } from '../hooks/use-drive-filter';
import { BOTTOM_BAR_HEIGHT } from '../core/hmi/BottomBar';
import { ChartPanel } from '../core/hmi/ChartPanel';

const PALETTE = [
  '#4fc3f7', '#e94078', '#66bb6a', '#ffa726', '#ab47bc',
  '#26c6da', '#ef5350', '#ffee58', '#8d6e63', '#78909c',
  '#ec407a', '#7e57c2', '#29b6f6', '#9ccc65', '#ff7043',
  '#5c6bc0', '#26a69a', '#d4e157', '#f44336', '#42a5f5',
];

type ChartMode = 'position' | 'speed' | 'both';
type TimePeriod = 30 | 60 | 120 | 300;
const PERIOD_OPTIONS: TimePeriod[] = [30, 60, 120, 300];
const SAMPLE_RATE = 10;

const DEFAULT_W = 700;
const DEFAULT_H = 300;
const REFRESH_INTERVAL = 200;
const BOTTOM_MARGIN = BOTTOM_BAR_HEIGHT + 12;

// ─── Component ───────────────────────────────────────────────────────────

export function DriveChartOverlay() {
  const viewer = useViewer();
  const open = useDriveChartOpen();
  const drives = useDrives();
  const { filter, filteredDrives, setFilter } = useDriveFilter();

  const activeDrives = filter ? filteredDrives : drives;

  const [mode, setMode] = useState<ChartMode>('position');
  const [period, setPeriod] = useState<TimePeriod>(60);

  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

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

  // Init ECharts — only once when opened
  const handleDriveClickRef = useRef(handleDriveClick);
  handleDriveClickRef.current = handleDriveClick;

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      if (!chartInstance.current && chartRef.current) {
        chartInstance.current = echarts.init(chartRef.current, undefined, { renderer: 'canvas' });
        chartInstance.current.on('click', (params: unknown) => {
          const p = params as { seriesName?: string };
          if (p.seriesName) handleDriveClickRef.current(p.seriesName);
        });
        chartInstance.current.on('legendselectchanged', (params: unknown) => {
          const p = params as { name: string; selected: Record<string, boolean> };
          const allSelected: Record<string, boolean> = {};
          for (const key of Object.keys(p.selected)) allSelected[key] = true;
          chartInstance.current!.dispatchAction({ type: 'legendSelect', name: p.name });
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

  // Resize chart on size changes (ChartPanel handles expand via CSS transition)
  useEffect(() => {
    if (!open) return;
    const observer = chartRef.current
      ? new ResizeObserver(() => chartInstance.current?.resize())
      : null;
    if (chartRef.current && observer) observer.observe(chartRef.current);
    return () => observer?.disconnect();
  }, [open]);

  // Window resize
  useEffect(() => {
    if (!open) return;
    const onResize = () => chartInstance.current?.resize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open]);

  // Periodic data refresh
  useEffect(() => {
    if (!open) return;

    const update = () => {
      const chart = chartInstance.current;
      if (!chart) return;
      const recorder = viewer.driveRecorder;
      if (recorder.timeBuffer.count === 0) return;

      const samplesToShow = period * SAMPLE_RATE;
      const timeData = recorder.timeBuffer.lastN(samplesToShow);
      if (timeData.length === 0) return;

      const activeDriveNames = new Set(activeDrives.map((d) => d.name));

      const xData = timeData.map((t) => t.toFixed(1));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const series: any[] = [];
      const legendData: string[] = [];

      const dualAxis = mode === 'both';

      for (let i = 0; i < recorder.series.length; i++) {
        const s = recorder.series[i];
        const driveName = s.drive.name;
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

  const driveCount = filter ? `${activeDrives.length}/${drives.length} drives` : `${drives.length} drives`;

  const toolbar = (
    <>
      {/* Clear filter chip */}
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
    </>
  );

  return (
    <ChartPanel
      open={open}
      onClose={() => viewer.toggleDriveChart(false)}
      title="Drive Monitor"
      titleColor="#4fc3f7"
      subtitle={driveCount}
      defaultWidth={DEFAULT_W}
      defaultHeight={DEFAULT_H}
      defaultPosition={{ x: 64, y: window.innerHeight - DEFAULT_H - BOTTOM_MARGIN }}
      zIndex={1500}
      toolbar={toolbar}
    >
      <Box ref={chartRef} sx={{ flex: 1, minHeight: 0 }} />
    </ChartPanel>
  );
}
