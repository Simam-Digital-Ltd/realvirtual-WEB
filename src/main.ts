/**
 * realvirtual Web Viewer — Entry Point
 *
 * Thin orchestrator that creates an RVViewer, handles model selection
 * (URL params, localStorage, Firebase demo mode), and initializes the HMI.
 *
 * All 3D, simulation, and data logic lives in RVViewer (core/rv-viewer.ts)
 * and the engine subsystems (core/engine/).
 * All UI lives in core/hmi/ (layout) and custom/ (content).
 */

import { RVViewer } from './core/rv-viewer';
import { initHMI } from './custom/hmi-entry';
import { initTestRunner } from './rv-test-runner';
import { fetchAppConfig, setAppConfig } from './core/hmi/rv-app-config';
import { loadVisualSettings } from './core/hmi/visual-settings-store';

// Core Plugins
import { SensorMonitorPlugin } from './plugins/sensor-monitor-plugin';
import { TransportStatsPlugin } from './plugins/transport-stats-plugin';
import { CameraEventsPlugin } from './plugins/camera-events-plugin';
import { DriveOrderPlugin } from './plugins/drive-order-plugin';
import { KpiDemoPlugin } from './plugins/kpi-demo-plugin';
import { RapierPhysicsPlugin } from './core/engine/rapier-physics-plugin';

// Demo HMI content (registers KPI cards, nav buttons, message tiles into HMI slots)
import { DemoHMIPlugin } from './custom/demo-hmi-plugin';

// TestAxes plugin (sequential rotary axis tester)
import { TestAxesPlugin } from './plugins/test-axes-plugin';

// Extras editor plugin (hierarchy browser + property editor)
import { RvExtrasEditorPlugin } from './core/hmi/rv-extras-editor';

// Industrial interface plugins (WebSocket Realtime, ctrlX, etc.)
import { InterfaceManager } from './interfaces/interface-manager';
import { WebSocketRealtimeInterface } from './interfaces/websocket-realtime-interface';
import { CtrlXInterface } from './interfaces/ctrlx-interface';

// WebXR plugin (immersive VR on Quest 3 and other headsets)
import { WebXRPlugin } from './plugins/webxr-plugin';

// Maintenance guide plugin (LogicStep-driven step-by-step maintenance wizard)
import { MaintenancePlugin } from './plugins/maintenance-plugin';

// Machine control panel plugin (demo HMI with PackML-inspired state machine)
import { MachineControlPlugin } from './plugins/machine-control-plugin';

// Performance test plugin (activated via ?perf URL param)
import { PerfTestPlugin } from './plugins/perf-test-plugin';

// --- localStorage keys ---
const LS_KEY_MODEL = 'rv-webviewer-last-model';
const LS_KEY_RENDERER = 'rv-webviewer-renderer';

// --- Renderer selection via URL parameter (fallback to localStorage) ---
// Mobile/touch devices always use WebGL — WebGPU is desktop-only unless explicitly overridden.
const params = new URLSearchParams(window.location.search);
const isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
const useWebGPU = !isTouchDevice
  && (params.get('renderer') ?? localStorage.getItem(LS_KEY_RENDERER)) === 'webgpu';

// --- Loading overlay ---
const loadingOverlay = document.getElementById('loading-overlay')!;
const loadingModelName = document.getElementById('loading-model-name')!;
const loadingProgressBar = document.getElementById('loading-progress-bar')!;
const loadingProgressPct = document.getElementById('loading-progress-pct')!;

function showLoadingOverlay(modelName: string) {
  loadingModelName.textContent = modelName;
  loadingProgressBar.classList.add('indeterminate');
  loadingProgressBar.style.width = '';
  loadingProgressPct.textContent = '';
  loadingOverlay.classList.remove('fade-out', 'hidden');
}

function setLoadingProgress(loaded: number, total: number) {
  const pct = Math.round((loaded / total) * 100);
  loadingProgressBar.classList.remove('indeterminate');
  loadingProgressBar.style.width = `${pct}%`;
  const loadedMB = (loaded / (1024 * 1024)).toFixed(1);
  const totalMB = (total / (1024 * 1024)).toFixed(1);
  loadingProgressPct.textContent = `${loadedMB} / ${totalMB} MB`;
}

function hideLoadingOverlay() {
  loadingOverlay.classList.add('fade-out');
  setTimeout(() => {
    loadingOverlay.classList.add('hidden');
    loadingOverlay.classList.remove('fade-out');
  }, 600);
}

