/**
 * CycleTimeChart — Scatter + zone bands chart for the last 100 cycles.
 *
 * Shows individual cycle times as dots, colored by zone (green/amber/red).
 * Includes a takt time markLine and 10-cycle moving average.
 */

import { useRef, useEffect } from 'react';
import { Box } from '@mui/material';
import { echarts } from '../core/hmi/echarts-setup';
import { ChartPanel } from '../core/hmi/ChartPanel';
import { useKpiData } from '../hooks/use-kpi-data';
import { movingAverage } from '../core/hmi/kpi-utils';

interface CycleTimeChartProps {
  open: boolean;
  onClose: () => void;
}

function dotColor(ms: number, takt: number): string {
  const s = ms / 1000;
  const taktS = takt / 1000;
  if (s <= taktS * 1.05) return '#22c55e';    // Green: within ±5% of takt
  if (s <= taktS * 1.20) return '#f59e0b';    // Amber: +5% to +20%
  return '#ef4444';                             // Red: >+20%
}

export function CycleTimeChart({ open, onClose }: CycleTimeChartProps) {
  const kpi = useKpiData();
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      if (!chartInstance.current && chartRef.current) {
        chartInstance.current = echarts.init(chartRef.current, undefined, { renderer: 'canvas' });
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (open) return;
    chartInstance.current?.dispose();
    chartInstance.current = null;
  }, [open]);

  useEffect(() => {
    if (!open || !chartRef.current) return;
    const observer = new ResizeObserver(() => chartInstance.current?.resize());
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open || !kpi) return;
    const timer = setTimeout(() => {
      const chart = chartInstance.current;
      if (!chart) return;

      const data = kpi.cycleTimeData;
      const takt = kpi.taktTimeMs;
      const taktS = takt / 1000;
      const xData = data.map((_, i) => i + 1);
      const ma = movingAverage(data, 10);

      // Zone boundaries in seconds
      const greenUpper = taktS * 1.05;  // 31.5s
      const amberUpper = taktS * 1.20;  // 36s

      chart.setOption(
        {
          backgroundColor: 'transparent',
          textStyle: { fontFamily: 'Inter, Roboto, Arial, sans-serif', color: 'rgba(255,255,255,0.7)' },
          title: {
            text: 'Cycle Time — Last 100 Cycles',
            left: 8,
            top: 2,
            textStyle: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 500 },
          },
          legend: {
            data: ['Cycle Time', '10-Cycle Avg'],
            bottom: 0,
            textStyle: { color: 'rgba(255,255,255,0.5)', fontSize: 10 },
            itemWidth: 12,
            itemHeight: 8,
          },
          tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(10,10,10,0.92)',
            borderColor: 'rgba(255,255,255,0.06)',
            textStyle: { color: '#fff', fontSize: 11 },
            formatter: (params: unknown) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const ps = params as any[];
              if (!ps.length) return '';
              let html = `<b>Cycle #${ps[0].axisValue}</b><br/>`;
              for (const p of ps) {
                const v = typeof p.value === 'number' ? p.value : (p.value as number[])?.[1] ?? p.value;
                html += `${p.marker} ${p.seriesName}: <b>${(v / 1000).toFixed(1)}s</b><br/>`;
              }
              return html;
            },
          },
          grid: { left: 50, right: 12, top: 24, bottom: 42 },
          xAxis: {
            type: 'category',
            data: xData,
            axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
            axisLabel: {
              color: 'rgba(255,255,255,0.3)',
              fontSize: 10,
              interval: 9, // Show every 10th cycle
            },
            splitLine: { show: false },
          },
          yAxis: {
            type: 'value',
            axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
            axisLabel: {
              color: 'rgba(255,255,255,0.3)',
              fontSize: 10,
              formatter: (v: number) => `${(v / 1000).toFixed(0)}s`,
            },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
          },
          series: [
            // Zone bands (invisible lines with area fill)
            {
              name: '_greenZone',
              type: 'line',
              data: xData.map(() => greenUpper * 1000),
              symbol: 'none',
              lineStyle: { width: 0 },
              areaStyle: { color: 'rgba(34,197,94,0.06)', origin: taktS * 0.9 * 1000 },
              silent: true,
              z: 0,
            },
            {
              name: '_amberZone',
              type: 'line',
              data: xData.map(() => amberUpper * 1000),
              symbol: 'none',
              lineStyle: { width: 0 },
              areaStyle: { color: 'rgba(249,115,22,0.05)', origin: greenUpper * 1000 },
              silent: true,
              z: 0,
            },
            // Scatter dots
            {
              name: 'Cycle Time',
              type: 'scatter',
              data: data.map((v) => ({
                value: v,
                itemStyle: { color: dotColor(v, takt) },
              })),
              symbolSize: 5,
              markLine: {
                silent: true,
                symbol: 'none',
                lineStyle: { type: 'dashed', color: '#60a5fa', width: 1.5 },
                label: {
                  formatter: `Takt: ${taktS.toFixed(1)}s`,
                  color: '#60a5fa',
                  fontSize: 10,
                },
                data: [{ yAxis: takt }],
              },
            },
            // Moving average line
            {
              name: '10-Cycle Avg',
              type: 'line',
              data: ma.map((v) => Math.round(v)),
              smooth: true,
              symbol: 'none',
              lineStyle: { color: '#a78bfa', width: 2 },
              itemStyle: { color: '#a78bfa' },
            },
          ],
          animationDuration: 500,
          animationEasing: 'cubicOut',
        },
        { notMerge: true },
      );
    }, 100);
    return () => clearTimeout(timer);
  }, [open, kpi]);

  return (
    <ChartPanel
      open={open}
      onClose={onClose}
      title="Cycle Time"
      titleColor="#ffa726"
      subtitle="Last 100 Cycles"
      defaultWidth={700}
      defaultHeight={340}
      zIndex={1400}
    >
      <Box ref={chartRef} sx={{ flex: 1, minHeight: 0 }} />
    </ChartPanel>
  );
}
