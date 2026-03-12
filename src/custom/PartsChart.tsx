/**
 * PartsChart — 24h bar chart showing parts per hour with target line and moving average.
 *
 * Bars are color-coded: green (>= target), amber (85-99%), red (< 85%).
 * Includes a dashed target markLine and a 3-hour moving average line.
 */

import { useRef, useEffect } from 'react';
import { Box } from '@mui/material';
import { echarts } from '../core/hmi/echarts-setup';
import { ChartPanel } from '../core/hmi/ChartPanel';
import { useKpiData } from '../hooks/use-kpi-data';
import { movingAverage } from '../core/hmi/kpi-utils';

interface PartsChartProps {
  open: boolean;
  onClose: () => void;
}

function barColor(value: number, target: number): string {
  const ratio = value / target;
  if (ratio >= 1) return '#22c55e';     // Green: at or above target
  if (ratio >= 0.85) return '#f59e0b';  // Amber: 85-99%
  return '#ef4444';                      // Red: below 85%
}

export function PartsChart({ open, onClose }: PartsChartProps) {
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

      const data = kpi.partsData;
      const target = kpi.partsTarget;
      const values = data.map((d) => d.parts);
      const ma = movingAverage(values, 3);

      chart.setOption(
        {
          backgroundColor: 'transparent',
          textStyle: { fontFamily: 'Inter, Roboto, Arial, sans-serif', color: 'rgba(255,255,255,0.7)' },
          title: {
            text: 'Parts per Hour — Last 24h',
            left: 8,
            top: 2,
            textStyle: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 500 },
          },
          legend: {
            data: ['Parts/h', '3h Average'],
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
          },
          grid: { left: 45, right: 12, top: 24, bottom: 42 },
          xAxis: {
            type: 'category',
            data: data.map((d) => d.hour),
            axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
            axisLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 10 },
            splitLine: { show: false },
          },
          yAxis: {
            type: 'value',
            axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
            axisLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 10 },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
          },
          series: [
            {
              name: 'Parts/h',
              type: 'bar',
              data: values.map((v) => ({
                value: v,
                itemStyle: { color: barColor(v, target) },
              })),
              barMaxWidth: 20,
              markLine: {
                silent: true,
                symbol: 'none',
                lineStyle: { type: 'dashed', color: '#60a5fa', width: 1.5 },
                label: {
                  formatter: `Target: ${target}`,
                  color: '#60a5fa',
                  fontSize: 10,
                },
                data: [{ yAxis: target }],
              },
            },
            {
              name: '3h Average',
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
      title="Parts per Hour"
      titleColor="#4fc3f7"
      subtitle="Last 24h"
      defaultWidth={700}
      defaultHeight={340}
      zIndex={1400}
    >
      <Box ref={chartRef} sx={{ flex: 1, minHeight: 0 }} />
    </ChartPanel>
  );
}
