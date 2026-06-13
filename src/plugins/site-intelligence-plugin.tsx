// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  IconButton,
  Collapse,
  Tooltip,
  LinearProgress,
  Stack,
  Divider,
  Fade,
  Badge
} from '@mui/material';
import {
  BarChart,
  Warning,
  CheckCircle,
  Group,
  ElectricBolt,
  Traffic,
  Security,
  Close,
  ChevronRight,
  ChevronLeft,
  ExpandMore,
  ExpandLess,
  NotificationsActive,
  Sensors,
  WbSunny,
  Timeline,
  Thunderstorm
} from '@mui/icons-material';
import { Slider } from '@mui/material';
import type { RVViewerPlugin } from '../core/rv-plugin';
import type { UISlotEntry } from '../core/rv-ui-plugin';
import type { RVViewer } from '../core/rv-viewer';
import type { LoadResult } from '../core/engine/rv-scene-loader';
import { GeospatialService, type SiteMetrics, type SiteCondition, type TrafficStatus, type OperationalIntelligence, type ForecastItem } from '../core/geospatial-service';
import { SiteManagerPlugin } from './site-manager-plugin';
import { Chip } from '@mui/material';
import {
  AccessTime,
  Factory,
  HealthAndSafety,
  TrendingUp,
  WaterDrop,
  Air,
  LocationOn
} from '@mui/icons-material';

/**
 * SiteIntelligencePlugin
 * Provides real-time industrial intelligence overlays for the OSM map view.
 * Simulates a "Command & Control" center for the industrial site.
 */
export class SiteIntelligencePlugin implements RVViewerPlugin {
  readonly id = 'site-intelligence';
  readonly order = 150;

  private viewer: RVViewer | null = null;

  // React component for the plugin slots
  slots: UISlotEntry[] = [
    {
      slot: 'overlay',
      component: () => <SiteStatsPanel plugin={this} />
    }
  ];

  onModelLoaded(result: LoadResult, viewer: RVViewer): void {
    this.viewer = viewer;
  }

  public setDaytime(hour: number): void {
    const mapPlugin = this.viewer?.getPlugin('osm-map') as unknown as { setDaytime?: (h: number) => void } | undefined;
    mapPlugin?.setDaytime?.(hour);
  }

  public isMapActive(): boolean {
    const mapPlugin = this.viewer?.getPlugin('osm-map') as unknown as { active?: boolean } | undefined;
    return !!mapPlugin?.active;
  }

  public getSiteManager(): SiteManagerPlugin | null {
    return this.viewer?.getPlugin<SiteManagerPlugin>('site-manager') || null;
  }
}

