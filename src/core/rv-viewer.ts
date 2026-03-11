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
  WebGLRenderer,
  DirectionalLight,
  HemisphereLight,
  Color,
  Vector3,
  Box3,
  Object3D,
  MOUSE,
  PlaneGeometry,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  ACESFilmicToneMapping,
  CanvasTexture,
  RepeatWrapping,
  NearestFilter,
  SRGBColorSpace,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Stats from 'stats.js';

import { EventEmitter } from './rv-events';
import { loadGLB, type LoadResult } from '../rv-scene-loader';
import { SimulationLoop } from '../rv-simulation-loop';
import { RVErraticDriver } from '../rv-erratic';
import { setupDriveHover, type RVDriveHover } from '../rv-drive-hover';
import { RVHighlightManager } from '../rv-highlight-manager';
import type { RVDrive } from '../rv-drive';
import type { RVTransportManager } from '../rv-transport-manager';
import type { SignalStore } from '../rv-signal-store';
import type { RVDrivesPlayback } from '../rv-drives-playback';
import type { RVReplayRecording } from '../rv-replay-recording';
import type { RVLogicEngine } from '../rv-logic-engine';
import type { NodeRegistry } from '../rv-node-registry';
import { DriveDataRecorder } from '../rv-drive-recorder';
import type { RVViewerPlugin } from './rv-plugin';
import type { RVUIPlugin } from './rv-ui-plugin';
import { UIPluginRegistry } from './rv-ui-registry';

// ─── Public Types ───────────────────────────────────────────────────────

export interface RVViewerOptions {
  /** Use WebGPU renderer (falls back to WebGL if unavailable). Default: false */
  useWebGPU?: boolean;
  /** Show checkerboard ground plane. Default: true */
  ground?: boolean;
  /** Auto-resize on window resize. Default: true */
  autoResize?: boolean;
}

export interface ViewerEvents {
  // ── Existing events (unchanged) ──
  'model-loaded': { result: LoadResult };
  'model-cleared': void;
  'drive-hover': { drive: RVDrive | null; clientX: number; clientY: number };
  'drive-focus': { drive: RVDrive | null; node: Object3D | null };
  'drive-chart-toggle': { open: boolean };
  'drive-filter': { filter: string; filteredDrives: RVDrive[] };

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

  // ── UI events (emitted by UI plugins) ──
  'camera-animation-done': { targetPath?: string };
  'object-clicked': { path: string; node: Object3D };
  'panel-opened': { panelId: string };
  'panel-closed': { panelId: string };

  // ── XR events ──
  'xr-session-start': undefined;
  'xr-session-end': undefined;
  'xr-hit-test': { position: Float32Array; matrix: Float32Array };
  'xr-controller-select': { hand: 'left' | 'right'; position: { x: number; y: number; z: number } };
}

// ─── RVViewer ───────────────────────────────────────────────────────────

export class RVViewer extends EventEmitter<ViewerEvents> {
  // --- Three.js context (read-only for custom UIs) ---
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  readonly controls: OrbitControls;
  readonly loop: SimulationLoop;
  readonly stats: Stats;
  readonly isWebGPU: boolean;

  // --- Highlight system (always available) ---
  readonly highlighter: RVHighlightManager;

  // --- Simulation state (populated after loadModel) ---
  signalStore: SignalStore | null = null;
  registry: NodeRegistry | null = null;
  drives: RVDrive[] = [];
  driveHover: RVDriveHover | null = null;
  transportManager: RVTransportManager | null = null;
  logicEngine: RVLogicEngine | null = null;
  playback: RVDrivesPlayback | null = null;

  /** Drive data recorder for chart overlay (ring buffer sampling). */
  readonly driveRecorder = new DriveDataRecorder(3000, 10);

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

  /** UI plugin registry for React slot rendering. */
  readonly uiRegistry = new UIPluginRegistry();

  /**
   * Register a core plugin. Sorted into cached lifecycle lists.
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

  /**
   * Register a UI plugin. Its slot entries are added to the uiRegistry. Chainable.
   */
  useUI(uiPlugin: RVUIPlugin): this {
    this.uiRegistry.register(uiPlugin);
    return this;
  }

  /** Type-safe plugin lookup by ID. */
  getPlugin<T extends RVViewerPlugin>(id: string): T | undefined {
    return this._plugins.find((p) => p.id === id) as T | undefined;
  }

