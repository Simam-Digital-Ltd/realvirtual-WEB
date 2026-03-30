/**
 * RVViewer — Public facade for the realvirtual Web Viewer core.
 *
 * Single entry point that owns the Three.js scene, simulation loop, and all
 * core subsystems. Framework-agnostic: no React, no MUI. Custom UIs bind
 * to this class via events and direct property access.
 *
 * Usage:
 *   const viewer = new RVViewer(document.getElementById('app'));
 *   await viewer.loadModel('./models/demo.glb');
 *   viewer.signalStore?.subscribe('ConveyorStart', console.log);
 *   viewer.on('drive-hover', ({ drive }) => console.log(drive?.name));
 */

import {
  Scene,
  PerspectiveCamera,
  OrthographicCamera,
  WebGLRenderer,
  AmbientLight,
  DirectionalLight,
  Color,
  Vector3,
  Vector2,
  Box3,
  Object3D,
  MOUSE,
  TOUCH,
  PlaneGeometry,
  Mesh,
  MeshStandardMaterial,
  NoToneMapping,
  CanvasTexture,
  RepeatWrapping,
  NearestFilter,
  SRGBColorSpace,
  Raycaster,
  Spherical,
  BufferGeometry,
} from 'three';
import type { Renderer } from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ToneMappingType, ShadowQuality, ProjectionType } from './hmi/visual-settings-store';
import { CameraManager, type ViewportOffset } from './rv-camera-manager';
import { VisualSettingsManager } from './rv-visual-settings-manager';
import Stats from 'stats-gl';

import { EventEmitter } from './rv-events';
import { debug, logInfo } from './engine/rv-debug';
import { DRAG_THRESHOLD_PX, DEFAULT_DPR_CAP } from './engine/rv-constants';
import { loadGLB, type LoadResult } from './engine/rv-scene-loader';
import {
  loadModelJsonConfig,
  extractGlbPluginConfig,
  mergeModelConfig,
  type ModelConfig,
} from './engine/rv-model-config';
import { loadExternalPlugin } from './engine/rv-plugin-loader';
import { SimulationLoop } from './engine/rv-simulation-loop';
import { RVHighlightManager } from './engine/rv-highlight-manager';
import { RaycastManager, type ObjectHoverData, type ObjectUnhoverData, type ObjectClickData } from './engine/rv-raycast-manager';
import type { RaycastLayerName } from './engine/rv-raycast-layers';
import type { RVDrive } from './engine/rv-drive';
import type { RVTransportManager } from './engine/rv-transport-manager';
import type { SignalStore } from './engine/rv-signal-store';
import type { RVDrivesPlayback } from './engine/rv-drives-playback';
import type { RVReplayRecording } from './engine/rv-replay-recording';
import type { RVLogicEngine } from './engine/rv-logic-engine';
import type { NodeRegistry, NodeSearchResult } from './engine/rv-node-registry';
import type { GroupRegistry } from './engine/rv-group-registry';
import { registerFilterSubscriber, loadSearchSettings, isTypeEnabled } from './hmi/search-settings-store';
import type { RVViewerPlugin } from './rv-plugin';
import { UIPluginRegistry } from './rv-ui-registry';
import { isActiveForState } from './engine/rv-active-only';
import { LeftPanelManager } from './hmi/left-panel-manager';
import { SelectionManager } from './engine/rv-selection-manager';
import { ContextMenuStore } from './hmi/context-menu-store';
import type { ContextMenuTarget } from './hmi/context-menu-store';
import type { SelectionSnapshot } from './engine/rv-selection-manager';
import { isMobileDevice } from '../hooks/use-mobile-layout';
import { resetDynamicContexts } from './hmi/ui-context-store';
import { getAppConfig } from './rv-app-config';

// ─── Plugin Error Isolation ──────────────────────────────────────────────

/**
 * Call a plugin method with error isolation. If the method doesn't exist
 * or throws, the error is logged with the plugin's ID and swallowed.
 * Exported for unit testing — only used internally by RVViewer.
 */
export function callPlugin(
  plugin: RVViewerPlugin,
  method: string,
  ...args: unknown[]
): void {
  const fn = (plugin as unknown as Record<string, unknown>)[method];
  if (typeof fn !== 'function') return;
  try {
    fn.apply(plugin, args);
  } catch (e) {
    console.error(`[RVViewer] Plugin '${plugin.id}' ${method} error:`, e);
  }
}

// ─── Public Types ───────────────────────────────────────────────────────

// Re-export ViewportOffset from CameraManager (public API backward compat)
export type { ViewportOffset } from './rv-camera-manager';

export interface RVViewerOptions {
  /** Use WebGPU renderer (falls back to WebGL if unavailable). Default: false */
  useWebGPU?: boolean;
  /** Show checkerboard ground plane. Default: true */
  ground?: boolean;
  /** Auto-resize on window resize. Default: true */
  autoResize?: boolean;
  /** Enable native MSAA antialiasing (constructor-only, requires page reload to change). Default: false */
  antialias?: boolean;
}

export interface ViewerEvents {
  // ── Existing events (unchanged) ──
  'model-loaded': { result: LoadResult };
  'model-cleared': void;
  'drive-hover': { drive: RVDrive | null; clientX: number; clientY: number };
  'drive-focus': { drive: RVDrive | null; node: Object3D | null };
  'drive-chart-toggle': { open: boolean };
  'drive-filter': { filter: string; filteredDrives: RVDrive[] };
  'node-filter': { filter: string; filteredNodes: NodeSearchResult[]; tooMany: boolean };
  'sensor-chart-toggle': { open: boolean };
  'groups-overlay-toggle': { open: boolean };
  'exclusive-hover-mode': { mode: RaycastLayerName | null };

  // ── Connection state ──
  'connection-state-changed': { state: 'Connected' | 'Disconnected'; previous: 'Connected' | 'Disconnected' };

  // ── Simulation events (emitted by plugins) ──
  'sensor-changed': { sensorPath: string; occupied: boolean };
  'mu-spawned': { totalSpawned: number };
  'mu-consumed': { totalConsumed: number };
  'drive-at-target': { drivePath: string; position: number };

  // ── Interface events (emitted by interface plugins) ──
  'interface-connected': { interfaceId: string; type: string };
  'interface-disconnected': { interfaceId: string; reason?: string };
  'interface-error': { interfaceId: string; error: string };
  'interface-data': { interfaceId: string; signals: Record<string, unknown> };

  // ── Generic raycast events (emitted by RaycastManager) ──
  'object-hover': ObjectHoverData | null;
  'object-unhover': ObjectUnhoverData;
  'object-click': ObjectClickData;

  // ── UI events (emitted by UI plugins) ──
  'camera-animation-done': { targetPath?: string };
  'object-clicked': { path: string; node: Object3D };
  'selection-changed': SelectionSnapshot;
  'object-focus': { path: string; node: Object3D };
  'panel-opened': { panelId: string };
  'panel-closed': { panelId: string };

  // ── XR events ──
  'xr-session-start': void;
  'xr-session-end': void;
  'xr-hit-test': { position: Float32Array; matrix: Float32Array };
  'xr-controller-select': { hand: 'left' | 'right'; position: { x: number; y: number; z: number } };

  // ── FPV events ──
  'fpv-enter': void;
  'fpv-exit': void;

  // ── Context Menu events ──
  'context-menu-request': { pos: { x: number; y: number }; path: string; node: Object3D };

  // ── Layout events ──
  'layout-transform-update': { path: string; position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number } };
}

// ─── RVViewer ───────────────────────────────────────────────────────────

export class RVViewer extends EventEmitter<ViewerEvents> {
  // --- Three.js context (read-only for custom UIs) ---
  readonly scene: Scene;
  private perspCamera!: PerspectiveCamera;
  private orthoCamera!: OrthographicCamera;
  private _activeCamera!: PerspectiveCamera | OrthographicCamera;
  /** The active camera (perspective or orthographic). */
  get camera(): PerspectiveCamera | OrthographicCamera { return this._activeCamera; }
  readonly renderer: Renderer;
  readonly controls: OrbitControls;
  readonly loop: SimulationLoop;
  private stats!: Stats;
  private statsReady = false;
  readonly isWebGPU: boolean;

  /** Whether native MSAA antialiasing is active (set at renderer creation, cannot change at runtime). */
  private _antialiasActive = false;
  /** Whether native MSAA antialiasing is active on the current renderer. */
  get antialiasActive(): boolean { return this._antialiasActive; }

  // --- Delegated Managers (internal implementation detail) ---
  /** @internal Camera projection, animation, and viewport offset logic. */
  private _cameraManager!: CameraManager;
  /** @internal Lighting, tone mapping, shadows, DPR settings. */
  private _visualSettings!: VisualSettingsManager;

  // --- Highlight system (always available) ---
  readonly highlighter: RVHighlightManager;

  // --- Connection State ---
  /** Global connection state — controls which subsystems run based on their ActiveOnly mode. */
  private _connectionState: 'Connected' | 'Disconnected' = 'Connected';

  /** Current connection state ('Connected' or 'Disconnected'). */
  get connectionState(): 'Connected' | 'Disconnected' { return this._connectionState; }

  /**
   * Set the global connection state. Notifies all plugins and emits
   * 'connection-state-changed' event. Subsystems are guarded in fixedUpdate().
   */
  setConnectionState(state: 'Connected' | 'Disconnected'): void {
    if (state === this._connectionState) return;
    const previous = this._connectionState;
    this._connectionState = state;

    // Notify plugins
    for (const p of this._plugins) {
      callPlugin(p, 'onConnectionStateChanged', state, this);
    }

    this.emit('connection-state-changed', { state, previous });
  }

