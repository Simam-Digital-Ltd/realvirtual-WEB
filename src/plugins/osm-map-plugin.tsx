// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import React, { useState, useEffect } from 'react';
import type { RVViewerPlugin } from '../core/rv-plugin';
import type { RVViewer } from '../core/rv-viewer';
import type { LoadResult } from '../core/engine/rv-scene-loader';
import type { UISlotEntry, UISlotProps } from '../core/rv-ui-plugin';
import { 
  IconButton, Tooltip, Box, Typography, Slider, Paper, 
  Divider, CircularProgress, Badge, Chip 
} from '@mui/material';
import { 
  Map as MapIcon, MapOutlined, Factory as FactoryIcon, NearMe,
  WbSunny, Thunderstorm, Traffic, Visibility, Timeline, Warning,
  Schedule
} from '@mui/icons-material';
import { 
  GeospatialService, WeatherData, FloodAlert, TrafficStatus, 
  SiteMetrics, SiteCondition 
} from '../core/geospatial-service';
import { DataConnectService } from '../core/dataconnect-service';

// @ts-ignore - Loaded via CDN in index.html
const OSMBuildings = (window as any).OSMBuildings;

interface MapLabel {
  id: string;
  name: string;
  status?: string;
  lat: number;
  lng: number;
  alt: number;
  x: number;
  y: number;
  visible: boolean;
}

interface RobotTrail {
  id: string;
  name: string;
  points: { x: number, y: number }[];
  visible: boolean;
  color?: string;
}

interface SiteWorker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  role: 'Technician' | 'Operator' | 'Security';
  status: 'Active' | 'On Break' | 'Emergency';
}

interface LogisticsAsset {
  id: string;
  type: 'Truck' | 'Delivery Van';
  lat: number;
  lng: number;
  destination: string;
  loadPct: number;
  driver: string;
  rounds: number;
  shift: 'AM' | 'PM' | 'Night';
  startTime: string;
}

/**
 * AlertBanner
 * Functional safety alerts based on environmental thresholds.
 */
const AlertBanner: React.FC<{ 
  weather: WeatherData | null, 
  floodCount: number,
  trafficFlow: number 
}> = ({ weather, floodCount, trafficFlow }) => {
  const alerts: { msg: string, severity: 'error' | 'warning' | 'info' }[] = [];
  
  if (weather && weather.windSpeed > 25) {
    alerts.push({ msg: 'EXTREME WIND: Ground Drones', severity: 'error' });
  }
  if (weather && weather.isRaining) {
    alerts.push({ msg: 'RAIN: Sensor Accuracy Risk', severity: 'warning' });
  }
  if (floodCount > 0) {
    alerts.push({ msg: 'FLOOD ALERT: Site Watch', severity: 'error' });
  }
  if (trafficFlow < 40) {
    alerts.push({ msg: 'TRAFFIC: Logistical Delay', severity: 'info' });
  }

  if (alerts.length === 0) return null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
      {alerts.map((alert, i) => (
        <Paper 
          key={i}
          sx={{ 
            p: '6px 12px', borderRadius: '4px',
            bgcolor: alert.severity === 'error' ? 'rgba(255, 82, 82, 0.15)' : 
                     alert.severity === 'warning' ? 'rgba(255, 152, 0, 0.15)' : 'rgba(32, 161, 177, 0.15)',
            borderLeft: `3px solid ${alert.severity === 'error' ? '#ff5252' : 
                                   alert.severity === 'warning' ? '#ff9800' : '#20a1b1'}`,
            display: 'flex', alignItems: 'center', gap: 1
          }}
        >
          <Warning sx={{ fontSize: 14, color: alert.severity === 'error' ? '#ff5252' : 
                                               alert.severity === 'warning' ? '#ff9800' : '#20a1b1' }} />
          <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2px', color: '#fff' }}>
            {alert.msg}
          </Typography>
        </Paper>
      ))}
    </Box>
  );
};


