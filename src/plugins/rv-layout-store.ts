/**
 * LayoutStore — State management for the Layout Planner plugin.
 *
 * Uses useSyncExternalStore pattern for React integration.
 * Manages catalog tabs, placed components, selection, grid settings,
 * and localStorage persistence.
 */

// ─── Types ──────────────────────────────────────────────────────────────

export interface LibraryCatalog {
  version: '1.0';
  name: string;
  entries: LibraryCatalogEntry[];
}

export interface LibraryCatalogEntry {
  id: string;
  name: string;
  category: 'conveyor' | 'robot' | 'machine' | 'fixture' | 'custom';
  glbUrl: string;
  thumbnailUrl: string;
  footprintMm?: [number, number];
  tags?: string[];
}

export interface PlacedComponent {
  id: string;
  catalogId: string;
  glbUrl: string;
  label: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface LayoutFile {
  version: '1.0';
  name: string;
  createdAt: string;
  catalogUrls: string[];
  gridSizeMm: number;
  components: PlacedComponent[];
}

export type TransformMode = 'select' | 'translate' | 'rotate';

export interface LayoutSnapshot {
  catalogs: Map<string, LibraryCatalog>;
  catalogUrls: string[];
  catalogErrors: Map<string, string>;
  activeTabUrl: string | null;
  placed: PlacedComponent[];
  selectedId: string | null;
  mode: TransformMode;
  gridEnabled: boolean;
  gridSizeMm: number;
  placementMode: string | null; // catalogEntry id for tap-to-place
}

// ─── localStorage keys ──────────────────────────────────────────────────

const LS_KEY_URLS = 'rv-layout-library-urls';
const LS_KEY_AUTOSAVE = 'rv-layout-autosave';
const LS_KEY_GRID_ENABLED = 'rv-layout-grid-enabled';
const LS_KEY_GRID_SIZE = 'rv-layout-grid-size';

// ─── Serialization helpers ──────────────────────────────────────────────

export function serializeLayout(
  name: string,
  components: PlacedComponent[],
  catalogUrls: string[],
  gridSizeMm: number,
): LayoutFile {
  return {
    version: '1.0',
    name,
    createdAt: new Date().toISOString(),
    catalogUrls,
    gridSizeMm,
    components,
  };
}

export function deserializeLayout(json: string): LayoutFile {
  const data = JSON.parse(json);
  return data as LayoutFile;
}

// ─── Grid snap helper ───────────────────────────────────────────────────

export function snapToGrid(
  pos: { x: number; y: number; z: number },
  gridSize: number,
): { x: number; y: number; z: number } {
  if (gridSize <= 0) return { ...pos };
  return {
    x: Math.round(pos.x / gridSize) * gridSize,
    y: pos.y,
    z: Math.round(pos.z / gridSize) * gridSize,
  };
}

// ─── Floor alignment helper ─────────────────────────────────────────────

import { Box3, Vector3, type Object3D } from 'three';

const _box = new Box3();
const _v = new Vector3();

/** Shift object so the bottom of its bounding box sits at Y=0. */
export function alignToFloor(obj: Object3D): void {
  // Reset position to origin before computing bounds
  const savedY = obj.position.y;
  obj.position.y = 0;
  obj.updateMatrixWorld(true);

  _box.setFromObject(obj);
  if (_box.isEmpty()) {
    obj.position.y = savedY;
    return;
  }

  _v.copy(_box.min);
  obj.position.y = -_v.y;
}

// ─── Store ──────────────────────────────────────────────────────────────

export class LayoutStore {
  private _catalogs = new Map<string, LibraryCatalog>();
  private _catalogUrls: string[] = [];
  private _catalogErrors = new Map<string, string>();
  private _activeTabUrl: string | null = null;
  private _placed: PlacedComponent[] = [];
  private _selectedId: string | null = null;
  private _mode: TransformMode = 'select';
  private _gridEnabled = true;
  private _gridSizeMm = 500;
  private _placementMode: string | null = null;
  private _listeners = new Set<() => void>();
  private _snapshot: LayoutSnapshot;
  /** Map of URL -> pending Promise to serialize concurrent fetches. */
  private _pendingFetches = new Map<string, Promise<void>>();

  constructor() {
    // Restore grid settings from localStorage
    try {
      const ge = localStorage.getItem(LS_KEY_GRID_ENABLED);
      if (ge !== null) this._gridEnabled = ge === 'true';
      const gs = localStorage.getItem(LS_KEY_GRID_SIZE);
      if (gs !== null) {
        const n = Number(gs);
        if (!Number.isNaN(n) && n > 0) this._gridSizeMm = n;
      }
    } catch { /* ignore */ }

    this._snapshot = this._createSnapshot();
  }

  // ─── useSyncExternalStore API ─────────────────────────────────────

  subscribe = (listener: () => void): (() => void) => {
    this._listeners.add(listener);
    return () => { this._listeners.delete(listener); };
  };

  getSnapshot = (): LayoutSnapshot => {
    return this._snapshot;
  };

  // ─── Catalog management (multi-tab) ───────────────────────────────