  // --- Simulation state (populated after loadModel) ---
  signalStore: SignalStore | null = null;
  registry: NodeRegistry | null = null;
  drives: RVDrive[] = [];
  /** Unified raycast manager (replaces the old driveHover). */
  raycastManager: RaycastManager | null = null;
  transportManager: RVTransportManager | null = null;
  logicEngine: RVLogicEngine | null = null;
  playback: RVDrivesPlayback | null = null;
  groups: GroupRegistry | null = null;

  /**
   * @deprecated Use `viewer.raycastManager` instead. This getter returns
   * an adapter that delegates to RaycastManager for backward compatibility.
   */
  get driveHover(): {
    enabled: boolean;
    hoveredDrive: RVDrive | null;
    pointerClientX: number;
    pointerClientY: number;
    lastRayOrigin: Vector3 | null;
    lastRayDirection: Vector3 | null;
    setDriveTargets(drives: RVDrive[]): void;
    updateFromXRController(origin: Vector3, direction: Vector3): void;
    dispose(): void;
  } | null {
    if (!this.raycastManager) return null;
    const rm = this.raycastManager;
    const self = this;
    return {
      get enabled() { return rm.enabled; },
      set enabled(v: boolean) { rm.setEnabled(v); },
      get hoveredDrive() {
        if (!rm.hoveredNode || rm.hoveredNodeType !== 'Drive') return null;
        return self.registry?.findInParent<RVDrive>(rm.hoveredNode, 'Drive') ?? null;
      },
      get pointerClientX() { return rm.pointerClientX; },
      get pointerClientY() { return rm.pointerClientY; },
      get lastRayOrigin() { return rm.lastRayOrigin; },
      get lastRayDirection() { return rm.lastRayDirection; },
      setDriveTargets(drives: RVDrive[]) {
        rm.registerTargets('DRIVE', drives.map(d => d.node));
      },
      updateFromXRController(origin: Vector3, direction: Vector3) {
        rm.updateFromXRController(origin, direction);
      },
      dispose() {
        rm.dispose();
      },
    };
  }

  // --- Plugin System ---

  /** All registered core plugins. */
  private _plugins: RVViewerPlugin[] = [];
  /** Cached: only plugins with onFixedUpdatePre, sorted by order. */
  private _prePlugins: RVViewerPlugin[] = [];
  /** Cached: only plugins with onFixedUpdatePost, sorted by order. */
  private _postPlugins: RVViewerPlugin[] = [];
  /** Cached: only plugins with onRender, sorted by order. */
  private _renderPlugins: RVViewerPlugin[] = [];
  /** Flag: a plugin handles transport (kinematic transportManager.update is skipped). */
  private _physicsPluginActive = false;
  /** Last successful load result (for retroactive onModelLoaded). */
  private _lastLoadResult: LoadResult | null = null;
  /** Lazy plugin factories: ID → async import factory (code-split by Vite). */
  private _lazyFactories = new Map<string, () => Promise<{ default: unknown }>>();
  /** URL of the currently loaded model (for reloadModel). */
  private _currentModelUrl: string | null = null;
  /** True while OrbitControls is actively rotating/panning/pinching. */
  private _isOrbiting = false;
  /** Pointer position at pointerdown — used for drag-distance threshold. */
  private _pointerDownPos: { x: number; y: number } | null = null;
  /** Right-button pointer position at pointerdown — used for context menu drag guard. */
  private _rightDownPos: { x: number; y: number } | null = null;
  /** Long-press timer ID for touch context menu. */
  private _longPressTimer: ReturnType<typeof setTimeout> | null = null;
  /** Stored position at touch start for long-press context menu. */
  private _longPressPos: { x: number; y: number } | null = null;

  /** Available model entries for the model selector UI. */
  availableModels: Array<{ url: string; label: string }> = [];

  /** UI plugin registry for React slot rendering. */
  readonly uiRegistry = new UIPluginRegistry();

  /** Centralized left-panel coordination (mutual exclusion, ButtonPanel offset). */
  readonly leftPanelManager = new LeftPanelManager();

  /** Central selection state (multi-select, Escape-to-deselect, selection highlights). */
  readonly selectionManager = new SelectionManager();

  /** Plugin-extensible context menu (right-click / long-press). */
  readonly contextMenu = new ContextMenuStore();

  /**
   * Register a plugin. Sorted into cached lifecycle lists.
   * If the plugin has `slots`, its UI entries are auto-registered into the HMI.
   * Duplicate IDs are rejected with a warning. Chainable.
   */
  use(plugin: RVViewerPlugin): this {
    if (this._plugins.some((p) => p.id === plugin.id)) {
      console.warn(`[RVViewer] Plugin '${plugin.id}' already registered`);
      return this;
    }
    this._plugins.push(plugin);

    // Insert into cached lists sorted by order
    const insertSorted = (list: RVViewerPlugin[], p: RVViewerPlugin) => {
      list.push(p);
      list.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
    };
    if (plugin.onFixedUpdatePre) insertSorted(this._prePlugins, plugin);
    if (plugin.onFixedUpdatePost) insertSorted(this._postPlugins, plugin);
    if (plugin.onRender) insertSorted(this._renderPlugins, plugin);

    if (plugin.handlesTransport) this._physicsPluginActive = true;

    // Auto-register UI slot entries if the plugin provides them
    if (plugin.slots && plugin.slots.length > 0) {
      this.uiRegistry.register(plugin);
    }

    // Retroactive: if model already loaded, call onModelLoaded immediately
    if (this.drives.length > 0 && this._lastLoadResult && plugin.onModelLoaded) {
      try {
        plugin.onModelLoaded(this._lastLoadResult, this);
      } catch (e) {
        console.error(`[RVViewer] Plugin '${plugin.id}' onModelLoaded error:`, e);
      }
    }
    return this;
  }

  /** Type-safe plugin lookup by ID. */
  getPlugin<T extends RVViewerPlugin>(id: string): T | undefined {
    return this._plugins.find((p) => p.id === id) as T | undefined;
  }

  /**
   * Register a lazy plugin factory. The factory is only called when a model
   * actually requests the plugin (via rv_plugins / modelname.json).
   * Vite automatically code-splits lazy factories into separate chunks.
   */
  registerLazy(id: string, factory: () => Promise<{ default: unknown }>): this {
    this._lazyFactories.set(id, factory);
    return this;
  }

  /**
   * Resolve a plugin by ID through the three-level resolution chain:
   *   1. Already registered (via `use()`)  → return existing
   *   2. Lazy built-in (via `registerLazy()`) → import chunk, instantiate, register
   *   3. External plugin (`models/plugins/{id}.js`) → dynamic import, register
   *   4. Not found → return null (no crash)
   */
  async resolvePlugin(id: string): Promise<RVViewerPlugin | null> {
    // 1. Already registered?
    const existing = this._plugins.find(p => p.id === id);
    if (existing) return existing;

    // 2. Lazy built-in?
    const factory = this._lazyFactories.get(id);
    if (factory) {
      try {
        const mod = await factory();
        const PluginOrInstance = mod.default;
        const plugin = typeof PluginOrInstance === 'function'
          ? new (PluginOrInstance as new () => RVViewerPlugin)()
          : PluginOrInstance as RVViewerPlugin;
        if (plugin && plugin.id) {
          this.use(plugin);
          return plugin;
        }
      } catch (e) {
        console.warn(`[RVViewer] Failed to load lazy plugin '${id}':`, e);
      }
      return null;
    }

    // 3. External plugin?
    const baseUrl = this._currentModelUrl
      ? this._currentModelUrl.substring(0, this._currentModelUrl.lastIndexOf('/'))
      : '.';
    const plugin = await loadExternalPlugin(id, baseUrl);
    if (plugin) {
      this.use(plugin);
      return plugin;
    }

    // 4. Not found
    console.warn(`[RVViewer] Plugin '${id}' not found (not registered, no lazy factory, no external)`);
    return null;
  }

  // ─── Exclusive Hover Mode ──────────────────────────────────────────

  /** The currently active exclusive hover mode (only this type is hoverable). null = all types. */
  private _exclusiveHoverMode: RaycastLayerName | null = null;
  get exclusiveHoverMode(): RaycastLayerName | null { return this._exclusiveHoverMode; }

  /**
   * Set an exclusive hover mode — only the specified type will be hoverable.
   * Pass null to restore default behavior (all registered types hoverable).
   * Any existing exclusive mode is automatically deactivated.
   */
  setExclusiveHoverMode(mode: RaycastLayerName | null): void {
    if (mode === this._exclusiveHoverMode) return;
    this._exclusiveHoverMode = mode;

    if (!this.raycastManager) return;
    if (mode) {
      // Enable only the requested type
      this.raycastManager.enableHoverType('DRIVE', mode === 'DRIVE');
      this.raycastManager.enableHoverType('SENSOR', mode === 'SENSOR');
      this.raycastManager.enableHoverType('MU', mode === 'MU');
    } else {
      // Default: all registered types hoverable
      this.raycastManager.enableHoverType('DRIVE', true);
      this.raycastManager.enableHoverType('SENSOR', true);
      this.raycastManager.enableHoverType('MU', true);
    }
    this.emit('exclusive-hover-mode', { mode });
  }

  // ─── Drive Chart ──────────────────────────────────────────────────

  /** Whether the drive chart overlay is open. */
  private _driveChartOpen = false;
  get driveChartOpen(): boolean { return this._driveChartOpen; }

  /** Toggle the drive chart overlay. Exclusive with other chart modes. */
  toggleDriveChart(forceOpen?: boolean): void {
    this._driveChartOpen = forceOpen ?? !this._driveChartOpen;
    if (this._driveChartOpen) {
      // Close other exclusive modes
      if (this._sensorChartOpen) {
        this._sensorChartOpen = false;
        this.emit('sensor-chart-toggle', { open: false });
      }
      this.setExclusiveHoverMode('DRIVE');
      // Highlight filtered drives (or all if no filter)
      const drivesToHighlight = this._driveFilter ? this._filteredDrives : this.drives;
      const nodes = drivesToHighlight.map((d) => d.node);
      if (nodes.length > 0) {
        this.highlighter.highlightMultiple(nodes);
        this.fitToNodes(nodes);
      }
    } else {
      this.setExclusiveHoverMode(null);
      this.highlighter.clear();
    }
    this.emit('drive-chart-toggle', { open: this._driveChartOpen });
  }

