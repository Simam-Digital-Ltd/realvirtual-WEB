// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import React, { useState, useEffect } from 'react';
import type { RVViewerPlugin } from '../core/rv-plugin';
import type { RVViewer } from '../core/rv-viewer';
import type { LoadResult } from '../core/engine/rv-scene-loader';
import type { UISlotEntry, UISlotProps } from '../core/rv-ui-plugin';
import { IconButton, Tooltip } from '@mui/material';
import { Map as MapIcon, MapOutlined } from '@mui/icons-material';

// @ts-ignore - Loaded via CDN in index.html
const OSMBuildings = (window as any).OSMBuildings;

/**
 * OSMMapToggle Component
 * Rendered in the 'views' slot to toggle the 3D map.
 */
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

  return (
    <Tooltip title={active ? "Hide Site Map" : "Show Site Map"} placement="left">
      <IconButton 
        onClick={toggle} 
        color={active ? "primary" : "inherit"}
        sx={{ 
          bgcolor: active ? 'rgba(32, 161, 177, 0.2)' : 'transparent',
          '&:hover': { bgcolor: active ? 'rgba(32, 161, 177, 0.3)' : 'rgba(255,255,255,0.05)' }
        }}
      >
        {active ? <MapIcon /> : <MapOutlined />}
      </IconButton>
    </Tooltip>
  );
};

export class OSMMapPlugin implements RVViewerPlugin {
  readonly id = 'osm-map';
  readonly order = 1000;
  readonly slots: UISlotEntry[] = [
    {
      id: 'osm-map-toggle',
      slot: 'button-group', // Move to button-group (left side)
      order: 100,
      component: OSMMapToggle,
    }
  ];

  private _viewer: RVViewer | null = null;
  private _osmb: any = null;
  private _active = false;
  private _container: HTMLElement | null = null;
  private _appContainer: HTMLElement | null = null;

  // Default coordinate: Berlin Demo
  private _latitude = 52.5200;
  private _longitude = 13.4040;
  private _rotation = 0;
  private _zoom = 17;

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
    } else {
      this._hide();
    }
    this._viewer?.emit('osm-map-toggled' as any, { active: this._active });
  }

  private _setupMap(): void {
    if (!this._container || this._osmb) return;

    try {
      this._osmb = new OSMBuildings({
        container: 'map',
        position: { latitude: this._latitude, longitude: this._longitude },
        zoom: this._zoom,
        minZoom: 15,
        maxZoom: 22,
        tilt: 45,
        rotation: this._rotation,
        effects: ['shadows'],
        attribution: '© OSM Buildings'
      });

      this._osmb.addMapTiles('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
      this._osmb.addGeoJSONTiles('https://{s}.data.osmbuildings.org/0.2/59fcc2e8/tile/{z}/{x}/{y}.json');
    } catch (e) {
      console.error('[OSMMapPlugin] Failed to initialize OSM Buildings:', e);
    }
  }

  private _show(): void {
    if (this._container) {
      this._container.style.opacity = '1';
      this._container.style.pointerEvents = 'auto';
    }
    
    if (this._appContainer) {
      this._appContainer.style.transition = 'opacity 0.5s ease-in-out';
      this._appContainer.style.opacity = '0.4';
      // Note: we don't disable pointer events so user can still rotate the model OVER the map
    }
  }

  private _hide(): void {
    if (this._container) {
      this._container.style.opacity = '0';
      this._container.style.pointerEvents = 'none';
    }
    if (this._appContainer) {
      this._appContainer.style.opacity = '1';
    }
  }

  onRender(): void {
    // Optional: Synchronize logic here
  }

  dispose(): void {
    this._hide();
  }
}
