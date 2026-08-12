// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import React, { useState, useEffect, useRef } from 'react';
import { 
  Box, Paper, Typography, IconButton, Tooltip, 
  LinearProgress, Grid, Divider, useTheme, Zoom
} from '@mui/material';
import { 
  ShieldAlert, Settings, Activity, Thermometer, 
  BarChart3, X
} from 'lucide-react';
import type { RVViewerPlugin } from '../core/rv-plugin';
import type { RVViewer } from '../core/rv-viewer';
import type { UISlotEntry, UISlotProps } from '../core/rv-ui-plugin';
import type { LoadResult } from '../core/engine/rv-scene-loader';
import { echarts } from '../core/hmi/echarts-setup';

/**
 * MaintenanceInsightDashboard Component
 * A premium, glassmorphic dashboard for prognostics data.
 */
const MaintenanceInsightDashboard: React.FC<UISlotProps> = ({ viewer }) => {
  const [open, setOpen] = useState(false);
  const [healthScore, setHealthScore] = useState(94);
  const chartRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();

  useEffect(() => {
    if (open && chartRef.current) {
      const chart = echarts.init(chartRef.current, 'dark');
      const option = {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        grid: { left: '3%', right: '4%', bottom: '3%', top: '15%', containLabel: true },
        xAxis: { type: 'category', boundaryGap: false, data: ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'] },
        yAxis: { type: 'value', min: 80, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
        series: [{
          name: 'Health %',
          type: 'line',
          smooth: true,
          data: [98, 97, 95, 96, 94, 95, 94],
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(32, 161, 177, 0.5)' },
              { offset: 1, color: 'rgba(32, 161, 177, 0)' }
            ])
          },
          lineStyle: { color: '#3FB8C4', width: 3 },
          itemStyle: { color: '#3FB8C4' }
        }]
      };
      chart.setOption(option);
      return () => chart.dispose();
    }
  }, [open]);

  // Sync health score changes
  useEffect(() => {
    const timer = setInterval(() => {
      setHealthScore(prev => Math.max(0, Math.min(100, prev + (Math.random() - 0.52))));
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  if (!open) {
    return (
      <Tooltip title="Maintenance Insights">
        <IconButton 
          onClick={() => setOpen(true)}
          sx={{ 
            bgcolor: 'rgba(0,0,0,0.3)', 
            border: '1px solid rgba(255,255,255,0.1)',
            '&:hover': { bgcolor: 'rgba(32, 161, 177, 0.2)' }
          }}
        >
          <Activity size={20} color="#3FB8C4" />
        </IconButton>
      </Tooltip>
    );
  }

  return (
    <Zoom in={open}>
      <Paper
        className="glass"
        sx={{
          width: 400,
          p: 0,
          overflow: 'hidden',
          position: 'relative',
          borderTop: '2px solid #3FB8C4'
        }}
      >
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Activity size={18} color="#3FB8C4" />
            <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600 }}>System Prognostics</Typography>
          </Box>
          <IconButton size="small" onClick={() => setOpen(false)} sx={{ color: 'rgba(255,255,255,0.5)' }}>
            <X size={16} />
          </IconButton>
        </Box>

        <Box sx={{ px: 2, pb: 2 }}>
          <Grid container spacing={2}>
            <Grid size={6}>
              <Box sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 1 }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>MTBF Prediction</Typography>
                <Typography variant="h5" sx={{ color: '#3FB8C4', fontWeight: 700 }}>4,120h</Typography>
              </Box>
            </Grid>
            <Grid size={6}>
              <Box sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 1 }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>System Health</Typography>
                <Typography variant="h5" sx={{ color: healthScore > 90 ? '#5FB37A' : '#D9A441', fontWeight: 700 }}>{healthScore.toFixed(0)}%</Typography>
              </Box>
            </Grid>
          </Grid>

          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption">Resource Utilization</Typography>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>82%</Typography>
            </Box>
            <LinearProgress variant="determinate" value={82} sx={{ height: 4, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.1)', '& .MuiLinearProgress-bar': { bgcolor: '#3FB8C4' } }} />
          </Box>

          <Box sx={{ mt: 3, height: 180 }} ref={chartRef} />

          <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.05)' }} />
          
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <ShieldAlert size={14} color="#D9A441" />
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>Recommendation: Inspect Robot_42 joints in 12h.</Typography>
          </Box>
        </Box>
      </Paper>
    </Zoom>
  );
};

export class MaintenanceInsightPlugin implements RVViewerPlugin {
  readonly id = 'maintenance-insight';
  readonly order = 500;
  readonly slots: UISlotEntry[] = [
    {
      slot: 'views',
      order: 10,
      component: MaintenanceInsightDashboard,
    }
  ];

  private _viewer: RVViewer | null = null;

  onModelLoaded(_result: LoadResult, viewer: RVViewer): void {
    this._viewer = viewer;
  }
}
