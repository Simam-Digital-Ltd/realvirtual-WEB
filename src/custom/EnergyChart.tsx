/**
 * EnergyChart — 24h stacked area chart showing power consumption by component.
 *
 * Components: Spindle, Coolant, Hydraulics, Robot, Conveyor Entry, Conveyor Exit, Auxiliary.
 * Typical values for a CNC machine tool cell (~18-25 kW peak).
 */

import { useRef, useEffect } from 'react';
import { Box } from '@mui/material';
import { echarts } from '../core/hmi/echarts-setup';
import { ChartPanel } from '../core/hmi/ChartPanel';
import { useKpiData } from '../hooks/use-kpi-data';

const COMPONENTS = [
  { key: 'spindle', name: 'Spindle', color: '#ef4444' },
  { key: 'coolant', name: 'Coolant', color: '#38bdf8' },
  { key: 'hydraulics', name: 'Hydraulics', color: '#f59e0b' },
  { key: 'robot', name: 'Robot', color: '#a78bfa' },
  { key: 'conveyorEntry', name: 'Conv. Entry', color: '#22c55e' },
  { key: 'conveyorExit', name: 'Conv. Exit', color: '#06b6d4' },
  { key: 'auxiliary', name: 'Auxiliary', color: '#94a3b8' },
] as const;

interface EnergyChartProps {
  open: boolean;
  onClose: () => void;
}

export function EnergyChart({ open, onClose }: EnergyChartProps) {
  const kpi = useKpiData();
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  // Init chart
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      if (!chartInstance.current && chartRef.current) {
        chartInstance.current = echarts.init(chartRef.current, undefined, { renderer: 'canvas' });
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

  // Resize
  useEffect(() => {
    if (!open || !chartRef.current) return;
    const observer = new ResizeObserver(() => chartInstance.current?.resize());
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, [open]);

  // Set chart data
  useEffect(() => {
    if (!open || !kpi) return;
    const timer = setTimeout(() => {
      const chart = chartInstance.current;
      if (!chart) return;

      const data = kpi.energyData;
      const xLabels = data.map((d) => d.time);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const series: any[] = COMPONENTS.map((comp) => ({
        name: comp.name,
        type: 'line',
        stack: 'power',
        areaStyle: { opacity: 0.6 },
        data: data.map((d) => d[comp.key]),
        itemStyle: { color: comp.color },
        lineStyle: { width: 1 },
        symbol: 'none',
        emphasis: { focus: 'series' },
      }));

      chart.setOption(
        {
          backgroundColor: 'transparent',
          textStyle: { fontFamily: 'Inter, Roboto, Arial, sans-serif', color: 'rgba(255,255,255,0.7)' },
          title: {
            text: 'Power Consumption — Last 24h',
            left: 8,
            top: 2,
            textStyle: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 500 },
          },
          legend: {
            data: COMPONENTS.map((c) => c.name),
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
              let total = 0;
              let html = `<b>${ps[0].axisValue}</b><br/>`;
              for (const p of ps) {
                const v = p.value as number;
                total += v;
                html += `${p.marker} ${p.seriesName}: <b>${v.toFixed(1)} kW</b><br/>`;
              }
              html += `<br/><b>Total: ${total.toFixed(1)} kW</b>`;
              return html;
            },
          },
          grid: { left: 50, right: 12, top: 24, bottom: 42 },
          xAxis: {
            type: 'category',
            data: xLabels,
            boundaryGap: false,
            axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
            axisLabel: {
              color: 'rgba(255,255,255,0.3)',
              fontSize: 10,
              interval: 1,
            },
            splitLine: { show: false },
          },
          yAxis: {
            type: 'value',
            axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
            axisLabel: {
              color: 'rgba(255,255,255,0.3)',
              fontSize: 10,
              formatter: '{value} kW',
            },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
          },
          series,
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
      title="Power Consumption"
      titleColor="#ef5350"
      subtitle="Last 24h"
      defaultWidth={750}
      defaultHeight={360}
      zIndex={1400}
    >
      <Box ref={chartRef} sx={{ flex: 1, minHeight: 0 }} />
    </ChartPanel>
  );
}
