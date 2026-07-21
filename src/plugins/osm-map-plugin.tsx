// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { APIProvider, AdvancedMarker, Map, Pin, useMap } from '@vis.gl/react-google-maps';
import type { RVViewerPlugin } from '../core/rv-plugin';
import type { RVViewer } from '../core/rv-viewer';
import type { LoadResult } from '../core/engine/rv-scene-loader';
import type { UISlotEntry, UISlotProps } from '../core/rv-ui-plugin';
import { 
  IconButton, Tooltip, Box, Typography, Slider, Paper, 
  Divider, CircularProgress, Badge, Chip 
} from '@mui/material';
import { 
  Map as MapIcon, MapOutlined, NearMe,
  WbSunny, Thunderstorm, Traffic, Visibility, Timeline, Warning,
  Schedule, LocalShipping, Badge as BadgeIcon, Warehouse
} from '@mui/icons-material';
import { 
  GeospatialService, WeatherData, FloodAlert, TrafficStatus, 
  SiteMetrics, SiteCondition 
} from '../core/geospatial-service';
import { DataConnectService } from '../core/dataconnect-service';
import { WAKEFIELD_DEMO_PROFILE as DEMO_PROFILE } from './demo/demo-profile';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const GOOGLE_MAPS_MAP_ID = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined) || 'DEMO_MAP_ID';
const GOOGLE_MAPS_LANGUAGE = 'en';
const GOOGLE_MAPS_REGION = 'GB';

type GoogleMapPoint = { lat: number; lng: number };
type YardZone = { id: string; name: string; kind: 'factory' | 'dock' | 'cold' | 'gate'; status: string; position: GoogleMapPoint; accent: string };

class ReactMapProjector {
  private readonly googleApi: typeof google;
  private readonly map: google.maps.Map;
  private readonly overlay: google.maps.OverlayView;
  private readonly container: HTMLElement;

  constructor(map: google.maps.Map, container: HTMLElement) {
    this.googleApi = window.google;
    this.map = map;
    this.container = container;
    this.overlay = new this.googleApi.maps.OverlayView();
    this.overlay.onAdd = () => undefined;
    this.overlay.draw = () => undefined;
    this.overlay.onRemove = () => undefined;
    this.overlay.setMap(map);
  }

  project(lat: number, lng: number, alt = 0): { x: number; y: number; z: number } {
    void this.map;
    const projection = this.overlay.getProjection?.();
    if (!projection) return { x: -1000, y: -1000, z: -1 };

    const point = projection.fromLatLngToContainerPixel(new this.googleApi.maps.LatLng(lat, lng));
    if (!point) return { x: -1000, y: -1000, z: -1 };

    const y = point.y - alt * 0.35;
    const visible = point.x >= -200 && point.y >= -200 && point.x <= this.container.clientWidth + 200 && point.y <= this.container.clientHeight + 200;
    return { x: point.x, y, z: visible ? 1 : -1 };
  }
}

class ReactYardMapBridge {
  private readonly map: google.maps.Map;
  private readonly googleApi: typeof google;
  private readonly projector: ReactMapProjector;
  private readonly listeners = new Set<() => void>();