async function init() {
  // --- Load App Config (MUST complete before React mount — no flicker) ---
  const appConfig = await fetchAppConfig();

  // URL param override for lockSettings (highest priority)
  if (params.has('lockSettings')) {
    appConfig.lockSettings = params.get('lockSettings') !== 'false';
  }

  // Perf test mode: suppress UI chrome
  const perfMode = params.has('perf');
  if (perfMode) {
    appConfig.lockSettings = true;
    appConfig.hideWelcomeModal = true;
  }

  // Set singleton — from here all stores have access via getAppConfig()
  setAppConfig(appConfig);

  const container = document.getElementById('app')!;

  // --- Resolve antialias BEFORE renderer creation (constructor-only param) ---
  const initialSettings = loadVisualSettings();
  const wantAntialias = initialSettings.antialias !== false && !isTouchDevice;

  // --- Create Viewer ---
  const viewer = await RVViewer.create(container, { useWebGPU, antialias: wantAntialias });

  // Apply persisted DPR cap (runtime-changeable, no reload needed)
  viewer.maxDpr = initialSettings.maxDpr;

  // Expose viewer globally for console debugging
  (window as unknown as { viewer: RVViewer }).viewer = viewer;

  // --- Preload Rapier WASM (non-blocking) ---
  // Start WASM download in background. If it finishes before model load,
  // physics will be used; otherwise kinematic transport kicks in and
  // physics activates on the next model load.
  const rapierPlugin = new RapierPhysicsPlugin();
  const rapierReady = rapierPlugin.preload();

  // --- Register Industrial Interfaces ---
  const ifaceManager = new InterfaceManager();
  ifaceManager.register(new WebSocketRealtimeInterface());
  ifaceManager.register(new CtrlXInterface());

  // --- Register Core Plugins ---
  viewer
    .use(ifaceManager)
    .use(rapierPlugin)
    .use(new WebXRPlugin())
    .use(new DriveOrderPlugin())
    .use(new SensorMonitorPlugin())
    .use(new TransportStatsPlugin())
    .use(new CameraEventsPlugin())
    .use(new KpiDemoPlugin())
    .use(new DemoHMIPlugin())
    .use(new MaintenancePlugin())
    .use(new MachineControlPlugin())
    .use(new TestAxesPlugin())
    .use(new RvExtrasEditorPlugin());

  if (perfMode) viewer.use(new PerfTestPlugin());

  // --- Model discovery ---
  const modelFiles = import.meta.glob('/public/models/*.glb', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
  const entries = Object.keys(modelFiles).map((key) => {
    const filename = key.split('/').pop()!;
    return { filename, url: `${import.meta.env.BASE_URL}models/${filename}` };
  });

  // Expose discovered models to the HMI model selector
  viewer.availableModels = entries.map((e) => ({ url: e.url, label: e.filename.replace(/\.glb$/i, '') }));

  // --- Load model helper ---
  async function loadModel(url: string) {
    const modelName = (url.split('/').pop() ?? url).split('?')[0].replace(/\.glb$/i, '');
    showLoadingOverlay(modelName);
    localStorage.setItem(LS_KEY_MODEL, url);

    try {
      const loadStart = performance.now();

      // Fetch with streaming progress
      const resp = await fetch(url);
      const contentLength = resp.headers.get('content-length');
      const totalBytes = contentLength ? parseInt(contentLength) : 0;
      const sizeMB = totalBytes ? (totalBytes / (1024 * 1024)).toFixed(1) + ' MB' : '--';

      let modelUrl = url;
      if (totalBytes && resp.body) {
        // Stream the response to track download progress
        const reader = resp.body.getReader();
        const chunks: Uint8Array[] = [];
        let loaded = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.byteLength;
          setLoadingProgress(loaded, totalBytes);
        }
        const blob = new Blob(chunks as BlobPart[]);
        modelUrl = URL.createObjectURL(blob);
      }

      const result = await viewer.loadModel(modelUrl);

      // Clean up blob URL after a delay — GLTFLoader may have pending async
      // operations (DRACO decoder, texture loading) that still reference the
      // blob URL after loadModel() resolves.
      if (modelUrl !== url) setTimeout(() => URL.revokeObjectURL(modelUrl), 5000);

      const loadTime = ((performance.now() - loadStart) / 1000).toFixed(1) + 's';
      viewer.lastLoadInfo = { glbSize: sizeMB, loadTime };
      console.log(`[main] Model loaded: ${sizeMB}, ${loadTime}, ${result.drives.length} drives`);
      hideLoadingOverlay();
    } catch (e) {
      console.error(`[main] Failed to load model: ${url}`, e);
      hideLoadingOverlay();
    }
  }

  // --- Firebase demo mode: /demo/webviewer/{demoName} ---
  const pathParts = window.location.pathname.split('/').filter(p => p);
  const webviewerIdx = pathParts.indexOf('webviewer');
  const firebaseDemoName = webviewerIdx >= 0 && pathParts[webviewerIdx + 1] ? pathParts[webviewerIdx + 1] : null;

  if (firebaseDemoName) {
    const bucketName = 'realvirtual-files.firebasestorage.app';
    const storagePath = `demo/webviewer/${firebaseDemoName}/demo.glb`;
    const firebaseGlbUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media`;
    console.log(`[main] Firebase demo: "${firebaseDemoName}" → ${firebaseGlbUrl}`);
    document.title = `${firebaseDemoName} - realvirtual WEB`;
    loadModel(firebaseGlbUrl);
  } else {
    // Local dev mode: URL param > settings.json defaultModel > localStorage > demo.glb > first model
    const urlModel = params.get('model');
    const configModel = appConfig.defaultModel;
    const savedModel = localStorage.getItem(LS_KEY_MODEL);

    // Resolve configModel: could be a full URL or just a filename like "customer-line.glb"
    const resolvedConfigModel = configModel
      ? entries.find((e) => e.url === configModel || e.filename === configModel)?.url ?? configModel
      : null;

    const modelToLoad = urlModel
      ?? (resolvedConfigModel && entries.some((e) => e.url === resolvedConfigModel) ? resolvedConfigModel : null)
      ?? (savedModel && entries.some((e) => e.url === savedModel) ? savedModel : null);

    if (modelToLoad) {
      loadModel(modelToLoad);
    } else {
      // Default to demo.glb, then first available model
      const defaultEntry = entries.find((e) => e.filename === 'demo.glb') ?? entries[0];
      if (defaultEntry) {
        loadModel(defaultEntry.url);
      } else {
        hideLoadingOverlay();
      }
    }
  }

  // --- Wait for Rapier WASM (non-critical, already has internal fallback) ---
  await rapierReady;

  // --- Initialize HMI React Overlay ---
  initHMI(viewer);

  // --- Dev-only: test runner + debug endpoint ---
  if (import.meta.env.DEV) {
    initTestRunner();
    const { DebugEndpointPlugin } = await import('./plugins/debug-endpoint-plugin');
    viewer.use(new DebugEndpointPlugin());
  }
}

init().catch(console.error);
