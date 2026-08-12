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
  Badge,
  Button
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
  Thunderstorm,
  Inventory2,
  LocalShipping,
  AcUnit,
  Engineering,
  PlayArrow
} from '@mui/icons-material';
import { Slider } from '@mui/material';
import type { RVViewerPlugin } from '../core/rv-plugin';
import type { UISlotEntry } from '../core/rv-ui-plugin';
import type { RVViewer } from '../core/rv-viewer';
import type { LoadResult } from '../core/engine/rv-scene-loader';
import { WAKEFIELD_DEMO_PROFILE as DEMO_PROFILE } from './demo/demo-profile';
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
      component: () => <DecisionHighlightsPanel plugin={this} />,
      order: 32
    },
    {
      slot: 'overlay',
      component: () => <SiteStatsPanel plugin={this} />,
      order: 82
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

  public hasSelectedSite(): boolean {
    return !!this.getSiteManager()?.currentSite;
  }

  public openAsset(assetId: string): void {
    this.viewer?.emit('wpf-asset-selected' as string, { assetId } as any);
  }

  public openMap(assetId?: string): void {
    const mapPlugin = this.viewer?.getPlugin('osm-map') as unknown as { active?: boolean; toggle?: () => void; jumpTo?: (lat: number, lng: number, zoom?: number) => void } | undefined;
    if (mapPlugin && !mapPlugin.active) mapPlugin.toggle?.();
    mapPlugin?.jumpTo?.(DEMO_PROFILE.site.mapLatitude, DEMO_PROFILE.site.mapLongitude, DEMO_PROFILE.site.mapZoom);
    if (assetId) this.openAsset(assetId);
  }

  public focusCell(path: string, assetId?: string): void {
    this.viewer?.focusByPath(path);
    this.viewer?.highlightByPath(path, true);
    if (assetId) this.openAsset(assetId);
  }

  public enterMaintenance(assetId = 'robot-cell-a'): void {
    this.focusCell('A4', assetId);
    this.viewer?.emit('enter-maintenance' as string, undefined);
  }
}

type DecisionSignal = {
  id: string;
  title: string;
  detail: string;
  metric: string;
  color: string;
  icon: React.ReactNode;
  command: 'asset' | 'map' | 'cell' | 'maintenance';
  assetId?: string;
  path?: string;
};

const DECISION_SIGNALS: DecisionSignal[] = [
  {
    id: 'constraint',
    title: `${DEMO_PROFILE.assets.robotCell} is the constraint`,
    detail: `Tray former motor load is high enough to affect ${DEMO_PROFILE.assets.dock} dispatch in 12 min.`,
    metric: '142% load',
    color: '#D9A441',
    icon: <Engineering sx={{ fontSize: 15 }} />,
    command: 'maintenance',
    assetId: 'robot-cell-a'
  },
  {
    id: 'yard',
    title: `Hold ${DEMO_PROFILE.assets.inboundVehicle} at gate`,
    detail: 'Weighbridge buffer is cheaper than blocking the outbound bay.',
    metric: '8 min hold',
    color: '#3FB8C4',
    icon: <LocalShipping sx={{ fontSize: 15 }} />,
    command: 'map',
    assetId: 'hgv-14'
  },
  {
    id: 'dock',
    title: `${DEMO_PROFILE.assets.dock} queue forming`,
    detail: `Two vehicles are waiting; ${DEMO_PROFILE.assets.yardTug} can clear staged cold pallets first.`,
    metric: '2 waiting',
    color: '#D9534F',
    icon: <Inventory2 sx={{ fontSize: 15 }} />,
    command: 'cell',
    assetId: 'dock-4',
    path: 'ConveyorEntry2'
  },
  {
    id: 'cold',
    title: 'Cold chain stable',
    detail: 'Zone A remains stable; keep chilled dispatch priority until queue clears.',
    metric: `${DEMO_PROFILE.kpis.coldChain} ${DEMO_PROFILE.kpis.coldChainUnit}`,
    color: '#3FB8C4',
    icon: <AcUnit sx={{ fontSize: 15 }} />,
    command: 'asset',
    assetId: 'cold-store-b'
  }
];