/**
 * OSMMapLabels Component
 * Renders labels, workers, logistics assets, and multi-asset ghost paths.
 */
const OSMMapLabels: React.FC<UISlotProps> = ({ viewer }) => {
  const [labels, setLabels] = useState<MapLabel[]>([]);
  const [trails, setTrails] = useState<RobotTrail[]>([]);
  const [workers, setWorkers] = useState<SiteWorker[]>([]);
  const [logistics, setLogistics] = useState<LogisticsAsset[]>([]);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const handleLabels = (e: any) => setLabels(e.labels || []);
    const handleTrails = (e: any) => setTrails(e.trails || []);
    const handleWorkers = (e: any) => setWorkers(e.workers || []);
    const handleLogistics = (e: any) => setLogistics(e.logistics || []);
    const handleToggle = (e: any) => setActive(e.active);
    
    viewer.on('osm-labels-updated' as any, handleLabels);
    viewer.on('osm-trails-updated' as any, handleTrails);
    viewer.on('osm-workers-updated' as any, handleWorkers);
    viewer.on('osm-logistics-updated' as any, handleLogistics);
    viewer.on('osm-map-toggled' as any, handleToggle);
    
    return () => {
      viewer.off('osm-labels-updated' as any, handleLabels);
      viewer.off('osm-trails-updated' as any, handleTrails);
      viewer.off('osm-workers-updated' as any, handleWorkers);
      viewer.off('osm-logistics-updated' as any, handleLogistics);
      viewer.off('osm-map-toggled' as any, handleToggle);
    };
  }, [viewer]);

  const projectPoint = (lat: number, lng: number) => {
    const plugin = viewer.getPlugin('osm-map') as any;
    if (!plugin?._osmb) return { x: -1000, y: -1000, z: -1 };
    return plugin._osmb.project(lat, lng, 0);
  };

  if (!active) return null;

  return (
    <Box sx={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1050 }}>
      {/* Ghost Paths (SVG Overlay) */}
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id="trailGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(32, 161, 177, 0)" />
            <stop offset="100%" stopColor="rgba(32, 161, 177, 0.8)" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        {trails.map(trail => (
          trail.visible && (
            <g key={trail.id}>
              <path
                d={`M ${trail.points.map(p => `${p.x},${p.y}`).join(' L ')}`}
                fill="none"
                stroke={trail.color || "#20a1b1"}
                strokeWidth="4"
                opacity="0.15"
                style={{ filter: 'url(#glow)' }}
              />
              <path
                d={`M ${trail.points.map(p => `${p.x},${p.y}`).join(' L ')}`}
                fill="none"
                stroke="url(#trailGrad)"
                strokeWidth="2"
                strokeDasharray="12,6"
                opacity="0.8"
              >
                <animate 
                  attributeName="stroke-dashoffset" 
                  from="100" to="0" 
                  dur="4s" 
                  repeatCount="indefinite" 
                />
              </path>
            </g>
          )
        ))}
      </svg>

      {/* Logistics Asset Markers */}
      {logistics.map(asset => {
        const pos = projectPoint(asset.lat, asset.lng);
        if (pos.z <= 0) return null;
        return (
          <Box
            key={asset.id}
            sx={{
              position: 'absolute', left: pos.x, top: pos.y,
              transform: 'translate(-50%, -100%)',
              transition: 'all 0.5s linear'
            }}
          >
            <Box sx={{
              bgcolor: 'rgba(32, 161, 177, 0.95)', color: '#fff',
              px: 1, py: 0.5, borderRadius: '6px', border: '1px solid rgba(255,255,255,0.3)',
              display: 'flex', alignItems: 'center', gap: 1, boxShadow: '0 8px 20px rgba(0,0,0,0.5)',
              backdropFilter: 'blur(4px)'
            }}>
              <NearMe sx={{ fontSize: 12, transform: 'rotate(45deg)', color: '#4fc3f7' }} />
              <Typography sx={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.5 }}>{asset.id}</Typography>
            </Box>
            <Box sx={{ height: 12, width: 2, bgcolor: 'rgba(255,255,255,0.5)', mx: 'auto', boxShadow: '0 0 10px rgba(0,0,0,0.5)' }} />
          </Box>
        );
      })}

      {/* Site Worker Markers */}
      {workers.map(worker => {
        const pos = projectPoint(worker.lat, worker.lng);
        if (pos.z <= 0) return null;
        return (
          <Box
            key={worker.id}
            sx={{
              position: 'absolute', left: pos.x, top: pos.y,
              transform: 'translate(-50%, -50%)',
              transition: 'all 1s linear'
            }}
          >
            <Tooltip title={`${worker.name} (${worker.role})`}>
              <Box sx={{
                width: 12, height: 12, borderRadius: '50%',
                bgcolor: worker.role === 'Security' ? '#ff5252' : '#00e676',
                border: '2px solid #fff', boxShadow: '0 0 10px currentColor'
              }}>
                <Box sx={{
                  width: '100%', height: '100%', borderRadius: '50%',
                  animation: 'pulse 2s infinite',
                  '@keyframes pulse': { '0%': { transform: 'scale(1)', opacity: 1 }, '100%': { transform: 'scale(3)', opacity: 0 } },
                  bgcolor: 'inherit'
                }} />
              </Box>
            </Tooltip>
          </Box>
        );
      })}

      {/* Coordinate Labels */}
      {labels.map(label => (
        label.visible && (
          <Box
            key={label.id}
            sx={{
              position: 'absolute', left: label.x, top: label.y,
              transform: 'translate(-50%, -100%) translateY(-20px)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1
            }}
          >
            <Box sx={{
              background: 'rgba(13, 15, 20, 0.9)', backdropFilter: 'blur(12px)',
              border: '1px solid rgba(32, 161, 177, 0.4)', borderRadius: '12px', 
              padding: '10px 20px', boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
              display: 'flex', alignItems: 'center', gap: 1.5
            }}>
              <FactoryIcon sx={{ color: '#20a1b1', fontSize: 22 }} />
              <Box>
                <Typography sx={{ color: '#fff', fontSize: 13, fontWeight: 800, letterSpacing: '0.5px' }}>{label.name}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ color: 'rgba(32, 161, 177, 0.8)', fontSize: 10, fontWeight: 700 }}>SIMAM GOODS HQ</Typography>
                  {label.status && (
                    <Chip 
                      label={label.status.toUpperCase()} 
                      size="small" 
                      sx={{ 
                        height: 14, fontSize: 8, fontWeight: 900, 
                        bgcolor: 'rgba(255, 213, 79, 0.2)', color: '#ffd54f',
                        border: '1px solid rgba(255, 213, 79, 0.4)'
                      }} 
                    />
                  )}
                </Box>
              </Box>
            </Box>
            <Box sx={{ width: '2px', height: '40px', background: 'linear-gradient(to bottom, #20a1b1, transparent)' }} />
          </Box>
        )
      ))}
    </Box>
  );
};