  // ─── Sensor Chart ─────────────────────────────────────────────────

  /** Whether the sensor chart overlay is open. */
  private _sensorChartOpen = false;
  get sensorChartOpen(): boolean { return this._sensorChartOpen; }

  /** Toggle the sensor chart overlay. Exclusive with other chart modes. */
  toggleSensorChart(forceOpen?: boolean): void {
    this._sensorChartOpen = forceOpen ?? !this._sensorChartOpen;
    if (this._sensorChartOpen) {
      // Close other exclusive modes
      if (this._driveChartOpen) {
        this._driveChartOpen = false;
        this.emit('drive-chart-toggle', { open: false });
      }
      this.setExclusiveHoverMode('SENSOR');
      const sensors = this.transportManager?.sensors ?? [];
      const nodes = sensors.map((s) => s.node);
      if (nodes.length > 0) {
        this.highlighter.highlightMultiple(nodes, { includeSensorViz: true });
        this.fitToNodes(nodes);
      }
    } else {
      this.setExclusiveHoverMode(null);
      this.highlighter.clear();
    }
    this.emit('sensor-chart-toggle', { open: this._sensorChartOpen });
  }

  /** Whether the groups overlay is open. */
  private _groupsOverlayOpen = false;
  get groupsOverlayOpen(): boolean { return this._groupsOverlayOpen; }

  /** Toggle the groups overlay panel. */
  toggleGroupsOverlay(forceOpen?: boolean): void {
    this._groupsOverlayOpen = forceOpen ?? !this._groupsOverlayOpen;
    this.emit('groups-overlay-toggle', { open: this._groupsOverlayOpen });
  }

  /**
   * Mark shadows as dirty — call after visibility changes (e.g. group toggle)
   * so the shadow map is re-rendered on the next frame.
   */
  markShadowsDirty(): void {
    this._shadowsDirty = true;
    this._renderDirty = true;
  }

  /**
   * Mark the render pass as dirty so the next frame renders.
   * Call from plugins that need continuous rendering (e.g. FPV movement).
   */
  markRenderDirty(): void {
    this._renderDirty = true;
  }

  /** The ground plane mesh, or null if ground was disabled. */
  get groundMesh(): Mesh | null {
    return this._groundMesh;
  }

  /**
   * Cancel any in-progress camera animation immediately.
   * Used by FPV to prevent the animation overwriting the camera position.
   */
  cancelCameraAnimation(): void {
    this._cameraManager.cancelCameraAnimation();
  }

  // ─── Shared View Mode ────────────────────────────────────────────

  /** Whether shared view mode is active (camera controlled by remote operator). */
  private _sharedViewActive = false;
  get sharedViewActive(): boolean { return this._sharedViewActive; }

  /**
   * Enable or disable shared view mode — used by multiuser shared view.
   * When active: controls disabled, raycast disabled, _isOrbiting cleared.
   * When inactive: controls and raycast re-enabled.
   *
   * Rejects toggle if FPV or XR is active (returns false).
   * ALWAYS use this method instead of writing controls.enabled directly.
   *
   * @returns true if the toggle was applied, false if rejected.
   */
  setSharedViewMode(active: boolean): boolean {
    // Check FPV conflict
    const fpv = this.getPlugin<{ id: string; toggle(): void }>('fpv');
    if (active && fpv && (this as unknown as { _fpvActive?: boolean })._fpvActive) return false;

    // Check XR conflict
    const xr = this.getPlugin('webxr') as { isPresenting?: boolean } | undefined;
    if (active && xr?.isPresenting) return false;

    this._sharedViewActive = active;
    this.controls.enabled = !active;
    this._isOrbiting = false;
    this.raycastManager?.setEnabled(!active);
    this.controls.update();
    this._renderDirty = true;
    return true;
  }

  // ─── Unified Node Filter ──────────────────────────────────────────

  private static readonly MAX_HIGHLIGHT_RESULTS = 20;

  /** Current drive search filter string (derived from node filter). */
  private _driveFilter = '';
  get driveFilter(): string { return this._driveFilter; }

  /** Drives matching the current filter (all drives if filter is empty). */
  private _filteredDrives: RVDrive[] = [];
  get filteredDrives(): RVDrive[] { return this._filteredDrives.length > 0 || this._driveFilter ? this._filteredDrives : this.drives; }

  /** Current node search filter string. */
  private _nodeFilter = '';
  get nodeFilter(): string { return this._nodeFilter; }

  /** Nodes matching the current filter. */
  private _filteredNodes: NodeSearchResult[] = [];
  get filteredNodes(): NodeSearchResult[] { return this._filteredNodes; }

  /** Unified search: filters ALL registered nodes. Subscribers extract their subset via events. */
  filterNodes(term: string): void {
    this._nodeFilter = term;
    this._driveFilter = term;

    if (!term.trim()) {
      this._filteredNodes = [];
      this._filteredDrives = [];
      // Restore chart-specific highlights if chart is open
      if (this._driveChartOpen) {
        const nodes = this.drives.map((d) => d.node);
        if (nodes.length > 0) this.highlighter.highlightMultiple(nodes);
      } else if (this._sensorChartOpen) {
        const sensors = this.transportManager?.sensors ?? [];
        const nodes = sensors.map((s) => s.node);
        if (nodes.length > 0) this.highlighter.highlightMultiple(nodes, { includeSensorViz: true });
      } else {
        this.highlighter.clear();
      }
      this.emit('node-filter', { filter: '', filteredNodes: [], tooMany: false });
      this.emit('drive-filter', { filter: '', filteredDrives: [] });
      return;
    }

    const allResults = this.registry?.search(term) ?? [];
    // Apply subscriber type filter from settings
    const settings = loadSearchSettings();
    const results = allResults.filter(r => isTypeEnabled(settings, r.types));
    this._filteredNodes = results;
    const tooMany = results.length >= RVViewer.MAX_HIGHLIGHT_RESULTS;

    // Highlight matching nodes (only if below threshold and highlight enabled)
    if (settings.highlightEnabled && !tooMany && results.length > 0) {
      const nodes = results.map(r => r.node);
      this.highlighter.highlightMultiple(nodes);
    } else {
      this.highlighter.clear();
    }

    // Derive drive-filter from node-filter (backwards compat)
    this._filteredDrives = this.drives.filter((d) =>
      results.some((r) => r.node === d.node)
    );

    this.emit('node-filter', { filter: term, filteredNodes: results, tooMany });
    this.emit('drive-filter', { filter: term, filteredDrives: this._filteredDrives });
  }

  /** Backwards-compatible wrapper. Delegates to filterNodes(). */
  filterDrives(term: string): void {
    this.filterNodes(term);
  }

  /** Drive pinned by a card click (shown in tooltip until cleared). */
  focusedDrive: RVDrive | null = null;
  focusedNode: Object3D | null = null;

  // --- Dev Tools stats (polled by React DevToolsTab) ---
  /** Current FPS (updated every 500ms). */
  currentFps = 0;
  /** Current frame time in ms (updated every 500ms). */
  currentFrameTime = 0;
  /** Info from the last GLB load. */
  lastLoadInfo: { glbSize: string; loadTime: string } | null = null;

  // --- XR state ---
  private _savedBackground: Color | null = null;
  private _savedShadowState = true;

  // --- Internal ---
  private replayRecordings: RVReplayRecording[] = [];
  private currentModel: Object3D | null = null;
  private sceneFixtures = new Set<Object3D>();
  private resizeHandler: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private simTickCount = 0;
  private fpsFrameCount = 0;
  private fpsAccumTime = 0;
  private rendererInfoFrameCount = 0;
  private _lastGeoCount = 0;
  private _lastTexCount = 0;
  private ambientLight!: AmbientLight;
  private dirLight!: DirectionalLight;

  private constructor(
    container: HTMLElement,
    renderer: Renderer,
    options: RVViewerOptions = {},
  ) {
    super();

    const showGround = options.ground ?? true;
    const autoResize = options.autoResize ?? true;

    // --- Renderer (already configured by create/_configureAndCreate) ---
    this.renderer = renderer;
    this.isWebGPU = this._detectWebGPU(renderer);
    this._antialiasActive = options.antialias ?? false;

    // --- Scene ---
    this.scene = new Scene();
    this.scene.background = new Color(0x9a9a9a);
    this.highlighter = new RVHighlightManager(this.scene);

    // --- Camera ---
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    const aspect = w / h;
    this.perspCamera = new PerspectiveCamera(45, aspect, 0.01, 1000);
    this.perspCamera.position.set(3, 2.5, 4);
    this.perspCamera.lookAt(0, 0.5, 0);

    const frustumHalf = 5;
    this.orthoCamera = new OrthographicCamera(
      -frustumHalf * aspect, frustumHalf * aspect, frustumHalf, -frustumHalf, 0.01, 1000,
    );
    this.orthoCamera.position.set(3, 2.5, 4);
    this.orthoCamera.lookAt(0, 0.5, 0);

    this._activeCamera = this.perspCamera;

    // --- Lighting ---
    this.ambientLight = new AmbientLight(0xffffff, 1.8);
    this.scene.add(this.ambientLight);
    this.sceneFixtures.add(this.ambientLight);

    this.dirLight = new DirectionalLight(0xffffff, 1.5);
    this.dirLight.position.set(-3, 10, 5);
    this.dirLight.castShadow = false;
    this.dirLight.shadow.mapSize.set(1024, 1024);
    this.dirLight.shadow.camera.near = 0.1;
    this.dirLight.shadow.camera.far = 50;
    this.dirLight.shadow.camera.left = -15;
    this.dirLight.shadow.camera.right = 15;
    this.dirLight.shadow.camera.top = 15;
    this.dirLight.shadow.camera.bottom = -15;
    this.dirLight.shadow.bias = -0.0005;
    this.dirLight.shadow.normalBias = 0.02;
    this.dirLight.shadow.intensity = 0.5;
    this.dirLight.shadow.radius = 2;

    // --- Delegated Managers ---
    // VisualSettingsManager reads/writes shared state on `this` (the facade).
    // We pass a thin object whose property accessors proxy back to the viewer.
    const self = this;
    this._visualSettings = new VisualSettingsManager({
      scene: this.scene,
      renderer: this.renderer,
      ambientLight: this.ambientLight,
      dirLight: this.dirLight,
      sceneFixtures: this.sceneFixtures,
      get _shadowsDirty() { return self._shadowsDirty; },
      set _shadowsDirty(v: boolean) { self._shadowsDirty = v; },
      get _renderDirty() { return self._renderDirty; },
      set _renderDirty(v: boolean) { self._renderDirty = v; },
    });

    // --- Ground ---
    if (showGround) {
      const ground = this.createGround();
      this.scene.add(ground);
      this.sceneFixtures.add(ground);
      this._groundMesh = ground;
    }

    // --- Renderer-dependent init ---
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);