function DecisionHighlightsPanel({ plugin }: { plugin: SiteIntelligencePlugin }) {
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState(0);
  const [hiddenBySitePanel, setHiddenBySitePanel] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setActive((index) => (index + 1) % DECISION_SIGNALS.length), 6500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const updateVisibility = () => setHiddenBySitePanel(plugin.hasSelectedSite());
    updateVisibility();
    const timer = window.setInterval(updateVisibility, 1000);
    return () => window.clearInterval(timer);
  }, [plugin]);

  const runCommand = (signal: DecisionSignal) => {
    if (signal.command === 'map') {
      plugin.openMap(signal.assetId);
      return;
    }
    if (signal.command === 'cell' && signal.path) {
      plugin.focusCell(signal.path, signal.assetId);
      return;
    }
    if (signal.command === 'maintenance') {
      plugin.enterMaintenance(signal.assetId);
      return;
    }
    if (signal.assetId) plugin.openAsset(signal.assetId);
  };

  const primary = DECISION_SIGNALS[active];
  if (hiddenBySitePanel) return null;

  return (
    <Paper elevation={6} sx={{
      position: 'fixed',
      right: 24,
      top: 96,
      width: collapsed ? 232 : 306,
      display: { xs: 'none', lg: 'block' },
      pointerEvents: 'auto',
      zIndex: 980,
      p: collapsed ? 1 : 1.15,
      borderRadius: 2,
      bgcolor: 'rgba(12, 15, 19, 0.76)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(255,255,255,0.08)',
      boxShadow: '0 12px 28px rgba(0,0,0,0.38)'
    }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: collapsed ? 0 : 0.85 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ color: '#3FB8C4', fontSize: 8.5, fontWeight: 900, letterSpacing: 1.1, textTransform: 'uppercase' }}>Decision highlights</Typography>
          <Typography sx={{ color: '#fff', fontSize: 12.5, fontWeight: 900, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{DEMO_PROFILE.client.liveWatchLabel}</Typography>
        </Box>
        <IconButton size="small" onClick={() => setCollapsed((v) => !v)} sx={{ p: 0.2, color: 'rgba(255,255,255,0.58)' }}>
          {collapsed ? <ExpandMore sx={{ fontSize: 17 }} /> : <ExpandLess sx={{ fontSize: 17 }} />}
        </IconButton>
      </Box>

      {!collapsed && (
        <Stack spacing={0.75}>
          <Box onClick={() => runCommand(primary)} sx={{
            p: 0.85,
            borderRadius: 1.35,
            bgcolor: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.075)',
            borderLeft: `3px solid ${primary.color}`,
            cursor: 'pointer',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.065)' }
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.35, color: primary.color }}>
              {primary.icon}
              <Typography sx={{ color: '#fff', fontSize: 10.5, fontWeight: 900, lineHeight: 1.15, flex: 1 }}>{primary.title}</Typography>
              <Chip label={primary.metric} size="small" sx={{ height: 16, fontSize: 7.5, fontWeight: 900, bgcolor: `${primary.color}22`, color: primary.color, border: `1px solid ${primary.color}55` }} />
            </Box>
            <Typography sx={{ color: 'rgba(255,255,255,0.58)', fontSize: 9.2, lineHeight: 1.28 }}>{primary.detail}</Typography>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.45 }}>
            {DECISION_SIGNALS.map((signal, index) => (
              <Box key={signal.id} onClick={() => { setActive(index); runCommand(signal); }} sx={{
                height: 27,
                borderRadius: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: index === active ? signal.color : 'rgba(255,255,255,0.42)',
                bgcolor: index === active ? `${signal.color}1f` : 'rgba(255,255,255,0.035)',
                border: '1px solid',
                borderColor: index === active ? `${signal.color}66` : 'rgba(255,255,255,0.06)',
                cursor: 'pointer',
                '& svg': { fontSize: 14 }
              }}>
                {signal.icon}
              </Box>
            ))}
          </Box>

          <Button size="small" startIcon={<PlayArrow sx={{ fontSize: 14 }} />} onClick={() => runCommand(primary)} sx={{
            height: 25,
            fontSize: 8.5,
            fontWeight: 900,
            color: '#071013',
            bgcolor: primary.color,
            '&:hover': { bgcolor: primary.color }
          }}>
            Open recommended action
          </Button>
        </Stack>
      )}
    </Paper>
  );
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
    `Inbound ${DEMO_PROFILE.assets.inboundVehicle}: weighbridge slot in 12m`,
    `Yard Alert: ${DEMO_PROFILE.assets.dock} queue forming`,
    `Personnel: maintenance tech entering ${DEMO_PROFILE.assets.robotCell}`,
    `Cold Chain: ${DEMO_PROFILE.kpis.coldChainStatus}, Zone B watch`
  ]);
  const [visible, setVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'personnel' | 'logistics'>('overview');
  const [logistics, setLogistics] = useState<any[]>([]);
  const [scenario, setScenario] = useState<'normal' | 'dock4-blocked'>('normal');

  useEffect(() => {
    const handler = (payload?: { scenario?: 'normal' | 'dock4-blocked' }) => {
      if (!payload?.scenario) return;
      setScenario(payload.scenario);
      if (payload.scenario === 'dock4-blocked') {
        setAlerts(prev => [`Scenario: Dock 4 blocked - route YT-02 to temporary bay`, `Outbound queue: 4 vehicles, dispatch at risk`, ...prev].slice(0, 6));
        setActiveTab('logistics');
      }
    };
    plugin['viewer']?.on('wpf-scenario' as string, handler as any);
    return () => plugin['viewer']?.off('wpf-scenario' as string, handler as any);
  }, [plugin]);

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
        { id: DEMO_PROFILE.assets.inboundVehicle, driver: 'R. Taylor', eta: scenario === 'dock4-blocked' ? 'HOLD' : '14:20', rounds: 4, dest: scenario === 'dock4-blocked' ? 'Gate hold' : 'Weighbridge', loadPct: 65, shift: 'AM' },
        { id: DEMO_PROFILE.assets.yardTug, driver: 'S. Malik', eta: scenario === 'dock4-blocked' ? 'NOW' : '14:05', rounds: 8, dest: scenario === 'dock4-blocked' ? 'Temporary bay' : DEMO_PROFILE.assets.dock, loadPct: scenario === 'dock4-blocked' ? 72 : 40, shift: 'AM' }
      ]);
    };

    update();
    const timer = setInterval(update, 5000);
    return () => clearInterval(timer);
  }, [visible, scenario]);

  const handleHourChange = (_: any, value: number | number[]) => {
    const v = value as number;
    setHour(v);
    plugin.setDaytime(v);
  };

  if (!visible) return null;

  const statusColor = condition?.status === 'Optimal' ? '#5FB37A' : (condition?.status === 'Caution' ? '#D9A441' : '#D9534F');

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
              <Typography variant="overline" sx={{ color: '#3FB8C4', fontWeight: 900, letterSpacing: 2, display: 'block', lineHeight: 1, fontSize: 10 }}>
                SIMAM INTELLIGENCE
              </Typography>
              <Typography variant="h6" sx={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>
                {scenario === 'dock4-blocked' ? 'Dock 4 Recovery Plan' : DEMO_PROFILE.client.commandLabel}
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
                    color: activeTab === t ? '#3FB8C4' : 'rgba(255,255,255,0.4)',
                    border: '1px solid',
                    borderColor: activeTab === t ? '#3FB8C4' : 'rgba(255,255,255,0.1)',
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
                        <AccessTime sx={{ fontSize: 14, color: '#3FB8C4' }} />
                        <Typography variant="caption" sx={{ color: '#fff', fontWeight: 800, fontSize: 10 }}>{opIntel?.shiftName.toUpperCase()} SHIFT</Typography>
                      </Box>
                      <Typography variant="caption" sx={{ color: '#3FB8C4', fontWeight: 900, fontSize: 10 }}>{opIntel?.shiftProgress}%</Typography>
                    </Box>
                    <LinearProgress 
                      variant="determinate" 
                      value={opIntel?.shiftProgress || 0} 
                      sx={{ 
                        height: 6, borderRadius: 3, 
                        bgcolor: 'rgba(32, 161, 177, 0.1)',
                        '& .MuiLinearProgress-bar': { bgcolor: '#3FB8C4', borderRadius: 3 }
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
                      color="#5FB37A"
                      trend={[30, 45, 35, 55, 60, 40, 50]}
                    />
                    <MetricCard
                      icon={<Factory sx={{ fontSize: 18 }} />}
                      label="THROUGHPUT"
                      value={metrics?.throughput || 0}
                      sub="UNITS / HR"
                      color="#3FB8C4"
                      trend={[1100, 1150, 1200, 1250, 1180, 1220, 1280]}
                    />
                  </Box>

                  {/* Safety & Intelligence Badges */}
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Box sx={{ flex: 1, p: 1.2, borderRadius: 2, bgcolor: 'rgba(129, 199, 132, 0.1)', border: '1px solid rgba(129, 199, 132, 0.2)', display: 'flex', alignItems: 'center', gap: 1 }}>
                      <HealthAndSafety sx={{ color: '#5FB37A', fontSize: 16 }} />
                      <Box>
                        <Typography sx={{ color: '#5FB37A', fontSize: 9, fontWeight: 900, lineHeight: 1 }}>SAFETY MILESTONE</Typography>
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
                            {f.condition.includes('Rain') ? <WaterDrop sx={{ fontSize: 14, color: '#3FB8C4' }} /> : <WbSunny sx={{ fontSize: 14, color: '#D9A441' }} />}
                          </Box>
                          <Typography sx={{ color: '#fff', fontSize: 10, fontWeight: 900 }}>{Math.round(f.temp)}C</Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>

                  {/* Shadow Engine Control */}
                  <Box sx={{ px: 0.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700, fontSize: 9, letterSpacing: 1 }}>SHADOW ENGINE (LIVE)</Typography>
                      <Typography variant="caption" sx={{ fontWeight: 800, fontSize: 10, color: '#3FB8C4' }}>{hour}:00</Typography>
                    </Box>
                    <Slider
                      value={hour} min={0} max={23} step={1}
                      onChange={handleHourChange}
                      sx={{
                        color: '#3FB8C4', height: 4, py: 1,
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
                    { name: DEMO_PROFILE.assets.maintenanceTech, role: 'Maintenance Tech', zone: DEMO_PROFILE.assets.robotCell, status: 'Active' },
                    { name: 'OP-11', role: 'Line Operator', zone: 'Packing', status: 'Active' },
                    { name: 'QA-02', role: 'Quality Lead', zone: DEMO_PROFILE.assets.coldStore, status: 'Watch' },
                    { name: 'SEC-01', role: 'Security Ops', zone: 'Gatehouse', status: 'Patrol' }
                  ].map((p, i) => (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                        <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: 'rgba(32, 161, 177, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(32, 161, 177, 0.4)' }}>
                          <Typography sx={{ color: '#3FB8C4', fontSize: 12, fontWeight: 900 }}>{p.name[0]}</Typography>
                        </Box>
                        <Box>
                          <Typography sx={{ color: '#fff', fontSize: 11, fontWeight: 800 }}>{p.name}</Typography>
                          <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, fontWeight: 600 }}>{p.role}</Typography>
                        </Box>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography sx={{ color: '#3FB8C4', fontSize: 9, fontWeight: 800 }}>{p.zone}</Typography>
                        <Typography sx={{ color: '#5FB37A', fontSize: 8, fontWeight: 700 }}>{p.status.toUpperCase()}</Typography>
                      </Box>
                    </Box>
                  ))}
                </Stack>
              )}

              {activeTab === 'logistics' && (
                <Stack spacing={1.5}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, fontSize: 9, letterSpacing: 1 }}>LOGISTICS FLEET STATUS</Typography>
                    <Chip label="ACTIVE SHIFT: AM" size="small" sx={{ height: 16, fontSize: 8, fontWeight: 900, bgcolor: 'rgba(32, 161, 177, 0.2)', color: '#3FB8C4', border: '1px solid rgba(32, 161, 177, 0.4)' }} />
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
                          <Typography sx={{ color: '#3FB8C4', fontSize: 10, fontWeight: 800 }}>ETA: {l.eta || 'Calculating...'}</Typography>
                          <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 8, fontWeight: 700 }}>Rounds: {l.rounds || 0}</Typography>
                        </Box>
                      </Box>
                      
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: 9, fontWeight: 700 }}>DEST: {l.dest || l.destination}</Typography>
                        <Typography sx={{ color: '#5FB37A', fontSize: 8, fontWeight: 900 }}>SHIFT: {l.shift || 'AM'}</Typography>
                      </Box>

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ flexGrow: 1 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
                            <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 8, fontWeight: 800 }}>LOAD CAPACITY</Typography>
                            <Typography sx={{ color: '#fff', fontSize: 8, fontWeight: 900 }}>{l.loadPct}%</Typography>
                          </Box>
                          <LinearProgress 
                            variant="determinate" 
                            value={l.loadPct} 
                            sx={{ 
                              height: 3, borderRadius: 1, 
                              bgcolor: 'rgba(255,255,255,0.05)', 
                              '& .MuiLinearProgress-bar': { 
                                bgcolor: l.loadPct > 80 ? '#D9534F' : '#3FB8C4',
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
                borderLeft: `4px solid ${alert.includes('Security') ? '#D9534F' : '#3FB8C4'}`,
                borderRadius: '4px 12px 12px 4px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                boxShadow: '0 8px 16px rgba(0,0,0,0.4)'
              }}>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                  <NotificationsActive sx={{ color: alert.includes('Security') ? '#D9534F' : '#3FB8C4', fontSize: 16 }} />
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