  async addCatalog(url: string): Promise<void> {
    // If already loading this URL, wait for the existing fetch
    const existing = this._pendingFetches.get(url);
    if (existing) {
      await existing;
      return;
    }

    // Avoid duplicate tabs
    if (this._catalogUrls.includes(url)) {
      this._activeTabUrl = url;
      this._notify();
      return;
    }

    // Add URL to tab list immediately (shows loading state)
    this._catalogUrls.push(url);
    if (!this._activeTabUrl) this._activeTabUrl = url;
    this._notify();

    const fetchPromise = (async () => {
      try {
        const resp = await fetch(url);
        if (!resp.ok) {
          this._catalogErrors.set(url, `HTTP ${resp.status}`);
          this._notify();
          return;
        }
        const data = await resp.json() as LibraryCatalog;
        if (!data.entries || !Array.isArray(data.entries)) {
          this._catalogErrors.set(url, 'Invalid catalog format');
          this._notify();
          return;
        }
        this._catalogs.set(url, data);
        this._catalogErrors.delete(url);
        this._notify();
      } catch (e) {
        this._catalogErrors.set(url, String(e));
        this._notify();
      } finally {
        this._pendingFetches.delete(url);
      }
    })();

    this._pendingFetches.set(url, fetchPromise);
    await fetchPromise;

    this._persistUrls();
  }

  removeCatalog(url: string): void {
    const idx = this._catalogUrls.indexOf(url);
    if (idx === -1) return;
    this._catalogUrls.splice(idx, 1);
    this._catalogs.delete(url);
    this._catalogErrors.delete(url);

    // Switch active tab
    if (this._activeTabUrl === url) {
      this._activeTabUrl = this._catalogUrls[0] ?? null;
    }
    this._persistUrls();
    this._notify();
  }

  setActiveTab(url: string): void {
    if (!this._catalogUrls.includes(url)) return;
    this._activeTabUrl = url;
    this._notify();
  }

  // ─── Component management ─────────────────────────────────────────

  addComponent(comp: PlacedComponent): void {
    this._placed = [...this._placed, comp];
    this._notify();
  }

  removeComponent(id: string): void {
    this._placed = this._placed.filter(c => c.id !== id);
    if (this._selectedId === id) this._selectedId = null;
    this._notify();
  }

  selectComponent(id: string | null): void {
    this._selectedId = id;
    this._notify();
  }

  updateTransform(id: string, position: [number, number, number], rotation: [number, number, number]): void {
    this._placed = this._placed.map(c =>
      c.id === id ? { ...c, position, rotation } : c,
    );
    this._notify();
  }

  updateLabel(id: string, label: string): void {
    this._placed = this._placed.map(c =>
      c.id === id ? { ...c, label } : c,
    );
    this._notify();
  }

  // ─── Mode & Grid ──────────────────────────────────────────────────

  setMode(mode: TransformMode): void {
    this._mode = mode;
    this._notify();
  }

  setGridEnabled(enabled: boolean): void {
    this._gridEnabled = enabled;
    try { localStorage.setItem(LS_KEY_GRID_ENABLED, String(enabled)); } catch { /* ignore */ }
    this._notify();
  }

  setGridSize(mm: number): void {
    this._gridSizeMm = mm;
    try { localStorage.setItem(LS_KEY_GRID_SIZE, String(mm)); } catch { /* ignore */ }
    this._notify();
  }

  setPlacementMode(catalogEntryId: string | null): void {
    this._placementMode = catalogEntryId;
    this._notify();
  }

  // ─── Persistence ──────────────────────────────────────────────────

  autoSave(): void {
    try {
      const layout = serializeLayout(
        'autosave',
        this._placed,
        this._catalogUrls,
        this._gridSizeMm,
      );
      localStorage.setItem(LS_KEY_AUTOSAVE, JSON.stringify(layout));
    } catch {
      // QuotaExceededError — silently ignore
    }
  }

  loadAutoSave(): void {
    try {
      const json = localStorage.getItem(LS_KEY_AUTOSAVE);
      if (!json) return;
      const layout = deserializeLayout(json);
      this._placed = layout.components;
      this._gridSizeMm = layout.gridSizeMm;
      this._notify();
    } catch { /* ignore corrupt data */ }
  }

  async restoreFromStorage(): Promise<void> {
    try {
      const urlsJson = localStorage.getItem(LS_KEY_URLS);
      if (!urlsJson) return;
      const urls = JSON.parse(urlsJson) as string[];
      for (const url of urls) {
        await this.addCatalog(url);
      }
    } catch { /* ignore */ }
  }

  /** Replace all placed components (used when loading a layout file). */
  setComponents(components: PlacedComponent[]): void {
    this._placed = [...components];
    this._selectedId = null;
    this._notify();
  }

  // ─── Getters (non-React) ──────────────────────────────────────────

  get placed(): PlacedComponent[] { return this._placed; }
  get selectedId(): string | null { return this._selectedId; }
  get gridEnabled(): boolean { return this._gridEnabled; }
  get gridSizeMm(): number { return this._gridSizeMm; }

  // ─── Internal ─────────────────────────────────────────────────────

  private _persistUrls(): void {
    try {
      localStorage.setItem(LS_KEY_URLS, JSON.stringify(this._catalogUrls));
    } catch { /* ignore */ }
  }

  private _createSnapshot(): LayoutSnapshot {
    return {
      catalogs: new Map(this._catalogs),
      catalogUrls: [...this._catalogUrls],
      catalogErrors: new Map(this._catalogErrors),
      activeTabUrl: this._activeTabUrl,
      placed: this._placed,
      selectedId: this._selectedId,
      mode: this._mode,
      gridEnabled: this._gridEnabled,
      gridSizeMm: this._gridSizeMm,
      placementMode: this._placementMode,
    };
  }

  private _notify(): void {
    this._snapshot = this._createSnapshot();
    for (const l of this._listeners) l();
  }
}
