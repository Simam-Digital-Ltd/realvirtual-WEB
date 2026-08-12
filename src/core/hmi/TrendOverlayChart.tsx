// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { useEffect, useRef, useState } from 'react';
import { Box, Typography, IconButton, Paper, CircularProgress } from '@mui/material';
import { Close, Timeline } from '@mui/icons-material';
import { echarts } from './echarts-setup';
import { DataConnectService } from '../dataconnect-service';
import { useTrendOverlay, closeTrendOverlay } from './trend-overlay-store';

export function TrendOverlayChart() {
  const robotId = useTrendOverlay();
  const chartRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!robotId) {
      setData([]);
      return;
    }
    setLoading(true);
    DataConnectService.get7DayTrendData(robotId).then(fetched => {
      setData(fetched || []);
      setLoading(false);
    }).catch(e => {
      console.error(e);
      setLoading(false);
    });
  }, [robotId]);

  useEffect(() => {
    if (!chartRef.current || data.length === 0 || !robotId) return;
    
    const chart = echarts.init(chartRef.current);
    
    const option = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        textStyle: { color: '#000' }
      },
      legend: {
        data: ['Temperature', 'Vibration', 'OEE Score'],
        textStyle: { color: 'rgba(255,255,255,0.8)' },
        top: 10
      },
      grid: {
        left: '10%',
        right: '5%',
        bottom: '15%',
        top: '25%'
      },
      xAxis: {
        type: 'category',
        data: data.map(d => {
          const date = new Date(d.timestamp);
          return `${date.getMonth()+1}/${date.getDate()}`;
        }),
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.3)' } },
        axisLabel: { color: 'rgba(255,255,255,0.6)' }
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
        axisLabel: { color: 'rgba(255,255,255,0.6)' }
      },
      series: [
        {
          name: 'Temperature',
          type: 'line',
          smooth: true,
          data: data.map(d => d.temperature),
          itemStyle: { color: '#D9534F' }
        },
        {
          name: 'Vibration',
          type: 'line',
          smooth: true,
          data: data.map(d => d.vibration),
          itemStyle: { color: '#D9A441' }
        },
        {
          name: 'OEE Score',
          type: 'line',
          smooth: true,
          data: data.map(d => d.oeeScore),
          itemStyle: { color: '#5FB37A' }
        }
      ]
    };

    chart.setOption(option);

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
    };
  }, [data, robotId]);

  if (!robotId) return null;

  return (
    <Paper elevation={8} sx={{
      position: 'absolute',
      bottom: 80,
      right: 20,
      width: 450,
      height: 320,
      bgcolor: 'rgba(20, 20, 20, 0.95)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255,255,255,0.15)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 2000,
      borderRadius: 2
    }}>
      <Box sx={{ p: 1.5, borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Timeline sx={{ color: '#5FB37A', fontSize: 20 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>7-Day Diagnostic Trend</Typography>
        </Box>
        <IconButton size="small" onClick={closeTrendOverlay} sx={{ color: 'text.secondary' }}>
          <Close sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, position: 'relative', p: 1 }}>
        {loading && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CircularProgress size={24} sx={{ color: '#5FB37A' }} />
          </Box>
        )}
        <Box ref={chartRef} sx={{ width: '100%', height: '100%' }} />
      </Box>
    </Paper>
  );
}