function SiteStatsPanel({ plugin }: { plugin: SiteIntelligencePlugin }) {
  const [metrics, setMetrics] = useState<SiteMetrics | null>(null);
  const [condition, setCondition] = useState<SiteCondition | null>(null);
  const [traffic, setTraffic] = useState<TrafficStatus | null>(null);
  const [opIntel, setOpIntel] = useState<OperationalIntelligence | null>(null);
  const [forecast, setForecast] = useState<ForecastItem[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [hour, setHour] = useState(new Date().getHours());
  const [alerts, setAlerts] = useState<string[]>([
    'Logistics Hub A1: Expected arrival T-102 in 12m',
    'Security Alert: Unauthorized perimeter access detected (Zone 4)',
    'Personnel Update: Shift change in progress (14:00)',
    'Weather Warning: High winds expected in 2 hours'
  ]);
  const [visible, setVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'personnel' | 'logistics'>('overview');
  const [logistics, setLogistics] = useState<any[]>([]);

  // Sync visibility with site selection
  useEffect(() => {
    const checkVisibility = () => {
      const siteManager = plugin.getSiteManager();
      setVisible(!!siteManager?.currentSite);
    };
    checkVisibility();
    const interval = setInterval(checkVisibility, 1000);
    return () => clearInterval(interval);
  }, [plugin]);

  useEffect(() => {
    if (!visible) return;

    const update = async () => {
      const [m, c, t, oi, f] = await Promise.all([
        GeospatialService.fetchSiteMetrics(),
        GeospatialService.fetchSiteCondition(null),
        GeospatialService.fetchTrafficStatus(53.71, -1.48),
        GeospatialService.fetchOperationalIntelligence(),
        GeospatialService.fetchWeatherForecast(53.71, -1.48)
      ]);
      setMetrics(m);
      setCondition(c);
      setTraffic(t);
      setOpIntel(oi);
      setForecast(f);
      
      // Update mock logistics
      setLogistics([
        { id: 'TRUCK-X1', driver: 'M. Ross', eta: '14:20', rounds: 4, dest: 'Dock B', loadPct: 65, shift: 'AM' },
        { id: 'VAN-G22', driver: 'T. Vance', eta: '14:05', rounds: 8, dest: 'Main Gate', loadPct: 40, shift: 'AM' }
      ]);
    };

    update();
    const timer = setInterval(update, 5000);
    return () => clearInterval(timer);
  }, [visible]);

  const handleHourChange = (_: any, value: number | number[]) => {
    const v = value as number;
    setHour(v);
    plugin.setDaytime(v);
  };

  if (!visible) return null;

  const statusColor = condition?.status === 'Optimal' ? '#81c784' : (condition?.status === 'Caution' ? '#ffd54f' : '#e57373');

  return (
    <Fade in={visible}>
      <Box sx={{
        position: 'absolute',
        top: 80,
        right: 24,
        width: 340,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        pointerEvents: 'auto',
        zIndex: 1100,
        maxHeight: 'calc(100vh - 120px)',
        overflowY: 'auto',
        pb: 4,
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' }
      }}>
        {/* Main Status Card */}
        <Paper elevation={6} sx={{
          background: 'rgba(13, 15, 20, 0.9)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '24px',
          overflow: 'hidden',
          p: 0,
          boxShadow: '0 30px 60px rgba(0,0,0,0.8)'
        }}>
          <Box sx={{
            p: 2,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(255, 255, 255, 0.03)'
          }}>
            <Box>
              <Typography variant="overline" sx={{ color: '#20a1b1', fontWeight: 900, letterSpacing: 2, display: 'block', lineHeight: 1, fontSize: 10 }}>
                SIMAM INTELLIGENCE
              </Typography>
              <Typography variant="h6" sx={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>
                WAKEFIELD COMMAND
              </Typography>
            </Box>
            <IconButton size="small" onClick={() => setCollapsed(!collapsed)} sx={{ color: 'rgba(255,255,255,0.7)' }}>
              {collapsed ? <ExpandMore /> : <ExpandLess />}
            </IconButton>
          </Box>

          <Collapse in={!collapsed}>
            {/* Tabs */}
            <Box sx={{ px: 2, pb: 1, display: 'flex', gap: 1 }}>
              {['overview', 'personnel', 'logistics'].map((t) => (
                <Chip
                  key={t}
                  label={t.toUpperCase()}
                  size="small"
                  onClick={() => setActiveTab(t as any)}
                  sx={{
                    fontSize: 9, fontWeight: 800,
                    bgcolor: activeTab === t ? 'rgba(32, 161, 177, 0.3)' : 'transparent',
                    color: activeTab === t ? '#20a1b1' : 'rgba(255,255,255,0.4)',
                    border: '1px solid',
                    borderColor: activeTab === t ? '#20a1b1' : 'rgba(255,255,255,0.1)',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' }
                  }}
                />
              ))}
            </Box>

            <Box sx={{ p: 2, pt: 1 }}>
              {activeTab === 'overview' && (
                <Stack spacing={2.5}>
                  {/* Site Condition */}
                  <Box sx={{
                    p: 1.5,
                    borderRadius: 3,
                    background: 'rgba(32, 161, 177, 0.08)',
                    border: '1px solid rgba(32, 161, 177, 0.2)',
                    display: 'flex', gap: 1.5, alignItems: 'flex-start'
                  }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: statusColor, boxShadow: `0 0 10px ${statusColor}`, mt: 0.75 }} />
                    <Box>
                      <Typography sx={{ color: '#fff', fontSize: 13, fontWeight: 800 }}>{condition?.label || 'Initializing...'}</Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.4, display: 'block' }}>{condition?.notes}</Typography>
                    </Box>
                  </Box>

                  {/* Shift Progress Strip */}
                  <Box sx={{
                    p: 1.5, borderRadius: 3,
                    bgcolor: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.05)'
                  }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, alignItems: 'center' }}>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <AccessTime sx={{ fontSize: 14, color: '#20a1b1' }} />
                        <Typography variant="caption" sx={{ color: '#fff', fontWeight: 800, fontSize: 10 }}>{opIntel?.shiftName.toUpperCase()} SHIFT</Typography>
                      </Box>
                      <Typography variant="caption" sx={{ color: '#20a1b1', fontWeight: 900, fontSize: 10 }}>{opIntel?.shiftProgress}%</Typography>
                    </Box>
                    <LinearProgress 
                      variant="determinate" 
                      value={opIntel?.shiftProgress || 0} 
                      sx={{ 
                        height: 6, borderRadius: 3, 
                        bgcolor: 'rgba(32, 161, 177, 0.1)',
                        '& .MuiLinearProgress-bar': { bgcolor: '#20a1b1', borderRadius: 3 }
                      }} 
                    />
                  </Box>

                  {/* Metrics Grid */}
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                    <MetricCard
                      icon={<Group sx={{ fontSize: 18 }} />}
                      label="PERSONNEL"
                      value={metrics?.workerCount || 0}
                      sub="LIVE ON-SITE"
                      color="#00e676"
                      trend={[30, 45, 35, 55, 60, 40, 50]}
                    />
                    <MetricCard
                      icon={<Factory sx={{ fontSize: 18 }} />}
                      label="THROUGHPUT"
                      value={metrics?.throughput || 0}
                      sub="UNITS / HR"
                      color="#4fc3f7"
                      trend={[1100, 1150, 1200, 1250, 1180, 1220, 1280]}
                    />
                  </Box>

                  {/* Safety & Intelligence Badges */}
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Box sx={{ flex: 1, p: 1.2, borderRadius: 2, bgcolor: 'rgba(129, 199, 132, 0.1)', border: '1px solid rgba(129, 199, 132, 0.2)', display: 'flex', alignItems: 'center', gap: 1 }}>
                      <HealthAndSafety sx={{ color: '#81c784', fontSize: 16 }} />
                      <Box>
                        <Typography sx={{ color: '#81c784', fontSize: 9, fontWeight: 900, lineHeight: 1 }}>SAFETY MILESTONE</Typography>
                        <Typography sx={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>{opIntel?.safetyMilestone}</Typography>
                      </Box>
                    </Box>
                  </Box>

                  {/* Weather Forecast Strip */}
                  <Box sx={{ pt: 1 }}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800, fontSize: 9, mb: 1, display: 'block' }}>6-HOUR FORECAST</Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', bgcolor: 'rgba(255,255,255,0.02)', p: 1, borderRadius: 2 }}>
                      {forecast.slice(0, 5).map((f, i) => (
                        <Box key={i} sx={{ textAlign: 'center', minWidth: 45 }}>
                          <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 8, fontWeight: 700 }}>{f.time}</Typography>
                          <Box sx={{ my: 0.5 }}>
                            {f.condition.includes('Rain') ? <WaterDrop sx={{ fontSize: 14, color: '#4fc3f7' }} /> : <WbSunny sx={{ fontSize: 14, color: '#ffd54f' }} />}
                          </Box>
                          <Typography sx={{ color: '#fff', fontSize: 10, fontWeight: 900 }}>{Math.round(f.temp)}°</Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>

                  {/* Shadow Engine Control */}
                  <Box sx={{ px: 0.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700, fontSize: 9, letterSpacing: 1 }}>SHADOW ENGINE (LIVE)</Typography>
                      <Typography variant="caption" sx={{ fontWeight: 800, fontSize: 10, color: '#20a1b1' }}>{hour}:00</Typography>
                    </Box>
                    <Slider
                      value={hour} min={0} max={23} step={1}
                      onChange={handleHourChange}
                      sx={{
                        color: '#20a1b1', height: 4, py: 1,
                        '& .MuiSlider-thumb': { width: 14, height: 14, border: '2px solid #fff' },
                        '& .MuiSlider-rail': { opacity: 0.1 }
                      }}
                    />
                  </Box>
                </Stack>
              )}

              {activeTab === 'personnel' && (
                <Stack spacing={1.5}>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, fontSize: 9, letterSpacing: 1 }}>ACTIVE SITE PERSONNEL</Typography>
                  {[
                    { name: 'John Doe', role: 'Lead Technician', zone: 'Sector A', status: 'Active' },
                    { name: 'Jane Smith', role: 'Floor Operator', zone: 'Docking 4', status: 'Active' },
                    { name: 'Sarah Connor', role: 'Safety Engineer', zone: 'Storage B', status: 'Maintenance' },
                    { name: 'David Miller', role: 'Security Ops', zone: 'Perimeter', status: 'Patrol' }
                  ].map((p, i) => (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                        <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: 'rgba(32, 161, 177, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(32, 161, 177, 0.4)' }}>
                          <Typography sx={{ color: '#20a1b1', fontSize: 12, fontWeight: 900 }}>{p.name[0]}</Typography>
                        </Box>
                        <Box>
                          <Typography sx={{ color: '#fff', fontSize: 11, fontWeight: 800 }}>{p.name}</Typography>
                          <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, fontWeight: 600 }}>{p.role}</Typography>
                        </Box>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography sx={{ color: '#20a1b1', fontSize: 9, fontWeight: 800 }}>{p.zone}</Typography>
                        <Typography sx={{ color: '#81c784', fontSize: 8, fontWeight: 700 }}>{p.status.toUpperCase()}</Typography>
                      </Box>
                    </Box>
                  ))}
                </Stack>
              )}

              {activeTab === 'logistics' && (
                <Stack spacing={1.5}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, fontSize: 9, letterSpacing: 1 }}>LOGISTICS FLEET STATUS</Typography>
                    <Chip label="ACTIVE SHIFT: AM" size="small" sx={{ height: 16, fontSize: 8, fontWeight: 900, bgcolor: 'rgba(32, 161, 177, 0.2)', color: '#20a1b1', border: '1px solid rgba(32, 161, 177, 0.4)' }} />
                  </Box>
                  {logistics.length > 0 ? logistics.map((l: any, i: number) => (
                    <Box key={i} sx={{ 
                      p: 1.5, borderRadius: 2, 
                      bgcolor: 'rgba(255,255,255,0.03)', 
                      border: '1px solid rgba(255,255,255,0.05)',
                      position: 'relative',
                      overflow: 'hidden'
                    }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Box>
                          <Typography sx={{ color: '#fff', fontSize: 12, fontWeight: 900 }}>{l.id}</Typography>
                          <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, fontWeight: 700 }}>Driver: {l.driver || 'Unassigned'}</Typography>
                        </Box>
                        <Box sx={{ textAlign: 'right' }}>
                          <Typography sx={{ color: '#20a1b1', fontSize: 10, fontWeight: 800 }}>ETA: {l.eta || 'Calculating...'}</Typography>
                          <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 8, fontWeight: 700 }}>Rounds: {l.rounds || 0}</Typography>
                        </Box>
                      </Box>
                      
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: 9, fontWeight: 700 }}>DEST: {l.dest || l.destination}</Typography>
                        <Typography sx={{ color: '#81c784', fontSize: 8, fontWeight: 900 }}>SHIFT: {l.shift || 'AM'}</Typography>
                      </Box>

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ flexGrow: 1 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
                            <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 8, fontWeight: 800 }}>LOAD CARACITY</Typography>
                            <Typography sx={{ color: '#fff', fontSize: 8, fontWeight: 900 }}>{l.loadPct}%</Typography>
                          </Box>
                          <LinearProgress 
                            variant="determinate" 
                            value={l.loadPct} 
                            sx={{ 
                              height: 3, borderRadius: 1, 
                              bgcolor: 'rgba(255,255,255,0.05)', 
                              '& .MuiLinearProgress-bar': { 
                                bgcolor: l.loadPct > 80 ? '#ff5252' : '#20a1b1',
                                transition: 'transform 0.4s linear'
                              } 
                            }} 
                          />
                        </Box>
                      </Box>
                    </Box>
                  )) : (
                    <Box sx={{ p: 4, textAlign: 'center', opacity: 0.5 }}>
                      <Typography variant="caption" sx={{ color: '#fff' }}>No Active Logistics Data</Typography>
                    </Box>
                  )}
                </Stack>
              )}
            </Box>
          </Collapse>
        </Paper>

        {/* Live Alerts Section */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, px: 1, fontSize: 9 }}>RECENT NOTIFICATIONS</Typography>
          {alerts.map((alert, idx) => (
            <Fade key={idx} in={visible}>
              <Paper elevation={4} sx={{
                p: 1.5,
                background: 'rgba(13, 15, 20, 0.8)',
                backdropFilter: 'blur(12px)',
                borderLeft: `4px solid ${alert.includes('Security') ? '#ff5252' : '#20a1b1'}`,
                borderRadius: '4px 12px 12px 4px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                boxShadow: '0 8px 16px rgba(0,0,0,0.4)'
              }}>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                  <NotificationsActive sx={{ color: alert.includes('Security') ? '#ff5252' : '#20a1b1', fontSize: 16 }} />
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600, fontSize: 11 }}>{alert}</Typography>
                </Box>
                <IconButton size="small" onClick={() => setAlerts(prev => prev.filter((_, i) => i !== idx))} sx={{ color: 'rgba(255,255,255,0.3)', p: 0.25 }}>
                  <Close sx={{ fontSize: 14 }} />
                </IconButton>
              </Paper>
            </Fade>
          ))}
        </Box>
      </Box>
    </Fade>
  );
}

function MetricCard({ icon, label, value, sub, color, trend }: { icon: React.ReactNode, label: string, value: string | number, sub: string, color: string, trend?: number[] }) {
  return (
    <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', p: 1.5, borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, color: 'rgba(255,255,255,0.4)' }}>
        {icon}
        <Typography variant="caption" sx={{ fontWeight: 800, fontSize: 9, letterSpacing: 1 }}>{label}</Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <Box>
          <Typography sx={{ fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{value}</Typography>
          <Typography sx={{ fontSize: 9, color: color, fontWeight: 800, letterSpacing: 0.5, mt: 0.5 }}>{sub}</Typography>
        </Box>
        {trend && (
          <Box sx={{ height: 24, width: 48, mb: 0.5 }}>
            <svg viewBox="0 0 48 24" style={{ width: '100%', height: '100%' }}>
              <path
                d={`M ${trend.map((v, i) => `${(i / (trend.length - 1)) * 48},${24 - (v / 100) * 24}`).join(' L ')}`}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.6"
              />
            </svg>
          </Box>
        )}
      </Box>
    </Box>
  );
}
