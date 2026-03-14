/**
 * SensorChartOverlay — Floating panel with a real-time ECharts step chart
 * showing sensor occupied/vacant states as high/low timelines.
 *
 * Uses ChartPanel for the reusable drag/resize/title-bar infrastructure.
 * Each sensor is displayed as a separate step-line series (0 = vacant, 1 = occupied).
 * Sensors are stacked vertically with offsets so they don't overlap.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Box, ToggleButtonGroup, ToggleButton } from '@mui/material';
import { echarts } from '../core/hmi/echarts-setup';
import { useViewer } from '../hooks/use-viewer';
import { useSensorChartOpen } from '../hooks/use-sensor-chart';
import { BOTTOM_BAR_HEIGHT } from '../core/hmi/BottomBar';
import { ChartPanel } from '../core/hmi/ChartPanel';
import { SensorRecorderPlugin } from '../plugins/sensor-recorder-plugin';

const PALETTE = [
  '#66bb6a', '#4fc3f7', '#ffa726', '#ef5350', '#ab47bc',
  '#26c6da', '#e94078', '#ffee58', '#8d6e63', '#78909c',
  '#ec407a', '#7e57c2', '#29b6f6', '#9ccc65', '#ff7043',
  '#5c6bc0', '#26a69a', '#d4e157', '#f44336', '#42a5f5',
];

type TimePeriod = 30 | 60 | 120 | 300;
const PERIOD_OPTIONS: TimePeriod[] = [30, 60, 120, 300];
const SAMPLE_RATE = 10;

const DEFAULT_W = 700;
const DEFAULT_H = 340;
const REFRESH_INTERVAL = 200;
const BOTTOM_MARGIN = BOTTOM_BAR_HEIGHT + 12;

/** Vertical spacing between stacked sensors. */
const SENSOR_SPACING = 1.5;

// ─── Component ───────────────────────────────────────────────────────────

function ensureSensorRecorder(viewer: ReturnType<typeof useViewer>) {
  let plugin = viewer.getPlugin<SensorRecorderPlugin>('sensor-recorder');
  if (!plugin) {
    plugin = new SensorRecorderPlugin();
    viewer.use(plugin);
  }
  return plugin;
}

export function SensorChartOverlay() {
  const viewer = useViewer();
  const open = useSensorChartOpen();

  const [period, setPeriod] = useState<TimePeriod>(60);

  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  // Short display name from full path
  const shortName = useCallback((path: string) => {
    const parts = path.split('/');
    return parts[parts.length - 1];
  }, []);

  // Handle clicking a series -> highlight + focus sensor
  const handleSensorClick = useCallback(
    (seriesName: string) => {
      const sensors = viewer.transportManager?.sensors ?? [];
      const recorder = ensureSensorRecorder(viewer).recorder;
      const s = recorder.series.find((ts) => shortName(ts.path) === seriesName);
      if (!s) return;
      const sensor = sensors.find((sen) => sen === s.sensor);
      if (!sensor) return;
      const pathParts: string[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let cur: any = sensor.node;
      while (cur && cur.name) {
        pathParts.unshift(cur.name);
        cur = cur.parent;
      }
      if (pathParts[0] === 'Scene' || pathParts[0] === '') pathParts.shift();
      const path = pathParts.join('/');
      viewer.highlightByPath(path, true);
      viewer.focusByPath(path);
    },
    [viewer, shortName],
  );

  // Init ECharts — only once when opened
  const handleClickRef = useRef(handleSensorClick);
  handleClickRef.current = handleSensorClick;

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      if (!chartInstance.current && chartRef.current) {
        chartInstance.current = echarts.init(chartRef.current, undefined, { renderer: 'canvas' });
        chartInstance.current.on('click', (params: unknown) => {
          const p = params as { seriesName?: string };
          if (p.seriesName) handleClickRef.current(p.seriesName);
        });
        chartInstance.current.on('legendselectchanged', (params: unknown) => {
          const p = params as { name: string; selected: Record<string, boolean> };
          // Re-select (don't hide — just focus)
          chartInstance.current!.dispatchAction({ type: 'legendSelect', name: p.name });
          handleClickRef.current(p.name);
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

  // Resize chart
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
      const recorder = ensureSensorRecorder(viewer).recorder;
      if (recorder.timeBuffer.count === 0) return;

      const samplesToShow = period * SAMPLE_RATE;
      const timeData = recorder.timeBuffer.lastN(samplesToShow);
      if (timeData.length === 0) return;

      const xData = timeData.map((t) => t.toFixed(1));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const series: any[] = [];
      const legendData: string[] = [];
      const sensorCount = recorder.series.length;

      for (let i = 0; i < sensorCount; i++) {
        const s = recorder.series[i];
        const name = shortName(s.path);
        const color = PALETTE[i % PALETTE.length];
        const offset = (sensorCount - 1 - i) * SENSOR_SPACING;

        legendData.push(name);

        // Step chart: each sensor gets offset vertically
        const rawData = s.state.lastN(samplesToShow);
        const offsetData = rawData.map((v) => v + offset);

        series.push({
          type: 'line',
          name,
          step: 'end',
          data: offsetData,
          symbol: 'none',
          lineStyle: { width: 2, color },
          itemStyle: { color },
          areaStyle: {
            color,
            opacity: 0.08,
            origin: offset,
          },
          emphasis: { lineStyle: { width: 3 } },
          tooltip: {
            valueFormatter: (v: number) => {
              const state = (v - offset) > 0.5 ? 'OCCUPIED' : 'vacant';
              return state;
            },
          },
        });
      }

      // Y-axis labels: sensor names at their offset positions
      const yAxisLabels: { value: number; label: string }[] = [];
      for (let i = 0; i < sensorCount; i++) {
        const offset = (sensorCount - 1 - i) * SENSOR_SPACING;
        yAxisLabels.push({ value: offset + 0.5, label: shortName(recorder.series[i].path) });
      }

      chart.setOption(
        {
          backgroundColor: 'transparent',
          textStyle: { fontFamily: 'Inter, Roboto, Arial, sans-serif', color: 'rgba(255,255,255,0.7)' },
          title: {
            text: 'Sensor Timeline',
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
          grid: { left: 12, right: 12, top: 24, bottom: 42 },
          xAxis: {
            type: 'category',
            data: xData,
            axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
            axisLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 10 },
            splitLine: { show: false },
          },
          yAxis: {
            type: 'value',
            min: -0.2,
            max: Math.max(1.5, (sensorCount - 1) * SENSOR_SPACING + 1.3),
            axisLine: { show: false },
            axisLabel: { show: false },
            splitLine: { show: false },
          },
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
  }, [open, viewer, period, shortName]);

  const sensorCount = ensureSensorRecorder(viewer).recorder.series.length;

  const toolbar = (
    <>
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
    </>
  );

  return (
    <ChartPanel
      open={open}
      onClose={() => viewer.toggleSensorChart(false)}
      title="Sensor Monitor"
      titleColor="#66bb6a"
      subtitle={`${sensorCount} sensors`}
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
