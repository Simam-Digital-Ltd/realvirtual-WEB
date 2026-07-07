// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
import { projectMapPoint, projectMapTrail } from './osm-map-overlay';
import { WAKEFIELD_DEMO_PROFILE as DEMO_PROFILE } from './demo/demo-profile';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const GOOGLE_MAPS_MAP_ID = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined) || 'DEMO_MAP_ID';
const GOOGLE_MAPS_SCRIPT_ID = 'rv-google-maps-sdk';

type GoogleMapPoint = { lat: number; lng: number };

let googleMapsPromise: Promise<void> | null = null;

function loadGoogleMapsSdk(): Promise<void> {
  const existingGoogle = (window as any).google;
  if (existingGoogle?.maps?.Map) return Promise.resolve();
  if (googleMapsPromise) return googleMapsPromise;
  if (!GOOGLE_MAPS_API_KEY) return Promise.reject(new Error('Missing VITE_GOOGLE_MAPS_API_KEY'));

  googleMapsPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Google Maps SDK failed to load')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&v=weekly&libraries=marker&region=GB&language=en`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Maps SDK failed to load'));
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

class GoogleMapProjector {
  private readonly map: any;
  private readonly overlay: any;
  private readonly container: HTMLElement;

  constructor(map: any, container: HTMLElement) {
    const googleApi = (window as any).google;
    this.map = map;
    this.container = container;
    this.overlay = new googleApi.maps.OverlayView();
    this.overlay.onAdd = () => undefined;
    this.overlay.draw = () => undefined;
    this.overlay.onRemove = () => undefined;
    this.overlay.setMap(map);
  }

  project(lat: number, lng: number, alt = 0): { x: number; y: number; z: number } {
    void this.map;
    const projection = this.overlay.getProjection?.();
    const googleApi = (window as any).google;
    if (!projection || !googleApi?.maps?.LatLng) return { x: -1000, y: -1000, z: -1 };

    const point = projection.fromLatLngToContainerPixel(new googleApi.maps.LatLng(lat, lng));
    if (!point) return { x: -1000, y: -1000, z: -1 };

    const y = point.y - alt * 0.35;
    const visible = point.x >= -200 && point.y >= -200 && point.x <= this.container.clientWidth + 200 && point.y <= this.container.clientHeight + 200;
    return { x: point.x, y, z: visible ? 1 : -1 };
  }
}

class GoogleYardMap {
  private readonly googleApi: any;
  private readonly map: any;
  private readonly projector: GoogleMapProjector;
  private readonly listeners = new Set<() => void>();
  private marker: any = null;

  constructor(container: HTMLElement, center: GoogleMapPoint, zoom: number, rotation: number) {
    this.googleApi = (window as any).google;
    this.map = new this.googleApi.maps.Map(container, {
      center,
      zoom,
      mapId: GOOGLE_MAPS_MAP_ID,
      mapTypeId: 'satellite',
      heading: rotation,
      tilt: 45,
      disableDefaultUI: true,
      gestureHandling: 'greedy',
      keyboardShortcuts: false,
      clickableIcons: false,
      internalUsageAttributionIds: ['gmp_git_agentskills_v1'],
    });
    this.projector = new GoogleMapProjector(this.map, container);
    this.map.addListener('bounds_changed', () => this.emitChange());
    this.map.addListener('zoom_changed', () => this.emitChange());
    this.map.addListener('heading_changed', () => this.emitChange());
    this.map.addListener('tilt_changed', () => this.emitChange());
  }

  on(event: string, cb: () => void): void {
    if (event === 'change') this.listeners.add(cb);
  }

  project(lat: number, lng: number, alt = 0): { x: number; y: number; z: number } {
    return this.projector.project(lat, lng, alt);
  }

  setPosition(point: { latitude: number; longitude: number }): void {
    this.map.panTo({ lat: point.latitude, lng: point.longitude });
    this.emitChange();
  }

  setZoom(zoom: number): void {
    this.map.setZoom(zoom);
    this.emitChange();
  }

  setDaytime(_time: string): void {
    // Google Maps JS does not expose daytime control for satellite imagery.
  }

  addMarker(point: { latitude: number; longitude: number }, options: { color?: string } = {}): void {
    const markerLib = this.googleApi.maps.marker;
    if (markerLib?.AdvancedMarkerElement && markerLib?.PinElement) {
      const pin = new markerLib.PinElement({ background: options.color || '#20a1b1', borderColor: '#ffffff', glyphText: 'W' });
      this.marker = new markerLib.AdvancedMarkerElement({
        map: this.map,
        position: { lat: point.latitude, lng: point.longitude },
        title: 'Wakefield Precision Foods WPF-41',
      });
      this.marker.append(pin);
      return;
    }
  }