    // --- Controls ---
    this.controls = new OrbitControls(this._activeCamera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0.5, 0);
    this.controls.mouseButtons = {
      LEFT: -1 as MOUSE,
      MIDDLE: MOUSE.PAN,
      RIGHT: MOUSE.ROTATE,
    };
    this.controls.touches = {
      ONE: TOUCH.ROTATE,
      TWO: TOUCH.DOLLY_PAN,
    };
    this.controls.update();

    // Track orbit/pan/pinch gesture state to suppress selection & hover highlighting
    this.controls.addEventListener('start', () => {
      this._isOrbiting = true;
      if (this.raycastManager) this.raycastManager.setEnabled(false);
      this._cancelLongPress();
    });
    this.controls.addEventListener('end', () => {
      this._isOrbiting = false;
      if (this.raycastManager) this.raycastManager.setEnabled(true);
      // Keep rendering for 60 frames (1s) after last user input for damping decay
      this._dampingFramesRemaining = 60;
    });
    // Mark render dirty on any controls change (orbit, pan, zoom)
    this.controls.addEventListener('change', () => {
      this._renderDirty = true;
    });

    // CameraManager — uses proxy state to read/write shared fields on the facade.
    this._cameraManager = new CameraManager({
      perspCamera: this.perspCamera,
      orthoCamera: this.orthoCamera,
      get _activeCamera() { return self._activeCamera; },
      set _activeCamera(v) { self._activeCamera = v; },
      controls: this.controls,
      renderer: this.renderer,
      get _renderDirty() { return self._renderDirty; },
      set _renderDirty(v: boolean) { self._renderDirty = v; },
      leftPanelManager: this.leftPanelManager,
      getPlugin: <T>(id: string) => this.getPlugin(id) as T | undefined,
    });

    // --- Canvas events ---
    this._bindCanvasEvents(renderer.domElement);

    // --- XR (only for WebGL backend) ---
    this._setupXR(renderer, container);

    // --- Stats-gl ---
    this._setupStats(renderer);

    // --- Simulation Loop ---
    this.loop = new SimulationLoop(renderer);
    this.loop.onFixedUpdate = (dt: number) => this.fixedUpdate(dt);
    this.loop.onRender = () => this.render();
    this.loop.start();

    // --- Resize (ResizeObserver on container — handles soft keyboard, orientation) ---
    if (autoResize) {
      let resizeRafId = 0;
      this.resizeHandler = () => {
        const w = container.clientWidth || window.innerWidth;
        const h = container.clientHeight || window.innerHeight;
        const aspect = w / h;
        this.perspCamera.aspect = aspect;
        this.perspCamera.updateProjectionMatrix();
        // Keep ortho frustum in sync
        const dist = this.orthoCamera.position.distanceTo(this.controls.target);
        const halfH = dist * Math.tan((this.perspCamera.fov * Math.PI / 180) / 2);
        this.orthoCamera.left = -halfH * aspect;
        this.orthoCamera.right = halfH * aspect;
        this.orthoCamera.top = halfH;
        this.orthoCamera.bottom = -halfH;
        this.orthoCamera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
        this._renderDirty = true;
      };
      this.resizeObserver = new ResizeObserver(() => {
        cancelAnimationFrame(resizeRafId);
        resizeRafId = requestAnimationFrame(() => this.resizeHandler!());
      });
      this.resizeObserver.observe(container);
      // Fallback for browsers without ResizeObserver on window events
      window.addEventListener('resize', this.resizeHandler);
    }