  /** Whether the drive chart overlay is open. */
  private _driveChartOpen = false;
  get driveChartOpen(): boolean { return this._driveChartOpen; }

  /** Toggle the drive chart overlay. Highlights all drives when open. */
  toggleDriveChart(forceOpen?: boolean): void {
    this._driveChartOpen = forceOpen ?? !this._driveChartOpen;
    if (this._driveChartOpen) {
      // Highlight filtered drives (or all if no filter)
      const drivesToHighlight = this._driveFilter ? this._filteredDrives : this.drives;
      const nodes = drivesToHighlight.map((d) => d.node);
      if (nodes.length > 0) this.highlighter.highlightMultiple(nodes);
    } else {
      this.highlighter.clear();
    }
    this.emit('drive-chart-toggle', { open: this._driveChartOpen });
  }

  /** Current drive search filter string. */
  private _driveFilter = '';
  get driveFilter(): string { return this._driveFilter; }

  /** Drives matching the current filter (all drives if filter is empty). */
  private _filteredDrives: RVDrive[] = [];
  get filteredDrives(): RVDrive[] { return this._filteredDrives.length > 0 || this._driveFilter ? this._filteredDrives : this.drives; }

  /** Filter drives by full-text search. Highlights matching drives in 3D and updates chart. */
  filterDrives(term: string): void {
    this._driveFilter = term;
    if (!term.trim()) {
      this._filteredDrives = [];
      // Restore full highlight if chart is open
      if (this._driveChartOpen) {
        const nodes = this.drives.map((d) => d.node);
        if (nodes.length > 0) this.highlighter.highlightMultiple(nodes);
      }
    } else {
      const lower = term.toLowerCase();
      this._filteredDrives = this.drives.filter((d) => d.name.toLowerCase().includes(lower));
      // Highlight matching drives
      const nodes = this._filteredDrives.map((d) => d.node);
      if (nodes.length > 0) {
        this.highlighter.highlightMultiple(nodes);
      } else {
        this.highlighter.clear();
      }
    }
    this.emit('drive-filter', { filter: term, filteredDrives: this._filteredDrives });
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
  private erraticDrivers: RVErraticDriver[] = [];
  private replayRecordings: RVReplayRecording[] = [];
  private currentModel: Object3D | null = null;
  private sceneFixtures = new Set<Object3D>();
  private resizeHandler: (() => void) | null = null;
  private simTickCount = 0;
  private fpsFrameCount = 0;
  private fpsAccumTime = 0;
  private hemiLight!: HemisphereLight;
  private dirLight!: DirectionalLight;
  private fillLight!: DirectionalLight;

  constructor(container: HTMLElement, options?: RVViewerOptions) {
    super();

    const useWebGPU = options?.useWebGPU ?? false;
    const showGround = options?.ground ?? true;
    const autoResize = options?.autoResize ?? true;

    // --- Scene ---
    this.scene = new Scene();
    this.scene.background = new Color(0x9a9a9a);
    this.highlighter = new RVHighlightManager(this.scene);

    // --- Camera ---
    this.camera = new PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 1000);
    this.camera.position.set(3, 2.5, 4);
    this.camera.lookAt(0, 0.5, 0);

    // --- Renderer ---
    // Note: WebGPU init is async — for now we always start with WebGL.
    // WebGPU support can be added via an async factory method later.
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.xr.enabled = true;
    this.isWebGPU = false; // Sync constructor — WebGPU needs async init

    container.appendChild(this.renderer.domElement);

    // --- Controls ---
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0.5, 0);
    this.controls.mouseButtons = {
      LEFT: -1 as MOUSE,
      MIDDLE: MOUSE.PAN,
      RIGHT: MOUSE.ROTATE,
    };
    this.controls.update();

    // --- XR session lifecycle ---
    this.renderer.xr.addEventListener('sessionstart', () => {
      this._savedBackground = this.scene.background as Color | null;
      this._savedShadowState = this.renderer.shadowMap.enabled;
      this.renderer.shadowMap.enabled = false;
      this.controls.enabled = false;
      if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
      this.emit('xr-session-start', undefined as never);
    });
    this.renderer.xr.addEventListener('sessionend', () => {
      this.scene.background = this._savedBackground;
      this.renderer.shadowMap.enabled = this._savedShadowState;
      this.controls.reset();
      this.controls.enabled = true;
      if (this.resizeHandler) {
        window.addEventListener('resize', this.resizeHandler);
        this.resizeHandler();
      }
      this.emit('xr-session-end', undefined as never);
    });

