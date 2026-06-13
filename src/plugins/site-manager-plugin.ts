// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "../core/rv-firebase";
import type { RVViewerPlugin } from "../core/rv-plugin";
import type { RVViewer } from "../core/rv-viewer";
import type { LoadResult } from "../core/engine/rv-scene-loader";
import type { UISlotEntry } from "../core/rv-ui-plugin";
import { BreadcrumbUI } from "../hmi/BreadcrumbUI";
import { debug, logInfo } from "../core/engine/rv-debug";

export interface Site {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  zoom?: number;
  modelUrl?: string; // Optional: If the site corresponds to a specific GLB
}

export interface SiteAsset {
  id: string;
  name: string;
  path: string; // Hierarchy path in the GLB
}

/**
 * SiteManagerPlugin
 * Manages geographic sites and navigation context.
 * Fetches site data from Firebase Firestore and coordinates with OSMMapPlugin.
 */
export class SiteManagerPlugin implements RVViewerPlugin {
  readonly id = 'site-manager';
  readonly order = 50; // Load early for UI
  readonly core = true;

  readonly slots: UISlotEntry[] = [
    {
      id: 'breadcrumb-nav',
      slot: 'top-bar',
      order: 10,
      component: BreadcrumbUI,
    }
  ];

  private _viewer: RVViewer | null = null;
  private _sites: Site[] = [];
  private _currentSite: Site | null = null;
  private _currentAsset: SiteAsset | null = null;
  private _unsubscribe: (() => void) | null = null;

  get sites() { return this._sites; }
  get currentSite() { return this._currentSite; }
  get currentAsset() { return this._currentAsset; }

  onModelLoaded(result: LoadResult, viewer: RVViewer): void {
    this._viewer = viewer;
    this._subscribeToSites();
    
    // 1. Add hardcoded Demo Site for Wakefield (Yorkshire)
    this._sites.push({
      id: 'wakefield-demo',
      name: 'Wakefield Intelligence Hub',
      latitude: 53.693,
      longitude: -1.503,
      zoom: 18
    });

    // 2. Automatically detect current site based on model metadata if available
    const siteId = viewer.scene.userData?.site?.id;
    if (siteId) {
       const site = this._sites.find(s => s.id === siteId);
       if (site) this._currentSite = site;
    }
  }

  private _subscribeToSites(): void {
    if (this._unsubscribe) return;

    debug('site-manager', 'Subscribing to Firestore sites...');
    const q = query(collection(db, "sites"));
    this._unsubscribe = onSnapshot(q, (snapshot) => {
      this._sites = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Site));
      debug('site-manager', `Fetched ${this._sites.length} sites from Firestore`);
      
      // Update current site if needed
      if (this._viewer?.currentModelUrl) {
          const matchingSite = this._sites.find(s => s.modelUrl === this._viewer?.currentModelUrl);
          if (matchingSite) this._currentSite = matchingSite;
      }
      
      this._viewer?.emit('sites-updated' as any, { sites: this._sites });
    });
  }

  /** Navigate to a specific site (updates Map and optionally loads model). */
  async selectSite(site: Site): Promise<void> {
    this._currentSite = site;
    this._currentAsset = null;
    
    logInfo(`Navigating to Site: ${site.name}`);

    // If site has a different modelUrl, load it
    if (site.modelUrl && site.modelUrl !== this._viewer?.currentModelUrl) {
      if (this._viewer?.loadModelWithProgress) {
        await this._viewer.loadModelWithProgress(site.modelUrl);
      }
    }

    // Emit event for OSMMapPlugin to pick up
    this._viewer?.emit('site-selected' as any, { site });
    this._viewer?.emit('breadcrumb-updated' as any);
  }

  /** Highlight an asset and focus the camera on it. */
  selectAsset(asset: SiteAsset): void {
    if (!this._viewer) return;
    this._currentAsset = asset;
    
    logInfo(`Focusing Asset: ${asset.name} (${asset.path})`);

    // 1. Zoom to asset
    this._viewer.focusByPath(asset.path);

    // 2. Clear previous highlights and trigger Pulse Highlight (Alarm mode)
    this._viewer.highlighter.clear();
    const node = this._viewer.registry?.getNode(asset.path);
    if (node) {
      // 'nav-pulse' id is arbitrary but helps track the highlight cause
      this._viewer.highlighter.highlightAlarm(node, 'nav-pulse');
    }

    this._viewer.emit('breadcrumb-updated' as any);
  }

  /** Reset navigation to world level. */
  resetToWorld(): void {
    this._currentSite = null;
    this._currentAsset = null;
    this._viewer?.emit('breadcrumb-updated' as any);
    // Optional: Could open the Map view here
  }

  dispose(): void {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  }
}