    logInfo(`realvirtual WEB — Ready (${this.isWebGPU ? 'WebGPU' : 'WebGL'})`);
  }

  // ─── Static Factory ──────────────────────────────────────────────────

  /**
   * Create a viewer instance. Always use this instead of `new RVViewer()`.
   * Uses WebGPURenderer with forceWebGL as the universal renderer.
   * When `options.useWebGPU` is true and the browser supports it,
   * the real WebGPU backend is used instead.
   */
  static async create(
    container: HTMLElement,
    options?: RVViewerOptions,
  ): Promise<RVViewer> {
    const isTouchDevice = isMobileDevice();

    let useWebGPU = !!options?.useWebGPU;
    if (useWebGPU && !navigator.gpu) {
      console.warn('[RVViewer] WebGPU not available, falling back to WebGL');
      useWebGPU = false;
    }

    let renderer: Renderer;

    if (useWebGPU) {
      // Real WebGPU: use WebGPURenderer with async init
      const { WebGPURenderer } = await import('three/webgpu');
      const gpuRenderer = new WebGPURenderer({ antialias: options?.antialias ?? false, alpha: true });
      try {
        await gpuRenderer.init();
      } catch (err) {
        console.warn('[RVViewer] WebGPU init() failed, falling back to WebGL:', err);
        gpuRenderer.dispose();
        useWebGPU = false;
        // fall through to WebGL path below
      }
      if (useWebGPU) renderer = gpuRenderer;
    }

    if (!useWebGPU) {
      // Standard WebGL: use the proven WebGLRenderer (no init needed)
      renderer = new WebGLRenderer({ antialias: options?.antialias ?? false, alpha: true, powerPreference: 'high-performance' }) as unknown as Renderer;
    }

    return RVViewer._configureAndCreate(renderer!, container, isTouchDevice, useWebGPU, options);
  }

  /** Shared renderer config — called by create() and fallback path. */
  private static _configureAndCreate(
    renderer: Renderer,
    container: HTMLElement,
    isTouchDevice: boolean,
    isWebGPU: boolean,
    options?: RVViewerOptions,
  ): RVViewer {
    renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight,
    );
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, DEFAULT_DPR_CAP));
    renderer.shadowMap.enabled = false;
    (renderer.shadowMap as unknown as { autoUpdate: boolean }).autoUpdate = false;
    renderer.toneMapping = NoToneMapping;

    return new RVViewer(container, renderer, options ?? {});
  }

  // ─── Model Management ─────────────────────────────────────────────────

  /** Load a GLB model and start all simulation systems. */
  async loadModel(url: string): Promise<LoadResult> {
    this.clearModel();
    this._currentModelUrl = url;

    const result = await loadGLB(url, this.scene, { isWebGPU: this.isWebGPU });

    // Pre-compile shaders to avoid first-frame stutter (available on WebGPURenderer)
    if ('compileAsync' in this.renderer) {
      try {
        await this.renderer.compileAsync(this.scene, this.camera, this.scene);
      } catch { /* non-critical */ }
    }

    this.currentModel = this.scene.children.find((c) => !this.sceneFixtures.has(c)) ?? null;
    this.drives = result.drives;
    this.transportManager = result.transportManager;
    this.signalStore = result.signalStore;
    this.playback = result.playback;
    this.replayRecordings = result.replayRecordings;
    this.logicEngine = result.logicEngine;
    this.registry = result.registry;
    this.groups = result.groups;

    // Selection manager — init after registry is available
    this.selectionManager.init(this);

    // Register core "Focus" context menu item (available for all nodes)
    this.contextMenu.register({
      pluginId: '_core',
      items: [{
        id: '_core.focus',
        label: 'Focus',
        order: 1,
        action: (target) => {
          this.fitToNodes([target.node]);
          this.selectionManager.select(target.path);
        },
      }],
    });

    // Register filter subscribers for search settings
    registerFilterSubscriber({ id: 'Drive', label: 'Drives', componentType: 'Drive' });
    registerFilterSubscriber({ id: 'Sensor', label: 'Sensors', componentType: 'Sensor' });
    registerFilterSubscriber({ id: 'TransportSurface', label: 'Conveyors', componentType: 'TransportSurface' });

    // Unified raycast manager (replaces old driveHover)
    this.raycastManager = new RaycastManager(
      this.renderer, this.camera, this.scene,
      result.registry, this.highlighter, this,
    );
    this.raycastManager.registerTargets('DRIVE', this.drives.map(d => d.node));
    // Pre-register sensor targets so layer bits are set (hover is disabled until sensor mode activates)
    const sensorNodes = this.transportManager?.sensors?.map(s => s.node) ?? [];
    if (sensorNodes.length > 0) {
      this.raycastManager.registerTargets('SENSOR', sensorNodes);
    }

    // LogicEngine
    if (this.logicEngine) {
      this.logicEngine.start();
    }

    // Recording playback
    if (this.playback) {
      const shouldAutoPlay = result.recorderSettings?.playOnStart ?? false;
      if (shouldAutoPlay) {
        this.playback.play();
      }
    }

    // Fit camera to model
    const center = new Vector3();
    const size = new Vector3();
    result.boundingBox.getCenter(center);
    result.boundingBox.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.perspCamera.fov * (Math.PI / 180);
    const dist = (maxDim / (2 * Math.tan(fov / 2))) * 1.5;

    this.camera.position.set(center.x + dist * 0.7, center.y + dist * 0.5, center.z + dist * 0.7);
    this.controls.target.copy(center);
    this.controls.update();

    // Fit directional light shadow camera to model
    if (this.dirLight.parent) {
      const shadowPad = Math.max(maxDim * 1.2, 5);
      this.dirLight.position.set(center.x - 3, center.y + maxDim * 3, center.z + 5);
      this.dirLight.target.position.copy(center);
      this.dirLight.shadow.camera.left = -shadowPad;
      this.dirLight.shadow.camera.right = shadowPad;
      this.dirLight.shadow.camera.top = shadowPad;
      this.dirLight.shadow.camera.bottom = -shadowPad;
      this.dirLight.shadow.camera.near = 0.1;
      this.dirLight.shadow.camera.far = Math.max(maxDim * 4, 50);
      this.dirLight.shadow.camera.updateProjectionMatrix();
    }

    // --- Load and merge model-specific plugin configuration ---
    const [modelJsonConfig, glbConfig] = await Promise.all([
      loadModelJsonConfig(url).catch(() => ({} as ModelConfig)),
      Promise.resolve(extractGlbPluginConfig(this.scene)),
    ]);
    const settingsConfig: ModelConfig = {};
    const appConfig = getAppConfig();
    if (appConfig.plugins) settingsConfig.plugins = appConfig.plugins;
    if (appConfig.pluginConfig) settingsConfig.pluginConfig = appConfig.pluginConfig;

    result.modelConfig = mergeModelConfig(modelJsonConfig, glbConfig, settingsConfig);

    // Plugin lifecycle: onModelLoaded (before event, with error isolation)
    // Activation mode depends on whether rv_plugins is declared anywhere.
    this._lastLoadResult = result;
    const declared = result.modelConfig.plugins; // string[] | undefined

    if (declared === undefined) {
      // ALL-MODE: no rv_plugins declared — activate ALL registered plugins (backward compatible)
      for (const p of this._plugins) {
        callPlugin(p, 'onModelLoaded', result, this);
      }
    } else {
      // SELECTIVE-MODE: only declared plugins + core plugins activate
      for (const p of this._plugins) {
        if (p.core || declared.includes(p.id)) {
          callPlugin(p, 'onModelLoaded', result, this);
        }
      }
      // Resolve any declared plugins not yet registered (lazy built-in or external)
      for (const id of declared) {
        if (!this._plugins.find(p => p.id === id)) {
          const plugin = await this.resolvePlugin(id);
          if (plugin) callPlugin(plugin, 'onModelLoaded', result, this);
        }
      }
    }

    // Re-evaluate _physicsPluginActive — plugins may have changed handlesTransport in onModelLoaded
    // Re-evaluate _physicsPluginActive — plugins may have changed handlesTransport in onModelLoaded
    this._physicsPluginActive = this._plugins.some(p => p.handlesTransport);

    // Ensure first frame renders fully (shadows + scene)
    this._shadowsDirty = true;
    this._renderDirty = true;

    logInfo(`Model loaded: ${this.drives.length} drives, ${this.signalStore?.size ?? 0} signals`);
    this.emit('model-loaded', { result });
    return result;
  }

  /** Remove the current model and reset all simulation state. */
  clearModel(): void {
    // Plugin lifecycle: onModelCleared (before state reset)
    for (const p of this._plugins) {
      callPlugin(p, 'onModelCleared', this);
    }

    // Close context menu to prevent stale target references
    this.contextMenu.close();

    // Safety net: clear all dynamic UI contexts, preserve initial ones from config
    const initialCtxs = getAppConfig().ui?.initialContexts;
    resetDynamicContexts(Array.isArray(initialCtxs) ? initialCtxs : undefined);

    this._lastLoadResult = null;

    this.selectionManager.clear();
    this.selectionManager.dispose();

    if (this.raycastManager) {
      this.raycastManager.dispose();
      this.raycastManager = null;
    }

    // IMPORTANT: Reset transport manager BEFORE scene traverse to remove
    // active MU nodes from scene tree. MU clones share geometry by reference
    // with templates — disposing geometry during traverse would corrupt shared buffers.
    if (this.transportManager) {
      this.transportManager.reset();
      this.transportManager = null;
    }

    if (this.currentModel) {
      this.scene.remove(this.currentModel);
      this.currentModel.traverse((node) => {
        const mesh = node as {
          geometry?: { dispose(): void };
          material?: (MeshStandardMaterial & { dispose(): void }) | (MeshStandardMaterial & { dispose(): void })[];
        };
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          const disposeMat = (m: MeshStandardMaterial & { dispose(): void }) => {
            m.map?.dispose();
            m.normalMap?.dispose();
            m.roughnessMap?.dispose();
            m.aoMap?.dispose();
            m.emissiveMap?.dispose();
            m.metalnessMap?.dispose();
            m.alphaMap?.dispose();
            m.envMap?.dispose();
            m.dispose();
          };
          if (Array.isArray(mesh.material)) mesh.material.forEach(disposeMat);
          else disposeMat(mesh.material);
        }
      });
      this.currentModel = null;
    }
    this.drives = [];
    if (this.playback) {
      this.playback.stop();
      this.playback = null;
    }
    this.replayRecordings = [];
    if (this.logicEngine) {
      this.logicEngine.reset();
      this.logicEngine = null;
    }
    this.signalStore = null;
    this.registry = null;
    if (this.groups) {
      this.groups.clear();
      this.groups = null;
    }
    // Reset dirty flags for next model load
    this._shadowsDirty = true;
    this._renderDirty = true;
    this.emit('model-cleared');
  }

  /** URL of the currently loaded model (null if no model loaded). */
  get currentModelUrl(): string | null {
    return this._currentModelUrl;
  }

  /**
   * Reload the current model. Useful when physics settings change and
   * the world needs to be rebuilt from scratch.
   * Returns the LoadResult, or null if no model was loaded.
   */
  async reloadModel(): Promise<LoadResult | null> {
    if (!this._currentModelUrl) return null;
    const url = this._currentModelUrl;
    return this.loadModel(url);
  }

  /** Clean up all resources. */
  dispose(): void {
    // Plugin lifecycle: dispose (before everything else)
    for (const p of this._plugins) {
      callPlugin(p, 'dispose');
    }
    this.loop.stop();
    this.clearModel();
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.controls.dispose();
    this.renderer.dispose();
    if (this.statsReady) {
      this.stats.dispose();
      this.stats.dom.remove();
    }
    this.removeAllListeners();
  }

  // ─── Highlight & Focus ───────────────────────────────────────────────

  /**
   * Highlight a component by its hierarchy path (orange overlay).
   * @param tracked  If true, overlays follow moving parts each frame.
   */
  highlightByPath(path: string, tracked = false): void {
    const node = this.registry?.getNode(path);
    if (!node) return;
    // Detect if target is a sensor (include sensor viz in highlight)
    const isSensor = !!(node.userData?.realvirtual as Record<string, unknown> | undefined)?.['Sensor'];
    this.highlighter.highlight(node, tracked, { includeSensorViz: isSensor });
  }

  /** Remove the current highlight. */
  clearHighlight(): void {
    this.highlighter.clear();
  }

  /** Smoothly orbit camera to focus on a component by hierarchy path. Also pins the drive tooltip if the target is a drive.
   *  @param offset  Optional pixel offsets for panels obscuring the viewport (shifts orbit target). */
  focusByPath(path: string, offset?: ViewportOffset): void {
    const node = this.registry?.getNode(path);
    if (!node) return;

    // Pin drive tooltip if the focused node is (or belongs to) a drive
    const drive = this.registry!.findInParent<RVDrive>(node, 'Drive')
      ?? (this.registry!.getByPath<RVDrive>('Drive', path) || null);
    this.focusedDrive = drive;
    this.focusedNode = node;
    this.emit('drive-focus', { drive, node });

    const box = this._cameraManager.computeNodeBounds([node]);
    if (box.isEmpty()) return;

    const center = new Vector3();
    const size = new Vector3();
    box.getCenter(center);
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z, 0.1);
    const fov = this.perspCamera.fov * (Math.PI / 180);
    const dist = (maxDim / (2 * Math.tan(fov / 2))) * 2.5;

    // Keep current viewing direction — just move along it to frame the target
    const dir = new Vector3().subVectors(this.camera.position, this.controls.target).normalize();
    const effectiveOffset = offset ?? this.getCurrentViewportOffset();
    const adjustedCenter = this._cameraManager.applyViewportOffset(center, dist, effectiveOffset);
    const endPos = adjustedCenter.clone().add(dir.multiplyScalar(dist));
    this.animateCameraTo(endPos, adjustedCenter);
  }

  /** Smoothly animate camera to frame all given nodes.
   *  @param offset  Optional pixel offsets for panels obscuring the viewport (shifts orbit target). */
  fitToNodes(nodes: Object3D[], offset?: ViewportOffset): void {
    if (nodes.length === 0) return;
    const box = this._cameraManager.computeNodeBounds(nodes);
    if (box.isEmpty()) return;

    const center = new Vector3();
    const size = new Vector3();
    box.getCenter(center);
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z, 0.1);
    const fov = this.perspCamera.fov * (Math.PI / 180);
    const dist = (maxDim / (2 * Math.tan(fov / 2))) * 1.8;

    const dir = new Vector3().subVectors(this.camera.position, this.controls.target).normalize();
    const effectiveOffset = offset ?? this.getCurrentViewportOffset();
    const adjustedCenter = this._cameraManager.applyViewportOffset(center, dist, effectiveOffset);
    const endPos = adjustedCenter.clone().add(dir.multiplyScalar(dist));
    this.animateCameraTo(endPos, adjustedCenter);
  }

  /** Clear pinned drive focus (e.g., user clicked canvas). */
  clearFocus(): void {
    if (this.focusedDrive || this.focusedNode) {
      this.focusedDrive = null;
      this.focusedNode = null;
      this.emit('drive-focus', { drive: null, node: null });
    }
  }

  // ─── Scene Click → Hierarchy Selection ────────────────────────────────

  private readonly _clickRaycaster = new Raycaster();
  private readonly _clickPointer = new Vector2();

  /**
   * Raycast from a mouse/pointer event and find the nearest ancestor
   * node that has realvirtual userData. Returns the registry path or null.
   */
  private _raycastForRVNode(e: MouseEvent): string | null {
    if (!this.registry) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._clickPointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._clickPointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this._clickRaycaster.setFromCamera(this._clickPointer, this.camera);

    const hits = this._clickRaycaster.intersectObjects(this.scene.children, true);
    for (const hit of hits) {
      if (hit.object.userData?._highlightOverlay) continue;
      if (hit.object.userData?._driveHoverOverlay) continue;
      if (hit.object.name.endsWith('_sensorViz')) continue;
      // Walk up from hit mesh to find nearest node with realvirtual data
      let current: Object3D | null = hit.object;
      while (current) {
        const rv = current.userData?.realvirtual;
        if (rv && typeof rv === 'object') {
          const path = this.registry!.getPathForNode(current);
          if (path) return path;
        }
        current = current.parent;
      }
    }
    return null;
  }

  // ─── Camera Settings (delegated to CameraManager) ───────────────────

  /** Field of view in degrees (perspective camera). */
  get fov(): number { return this._cameraManager.fov; }
  set fov(v: number) { this._cameraManager.fov = v; }

  /** Camera projection type. */
  get projection(): ProjectionType { return this._cameraManager.projection; }
  set projection(v: ProjectionType) { this._cameraManager.projection = v; }

  // ─── Visual Settings (delegated to VisualSettingsManager) ────────────

  /** Active lighting mode. */
  get lightingMode() { return this._visualSettings.lightingMode; }
  set lightingMode(mode: import('./hmi/visual-settings-store').LightingMode) { this._visualSettings.lightingMode = mode; }

  /** Tone mapping algorithm (applied only in default mode). */
  get toneMapping(): ToneMappingType { return this._visualSettings.toneMapping; }
  set toneMapping(v: ToneMappingType) { this._visualSettings.toneMapping = v; }

  /** Tone mapping exposure (only effective when tone mapping != none). */
  get toneMappingExposure(): number { return this._visualSettings.toneMappingExposure; }
  set toneMappingExposure(v: number) { this._visualSettings.toneMappingExposure = v; }

  /** Ambient light color as hex string (e.g. '#ffffff'). */
  get ambientColor(): string { return this._visualSettings.ambientColor; }
  set ambientColor(hex: string) { this._visualSettings.ambientColor = hex; }

  /** Ambient light intensity. */
  get ambientIntensity(): number { return this._visualSettings.ambientIntensity; }
  set ambientIntensity(v: number) { this._visualSettings.ambientIntensity = v; }

  /** Directional light on/off. */
  get dirLightEnabled(): boolean { return this._visualSettings.dirLightEnabled; }
  set dirLightEnabled(v: boolean) { this._visualSettings.dirLightEnabled = v; }

  /** Directional light color as hex string. */
  get dirLightColor(): string { return this._visualSettings.dirLightColor; }
  set dirLightColor(hex: string) { this._visualSettings.dirLightColor = hex; }

  /** Directional light intensity. */
  get dirLightIntensity(): number { return this._visualSettings.dirLightIntensity; }
  set dirLightIntensity(v: number) { this._visualSettings.dirLightIntensity = v; }

  /** Shadow casting on/off. */
  get shadowEnabled(): boolean { return this._visualSettings.shadowEnabled; }
  set shadowEnabled(v: boolean) { this._visualSettings.shadowEnabled = v; }

  /** Shadow darkness (0 = invisible, 1 = full black). */
  get shadowIntensity(): number { return this._visualSettings.shadowIntensity; }
  set shadowIntensity(v: number) { this._visualSettings.shadowIntensity = v; }

  /** Shadow map resolution. */
  get shadowQuality(): ShadowQuality { return this._visualSettings.shadowQuality; }
  set shadowQuality(v: ShadowQuality) { this._visualSettings.shadowQuality = v; }

  /** Environment intensity (default mode) or ambient scale (simple mode). */
  get lightIntensity(): number { return this._visualSettings.lightIntensity; }
  set lightIntensity(v: number) { this._visualSettings.lightIntensity = v; }

  // ─── Individual Rendering Settings (delegated to VisualSettingsManager) ──

  /** Get current effective DPR. */
  get effectiveDpr(): number { return this._visualSettings.effectiveDpr; }

  /** Set maximum device pixel ratio. Values >= 2 use native DPR. Applies immediately (no reload). */
  set maxDpr(cap: number) { this._visualSettings.maxDpr = cap; }

  /** Set shadow map resolution (e.g. 512, 1024, 2048). Disposes old map. */
  set shadowMapSize(size: number) { this._visualSettings.shadowMapSize = size; }

  /** Set shadow softness radius (1-5). */
  set shadowRadius(radius: number) { this._visualSettings.shadowRadius = radius; }

  // ─── Profiler Overlay ────────────────────────────────────────────────

  /** Show/hide the stats-gl FPS/CPU/GPU overlay. */
  get showStats(): boolean { return this.statsReady && this.stats.dom.style.display !== 'none'; }
  set showStats(v: boolean) { if (this.statsReady) this.stats.dom.style.display = v ? '' : 'none'; }

  /** Enable/disable periodic renderer.info console logging. */
  rendererInfoLogging = false;

  // ─── Renderer Info (for dev tools) ────────────────────────────────────

  /** Get renderer performance info (triangles, draw calls, etc.). */
  getRendererInfo(): {
    triangles: number;
    drawCalls: number;
    geometries: number;
    textures: number;
    programs: number;
  } {
    const info = this.renderer.info;
    return {
      triangles: info.render?.triangles ?? 0,
      drawCalls: info.render?.calls ?? 0,
      geometries: (info as unknown as { memory?: { geometries?: number } }).memory?.geometries ?? 0,
      textures: (info as unknown as { memory?: { textures?: number } }).memory?.textures ?? 0,
      programs: (info as unknown as { programs?: unknown[] }).programs?.length ?? 0,
    };
  }

  /**
   * Run a quick GPU benchmark: render N frames in a tight loop (no vsync),
   * return uncapped FPS and average frame time.
   */
  async runBenchmark(frames = 120): Promise<{ uncappedFps: number; avgFrameMs: number; headroom: number }> {
    // Force a GPU flush before starting
    this.renderer.render(this.scene, this.camera);
    const ctx = this.renderer.getContext();
    const isWebGL = 'finish' in ctx;
    if (isWebGL) (ctx as WebGL2RenderingContext).finish();

    const start = performance.now();
    for (let i = 0; i < frames; i++) {
      this.renderer.render(this.scene, this.camera);
    }
    if (isWebGL) (ctx as WebGL2RenderingContext).finish();
    const elapsed = performance.now() - start;

    const avgFrameMs = elapsed / frames;
    const uncappedFps = Math.round(1000 / avgFrameMs);
    // Headroom: how much faster than 60fps are we? e.g., 180fps = 3x headroom
    const headroom = Math.round((1000 / avgFrameMs) / 60 * 100);

    return { uncappedFps, avgFrameMs: +avgFrameMs.toFixed(2), headroom };
  }

  // ─── Viewport Offset (delegated to CameraManager) ──────────────────

  /** Compute current viewport offset from open panels (hierarchy, inspector, left panels).
   *  Returns undefined when no panels obscure the viewport.
   *  NOTE: Uses INSPECTOR_PANEL_WIDTH from layout-constants internally. */
  getCurrentViewportOffset(): ViewportOffset | undefined {
    return this._cameraManager.getCurrentViewportOffset();
  }

  // ─── Camera Animation (delegated to CameraManager) ─────────────────

  /**
   * Smoothly animate the camera to a new position and orbit target.
   * @param position  Target camera position.
   * @param target    Target orbit center.
   * @param duration  Animation duration in seconds (default 0.6).
   */
  animateCameraTo(position: Vector3, target: Vector3, duration = 0.6): void {
    this._cameraManager.animateCameraTo(position, target, duration);
  }

  /** Whether a camera animation is currently in progress. */
  get isCameraAnimating(): boolean { return this._cameraManager.isCameraAnimating; }

  // ─── Private ──────────────────────────────────────────────────────────

  private lastHoveredDrive: RVDrive | null = null;
  private lastHoverClientX = 0;
  private lastHoverClientY = 0;
  private lastRenderTime = 0;
  /** Shadow map dirty flag — when false, shadow pass is skipped entirely. */
  private _shadowsDirty = true;
  /** Render dirty flag — when false, renderer.render() is skipped (Phase 4: render-on-demand). */
  private _renderDirty = true;
  /** Frames remaining for damping after last user input (Phase 4). */
  private _dampingFramesRemaining = 0;
  /** Previous MU count — used to detect spawn/despawn for shadow dirty flag. */
  private _prevMuCount = 0;
  /** Reference to the ground plane mesh (if created). */
  private _groundMesh: Mesh | null = null;

  private fixedUpdate(dt: number): void {
    this.simTickCount++;
    const isConnected = this._connectionState === 'Connected';

    // Recording playback — guarded by DrivesRecorder.Active
    if (this.playback && this.playback.isPlaying && isActiveForState(this.playback.activeOnly, isConnected)) {
      this.playback.update(dt);
    }

    // LogicStep engine — guarded by Active
    if (this.logicEngine && isActiveForState(this.logicEngine.activeOnly, isConnected)) {
      this.logicEngine.fixedUpdate(dt);
    }

    // ReplayRecording signal-triggered sequences — each has its own Active
    for (const rr of this.replayRecordings) {
      if (isActiveForState(rr.activeOnly, isConnected)) {
        rr.fixedUpdate(dt);
      }
    }

    // ── Plugins Pre (interface signals, replay, CAM) ──
    for (const p of this._prePlugins) {
      callPlugin(p, 'onFixedUpdatePre', dt);
    }

    // ── Core Drive Physics (behaviors + motion, drives[] may be topologically sorted) ──
    for (const drive of this.drives) {
      drive.update(dt);
      if (drive.isRunning || drive.positionOverwrite) {
        this._renderDirty = true;
        // Conveyor drives (jogForward/jogBackward) don't move geometry — only belt speed
        // changes. No shadow recompute needed for them.
        if (!drive.jogForward && !drive.jogBackward) {
          this._shadowsDirty = true;
        }
      }
    }

    // Mark shadows + render dirty only when MU count changes (spawn/despawn),
    // not when MUs merely exist. MU position changes already trigger render via
    // drive.isRunning on the transport surface drive.
    const muCount = this.transportManager ? this.transportManager.mus.length : 0;
    if (muCount !== this._prevMuCount) {
      this._shadowsDirty = true;
      this._renderDirty = true;
    }
    this._prevMuCount = muCount;

    // ── Core Transport (kinematic — skipped when physics plugin is active) ──
    if (this.transportManager && !this._physicsPluginActive) {
      this.transportManager.update(dt);
    }

    // ── Texture animation (always runs, even when physics plugin handles transport) ──
    if (this.transportManager) {
      this.transportManager.updateTextureAnimations(dt);
      // Mark render dirty when any surface is actively animating its belt texture
      for (const surface of this.transportManager.surfaces) {
        if (surface.isActive) {
          this._renderDirty = true;
          break;
        }
      }
    }

    // ── Plugins Post (recorder, sensor monitor, interface readback) ──
    for (const p of this._postPlugins) {
      callPlugin(p, 'onFixedUpdatePost', dt);
    }

  }

  private render(): void {
    if (this.statsReady) this.stats.begin();
    const now = performance.now() / 1000;
    const frameDt = this.lastRenderTime > 0 ? Math.min(now - this.lastRenderTime, 0.1) : 0.016;
    this.lastRenderTime = now;

    // FPS counter (updated every 500ms)
    this.fpsFrameCount++;
    this.fpsAccumTime += frameDt;
    if (this.fpsAccumTime >= 0.5) {
      this.currentFps = Math.round(this.fpsFrameCount / this.fpsAccumTime);
      this.currentFrameTime = +(this.fpsAccumTime / this.fpsFrameCount * 1000).toFixed(1);
      this.fpsFrameCount = 0;
      this.fpsAccumTime = 0;
    }

    this._cameraManager.tickCameraAnimation(frameDt);
    // Camera animation keeps render dirty
    if (this._cameraManager.isCameraAnimating) this._renderDirty = true;
    // Damping: keep rendering for N frames after last user input
    if (this._dampingFramesRemaining > 0) {
      this._dampingFramesRemaining--;
      this._renderDirty = true;
    }
    if (this.controls.enabled) this.controls.update();
    // Highlight tracked mode needs rendering when overlays move
    if (this.highlighter.isActive || this.highlighter.isSelectionActive) this._renderDirty = true;
    this.highlighter.update();

    // Shadow dirty flag: only re-render shadow map when something has changed
    (this.renderer.shadowMap as unknown as { needsUpdate: boolean }).needsUpdate = this._shadowsDirty;
    this._shadowsDirty = false;

    // Render-on-demand: skip expensive GPU render when scene is static
    if (this._renderDirty) {
      this.renderer.render(this.scene, this.camera);
      this._renderDirty = false;
    }

    // ── Plugins Render ──
    for (const p of this._renderPlugins) {
      callPlugin(p, 'onRender', frameDt);
    }

    // Emit object-hover + backward-compatible drive-hover events
    if (this.raycastManager) {
      const rm = this.raycastManager;
      const hoveredNode = rm.hoveredNode;
      const hoveredType = rm.hoveredNodeType;
      const hoveredPath = rm.hoveredNodePath;
      const cx = rm.pointerClientX;
      const cy = rm.pointerClientY;

      // Resolve drive for compat layer
      const hoveredDrive = (hoveredNode && hoveredType === 'Drive')
        ? this.registry?.findInParent<RVDrive>(hoveredNode, 'Drive') ?? null
        : null;

      const driveChanged = hoveredDrive !== this.lastHoveredDrive;
      const dx = cx - this.lastHoverClientX;
      const dy = cy - this.lastHoverClientY;
      const movedEnough = dx * dx + dy * dy > 16; // 4px threshold squared
      if (driveChanged || movedEnough) {
        this.lastHoveredDrive = hoveredDrive;
        this.lastHoverClientX = cx;
        this.lastHoverClientY = cy;

        // Emit generic object-hover
        if (hoveredNode && hoveredType && hoveredPath) {
          this.emit('object-hover', {
            node: hoveredNode,
            nodeType: hoveredType,
            nodePath: hoveredPath,
            pointer: { x: cx, y: cy },
            mesh: hoveredNode,
          });
        } else {
          this.emit('object-hover', null);
        }

        // Backward-compat: drive-hover with EXACT existing signature
        this.emit('drive-hover', { drive: hoveredDrive, clientX: cx, clientY: cy });
      }
    }

    if (this.statsReady) { this.stats.end(); this.stats.update(); }

    // --- Renderer.info periodic logging (every 5s at 60fps) ---
    if (this.rendererInfoLogging) {
      this.rendererInfoFrameCount++;
      if (this.rendererInfoFrameCount >= 300) {
        this.rendererInfoFrameCount = 0;
        const info = this.renderer.info;
        const mem = info.memory;
        const rnd = info.render;
        if (!mem || !rnd) return;
        debug('render',
          `Draw calls: ${rnd.calls ?? 0} | Tris: ${rnd.triangles ?? 0} | ` +
          `Geo: ${mem.geometries ?? 0} | Tex: ${mem.textures ?? 0}`
        );
        if (this._lastGeoCount > 0 && (mem.geometries ?? 0) > this._lastGeoCount + 10) {
          console.warn(`[Perf] Geometry count growing: ${this._lastGeoCount} → ${mem.geometries}`);
        }
        if (this._lastTexCount > 0 && (mem.textures ?? 0) > this._lastTexCount + 5) {
          console.warn(`[Perf] Texture count growing: ${this._lastTexCount} → ${mem.textures}`);
        }
        this._lastGeoCount = mem.geometries ?? 0;
        this._lastTexCount = mem.textures ?? 0;
      }
    }
  }

  // ─── Extracted Helper Methods ────────────────────────────────────────

  /** Detect whether the real WebGPU backend is active (not forceWebGL). */
  private _detectWebGPU(renderer: Renderer): boolean {
    if (!('isWebGPURenderer' in renderer)) return false;
    const backend = (renderer as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend;
    return !!backend?.isWebGPUBackend;
  }

  /** Bind all canvas event listeners. Called ONCE in the constructor. */
  private _bindCanvasEvents(canvas: HTMLCanvasElement): void {
    // Trackpad: two-finger drag rotates when no modifier, pinch (ctrl+wheel) zooms.
    canvas.addEventListener('wheel', (e) => {
      if (e.ctrlKey) return;
      if (e.deltaMode !== 0) return;
      const absDY = Math.abs(e.deltaY);
      if (absDY >= 50 && e.deltaX === 0) return;
      e.preventDefault();
      e.stopPropagation();
      const azimuth = e.deltaX * 0.003;
      const polar = e.deltaY * 0.003;
      const spherical = new Spherical().setFromVector3(
        this.camera.position.clone().sub(this.controls.target),
      );
      spherical.theta += azimuth;
      spherical.phi = Math.max(0.01, Math.min(Math.PI - 0.01, spherical.phi + polar));
      const offset = new Vector3().setFromSpherical(spherical);
      this.camera.position.copy(this.controls.target).add(offset);
      this.camera.lookAt(this.controls.target);
      this.controls.update();
    }, { passive: false });

    // Canvas click: record pointer start, then select on pointerup only if
    // the pointer didn't move (drag threshold).
    const DRAG_THRESHOLD = DRAG_THRESHOLD_PX;
    canvas.addEventListener('pointerdown', (e) => {
      // Left button: track for click selection
      if (e.button === 0) {
        this._pointerDownPos = { x: e.clientX, y: e.clientY };
      }
      // Right button: track for context menu drag guard
      if (e.button === 2) {
        this._rightDownPos = { x: e.clientX, y: e.clientY };
      }
      // Touch long-press: start timer for context menu
      if (e.pointerType !== 'mouse' && e.button === 0) {
        this._cancelLongPress();
        this._longPressPos = { x: e.clientX, y: e.clientY };
        this._longPressTimer = setTimeout(() => {
          this._handleLongPress(e);
        }, 500);
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      if (e.button !== 0 || !this._pointerDownPos) return;
      const dx = e.clientX - this._pointerDownPos.x;
      const dy = e.clientY - this._pointerDownPos.y;
      this._pointerDownPos = null;
      if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) return;
      if (this._isOrbiting) return;

      const hoveredNode = this.raycastManager?.hoveredNode ?? null;
      const hoveredType = this.raycastManager?.hoveredNodeType ?? null;
      const hoveredDrive = (hoveredNode && hoveredType === 'Drive')
        ? this.registry?.findInParent<RVDrive>(hoveredNode, 'Drive') ?? null
        : null;

      // Drive chart special mode: filter drives on click
      if (hoveredDrive && this._driveChartOpen) {
        this.filterDrives(hoveredDrive.name);
        return;
      }

      // Sensor chart special mode: filter sensors on click
      if (hoveredNode && hoveredType === 'Sensor' && this._sensorChartOpen) {
        const path = this.registry?.getPathForNode(hoveredNode);
        if (path) {
          this.filterNodes(hoveredNode.name);
          this.emit('object-clicked', { path, node: hoveredNode });
        }
        return;
      }

      // Normal selection: route through SelectionManager
      let hitPath: string | null = null;
      let hitNode: Object3D | null = null;

      if (hoveredDrive) {
        hitPath = this.registry?.getPathForNode(hoveredDrive.node) ?? null;
        hitNode = hoveredDrive.node;
      } else {
        hitPath = this.raycastManager?.raycastForRVNode(e) ?? this._raycastForRVNode(e);
        hitNode = hitPath && this.registry ? this.registry.getNode(hitPath) ?? null : null;
      }

      if (hitPath && hitNode) {
        if (e.shiftKey) {
          this.selectionManager.toggle(hitPath);
        } else {
          this.selectionManager.select(hitPath);
        }
        // Backward compat: emit object-clicked for existing listeners
        this.emit('object-clicked', { path: hitPath, node: hitNode });
      } else {
        // Clicked empty space
        this.selectionManager.clear();
        this.clearFocus();
      }
    });

    // Double-click: emit object-focus for camera zoom
    canvas.addEventListener('dblclick', (e) => {
      const hitPath = this.raycastManager?.raycastForRVNode(e) ?? this._raycastForRVNode(e);
      if (hitPath && this.registry) {
        const node = this.registry.getNode(hitPath);
        if (node) {
          this.emit('object-focus', { path: hitPath, node });
          this.fitToNodes([node]);
        }
      }
    });

    // ── Context Menu (right-click) ───────────────────────────────────
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault(); // Always suppress browser context menu on canvas

      // Drag-distance guard: if user right-dragged (orbit rotation), skip
      if (this._rightDownPos) {
        const dx = e.clientX - this._rightDownPos.x;
        const dy = e.clientY - this._rightDownPos.y;
        if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) {
          this._rightDownPos = null;
          return;
        }
      }
      this._rightDownPos = null;

      // FPV guard: don't open context menu when FPV plugin is active
      const fpvPlugin = this.getPlugin('fpv') as { active?: boolean } | undefined;
      if (fpvPlugin?.active) return;

      this._openContextMenuFromEvent(e);
    });

    // ── Long-press cancellation ──────────────────────────────────────
    canvas.addEventListener('pointermove', (e) => {
      if (this._longPressTimer && this._longPressPos) {
        const dx = e.clientX - this._longPressPos.x;
        const dy = e.clientY - this._longPressPos.y;
        if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) {
          this._cancelLongPress();
        }
      }
    });
    canvas.addEventListener('pointerup', () => {
      this._cancelLongPress();
    });
    canvas.addEventListener('pointercancel', () => {
      this._cancelLongPress();
    });
    canvas.addEventListener('touchcancel', () => {
      this._cancelLongPress();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this._cancelLongPress();
    });
  }

  // ─── Context Menu Helpers ───────────────────────────────────────────

  /** Cancel the long-press timer (touch context menu). */
  private _cancelLongPress(): void {
    if (this._longPressTimer) {
      clearTimeout(this._longPressTimer);
      this._longPressTimer = null;
    }
    this._longPressPos = null;
  }

  /** Handle long-press firing: raycast and open context menu. */
  private _handleLongPress(e: PointerEvent): void {
    this._longPressTimer = null;
    if (this._isOrbiting) return;

    // FPV guard
    const fpvPlugin = this.getPlugin('fpv') as { active?: boolean } | undefined;
    if (fpvPlugin?.active) return;

    // Use stored position for the raycast (finger may have moved slightly)
    const pos = this._longPressPos;
    if (!pos) return;

    // Create a synthetic mouse event at the stored position for raycast
    const syntheticEvent = { clientX: pos.x, clientY: pos.y } as MouseEvent;
    const detailed = this.raycastManager?.raycastForRVNodeDetailed(syntheticEvent);
    const path = detailed?.path ?? this._raycastForRVNode(syntheticEvent);
    if (!path) return;

    const node = this.registry?.getNode(path);
    if (!node) return;

    const target: ContextMenuTarget = {
      path,
      node,
      types: this.registry!.getComponentTypes(path),
      extras: (node.userData?.realvirtual ?? {}) as Record<string, unknown>,
      hitPoint: detailed?.hitPoint,
      hitNormal: detailed?.hitNormal,
    };

    if (this.raycastManager) this.raycastManager.holdHover = true;
    this.contextMenu.open({ x: pos.x, y: pos.y }, target);
    navigator.vibrate?.(50);
    this._longPressPos = null;
  }

  /**
   * Raycast from a mouse event and open the context menu on the hit node.
   * Shared by the `contextmenu` event handler and long-press handler.
   */
  private _openContextMenuFromEvent(e: MouseEvent): void {
    const detailed = this.raycastManager?.raycastForRVNodeDetailed(e);
    const path = detailed?.path ?? this._raycastForRVNode(e);
    if (!path) return;

    const node = this.registry?.getNode(path);
    if (!node) return;

    const target: ContextMenuTarget = {
      path,
      node,
      types: this.registry!.getComponentTypes(path),
      extras: (node.userData?.realvirtual ?? {}) as Record<string, unknown>,
      hitPoint: detailed?.hitPoint,
      hitNormal: detailed?.hitNormal,
    };

    // Hold hover highlight while context menu is open
    if (this.raycastManager) this.raycastManager.holdHover = true;
    this.contextMenu.open({ x: e.clientX, y: e.clientY }, target);
    this.emit('context-menu-request', { pos: { x: e.clientX, y: e.clientY }, path, node });
  }

  /** Set up XR if available (WebGPU real backend has no XR support). */
  private _setupXR(renderer: Renderer, container: HTMLElement): void {
    if (this.isWebGPU) return;
    const xr = (renderer as unknown as Record<string, unknown>).xr as Record<string, unknown> | undefined;
    if (!xr || typeof xr.addEventListener !== 'function') return;
    const glRenderer = renderer as unknown as WebGLRenderer;
    glRenderer.xr.enabled = true;

    glRenderer.xr.addEventListener('sessionstart', () => {
      this._savedBackground = this.scene.background as Color | null;
      this._savedShadowState = this.renderer.shadowMap.enabled;
      this.renderer.shadowMap.enabled = false;
      this.controls.enabled = false;
      if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
      if (this.resizeObserver) this.resizeObserver.disconnect();
      this.emit('xr-session-start', undefined as void);
    });
    glRenderer.xr.addEventListener('sessionend', () => {
      this.scene.background = this._savedBackground;
      this.renderer.shadowMap.enabled = this._savedShadowState;
      this.controls.reset();
      this.controls.enabled = true;
      if (this.resizeHandler) {
        window.addEventListener('resize', this.resizeHandler);
        this.resizeHandler();
      }
      if (this.resizeObserver) this.resizeObserver.observe(container);
      this.emit('xr-session-end', undefined as void);
    });
  }

  /** Initialize stats-gl with fallback for WebGPU incompatibility. */
  private _setupStats(renderer: Renderer): void {
    this.stats = new Stats({
      trackGPU: true,
      trackHz: true,
      trackCPT: false,
      logsPerSecond: 4,
      graphsPerSecond: 30,
      samplesLog: 40,
      samplesGraph: 10,
      precision: 2,
      minimal: false,
      horizontal: true,
    });
    this.stats.dom.style.position = 'absolute';
    this.stats.dom.style.bottom = '12px';
    this.stats.dom.style.left = '12px';
    this.stats.dom.style.display = 'none';
    document.body.appendChild(this.stats.dom);
    try {
      this.stats.init(renderer as unknown as WebGLRenderer);
      this.statsReady = true;
    } catch {
      console.warn('[RVViewer] stats-gl init failed — GPU profiling disabled');
      this.statsReady = false;
    }
  }

  private createGround(): Mesh {
    const checkerSize = 512;
    const tileCount = 8;
    const canvas = document.createElement('canvas');
    canvas.width = checkerSize;
    canvas.height = checkerSize;
    const ctx = canvas.getContext('2d')!;
    const tilePixels = checkerSize / tileCount;
    const colorA = '#b0b0b0';
    const colorB = '#9a9a9a';
    for (let y = 0; y < tileCount; y++) {
      for (let x = 0; x < tileCount; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? colorA : colorB;
        ctx.fillRect(x * tilePixels, y * tilePixels, tilePixels, tilePixels);
      }
    }
    const checkerTex = new CanvasTexture(canvas);
    checkerTex.wrapS = RepeatWrapping;
    checkerTex.wrapT = RepeatWrapping;
    checkerTex.repeat.set(25, 25);
    checkerTex.colorSpace = SRGBColorSpace;
    checkerTex.magFilter = NearestFilter;

    let groundGeo: PlaneGeometry | BufferGeometry = new PlaneGeometry(100, 100);
    // WebGPU r171: setIndex(Uint32) doesn't fix GPU buffer allocation — use toNonIndexed()
    if (this.isWebGPU && groundGeo.index) {
      const nonIndexed = groundGeo.toNonIndexed();
      groundGeo.dispose();
      groundGeo = nonIndexed;
    }
    const groundMat = new MeshStandardMaterial({
      map: checkerTex,
      roughness: 0.9,
      metalness: 0.0,
    });
    const ground = new Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    return ground;
  }
}