    // Canvas click: filter chart to hovered drive, or clear focus
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const hovered = this.driveHover?.hoveredDrive;
      if (hovered && this._driveChartOpen) {
        this.filterDrives(hovered.name);
      } else {
        this.clearFocus();
      }
    });

    // --- Lighting ---
    this.hemiLight = new HemisphereLight(0xe8e8e8, 0x888888, 0.9);
    this.scene.add(this.hemiLight);
    this.sceneFixtures.add(this.hemiLight);

    this.dirLight = new DirectionalLight(0xffffff, 2.2);
    this.dirLight.position.set(-3, 10, 5);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 0.1;
    this.dirLight.shadow.camera.far = 50;
    this.dirLight.shadow.camera.left = -15;
    this.dirLight.shadow.camera.right = 15;
    this.dirLight.shadow.camera.top = 15;
    this.dirLight.shadow.camera.bottom = -15;
    this.dirLight.shadow.bias = -0.0005;
    this.dirLight.shadow.normalBias = 0.02;
    this.dirLight.shadow.intensity = 0.5;
    this.dirLight.shadow.camera.updateProjectionMatrix();
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);
    this.sceneFixtures.add(this.dirLight);
    this.sceneFixtures.add(this.dirLight.target);

    this.fillLight = new DirectionalLight(0xd0d0d0, 0.4);
    this.fillLight.position.set(5, 3, -5);
    this.scene.add(this.fillLight);
    this.sceneFixtures.add(this.fillLight);

    // --- Ground ---
    if (showGround) {
      const ground = this.createGround();
      this.scene.add(ground);
      this.sceneFixtures.add(ground);
    }

    // --- Stats.js ---
    this.stats = new Stats();
    this.stats.showPanel(0);
    this.stats.dom.style.position = 'absolute';
    this.stats.dom.style.top = '12px';
    this.stats.dom.style.left = '220px';
    this.stats.dom.style.display = 'none';
    document.body.appendChild(this.stats.dom);

    // --- Simulation Loop ---
    this.loop = new SimulationLoop(this.renderer);
    this.loop.onFixedUpdate = (dt: number) => this.fixedUpdate(dt);
    this.loop.onRender = () => this.render();
    this.loop.start();

    // --- Resize ---
    if (autoResize) {
      this.resizeHandler = () => {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener('resize', this.resizeHandler);
    }

    console.log('realvirtual Web Viewer — Ready');
  }

  // ─── Static Factory for WebGPU ────────────────────────────────────────

  /**
   * Create a viewer with WebGPU support (async init).
   * Falls back to WebGL if WebGPU is unavailable.
   */
  static async create(
    container: HTMLElement,
    options?: RVViewerOptions,
  ): Promise<RVViewer> {
    if (options?.useWebGPU) {
      try {
        const { WebGPURenderer } = await import('three/webgpu');
        const viewer = new RVViewer(container, { ...options, useWebGPU: false });
        // Replace the WebGL renderer with WebGPU
        const gpuRenderer = new WebGPURenderer({ antialias: true });
        await gpuRenderer.init();
        gpuRenderer.setSize(window.innerWidth, window.innerHeight);
        gpuRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        gpuRenderer.shadowMap.enabled = true;
        gpuRenderer.shadowMap.type = PCFSoftShadowMap;
        gpuRenderer.toneMapping = ACESFilmicToneMapping;
        gpuRenderer.toneMappingExposure = 1.2;
        // Swap renderers
        viewer.renderer.domElement.replaceWith(gpuRenderer.domElement);
        (viewer as { renderer: WebGLRenderer }).renderer = gpuRenderer as unknown as WebGLRenderer;
        (viewer as { isWebGPU: boolean }).isWebGPU = true;
        // Re-attach controls to new canvas
        viewer.controls.dispose();
        const controls = new OrbitControls(viewer.camera, gpuRenderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.target.copy(viewer.controls.target);
        controls.mouseButtons = {
          LEFT: -1 as MOUSE,
          MIDDLE: MOUSE.PAN,
          RIGHT: MOUSE.ROTATE,
        };
        (viewer as { controls: OrbitControls }).controls = controls;
        console.log('WebGPU renderer initialized');
        return viewer;
      } catch (e) {
        console.warn('WebGPU not available, falling back to WebGL:', e);
      }
    }
    return new RVViewer(container, options);
  }

  // ─── Model Management ─────────────────────────────────────────────────

  /** Load a GLB model and start all simulation systems. */
  async loadModel(url: string): Promise<LoadResult> {
    this.clearModel();

    const result = await loadGLB(url, this.scene);

    this.currentModel = this.scene.children.find((c) => !this.sceneFixtures.has(c)) ?? null;
    this.drives = result.drives;
    this.transportManager = result.transportManager;
    this.signalStore = result.signalStore;
    this.playback = result.playback;
    this.replayRecordings = result.replayRecordings;
    this.logicEngine = result.logicEngine;
    this.registry = result.registry;

    // Drive data recorder
    this.driveRecorder.setDrives(this.drives);

    // Drive hover highlighting (hover events emitted in render loop)
    this.driveHover = setupDriveHover(this.renderer, this.camera, this.scene, result.registry, this.highlighter);

    // Erratic drivers
    this.erraticDrivers = this.drives
      .filter((drive) => drive.config.behaviors.includes('Drive_ErraticPosition'))
      .map((drive) => {
        const extras = drive.config.behaviorExtras['Drive_ErraticPosition'];
        return new RVErraticDriver(drive, extras ? {
          minPos: extras['MinPos'] as number | undefined,
          maxPos: extras['MaxPos'] as number | undefined,
          speed: extras['Speed'] as number | undefined,
          iterateBetweenMaxAndMin: extras['IterateBetweenMaxAndMin'] as boolean | undefined,
        } : undefined);
      });

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
    const fov = this.camera.fov * (Math.PI / 180);
    const dist = (maxDim / (2 * Math.tan(fov / 2))) * 1.5;

    this.camera.position.set(center.x + dist * 0.7, center.y + dist * 0.5, center.z + dist * 0.7);
    this.controls.target.copy(center);
    this.controls.update();

    // Update shadow camera to cover model
    {
      const shadowPad = Math.max(maxDim * 2, 5);
      this.dirLight.position.set(center.x - 3, center.y + maxDim * 3, center.z + 5);
      this.dirLight.target.position.copy(center);
      this.dirLight.shadow.camera.left = -shadowPad;
      this.dirLight.shadow.camera.right = shadowPad;
      this.dirLight.shadow.camera.top = shadowPad;
      this.dirLight.shadow.camera.bottom = -shadowPad;
      this.dirLight.shadow.camera.near = 0.1;
      this.dirLight.shadow.camera.far = Math.max(maxDim * 10, 50);
      this.dirLight.shadow.camera.updateProjectionMatrix();
    }

    // Plugin lifecycle: onModelLoaded (before event, with error isolation)
    this._lastLoadResult = result;
    for (const p of this._plugins) {
      if (p.onModelLoaded) {
        try { p.onModelLoaded(result, this); }
        catch (e) { console.error(`[RVViewer] Plugin '${p.id}' onModelLoaded error:`, e); }
      }
    }

    console.log(`[RVViewer] Model loaded: ${this.drives.length} drives, ${this.signalStore?.size ?? 0} signals`);
    this.emit('model-loaded', { result });
    return result;
  }

  /** Remove the current model and reset all simulation state. */
  clearModel(): void {
    // Plugin lifecycle: onModelCleared (before state reset)
    for (const p of this._plugins) {
      if (p.onModelCleared) {
        try { p.onModelCleared(this); }
        catch (e) { console.error(`[RVViewer] Plugin '${p.id}' onModelCleared error:`, e); }
      }
    }
    this._lastLoadResult = null;

    if (this.driveHover) {
      this.driveHover.dispose();
      this.driveHover = null;
    }
    if (this.currentModel) {
      this.scene.remove(this.currentModel);
      this.currentModel.traverse((node) => {
        const mesh = node as { geometry?: { dispose(): void }; material?: { dispose(): void } | { dispose(): void }[] };
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
          else mesh.material.dispose();
        }
      });
      this.currentModel = null;
    }
    this.drives = [];
    this.erraticDrivers = [];
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
    if (this.transportManager) {
      this.transportManager.reset();
      this.transportManager = null;
    }
    this.emit('model-cleared');
  }

  /** Clean up all resources. */
  dispose(): void {
    // Plugin lifecycle: dispose (before everything else)
    for (const p of this._plugins) {
      if (p.dispose) {
        try { p.dispose(); }
        catch (e) { console.error(`[RVViewer] Plugin '${p.id}' dispose error:`, e); }
      }
    }
    this.loop.stop();
    this.clearModel();
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }
    this.controls.dispose();
    this.renderer.dispose();
    this.stats.dom.remove();
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

  /** Smoothly orbit camera to focus on a component by hierarchy path. Also pins the drive tooltip if the target is a drive. */
  focusByPath(path: string): void {
    const node = this.registry?.getNode(path);
    if (!node) return;

    // Pin drive tooltip if the focused node is (or belongs to) a drive
    const drive = this.registry!.findInParent<RVDrive>(node, 'Drive')
      ?? (this.registry!.getByPath<RVDrive>('Drive', path) || null);
    this.focusedDrive = drive;
    this.focusedNode = node;
    this.emit('drive-focus', { drive, node });

    const box = new Box3();
    node.updateWorldMatrix(true, true);
    node.traverse((child) => {
      const m = child as Mesh;
      if (m.isMesh && m.geometry) {
        m.geometry.computeBoundingBox();
        if (m.geometry.boundingBox) {
          const mb = m.geometry.boundingBox.clone();
          mb.applyMatrix4(m.matrixWorld);
          box.union(mb);
        }
      }
    });
    if (box.isEmpty()) return;

    const center = new Vector3();
    const size = new Vector3();
    box.getCenter(center);
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z, 0.1);
    const fov = this.camera.fov * (Math.PI / 180);
    const dist = (maxDim / (2 * Math.tan(fov / 2))) * 2.5;

    // Keep current viewing direction — just move along it to frame the target
    const dir = new Vector3().subVectors(this.camera.position, this.controls.target).normalize();
    const endPos = center.clone().add(dir.multiplyScalar(dist));
    this.animateCameraTo(endPos, center);
  }

  /** Clear pinned drive focus (e.g., user clicked canvas). */
  clearFocus(): void {
    if (this.focusedDrive || this.focusedNode) {
      this.focusedDrive = null;
      this.focusedNode = null;
      this.emit('drive-focus', { drive: null, node: null });
    }
  }

  // ─── Visual Settings ─────────────────────────────────────────────────

  get shadowsEnabled(): boolean { return this.renderer.shadowMap.enabled; }
  set shadowsEnabled(v: boolean) {
    this.renderer.shadowMap.enabled = v;
    this.dirLight.castShadow = v;
    // Force material recompilation for shadow change
    this.scene.traverse((node) => {
      const mesh = node as { material?: { needsUpdate?: boolean } };
      if (mesh.material) mesh.material.needsUpdate = true;
    });
  }

  get shadowStrength(): number { return this.dirLight.shadow.intensity; }
  set shadowStrength(v: number) { this.dirLight.shadow.intensity = v; }

  /** Global light intensity multiplier (1.0 = default). Scales all three lights proportionally. */
  get lightIntensity(): number { return this.dirLight.intensity / 2.2; }
  set lightIntensity(v: number) {
    this.dirLight.intensity = 2.2 * v;
    this.fillLight.intensity = 0.4 * v;
    this.hemiLight.intensity = 0.9 * v;
  }

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
    const gl = this.renderer.getContext();
    gl.finish();

    const start = performance.now();
    for (let i = 0; i < frames; i++) {
      this.renderer.render(this.scene, this.camera);
    }
    gl.finish(); // Wait for GPU to complete all work
    const elapsed = performance.now() - start;

    const avgFrameMs = elapsed / frames;
    const uncappedFps = Math.round(1000 / avgFrameMs);
    // Headroom: how much faster than 60fps are we? e.g., 180fps = 3x headroom
    const headroom = Math.round((1000 / avgFrameMs) / 60 * 100);

    return { uncappedFps, avgFrameMs: +avgFrameMs.toFixed(2), headroom };
  }

  // ─── Camera Animation ──────────────────────────────────────────────

  private cameraAnim: {
    startPos: Vector3; endPos: Vector3;
    startTgt: Vector3; endTgt: Vector3;
    elapsed: number; duration: number;
  } | null = null;

  /**
   * Smoothly animate the camera to a new position and orbit target.
   * @param position  Target camera position.
   * @param target    Target orbit center.
   * @param duration  Animation duration in seconds (default 0.6).
   */
  animateCameraTo(position: Vector3, target: Vector3, duration = 0.6): void {
    if (this.renderer.xr.isPresenting) return;
    this.cameraAnim = {
      startPos: this.camera.position.clone(),
      endPos: position.clone(),
      startTgt: this.controls.target.clone(),
      endTgt: target.clone(),
      elapsed: 0,
      duration,
    };
  }

  /** Advance camera animation by frame delta. */
  private tickCameraAnimation(dtSec: number): void {
    if (!this.cameraAnim) return;
    this.cameraAnim.elapsed += dtSec;
    const t = Math.min(this.cameraAnim.elapsed / this.cameraAnim.duration, 1);
    // Smooth ease-out (cubic)
    const e = 1 - Math.pow(1 - t, 3);

    this.camera.position.lerpVectors(this.cameraAnim.startPos, this.cameraAnim.endPos, e);
    this.controls.target.lerpVectors(this.cameraAnim.startTgt, this.cameraAnim.endTgt, e);

    if (t >= 1) this.cameraAnim = null;
  }

  // ─── Private ──────────────────────────────────────────────────────────

  private lastHoveredDrive: RVDrive | null = null;
  private lastHoverClientX = 0;
  private lastHoverClientY = 0;
  private lastRenderTime = 0;

  private fixedUpdate(dt: number): void {
    this.simTickCount++;

    // Recording playback
    if (this.playback?.isPlaying) {
      this.playback.update(dt);
    }

    // LogicStep engine
    if (this.logicEngine) {
      this.logicEngine.fixedUpdate(dt);
    }

    // ReplayRecording signal-triggered sequences
    for (const rr of this.replayRecordings) {
      rr.fixedUpdate(dt);
    }

    // ── Plugins Pre (interface signals, erratic, replay, CAM) ──
    for (const p of this._prePlugins) {
      try { p.onFixedUpdatePre!(dt); }
      catch (e) { console.error(`[RVViewer] Plugin '${p.id}' onFixedUpdatePre error:`, e); }
    }

    // Erratic drivers (legacy — not yet migrated to plugin)
    for (const erratic of this.erraticDrivers) {
      erratic.update(dt);
    }

    // ── Core Drive Physics (drives[] may be topologically sorted by DriveOrderPlugin) ──
    for (const drive of this.drives) {
      drive.update(dt);
    }

    // ── Core Transport (kinematic — skipped when physics plugin is active) ──
    if (this.transportManager && !this._physicsPluginActive) {
      this.transportManager.update(dt);
    }

    // ── Plugins Post (recorder, sensor monitor, interface readback) ──
    for (const p of this._postPlugins) {
      try { p.onFixedUpdatePost!(dt); }
      catch (e) { console.error(`[RVViewer] Plugin '${p.id}' onFixedUpdatePost error:`, e); }
    }

    // Drive data sampling (for chart overlay — legacy, not yet migrated to plugin)
    this.driveRecorder.sample(dt);
  }

  private render(): void {
    this.stats.begin();
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

    this.tickCameraAnimation(frameDt);
    this.controls.update();
    this.highlighter.update();
    this.renderer.render(this.scene, this.camera);

    // ── Plugins Render ──
    for (const p of this._renderPlugins) {
      try { p.onRender!(frameDt); }
      catch (e) { console.error(`[RVViewer] Plugin '${p.id}' onRender error:`, e); }
    }

    // Emit drive-hover events when hovered drive or pointer position changes
    if (this.driveHover) {
      const hovered = this.driveHover.hoveredDrive;
      const cx = this.driveHover.pointerClientX;
      const cy = this.driveHover.pointerClientY;
      if (hovered !== this.lastHoveredDrive || cx !== this.lastHoverClientX || cy !== this.lastHoverClientY) {
        this.lastHoveredDrive = hovered;
        this.lastHoverClientX = cx;
        this.lastHoverClientY = cy;
        this.emit('drive-hover', { drive: hovered, clientX: cx, clientY: cy });
      }
    }

    this.stats.end();
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

    const groundGeo = new PlaneGeometry(100, 100);
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
