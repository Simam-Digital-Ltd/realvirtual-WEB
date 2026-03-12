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

// Core Plugins
import { SensorMonitorPlugin } from './plugins/sensor-monitor-plugin';
import { TransportStatsPlugin } from './plugins/transport-stats-plugin';
import { CameraEventsPlugin } from './plugins/camera-events-plugin';
import { DriveOrderPlugin } from './plugins/drive-order-plugin';
import { KpiDemoPlugin } from './plugins/kpi-demo-plugin';
import { RapierPhysicsPlugin } from './core/engine/rapier-physics-plugin';

// Demo HMI content (registers KPI cards, nav buttons, message tiles into HMI slots)
import { DemoHMIPlugin } from './custom/demo-hmi-plugin';

// --- localStorage keys ---
const LS_KEY_MODEL = 'rv-webviewer-last-model';
const LS_KEY_RENDERER = 'rv-webviewer-renderer';

// --- Renderer selection via URL parameter (fallback to localStorage) ---
const params = new URLSearchParams(window.location.search);
const useWebGPU = (params.get('renderer') ?? localStorage.getItem(LS_KEY_RENDERER)) === 'webgpu';

// --- Loading overlay ---
const loadingOverlay = document.getElementById('loading-overlay')!;
const loadingModelName = document.getElementById('loading-model-name')!;

function showLoadingOverlay(modelName: string) {
  loadingModelName.textContent = modelName;
  loadingOverlay.classList.remove('fade-out');
  loadingOverlay.classList.add('visible');
}

function hideLoadingOverlay() {
  loadingOverlay.classList.add('fade-out');
  setTimeout(() => {
    loadingOverlay.classList.remove('visible', 'fade-out');
  }, 600);
}

async function init() {
  const container = document.getElementById('app')!;

  // --- Create Viewer ---
  const viewer = useWebGPU
    ? await RVViewer.create(container, { useWebGPU: true })
    : new RVViewer(container);

  // Expose viewer globally for console debugging
  (window as unknown as { viewer: RVViewer }).viewer = viewer;

  // --- Preload Rapier WASM (before registering plugin) ---
  const rapierPlugin = new RapierPhysicsPlugin();
  await rapierPlugin.preload();

  // --- Register Core Plugins ---
  viewer
    .use(rapierPlugin)
    .use(new DriveOrderPlugin())
    .use(new SensorMonitorPlugin())
    .use(new TransportStatsPlugin())
    .use(new CameraEventsPlugin())
    .use(new KpiDemoPlugin())
    .use(new DemoHMIPlugin());

  // --- Model discovery ---
  const modelFiles = import.meta.glob('/public/models/*.glb', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
  const entries = Object.keys(modelFiles).map((key) => {
    const filename = key.split('/').pop()!;
    return { filename, url: `./models/${filename}` };
  });

  // --- Load model helper ---
  async function loadModel(url: string) {
    const modelName = url.split('/').pop() ?? url;
    showLoadingOverlay(modelName);
    localStorage.setItem(LS_KEY_MODEL, url);

    try {
      const loadStart = performance.now();
      const headResp = await fetch(url, { method: 'HEAD' });
      const contentLength = headResp.headers.get('content-length');
      const sizeMB = contentLength ? (parseInt(contentLength) / (1024 * 1024)).toFixed(1) + ' MB' : '--';

      const result = await viewer.loadModel(url);
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
    document.title = `${firebaseDemoName} - realvirtual Web Viewer`;
    loadModel(firebaseGlbUrl);
  } else {
    // Local dev mode: restore from URL param > localStorage > auto-first
    const savedModel = params.get('model') ?? localStorage.getItem(LS_KEY_MODEL);
    if (savedModel && entries.some((e) => e.url === savedModel)) {
      loadModel(savedModel);
    } else if (entries.length === 1) {
      loadModel(entries[0].url);
    } else {
      hideLoadingOverlay();
    }
  }

  // --- Initialize HMI React Overlay ---
  initHMI(viewer);

  // --- Dev-only: test runner ---
  if (import.meta.env.DEV) {
    initTestRunner();
  }
}

init().catch(console.error);
