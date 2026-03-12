/**
 * OeeChart — 24h stacked bar chart showing OEE breakdown by category.
 *
 * Categories (ISA-95): Production, Waiting, Blocked, Loading, Toolchange, Downtime.
 * Each 30-minute bucket sums to 100%.
 */

import { useRef, useEffect } from 'react';
import { Box } from '@mui/material';
import { echarts } from '../core/hmi/echarts-setup';
import { ChartPanel } from '../core/hmi/ChartPanel';
import { useKpiData } from '../hooks/use-kpi-data';

const CATEGORIES = [
  { key: 'production', name: 'Production', color: '#22c55e' },
  { key: 'waiting', name: 'Waiting', color: '#f59e0b' },
  { key: 'blocked', name: 'Blocked', color: '#f97316' },
  { key: 'loading', name: 'Loading', color: '#38bdf8' },
  { key: 'toolchange', name: 'Toolchange', color: '#06b6d4' },
  { key: 'downtime', name: 'Downtime', color: '#ef4444' },
] as const;

interface OeeChartProps {
  open: boolean;
  onClose: () => void;
}

export function OeeChart({ open, onClose }: OeeChartProps) {
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

      const data = kpi.oeeData;
      // Show only hourly labels (skip :30 buckets)
      const xLabels = data.map((d) => d.time);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const series: any[] = CATEGORIES.map((cat) => ({
        name: cat.name,
        type: 'bar',
        stack: 'oee',
        data: data.map((d) => d[cat.key]),
        itemStyle: { color: cat.color },
        emphasis: { itemStyle: { shadowBlur: 6, shadowColor: 'rgba(0,0,0,0.3)' } },
        barMaxWidth: 14,
      }));

      chart.setOption(
        {
          backgroundColor: 'transparent',
          textStyle: { fontFamily: 'Inter, Roboto, Arial, sans-serif', color: 'rgba(255,255,255,0.7)' },
          title: {
            text: 'OEE Breakdown — Last 24h',
            left: 8,
            top: 2,
            textStyle: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 500 },
          },
          legend: {
            data: CATEGORIES.map((c) => c.name),
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
              let html = `<b>${ps[0].axisValue}</b><br/>`;
              for (const p of ps) {
                html += `${p.marker} ${p.seriesName}: <b>${p.value.toFixed(1)}%</b><br/>`;
              }
              return html;
            },
          },
          grid: { left: 45, right: 12, top: 24, bottom: 42 },
          xAxis: {
            type: 'category',
            data: xLabels,
            axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
            axisLabel: {
              color: 'rgba(255,255,255,0.3)',
              fontSize: 10,
              interval: 1, // Show every other label (hourly)
            },
            splitLine: { show: false },
          },
          yAxis: {
            type: 'value',
            max: 100,
            axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
            axisLabel: {
              color: 'rgba(255,255,255,0.3)',
              fontSize: 10,
              formatter: '{value}%',
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
      title="OEE Breakdown"
      titleColor="#66bb6a"
      subtitle="Last 24h"
      defaultWidth={750}
      defaultHeight={340}
      zIndex={1400}
    >
      <Box ref={chartRef} sx={{ flex: 1, minHeight: 0 }} />
    </ChartPanel>
  );
}