  private emitChange(): void {
    window.requestAnimationFrame(() => {
      for (const cb of this.listeners) cb();
    });
  }
}

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

function normalizeAssetId(id: string): string {
  const key = id.toLowerCase();
  if (key === 'loading-dock-b') return 'dock-4';
  if (key === 'wakefield-factory') return 'robot-cell-a';
  if (key === 'w1') return 'mt-03';
  if (key === 'w4') return 'cold-store-b';
  return key;
}

function emitAssetDetail(viewer: RVViewer, id: string): void {
  viewer.emit('wpf-asset-selected' as string, { assetId: normalizeAssetId(id) } as any);
}

const SimulatedBadge: React.FC<{ label: string }> = ({ label }) => (
  <Chip
    label={`${label} SIMULATED`}
    size="small"
    sx={{
      height: 18,
      fontSize: 8,
      fontWeight: 900,
      letterSpacing: 0.6,
      bgcolor: 'rgba(255, 213, 79, 0.16)',
      color: '#ffd54f',
      border: '1px solid rgba(255, 213, 79, 0.42)',
      pointerEvents: 'none',
    }}
  />
);


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
  const [, setProjectionFrame] = useState(0);

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

  useEffect(() => {
    if (!active) return;

    let rafId = 0;
    const tick = () => {
      setProjectionFrame(frame => (frame + 1) % 100000);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [active]);

  const projectPoint = (lat: number, lng: number, alt = 0) => {
    const plugin = viewer.getPlugin('osm-map') as any;
    if (!plugin?._osmb) return { x: -1000, y: -1000, visible: false };
    return projectMapPoint(plugin._osmb, lat, lng, alt);
  };

  if (!active) return null;
  const mapPlugin = viewer.getPlugin('osm-map') as OSMMapPlugin | undefined;
  const mapContainer = mapPlugin?.mapContainer;
  if (!mapContainer) return null;

  return createPortal(
    <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 20 }}>
      {(workers.length > 0 || logistics.length > 0) && (
        <Box sx={{ position: 'absolute', left: 20, bottom: 24, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {workers.length > 0 && <SimulatedBadge label="Personnel" />}
          {logistics.length > 0 && <SimulatedBadge label="Logistics" />}
        </Box>
      )}

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
        if (!pos.visible) return null;
        return (
          <Box
            key={asset.id}
            sx={{
              position: 'absolute', left: pos.x, top: pos.y,
              transform: 'translate(-50%, -100%)',
              transition: 'opacity 0.15s ease',
              pointerEvents: 'auto',
              cursor: 'pointer'
            }}
            onClick={() => emitAssetDetail(viewer, asset.id)}
          >
            <Box sx={{
              bgcolor: 'rgba(32, 161, 177, 0.95)', color: '#fff',
              px: 1, py: 0.5, borderRadius: '6px', border: '1px solid rgba(255,255,255,0.3)',
              display: 'flex', alignItems: 'center', gap: 1, boxShadow: '0 8px 20px rgba(0,0,0,0.5)',
              backdropFilter: 'blur(4px)'
            }}>
              <NearMe sx={{ fontSize: 12, transform: 'rotate(45deg)', color: '#4fc3f7' }} />
              <Typography sx={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.5 }}>{asset.id}</Typography>
              <Chip
                label="SIM"
                size="small"
                sx={{ height: 14, fontSize: 8, fontWeight: 900, bgcolor: 'rgba(255,213,79,0.18)', color: '#ffd54f' }}
              />
            </Box>
            <Box sx={{ height: 12, width: 2, bgcolor: 'rgba(255,255,255,0.5)', mx: 'auto', boxShadow: '0 0 10px rgba(0,0,0,0.5)' }} />
          </Box>
        );
      })}

      {/* Site Worker Markers */}
      {workers.map(worker => {
        const pos = projectPoint(worker.lat, worker.lng);
        if (!pos.visible) return null;
        return (
          <Box
            key={worker.id}
            sx={{
              position: 'absolute', left: pos.x, top: pos.y,
              transform: 'translate(-50%, -50%)',
              transition: 'opacity 0.15s ease',
              pointerEvents: 'auto',
              cursor: 'pointer'
            }}
            onClick={() => emitAssetDetail(viewer, worker.name)}
          >
            <Tooltip title={`${worker.name} (${worker.role}) - simulated location`}>
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
      {labels.map(label => {
        const pos = projectPoint(label.lat, label.lng, label.alt);
        return (
        pos.visible && (
          <Box
            key={label.id}
            sx={{
              position: 'absolute', left: pos.x, top: pos.y,
              transform: 'translate(-50%, -100%) translateY(-20px)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
              pointerEvents: 'auto',
              cursor: 'pointer'
            }}
            onClick={() => emitAssetDetail(viewer, label.id)}
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
                  <Typography sx={{ color: 'rgba(32, 161, 177, 0.8)', fontSize: 10, fontWeight: 700 }}>{DEMO_PROFILE.client.mapSiteLabel}</Typography>
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
        );
      })}
    </Box>,
    mapContainer
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
    if (plugin) plugin.jumpTo(DEMO_PROFILE.site.mapLatitude, DEMO_PROFILE.site.mapLongitude, DEMO_PROFILE.site.mapZoom);
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
        <Tooltip title="Jump to WPF-41 Site" placement="right">
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

  get mapContainer(): HTMLElement | null {
    return this._container;
  }

  private _labels: MapLabel[] = [
    { id: 'wakefield-factory', name: DEMO_PROFILE.client.siteName, lat: DEMO_PROFILE.site.latitude, lng: DEMO_PROFILE.site.longitude, alt: 25, x: 0, y: 0, visible: true },
    { id: 'north-gate', name: 'Gatehouse & Weighbridge', lat: 53.696, lng: -1.508, alt: 10, x: 0, y: 0, visible: true },
    { id: 'loading-dock-b', name: DEMO_PROFILE.assets.dockLabel, lat: 53.692, lng: -1.502, alt: 10, x: 0, y: 0, visible: true }
  ];

  private _workers: SiteWorker[] = [
    { id: 'w1', name: 'MT-03', lat: 53.6931, lng: -1.5032, role: 'Technician', status: 'Active' },
    { id: 'w2', name: 'OP-11', lat: 53.6925, lng: -1.5025, role: 'Operator', status: 'Active' },
    { id: 'w3', name: 'SEC-01', lat: 53.6938, lng: -1.5045, role: 'Security', status: 'Active' },
    { id: 'w4', name: 'QA-02', lat: 53.6942, lng: -1.5052, role: 'Technician', status: 'Active' },
    { id: 'w5', name: 'FL-07', lat: 53.6922, lng: -1.5018, role: 'Operator', status: 'Active' },
    { id: 'w6', name: 'SEC-02', lat: 53.6918, lng: -1.5012, role: 'Security', status: 'Active' }
  ];

  private _workerRoutes = [
    [
      { lat: 53.6931, lng: -1.5032 },
      { lat: 53.6934, lng: -1.5038 },
      { lat: 53.6930, lng: -1.5041 },
      { lat: 53.6928, lng: -1.5035 }
    ],
    [
      { lat: 53.6925, lng: -1.5025 },
      { lat: 53.6921, lng: -1.5021 },
      { lat: 53.6924, lng: -1.5017 },
      { lat: 53.6928, lng: -1.5022 }
    ],
    [
      { lat: 53.6938, lng: -1.5045 },
      { lat: 53.6945, lng: -1.5050 },
      { lat: 53.6941, lng: -1.5057 },
      { lat: 53.6935, lng: -1.5051 }
    ],
    [
      { lat: 53.6942, lng: -1.5052 },
      { lat: 53.6947, lng: -1.5044 },
      { lat: 53.6940, lng: -1.5039 },
      { lat: 53.6937, lng: -1.5048 }
    ],
    [
      { lat: 53.6922, lng: -1.5018 },
      { lat: 53.6918, lng: -1.5013 },
      { lat: 53.6921, lng: -1.5008 },
      { lat: 53.6925, lng: -1.5014 }
    ],
    [
      { lat: 53.6918, lng: -1.5012 },
      { lat: 53.6914, lng: -1.5018 },
      { lat: 53.6919, lng: -1.5025 },
      { lat: 53.6923, lng: -1.5018 }
    ]
  ];

  private _workerProgress = [0, 0.7, 1.3, 2.0, 0.4, 1.6];

  private _logistics: LogisticsAsset[] = [
    { id: DEMO_PROFILE.assets.inboundVehicle, type: 'Truck', lat: 53.695, lng: -1.508, destination: 'A650 Northbound', loadPct: 85, driver: 'R. Taylor', rounds: 3, shift: 'AM', startTime: '06:00' },
    { id: DEMO_PROFILE.assets.yardTug, type: 'Truck', lat: 53.691, lng: -1.501, destination: DEMO_PROFILE.assets.coldStore, loadPct: 40, driver: 'S. Malik', rounds: 5, shift: 'AM', startTime: '06:15' },
    { id: 'HGV-27', type: 'Truck', lat: 53.698, lng: -1.512, destination: 'WPF Dispatch', loadPct: 10, driver: 'G. Khan', rounds: 2, shift: 'AM', startTime: '07:00' },
    { id: 'VAN-06', type: 'Delivery Van', lat: 53.694, lng: -1.505, destination: DEMO_PROFILE.assets.dock, loadPct: 60, driver: 'A. Shah', rounds: 8, shift: 'AM', startTime: '08:30' }
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
      // Simulated personnel follow bounded patrol routes instead of random GPS drift.
      this._workers.forEach((w, i) => {
        const route = this._workerRoutes[i % this._workerRoutes.length];
        this._workerProgress[i] = this._advanceRoute(this._workerProgress[i], route, 0.01);
        const pos = this._interpolateRoute(route, this._workerProgress[i]);
        w.lat = pos.lat;
        w.lng = pos.lng;
      });

      // Mock truck movement following routes
      this._logistics.forEach((l, i) => {
        const route = this._truckRoutes[i % this._truckRoutes.length];
        const previousProgress = this._truckProgress[i];
        this._truckProgress[i] = this._advanceRoute(this._truckProgress[i], route, 0.003);
        if (this._truckProgress[i] < previousProgress) {
          l.rounds++;
          l.loadPct = 35 + ((l.rounds * 17 + i * 11) % 60);
        }

        const pos = this._interpolateRoute(route, this._truckProgress[i]);
        l.lat = pos.lat;
        l.lng = pos.lng;
      });

      // Update dynamic labels (e.g. Loading Dock Status)
      const dockB = this._labels.find(l => l.id === 'loading-dock-b');
      if (dockB) {
        const truckCount = this._logistics.filter(l => l.destination === DEMO_PROFILE.assets.dock).length;
        dockB.status = `${truckCount} Trucks Active`;
      }

      this._viewer?.emit('osm-workers-updated' as any, { workers: this._workers });
      this._viewer?.emit('osm-logistics-updated' as any, { logistics: this._logistics });
      this._updateLabels();
      this._updateTrails();
    }, 100);
  }

  private _advanceRoute(progress: number, route: Array<{ lat: number; lng: number }>, step: number): number {
    if (route.length < 2) return 0;
    const max = route.length - 1;
    const next = progress + step;
    return next >= max ? next - max : next;
  }

  private _interpolateRoute(route: Array<{ lat: number; lng: number }>, progress: number): { lat: number; lng: number } {
    const maxSegment = Math.max(0, route.length - 2);
    const idx = Math.min(Math.floor(progress), maxSegment);
    const alpha = progress - idx;
    const p1 = route[idx];
    const p2 = route[idx + 1] ?? route[0];

    return {
      lat: p1.lat + (p2.lat - p1.lat) * alpha,
      lng: p1.lng + (p2.lng - p1.lng) * alpha
    };
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

    loadGoogleMapsSdk()
      .then(() => {
        if (!this._container || this._osmb) return;

        this._osmb = new GoogleYardMap(
          this._container,
          { lat: this._latitude, lng: this._longitude },
          this._zoom,
          this._rotation
        );

        this._osmb.on('change', () => { this._updateLabels(); this._updateTrails(); });
        this._osmb.addMarker({ latitude: 53.693, longitude: -1.503 }, { color: '#20a1b1' });
        this._updateLabels();
        this._updateTrails();
      })
      .catch(e => {
        console.error('[OSMMapPlugin] Failed to initialize Google Maps:', e);
      });
  }

  private _rawTrails: Record<string, { name: string, points: { lat: number, lng: number }[] }> = {};
  
  private async _refreshTrails(): Promise<void> {
    this._rawTrails = await DataConnectService.getHistoricalPaths(24);
    this._updateTrails();
  }

  private _updateTrails(): void {
    if (!this._osmb || !this._active) return;
    const trails: RobotTrail[] = Object.entries(this._rawTrails).map(([id, data]) => {
      const points = projectMapTrail(this._osmb, data.points);
      return { id, name: data.name, points, visible: points.length > 1 };
    });
    this._viewer?.emit('osm-trails-updated' as any, { trails });
  }

  private _updateLabels(): void {
    if (!this._osmb || !this._active) return;
    const updatedLabels = this._labels.map(label => {
      const pos = projectMapPoint(this._osmb, label.lat, label.lng, label.alt);
      return { ...label, x: pos.x, y: pos.y, visible: pos.visible };
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