const OSMMapToggle: React.FC<UISlotProps> = ({ viewer }) => {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const handleToggle = (e: any) => setActive(e.active);
    viewer.on('osm-map-toggled' as any, handleToggle);
    return () => viewer.off('osm-map-toggled' as any, handleToggle);
  }, [viewer]);

  const toggle = () => {
    const plugin = viewer.getPlugin('osm-map') as OSMMapPlugin;
    if (plugin) plugin.toggle();
  };

  const jumpToWakefield = () => {
    const plugin = viewer.getPlugin('osm-map') as OSMMapPlugin;
    if (plugin) plugin.jumpTo(53.693, -1.503, 18);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Tooltip title={active ? "Hide Site Map" : "Show Site Map"} placement="right">
        <IconButton
          onClick={toggle}
          sx={{
            bgcolor: active ? 'rgba(32, 161, 177, 0.2)' : 'rgba(0,0,0,0.4)',
            color: active ? '#20a1b1' : '#fff', backdropFilter: 'blur(4px)',
            '&:hover': { bgcolor: active ? 'rgba(32, 161, 177, 0.3)' : 'rgba(255,255,255,0.1)' }
          }}
        >
          {active ? <MapIcon /> : <MapOutlined />}
        </IconButton>
      </Tooltip>
      {active && (
        <Tooltip title="Jump to Wakefield Demo" placement="right">
          <IconButton onClick={jumpToWakefield} sx={{ bgcolor: 'rgba(0,0,0,0.4)', color: '#fff', backdropFilter: 'blur(4px)', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
            <NearMe />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
};

export class OSMMapPlugin implements RVViewerPlugin {
  readonly id = 'osm-map';
  readonly order = 1000;
  readonly slots: UISlotEntry[] = [
    { slot: 'button-group', order: 100, component: OSMMapToggle },
    { slot: 'overlay', order: 10, component: OSMMapLabels }
  ];

  private _viewer: RVViewer | null = null;
  private _osmb: any = null;
  private _active = false;
  private _container: HTMLElement | null = null;
  private _appContainer: HTMLElement | null = null;

  private _labels: MapLabel[] = [
    { id: 'wakefield-factory', name: 'Morrisons Wakefield 41', lat: 53.6931, lng: -1.5034, alt: 25, x: 0, y: 0, visible: true },
    { id: 'north-gate', name: 'North Access Gate', lat: 53.696, lng: -1.508, alt: 10, x: 0, y: 0, visible: true },
    { id: 'loading-dock-b', name: 'Loading Dock B', lat: 53.692, lng: -1.502, alt: 10, x: 0, y: 0, visible: true }
  ];

  private _workers: SiteWorker[] = [
    { id: 'w1', name: 'John Doe', lat: 53.6931, lng: -1.5032, role: 'Technician', status: 'Active' },
    { id: 'w2', name: 'Jane Smith', lat: 53.6925, lng: -1.5025, role: 'Operator', status: 'Active' },
    { id: 'w3', name: 'Mike Ross', lat: 53.6938, lng: -1.5045, role: 'Security', status: 'Active' },
    { id: 'w4', name: 'Sarah Connor', lat: 53.6942, lng: -1.5052, role: 'Technician', status: 'Active' },
    { id: 'w5', name: 'David Miller', lat: 53.6922, lng: -1.5018, role: 'Operator', status: 'Active' },
    { id: 'w6', name: 'Elena Fisher', lat: 53.6918, lng: -1.5012, role: 'Security', status: 'Active' }
  ];

  private _logistics: LogisticsAsset[] = [
    { id: 'T-102', type: 'Truck', lat: 53.695, lng: -1.508, destination: 'A650 North', loadPct: 85, driver: 'Robert T.', rounds: 3, shift: 'AM', startTime: '06:00' },
    { id: 'T-204', type: 'Truck', lat: 53.691, lng: -1.501, destination: 'Factory B', loadPct: 40, driver: 'Susan M.', rounds: 5, shift: 'AM', startTime: '06:15' },
    { id: 'T-305', type: 'Truck', lat: 53.698, lng: -1.512, destination: 'Wakefield HQ', loadPct: 10, driver: 'Gary K.', rounds: 2, shift: 'AM', startTime: '07:00' },
    { id: 'V-001', type: 'Delivery Van', lat: 53.694, lng: -1.505, destination: 'Dock 4', loadPct: 60, driver: 'Anna S.', rounds: 8, shift: 'AM', startTime: '08:30' }
  ];

  private _latitude = 53.6931;
  private _longitude = -1.5034;
  private _rotation = 0;
  private _zoom = 17.5;
  private _simTimer: any = null;

  onModelLoaded(_result: LoadResult, viewer: RVViewer): void {
    this._viewer = viewer;
    this._container = document.getElementById('map');
    this._appContainer = document.getElementById('app');
    const siteData = viewer.scene.userData?.site;
    if (siteData) {
      if (siteData.lat) this._latitude = parseFloat(siteData.lat);
      if (siteData.lng) this._longitude = parseFloat(siteData.lng);
      if (siteData.rot) this._rotation = parseFloat(siteData.rot);
    }
    this._setupMap();
  }

  toggle(): void {
    this._active = !this._active;
    if (this._active) { 
      this._show(); 
      this._refreshTrails();
      this._startMockSimulation();
    } else { 
      this._hide(); 
      this._stopMockSimulation();
    }
    this._viewer?.emit('osm-map-toggled' as any, { active: this._active });
    this._updateLabels();
  }

  private _truckRoutes = [
    [
      { lat: 53.691, lng: -1.501 },
      { lat: 53.692, lng: -1.502 },
      { lat: 53.693, lng: -1.503 },
      { lat: 53.695, lng: -1.508 }
    ],
    [
      { lat: 53.698, lng: -1.512 },
      { lat: 53.696, lng: -1.508 },
      { lat: 53.694, lng: -1.505 },
      { lat: 53.693, lng: -1.503 }
    ],
    [
      { lat: 53.690, lng: -1.505 },
      { lat: 53.692, lng: -1.506 },
      { lat: 53.694, lng: -1.507 },
      { lat: 53.696, lng: -1.508 }
    ],
    [
      { lat: 53.693, lng: -1.503 },
      { lat: 53.692, lng: -1.502 },
      { lat: 53.691, lng: -1.501 },
      { lat: 53.689, lng: -1.500 }
    ]
  ];

  private _truckProgress = [0, 0, 0.5, 0.2];

  private _startMockSimulation(): void {
    if (this._simTimer) return;
    this._simTimer = setInterval(() => {
      // Mock worker drift
      this._workers.forEach(w => {
        w.lat += (Math.random() - 0.5) * 0.00008;
        w.lng += (Math.random() - 0.5) * 0.00008;
      });

      // Mock truck movement following routes
      this._logistics.forEach((l, i) => {
        const route = this._truckRoutes[i % this._truckRoutes.length];
        this._truckProgress[i] += 0.003; // Slightly slower, more realistic
        if (this._truckProgress[i] >= route.length - 1) {
          this._truckProgress[i] = 0;
          l.rounds++; // Increment rounds completed
          l.loadPct = Math.floor(Math.random() * 100); // New load for new round
        }

        const idx = Math.floor(this._truckProgress[i]);
        const alpha = this._truckProgress[i] - idx;
        const p1 = route[idx];
        const p2 = route[idx + 1];

        l.lat = p1.lat + (p2.lat - p1.lat) * alpha;
        l.lng = p1.lng + (p2.lng - p1.lng) * alpha;
      });

      // Update dynamic labels (e.g. Loading Dock Status)
      const dockB = this._labels.find(l => l.id === 'loading-dock-b');
      if (dockB) {
        const truckCount = this._logistics.filter(l => l.destination === 'Dock 4').length;
        dockB.status = `${truckCount} Trucks Active`;
      }

      this._viewer?.emit('osm-workers-updated' as any, { workers: this._workers });
      this._viewer?.emit('osm-logistics-updated' as any, { logistics: this._logistics });
      this._updateLabels();
      this._updateTrails();
    }, 100);
  }

  private _stopMockSimulation(): void {
    if (this._simTimer) clearInterval(this._simTimer);
    this._simTimer = null;
  }

  jumpTo(lat: number, lng: number, zoom?: number): void {
    if (this._osmb) {
      this._osmb.setPosition({ latitude: lat, longitude: lng });
      if (zoom) this._osmb.setZoom(zoom);
    }
  }

  setDaytime(hour: number): void {
    if (this._osmb) {
      this._osmb.setDaytime(`${hour.toString().padStart(2, '0')}:00`);
    }
  }


  private _setupMap(): void {
    if (!this._container || this._osmb) return;
    try {
      this._osmb = new OSMBuildings({
        container: 'map',
        position: { latitude: this._latitude, longitude: this._longitude },
        zoom: this._zoom, 
        tilt: 30, // Lower tilt for better horizon stability
        rotation: this._rotation,
        minZoom: 12, // Lowered for further zoom out
        maxZoom: 21, // Increased for closer inspection
        effects: ['shadows'], 
        fastMode: true, // Optimize for faster frame rates
        attribution: '© OSM Buildings'
      });

      // Realistic Satellite Imagery (Esri World Imagery)
      this._osmb.addMapTiles('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      });

      // 3D Buildings with optimized loading profile
      this._osmb.addGeoJSONTiles('https://{s}.data.osmbuildings.org/0.2/59fcc2e8/tile/{z}/{x}/{y}.json', {
        fixedZoom: 14 // Better balance for building visibility at distance
      });

      // Set Realistic Industrial Style for Buildings
      this._osmb.style({
        color: 'rgba(210, 215, 220, 0.9)', // Slightly darker concrete
        roofColor: 'rgba(160, 165, 170, 0.95)',
        outlineColor: 'rgba(0, 0, 0, 0.15)',
        highlightColor: '#20a1b1'
      });

      this._osmb.on('change', () => { this._updateLabels(); this._updateTrails(); });
      
      // Site HQ Marker
      this._osmb.addMarker({ latitude: 53.693, longitude: -1.503 }, { color: '#20a1b1' });
    } catch (e) {
      console.error('[OSMMapPlugin] Failed to initialize OSM Buildings:', e);
    }
  }

  private _rawTrails: Record<string, { name: string, points: { lat: number, lng: number }[] }> = {};
  
  private async _refreshTrails(): Promise<void> {
    this._rawTrails = await DataConnectService.getHistoricalPaths(24);
    this._updateTrails();
  }

  private _updateTrails(): void {
    if (!this._osmb || !this._active) return;
    const trails: RobotTrail[] = Object.entries(this._rawTrails).map(([id, data]) => {
      const points = data.points.map(p => this._osmb.project(p.lat, p.lng, 0)).filter(p => p.z > 0);
      return { id, name: data.name, points, visible: points.length > 1 };
    });
    this._viewer?.emit('osm-trails-updated' as any, { trails });
  }

  private _updateLabels(): void {
    if (!this._osmb || !this._active) return;
    const updatedLabels = this._labels.map(label => {
      const pos = this._osmb.project(label.lat, label.lng, label.alt);
      return { ...label, x: pos.x, y: pos.y, visible: pos.z > 0 };
    });
    this._viewer?.emit('osm-labels-updated' as any, { labels: updatedLabels });
  }

  private _show(): void {
    if (this._container) { 
      this._container.style.opacity = '1'; 
      this._container.style.pointerEvents = 'auto'; 
      this._container.style.display = 'block';
    }
    if (this._appContainer) {
      this._appContainer.style.opacity = '0';
      this._appContainer.style.pointerEvents = 'none';
      this._appContainer.style.visibility = 'hidden';
    }
  }

  private _hide(): void {
    if (this._container) { 
      this._container.style.opacity = '0'; 
      this._container.style.pointerEvents = 'none'; 
      this._container.style.display = 'none';
    }
    if (this._appContainer) {
      this._appContainer.style.opacity = '1';
      this._appContainer.style.pointerEvents = 'auto';
      this._appContainer.style.visibility = 'visible';
    }
  }

  onRender(): void { }
  dispose(): void { this._hide(); }
}