  constructor(map: google.maps.Map, container: HTMLElement) {
    this.map = map;
    this.googleApi = window.google;
    this.projector = new ReactMapProjector(map, container);
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

  refresh(): void {
    const center = this.map.getCenter?.();
    this.googleApi.maps.event.trigger(this.map, 'resize');
    if (center) this.map.setCenter(center);
    this.map.setTilt?.(0);
    this.map.setHeading?.(0);
    this.emitChange();
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


const YardMapLinework: React.FC<{ plugin: OSMMapPlugin; logistics: LogisticsAsset[] }> = ({ plugin, logistics }) => {
  const map = useMap('wpf-yard-map');

  useEffect(() => {
    if (!map || !window.google) return undefined;
    const googleApi = window.google;
    const boundary = new googleApi.maps.Polygon({ paths: plugin.siteBoundary, strokeColor: '#20c7d9', strokeOpacity: 0.75, strokeWeight: 2, fillColor: '#20c7d9', fillOpacity: 0.12, map });
    const yard = new googleApi.maps.Polygon({ paths: plugin.yardBoundary, strokeColor: '#f9a825', strokeOpacity: 0.9, strokeWeight: 2, fillColor: '#f9a825', fillOpacity: 0.16, map });
    const inbound = new googleApi.maps.Polyline({ path: plugin.inboundRoute, strokeColor: '#8bd67f', strokeOpacity: 0.9, strokeWeight: 4, map });
    const dispatch = new googleApi.maps.Polyline({ path: plugin.dispatchRoute, strokeColor: '#20c7d9', strokeOpacity: 0.9, strokeWeight: 4, map });
    const queue = new googleApi.maps.Polyline({ path: logistics.map(asset => ({ lat: asset.lat, lng: asset.lng })), strokeColor: '#ffd54f', strokeOpacity: 0.55, strokeWeight: 2, map });
    return () => { boundary.setMap(null); yard.setMap(null); inbound.setMap(null); dispatch.setMap(null); queue.setMap(null); };
  }, [map, plugin, logistics]);

  return null;
};

const YardPin: React.FC<{ label: string; sub?: string; accent: string; tone?: 'dark' | 'cyan' | 'amber'; onClick?: () => void }> = ({ label, sub, accent, tone = 'dark', onClick }) => (
  <Box onClick={onClick} sx={{ transform: 'translate(-50%, -100%)', cursor: onClick ? 'pointer' : 'default', bgcolor: tone === 'cyan' ? 'rgba(5, 36, 43, 0.94)' : tone === 'amber' ? 'rgba(48, 34, 9, 0.94)' : 'rgba(8, 12, 17, 0.94)', color: '#fff', border: '1px solid ' + accent, borderRadius: '8px', minWidth: 150, px: 1.3, py: 0.9, boxShadow: '0 10px 24px rgba(0,0,0,0.45)', backdropFilter: 'blur(10px)', pointerEvents: 'auto' }}>
    <Typography sx={{ fontSize: 12, lineHeight: 1.1, fontWeight: 900 }}>{label}</Typography>
    {sub && <Typography sx={{ mt: 0.35, fontSize: 9.5, fontWeight: 800, color: accent }}>{sub}</Typography>}
  </Box>
);

const YardMapMarkers: React.FC<{ viewer: RVViewer; plugin: OSMMapPlugin; workers: SiteWorker[]; logistics: LogisticsAsset[] }> = ({ viewer, plugin, workers, logistics }) => (
  <>
    {plugin.zones.map(zone => (
      <AdvancedMarker key={zone.id} position={zone.position}>
        <YardPin label={zone.name} sub={zone.status} accent={zone.accent} tone={zone.kind === 'dock' ? 'amber' : 'cyan'} onClick={() => emitAssetDetail(viewer, zone.id)} />
      </AdvancedMarker>
    ))}
    {logistics.map(asset => (
      <AdvancedMarker key={asset.id} position={{ lat: asset.lat, lng: asset.lng }}>
        <Box onClick={() => emitAssetDetail(viewer, asset.id)} sx={{ transform: 'translate(-50%, -50%)', pointerEvents: 'auto', cursor: 'pointer' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.7, px: 1, py: 0.55, bgcolor: 'rgba(0, 151, 177, 0.96)', color: '#fff', border: '1px solid rgba(255,255,255,0.45)', borderRadius: '7px', boxShadow: '0 8px 18px rgba(0,0,0,0.38)' }}>
            <LocalShipping sx={{ fontSize: 14 }} />
            <Typography sx={{ fontSize: 10, fontWeight: 900 }}>{asset.id}</Typography>
            <Chip label={asset.loadPct + '%'} size="small" sx={{ height: 15, fontSize: 8, bgcolor: 'rgba(255,255,255,0.16)', color: '#fff', fontWeight: 900 }} />
          </Box>
        </Box>
      </AdvancedMarker>
    ))}
    {workers.map(worker => (
      <AdvancedMarker key={worker.id} position={{ lat: worker.lat, lng: worker.lng }}>
        <Tooltip title={worker.name + ' - ' + worker.role + ' - simulated GPS'}>
          <Box onClick={() => emitAssetDetail(viewer, worker.name)} sx={{ width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: worker.role === 'Security' ? '#ff5252' : '#00c853', border: '2px solid white', boxShadow: '0 0 0 5px rgba(255,255,255,0.16), 0 8px 18px rgba(0,0,0,0.36)', pointerEvents: 'auto', cursor: 'pointer' }}>
            <BadgeIcon sx={{ fontSize: 12, color: '#071013' }} />
          </Box>
        </Tooltip>
      </AdvancedMarker>
    ))}
  </>
);

const YardMapDashboard: React.FC<{ active: boolean; workers: SiteWorker[]; logistics: LogisticsAsset[] }> = ({ active, workers, logistics }) => (
  <Box sx={{ position: 'absolute', left: 64, top: 112, width: 308, zIndex: 5, display: active ? 'block' : 'none', pointerEvents: 'auto' }}>
    <Paper sx={{ bgcolor: 'rgba(7, 12, 16, 0.88)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 18px 42px rgba(0,0,0,0.42)', backdropFilter: 'blur(14px)' }}>
      <Box sx={{ p: 1.4, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <Typography sx={{ fontSize: 10, color: '#20c7d9', fontWeight: 900, letterSpacing: 1 }}>{DEMO_PROFILE.client.siteCode} YARD CONTROL</Typography>
        <Typography sx={{ fontSize: 16, fontWeight: 900, mt: 0.2 }}>Wakefield 41 Site Map</Typography>
        <Typography sx={{ fontSize: 10.5, color: 'rgba(255,255,255,0.62)', mt: 0.4 }}>Prototype location: Wakefield 41 Industrial Estate, Telford Way / Kenmore Road.</Typography>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.8, p: 1.2 }}>
        {[['Inbound', '1 held'], ['Dock 4', '2 queue'], ['Team', String(workers.length) + ' live']].map(([label, value]) => (
          <Box key={label} sx={{ bgcolor: 'rgba(255,255,255,0.07)', borderRadius: '6px', p: 0.9 }}>
            <Typography sx={{ fontSize: 9, color: 'rgba(255,255,255,0.52)', fontWeight: 800 }}>{label}</Typography>
            <Typography sx={{ fontSize: 13, color: label === 'Dock 4' ? '#ffd54f' : '#20c7d9', fontWeight: 900 }}>{value}</Typography>
          </Box>
        ))}
      </Box>
      <Box sx={{ px: 1.2, pb: 1.2 }}>
        <Box sx={{ display: 'flex', gap: 0.7, mb: 1 }}>
          <Chip icon={<Warehouse sx={{ fontSize: 12 }} />} label="Site boundary" size="small" sx={{ color: '#20c7d9', borderColor: 'rgba(32,199,217,0.45)' }} variant="outlined" />
          <Chip label="Simulated GPS" size="small" sx={{ color: '#ffd54f', borderColor: 'rgba(255,213,79,0.45)' }} variant="outlined" />
        </Box>
        {logistics.slice(0, 3).map(asset => (
          <Box key={asset.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, py: 0.7, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <Typography sx={{ fontSize: 11, fontWeight: 900 }}>{asset.id}</Typography>
            <Typography sx={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>{asset.destination}</Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  </Box>
);

const GoogleMapBinder: React.FC<{ plugin: OSMMapPlugin }> = ({ plugin }) => {
  const map = useMap('wpf-yard-map');

  useEffect(() => {
    if (!map) return;
    plugin.bindReactMap(map);
  }, [map, plugin]);

  return null;
};

const GoogleYardMapPortal: React.FC<UISlotProps> = ({ viewer }) => {
  const [active, setActive] = useState(false);
  const [workers, setWorkers] = useState<SiteWorker[]>([]);
  const [logistics, setLogistics] = useState<LogisticsAsset[]>([]);
  const mapPlugin = viewer.getPlugin('osm-map') as OSMMapPlugin | undefined;
  const mapContainer = mapPlugin?.mapContainer;

  useEffect(() => {
    const handleToggle = (e: any) => setActive(!!e.active);
    const handleWorkers = (e: any) => setWorkers(e.workers || []);
    const handleLogistics = (e: any) => setLogistics(e.logistics || []);
    viewer.on('osm-map-toggled' as any, handleToggle);
    viewer.on('osm-workers-updated' as any, handleWorkers);
    viewer.on('osm-logistics-updated' as any, handleLogistics);
    if (mapPlugin) {
      setWorkers(mapPlugin.workers);
      setLogistics(mapPlugin.logistics);
    }
    return () => {
      viewer.off('osm-map-toggled' as any, handleToggle);
      viewer.off('osm-workers-updated' as any, handleWorkers);
      viewer.off('osm-logistics-updated' as any, handleLogistics);
    };
  }, [viewer, mapPlugin]);

  useEffect(() => {
    if (active) window.setTimeout(() => mapPlugin?.refreshMap(), 50);
  }, [active, mapPlugin]);

  if (!mapPlugin || !mapContainer) return null;

  if (!GOOGLE_MAPS_API_KEY) {
    return createPortal(
      <Box sx={{ position: 'absolute', inset: 0, display: active ? 'grid' : 'none', placeItems: 'center', bgcolor: '#050607', color: '#fff', zIndex: 1 }}>
        <Paper sx={{ p: 2, bgcolor: 'rgba(12,15,19,0.92)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)' }}>
          <Typography sx={{ fontSize: 13, fontWeight: 900 }}>Google Maps API key missing</Typography>
          <Typography sx={{ fontSize: 11, color: 'rgba(255,255,255,0.62)' }}>Set VITE_GOOGLE_MAPS_API_KEY before building.</Typography>
        </Paper>
      </Box>,
      mapContainer,
    );
  }

  return createPortal(
    <Box sx={{ position: 'absolute', inset: 0, zIndex: 1, display: active ? 'block' : 'none', '& .gm-style': { fontFamily: 'Roboto, Arial, sans-serif' } }}>
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['marker']} version="weekly" language={GOOGLE_MAPS_LANGUAGE} region={GOOGLE_MAPS_REGION}>
        <Map
          id="wpf-yard-map"
          mapId={GOOGLE_MAPS_MAP_ID}
          defaultCenter={{ lat: mapPlugin.latitude, lng: mapPlugin.longitude }}
          defaultZoom={mapPlugin.zoom}
          mapTypeId="satellite"
          tilt={0}
          heading={0}
          disableDefaultUI
          gestureHandling="greedy"
          clickableIcons={false}
          internalUsageAttributionIds={['gmp_git_agentskills_v1']}
          onCameraChanged={() => mapPlugin.refreshMapProjection()}
          style={{ width: '100%', height: '100%' }}
        >
          <YardMapLinework plugin={mapPlugin} logistics={logistics} />
          <YardMapMarkers viewer={viewer} plugin={mapPlugin} workers={workers} logistics={logistics} />
          <GoogleMapBinder plugin={mapPlugin} />
        </Map>
      </APIProvider>
      <YardMapDashboard active={active} workers={workers} logistics={logistics} />
    </Box>,
    mapContainer,
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
    { slot: 'overlay', order: 8, component: GoogleYardMapPortal }
  ];

  private _viewer: RVViewer | null = null;
  private _osmb: ReactYardMapBridge | null = null;
  private _active = false;
  private _container: HTMLElement | null = null;
  private _appContainer: HTMLElement | null = null;

  get mapContainer(): HTMLElement | null {
    return this._container;
  }

  get latitude(): number { return this._latitude; }
  get longitude(): number { return this._longitude; }
  get zoom(): number { return this._zoom; }
  get workers(): SiteWorker[] { return [...this._workers]; }
  get logistics(): LogisticsAsset[] { return [...this._logistics]; }

  readonly siteBoundary: GoogleMapPoint[] = [
    { lat: 53.69485, lng: -1.50635 },
    { lat: 53.69445, lng: -1.50055 },
    { lat: 53.69155, lng: -1.50095 },
    { lat: 53.69135, lng: -1.50625 },
  ];

  readonly yardBoundary: GoogleMapPoint[] = [
    { lat: 53.69325, lng: -1.5029 },
    { lat: 53.69285, lng: -1.50155 },
    { lat: 53.69195, lng: -1.50195 },
    { lat: 53.69222, lng: -1.50325 },
  ];

  readonly inboundRoute: GoogleMapPoint[] = [
    { lat: 53.6952, lng: -1.5079 },
    { lat: 53.6944, lng: -1.5062 },
    { lat: 53.69325, lng: -1.5038 },
    { lat: 53.69265, lng: -1.5025 },
  ];

  readonly dispatchRoute: GoogleMapPoint[] = [
    { lat: 53.69315, lng: -1.50335 },
    { lat: 53.6925, lng: -1.50225 },
    { lat: 53.69165, lng: -1.50105 },
  ];

  readonly zones: YardZone[] = [
    { id: 'wakefield-factory', name: DEMO_PROFILE.client.siteName, kind: 'factory', status: 'Packing live', position: { lat: 53.6931, lng: -1.5034 }, accent: '#20c7d9' },
    { id: 'north-gate', name: 'Gatehouse', kind: 'gate', status: 'HGV-14 held', position: { lat: 53.69435, lng: -1.5061 }, accent: '#8bd67f' },
    { id: 'loading-dock-b', name: DEMO_PROFILE.assets.dockLabel, kind: 'dock', status: '2 waiting', position: { lat: 53.69225, lng: -1.50215 }, accent: '#ffd54f' },
    { id: 'cold-store-b', name: DEMO_PROFILE.assets.coldStore, kind: 'cold', status: '2.4 C stable', position: { lat: 53.69275, lng: -1.50155 }, accent: '#20c7d9' },
  ];

  bindReactMap(map: google.maps.Map): void {
    if (!this._container) return;
    if (!this._osmb) {
      this._osmb = new ReactYardMapBridge(map, this._container);
      this._osmb.on('change', () => { this._updateLabels(); this._updateTrails(); });
    }
    this.refreshMap();
  }

  refreshMap(): void {
    this._osmb?.refresh();
  }

  refreshMapProjection(): void {
    this._updateLabels();
    this._updateTrails();
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
    this._viewer?.emit('osm-map-ready' as any, undefined);
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


  private _rawTrails: Record<string, { name: string, points: { lat: number, lng: number }[] }> = {};
  
  private async _refreshTrails(): Promise<void> {
    this._rawTrails = await DataConnectService.getHistoricalPaths(24);
    this._updateTrails();
  }

  private _updateTrails(): void { }

  private _updateLabels(): void { }

  private _show(): void {
    if (this._container) { 
      this._container.style.opacity = '1'; 
      this._container.style.pointerEvents = 'auto'; 
      this._container.style.display = 'block';
      window.setTimeout(() => this._osmb?.refresh?.(), 50);
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