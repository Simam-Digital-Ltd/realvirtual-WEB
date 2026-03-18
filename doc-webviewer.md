# realvirtual WEB

Browser-based 3D digital twin platform — loads realvirtual GLB exports and runs transport simulation, sensor collision, LogicStep sequencing, and drive animation directly in the browser. Supports WebGL, WebGPU, and WebXR (VR/AR).

**Share a live, interactive digital twin with anyone in the world — just send a link.** No software installation, no plugins, no VPN. Works on any device with a browser.

**Key use cases:**
- **Sales & presales** — Send prospects an interactive 3D model of your machine or production line. They explore it live in the browser, see animations, toggle drives — far more convincing than slides or videos.
- **Maintenance & service guides** — Technicians open a link on their tablet, see the machine in 3D, interact with components, check sensor states and drive positions — on-site or remote.
- **3D HMI / operator dashboards** — Deploy as a web-based HMI connected to a real PLC via WebSocket or MQTT. Live signal visualization, KPI overlays, drive monitoring — no desktop app required.
- **Training & onboarding** — New operators learn machine behavior interactively before touching the real system.
- **Customer acceptance** — Share a virtual commissioning model with customers for remote review and sign-off.

> For building custom plugins and extending the viewer, see **[doc-extending-webviewer.md](doc-extending-webviewer.md)**.

## Quick Start

```bash
cd Assets/realvirtual-WebViewer~
npm install
npm run dev          # Vite dev server with HMR
```

Drop `.glb` files into `public/models/` — they appear automatically in the model selector.

```bash
npm run build        # Production build → dist/
npm run preview      # Preview production build
npm test             # Run all 226 tests (headless Chromium)
npm run test:watch   # Watch mode (328 tests)
```

## Architecture

```
src/
├── main.ts                              # Entry: viewer creation, plugin registration, HMI init
├── rv-test-runner.ts                    # Dev-only in-browser test runner
├── core/
│   ├── rv-viewer.ts                     # RVViewer facade (scene, sim loop, plugins, events)
│   ├── rv-plugin.ts                     # RVViewerPlugin interface (lifecycle + optional UI slots)
│   ├── rv-events.ts                     # Typed EventEmitter<TEvents>
│   ├── rv-behavior.ts                    # RVBehavior abstract base class (MonoBehaviour-like)
│   ├── rv-ui-plugin.ts                  # UISlot types, UISlotEntry
│   ├── rv-ui-registry.ts               # UIPluginRegistry (slot component lookup)
│   ├── engine/                          # Simulation engine subsystems
│   │   ├── rv-scene-loader.ts           # GLB loading, component construction, NodeRegistry population
│   │   ├── rv-node-registry.ts          # Centralized object discovery (path, type, hierarchy)
│   │   ├── rv-drive.ts                  # RVDrive (ported from Drive.cs)
│   │   ├── rv-drives-playback.ts        # Frame-based recording playback
│   │   ├── rv-transport-manager.ts      # Sources → Transport → Sensors → Sinks
│   │   ├── rv-transport-surface.ts      # AABB-based conveyor surface
│   │   ├── rv-mu.ts                     # RVMovingUnit
│   │   ├── rv-source.ts                 # MU spawner (interval/distance modes)
│   │   ├── rv-sink.ts                   # MU consumer
│   │   ├── rv-sensor.ts                 # AABB overlap detection
│   │   ├── rv-aabb.ts                   # Axis-aligned bounding box
│   │   ├── rv-signal-store.ts           # PLC signal pub/sub store
│   │   ├── rv-logic-step.ts             # LogicStep base + all step types
│   │   ├── rv-logic-engine.ts           # LogicStep tree builder from GLB extras
│   │   ├── rv-erratic.ts               # RVErraticDriver (random targets)
│   │   ├── rv-ring-buffer.ts            # Generic RingBuffer for history/stats
│   │   ├── rv-drive-recorder.ts         # Drive data recording
│   │   ├── rv-raycast-manager.ts        # Unified raycast system (hover, click, XR)
│   │   ├── rv-raycast-layers.ts        # Three.js layer constants for selective raycasting
│   │   ├── rv-drive-hover.ts            # Drive hover/click detection
│   │   ├── rv-highlight-manager.ts      # Object highlight overlays + edge glow
│   │   ├── rv-replay-recording.ts       # DrivesRecorder replay
│   │   ├── rv-simulation-loop.ts        # Fixed 60Hz accumulator loop (XR-compatible)
│   │   ├── rv-xr-manager.ts            # WebXR session management (VR/AR)
│   │   ├── rv-xr-hit-test.ts           # AR hit-test reticle
│   │   ├── rv-physics-world.ts          # Rapier.js physics world wrapper
│   │   ├── rapier-physics-plugin.ts     # Physics-based transport (replaces kinematic)
│   │   ├── rv-debug.ts                  # Structured category-based debug logging
│   │   └── rv-extras-validator.ts       # Dev-mode GLB extras parity checker
│   └── hmi/                             # React HMI layout components (MUI-based)
│       ├── rv-app-config.ts             # App config singleton (settings.json, lock mode)
│       ├── visual-settings-store.ts     # Visual settings (shadows, light, cameras)
│       ├── physics-settings-store.ts    # Physics settings (Rapier.js)
│       ├── search-settings-store.ts     # Search/filter settings
│       ├── rv-storage-keys.ts           # Central localStorage key registry
│       ├── hmi-entry.ts                 # HMI initialization (React root)
│       ├── App.tsx                      # Root layout
│       ├── HMIShell.tsx                 # SlotRenderer for plugin UI
│       ├── KpiBar.tsx                   # Top KPI card container (slot: kpi-bar)
│       ├── ButtonPanel.tsx              # Left sidebar with nav buttons (slot: button-group)
│       ├── MessagePanel.tsx             # Right message panel (slot: messages)
│       ├── TopBar.tsx, BottomBar.tsx     # Top/bottom bars
│       ├── KpiCard.tsx, TileCard.tsx     # Reusable card components
│       ├── ChartPanel.tsx               # Draggable/resizable chart overlay
│       └── tooltip/                     # Generic tooltip system
│           ├── tooltip-store.ts         # TooltipStore (useSyncExternalStore, priority resolution)
│           ├── tooltip-registry.ts      # TooltipContentRegistry (content type → React component)
│           ├── tooltip-utils.ts         # 3D→screen projection, viewport clamping
│           ├── TooltipLayer.tsx         # Tooltip renderer (glassmorphism, cursor/world/fixed)
│           ├── DriveTooltipController.tsx # Headless bridge: drive hover → tooltip store
│           ├── DriveTooltipContent.tsx   # Drive tooltip content (name, speed, position)
│           └── index.ts                 # Barrel export
├── interfaces/                          # Industrial interface plugins
│   ├── interface-manager.ts             # Interface coordinator (mutex, auto-connect)
│   ├── interface-settings-store.ts      # Interface settings (WS, MQTT, ctrlX)
│   ├── base-industrial-interface.ts     # Abstract interface base class
│   ├── websocket-realtime-interface.ts  # WebSocket Realtime protocol
│   └── ctrlx-interface.ts              # Bosch Rexroth ctrlX protocol
├── plugins/                             # Non-core plugins
│   ├── sensor-monitor-plugin.ts         # Event-based sensor monitoring
│   ├── transport-stats-plugin.ts        # Transport statistics (10Hz RingBuffer)
│   ├── camera-events-plugin.ts          # Camera animation done events
│   ├── drive-order-plugin.ts            # Topological drive sorting for CAM/Gear
│   ├── kpi-demo-plugin.ts              # Static demo KPI data
│   ├── webxr-plugin.ts                 # WebXR VR/AR support (Quest, Vision Pro)
│   └── test-axes-plugin.tsx           # Manual axis tester (extends RVBehavior)
├── hooks/                               # React hooks
│   ├── use-viewer.ts                    # RVViewer context access
│   ├── use-plugin.ts                    # usePlugin<T>(id) for type-safe plugin access
│   ├── use-simulation-event.ts          # Event subscription with auto-cleanup
│   ├── use-slot.ts                      # useSlot(slot) for UI rendering
│   ├── use-sensor-state.ts              # Event-based sensor state
│   ├── use-transport-stats.ts           # Transport counters
│   ├── use-drives.ts                    # Drive list and hover state
│   ├── use-drive-chart.ts              # Drive chart toggle
│   ├── use-drive-filter.ts             # Drive search/filter
│   ├── use-signal.ts                    # Signal store subscriptions
│   ├── use-tooltip.ts                   # useTooltipState() hook
│   └── use-interface-status.ts          # Interface connection status
├── custom/                              # Customizable demo content
│   ├── demo-hmi-plugin.tsx              # DemoHMIPlugin: KPI cards, nav buttons, messages
│   ├── App.tsx                          # Custom app layout
│   ├── OeeChart.tsx, PartsChart.tsx     # Demo chart panels
│   ├── CycleTimeChart.tsx               # Cycle time chart
│   └── DriveChartOverlay.tsx            # Drive chart overlay
└── tests/
    ├── glb-extras.test.ts               # GLB structure (21 tests)
    ├── rv-node-registry.test.ts         # NodeRegistry (34 tests)
    ├── rv-transport.test.ts             # Transport simulation (17 tests)
    ├── rv-logic-steps.test.ts           # LogicStep sequencing (33 tests)
    ├── rv-signal-store.test.ts          # Signal pub/sub (15 tests)
    ├── rv-drives-playback.test.ts       # Recording playback (10 tests)
    ├── rv-aabb.test.ts                  # AABB collision (7 tests)
    ├── rv-events-typed.test.ts          # Typed EventEmitter (7 tests)
    ├── rv-plugin-lifecycle.test.ts      # Plugin lifecycle (8 tests)
    ├── rv-sensor-monitor-plugin.test.ts # SensorMonitor (6 tests)
    ├── rv-ui-registry.test.ts           # UI registry (5 tests)
    ├── rv-simulation-loop-xr.test.ts    # SimLoop XR compat (5 tests)
    ├── rv-xr-manager.test.ts            # XR platform detection (8 tests)
    ├── rv-xr-hit-test.test.ts           # AR hit-test (5 tests)
    ├── kpi-utils.test.ts                # KPI utilities (40 tests)
    ├── rv-step-serializer.test.ts       # LogicStep serializer (5 tests)
    ├── rv-app-config.test.ts            # App config, lock mode, store overrides (15 tests)
```

> **Note:** The `~` suffix in `realvirtual-WebViewer~` prevents Unity from importing `node_modules/`.

## Data Flow

```
Unity GLB Export (UnityGLTF + GLBComponentSerializer)
  → GLB with node.extras.realvirtual.{Drive, TransportSurface, Sensor, Source, Sink, ...}
  → Three.js GLTFLoader → node.userData.realvirtual.*
  → rv-scene-loader.ts: Two-phase construction (register nodes, then build typed instances)
  → LoadResult { drives[], transportManager, signalStore, registry, logicEngine, playback }
  → viewer.use(plugin) — Register plugins
  → SimulationLoop (60Hz fixedUpdate):
      1. LogicEngine         — LogicStep sequencing
      2. Playback            — Recording playback
      3. Plugins Pre         — Set drive targets (ErraticDriver, ReplayRecording, etc.)
      4. Drive physics       — Sorted: master before slave (DriveOrderPlugin)
      5. Transport           — Sources → Surfaces → Sensors → Sinks (or Rapier physics)
      6. Plugins Post        — Sample data (SensorMonitor, TransportStats, DriveRecorder)
      7. Plugins Render      — Camera events, visual overlays
```

## Plugin System

All extensions use the `RVViewerPlugin` interface. For convenience, extend `RVBehavior` — a MonoBehaviour-like abstract base class that manages viewer lifecycle, provides getters for drives/sensors/signals, and handles cleanup:

```typescript
// Raw interface (for minimal plugins)
interface RVViewerPlugin {
  readonly id: string;
  readonly order?: number;              // Execution order (lower = earlier)
  readonly handlesTransport?: boolean;  // true = replaces kinematic transport
  readonly slots?: UISlotEntry[];       // Optional React components for HMI layout

  onModelLoaded?(result, viewer): void;
  onFixedUpdatePre?(dt): void;          // Before drive physics (60Hz)
  onFixedUpdatePost?(dt): void;         // After drive physics + transport (60Hz)
  onRender?(frameDt): void;
  dispose?(): void;
}

// Base class (recommended for most plugins)
abstract class RVBehavior implements RVViewerPlugin {
  abstract readonly id: string;
  protected viewer: RVViewer | null;    // Auto-managed
  protected get drives(): RVDrive[];
  protected get sensors(): RVSensor[];
  protected get signals(): SignalStore | null;
  // Signal access by name (primary)
  protected getSignalBool(name: string): boolean;
  protected setSignal(name: string, value: boolean | number): void;
  protected onSignalChanged(name: string, cb): void;  // Auto-cleanup
  // Generic component discovery (like GetComponent<T>)
  protected find<T>(type, path): T | null;
  protected findAll<T>(type): { path, instance: T }[];
  // Lifecycle hooks
  protected onStart?(result): void;     // Like MonoBehaviour.Start()
  protected onDestroy?(): void;         // Like MonoBehaviour.OnDestroy()
  protected onPreFixedUpdate?(dt): void;  // Before drive physics
  protected onLateFixedUpdate?(dt): void; // After drive physics
  protected onFrame?(frameDt): void;    // Per render frame
}
```

Register via `viewer.use()`:

```typescript
viewer
  .use(rapierPlugin)
  .use(new DriveOrderPlugin())
  .use(new SensorMonitorPlugin())
  .use(new TransportStatsPlugin())
  .use(new CameraEventsPlugin())
  .use(new KpiDemoPlugin())
  .use(new DemoHMIPlugin());
```

Plugins with `slots` automatically register React components into HMI layout positions (kpi-bar, button-group, messages, views, search-bar, settings-tab).

See **[doc-extending-webviewer.md](doc-extending-webviewer.md)** for detailed plugin development guide, UI slot system, event bus, hooks reference, and examples.

## Simulation Features

### Transport
Non-physics AABB-based transport (or Rapier.js physics when enabled). Sources spawn MUs, transport surfaces move them, sensors detect overlap, sinks consume.

### LogicStep Engine
Port of Unity's LogicStep sequencing: SerialContainer, ParallelContainer, SetSignalBool, WaitForSignalBool, WaitForSensor, Delay, DriveToPosition, SetDriveSpeed, Enable.

### Signal Store
Central pub/sub for PLC signals (bool/int/float) with two lookup tables:
- **By name** (primary) — Signal.Name if set, otherwise node name (GameObject name). Used by plugins and HMI.
- **By path** (secondary) — Full hierarchy path. Used by GLB object references (ComponentRef) and internal bindings.

Change-only notification. Batch semantics for `setMany()`.

### Drive Physics
Ported from Drive.cs — acceleration/deceleration, position limits, rotation and linear movement. CAM/Gear master-slave dependencies resolved via topological sort.

### Raycast System

Unified raycast pipeline (`rv-raycast-manager.ts`) consolidates drive hover, scene click, and XR controller raycasting into a single Three.js `Raycaster` with **layer-based filtering**.

**Layer Architecture** (`rv-raycast-layers.ts`):
| Layer | Bit | Purpose |
|-------|-----|---------|
| DEFAULT | 0 | Standard Three.js rendering layer |
| DRIVE | 1 | Drive meshes |
| SENSOR | 2 | Sensor meshes |
| MU | 3 | Moving Unit meshes |
| METADATA | 4 | Metadata nodes |
| SCENE_CLICK | 5 | General scene click targets |

Layers are hardware-level bit-mask filters (zero-cost, no array iteration). Each node type gets its own layer. Plugins register targets via `registerTargets()`, and the raycaster only tests meshes on enabled layers.

**Key features:**
- **Pointer hover**: Throttled at 50ms, walks up from hit mesh to find nearest ancestor with `realvirtual` userData
- **XR controller ray**: `updateFromXRController(origin, direction)` for VR/AR controller raycasting
- **AR tap selection**: 9-point sampling (`arTapRaycast()`) for touch tolerance on mobile AR
- **Click detection**: `raycastForRVNode(e)` for scene click without altering hover state
- **Exclude filters**: Skip highlight overlays, sensor viz meshes, and custom exclusions
- **Highlight integration**: Automatic orange overlay + edge glow via `RVHighlightManager`

**Highlight Manager** (`rv-highlight-manager.ts`):
- Semi-transparent orange fill overlay + glowing edge outlines
- Cached `EdgesGeometry` (WeakMap) for GC-free repeated highlights
- Two modes: static snapshot (brief hover) and tracked (overlays follow moving meshes)
- Single highlight slot — calling `highlight()` replaces the previous one

**Events emitted:**
- `object-hover` — `{ node, nodeType, nodePath, pointer, mesh }`
- `object-unhover` — `{ node, nodeType }`

### Tooltip System

Generic, extensible tooltip system (`core/hmi/tooltip/`) with content-type registry pattern. Decoupled from specific component types — new tooltip providers (sensor, MU, etc.) can be added without modifying the core.

**Architecture:**

```
Controller (headless)  →  TooltipStore (singleton)  →  TooltipLayer (renderer)
                                                            ↓
                                                    TooltipContentRegistry
                                                            ↓
                                                    Content Provider (React)
```

**Three positioning modes:**
- **cursor** — Follows mouse pointer (ref-based updates, no React re-render on move)
- **world** — Projects a 3D `Object3D` to screen coordinates (for focused/selected objects)
- **fixed** — Uses a fixed screen position

**Key design decisions:**
- **Data-only store**: Holds typed data objects, not ReactNodes (avoids re-render storms)
- **Shallow-compare guard**: `show()` only notifies React when data fields actually change
- **Cursor position is ref-based**: Updated via `getCursorPos()`, polled at 100ms — not in React state
- **Priority resolution**: When multiple tooltips are active, highest priority wins
- **useSyncExternalStore**: React 18+ pattern for efficient subscription without cascading renders

**Built-in: Drive Tooltip**

`DriveTooltipController` (headless) bridges drive hover/focus state to `tooltipStore.show()/hide()`. `DriveTooltipContent` renders drive name, direction, position, speed (exponential moving average), target, and limits.

**Adding a new tooltip type** (e.g., Sensor):

```typescript
// 1. Create content provider — self-registers at module import
import { tooltipRegistry } from './core/hmi/tooltip';

function SensorTooltipContent({ data, viewer }: TooltipContentProps) {
  return <Typography>{data.sensorName}: {data.occupied ? 'Occupied' : 'Free'}</Typography>;
}
tooltipRegistry.register({ contentType: 'sensor', component: SensorTooltipContent });

// 2. Create controller (headless React component)
function SensorTooltipController() {
  useEffect(() => {
    // On sensor hover:
    tooltipStore.show({
      id: 'sensor',
      data: { type: 'sensor', sensorName: 'MySensor', occupied: true },
      mode: 'cursor',
      cursorPos: { x: clientX, y: clientY },
      priority: 10,
    });
    // On unhover:
    tooltipStore.hide('sensor');
  }, [/* deps */]);
  return null;
}

// 3. Import content module in App.tsx (triggers self-registration)
import './core/hmi/tooltip/SensorTooltipContent';
```

**React hook:**
```typescript
import { useTooltipState } from './hooks/use-tooltip';
const { active } = useTooltipState();  // current tooltip or null
```

### WebXR (VR/AR)
VR on Quest, Vision Pro, PCVR. AR with hit-test surface detection and model placement. Uses `setAnimationLoop` for XR frame callback.

## Renderer Support

- **WebGL** (default): Stable, all browsers
- **WebGPU**: Three.js r171+ `WebGPURenderer` with WebGL2 fallback

Selection persists via URL parameter (`?renderer=webgpu`) or localStorage.

## Deployment Configuration (settings.json)

Place a `settings.json` in `public/` (or next to `index.html` in production) to configure the viewer at deployment level. The file is fetched with cache-busting before React mounts, so settings apply immediately without flicker.

A documented example is provided in `public/settings.example.json` — copy it to `public/settings.json` and edit as needed.

### Settings Priority

```
URL Params  >  settings.json  >  localStorage  >  Code DEFAULTS
```

Each settings store (`visual`, `physics`, `search`, `interface`) follows this 3-layer merge:
1. **DEFAULTS** — Hardcoded in each store module
2. **localStorage** — User's persisted preferences (overrides DEFAULTS)
3. **settings.json** — Deployment config (overrides localStorage per-field via `??`)

### Example settings.json

```json
{
  "lockSettings": true,
  "hideWelcomeModal": true,
  "defaultModel": "models/customer-line.glb",
  "visual": {
    "shadows": true,
    "shadowStrength": 0.5,
    "lightIntensity": 1.0
  },
  "physics": {
    "enabled": false
  },
  "interface": {
    "activeType": "websocket-realtime",
    "autoConnect": true,
    "wsAddress": "192.168.1.100",
    "wsPort": 7000
  }
}
```

### Lock Mode

- **`lockSettings: true`** — Hides the Settings gear button entirely. All `save*()` functions become no-ops (lock guard). End users see only the 3D scene and HMI overlay.
- **`lockedTabs: ["physics", "interfaces"]`** — Hides only specific tabs in the Settings dialog. The gear button remains visible for unlocked tabs.
- **`hideWelcomeModal: true`** — Suppresses the welcome/about dialog on first visit.
- **`defaultModel: "models/demo.glb"`** — Pre-selects a model on load (can be a filename or full URL).

`lockSettings` is an admin override — it only comes from `settings.json` or the `?lockSettings` URL param, never from localStorage.

### URL Parameter Overrides

| Parameter | Effect |
|-----------|--------|
| `?lockSettings` | Locks settings (highest priority) |
| `?lockSettings=false` | Explicitly unlocks |
| `?model=models/demo.glb` | Load specific model |
| `?renderer=webgpu` | Use WebGPU renderer |

### API (for plugins/custom code)

```typescript
import { getAppConfig, isSettingsLocked, isTabLocked } from './core/hmi/rv-app-config';

// Read config values
const config = getAppConfig();
if (config.interface?.autoConnect) { /* ... */ }

// Check lock state
if (isSettingsLocked()) { /* hide settings UI */ }
if (isTabLocked('physics')) { /* hide physics tab */ }
```

### How Stores Use Config

Each settings store internally calls `getAppConfig()` — no signature changes needed at call sites:

```typescript
// In loadVisualSettings():
const fromStorage = loadFromLocalStorage();           // Layer 1+2
const override = getAppConfig().visual;                // Layer 3
if (!override) return fromStorage;
return {
  shadows: override.shadows ?? fromStorage.shadows,    // config wins if set
  lightIntensity: override.lightIntensity ?? fromStorage.lightIntensity,
  // ...
};

// In saveVisualSettings():
if (isSettingsLocked()) return;  // Lock guard — no-op when locked
localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
```

## GLB Extras Format

The GLB export stores component data in `node.extras.realvirtual`:

```json
{
  "extras": {
    "realvirtual": {
      "Drive": { "Direction": "LinearX", "TargetSpeed": 500.0, "Acceleration": 100.0 },
      "TransportSurface": { "SurfaceSpeed": 500.0, "BoxCollider": { "center": [0,0.5,0], "size": [2,0.1,0.5] } },
      "Sensor": { "BoxCollider": { "center": [0,0,0], "size": [0.1,0.2,0.5] } }
    }
  }
}
```

Enums as strings, component references as `{ type: "ComponentReference", path: "...", componentType: "..." }`.

## Testing

**328 tests** running in real Chromium via Vitest v4 + Playwright:

```bash
npm test              # All tests, headless
npm run test:watch    # Watch mode
npx tsc --noEmit     # Type check only
```

Test GLB: Export from Unity demo scene → `public/models/tests.glb`.

| Suite | Tests | Validates |
|-------|-------|-----------|
| GLB structure | 21 | File loads, extras, component properties |
| NodeRegistry | 34 | Path computation, type queries, hierarchy traversal |
| Transport | 17 | Linear/radial movement, MU lifecycle, surface transfer |
| LogicSteps | 33 | All step types, containers, looping, integration |
| SignalStore | 23 | Pub/sub, name/path access, change notification, bulk updates |
| DrivesPlayback | 10 | Frame advancement, looping, seeking |
| KPI utils | 40 | Formatting, calculations, edge cases |
| AABB | 7 | Overlap, position update, X-flip |
| EventEmitter | 7 | Typed events, unsubscribe, custom events |
| Plugin Lifecycle | 8 | Order, retroactive load, exception isolation |
| SensorMonitor | 6 | onChanged callback, RingBuffer |
| UI Registry | 5 | Slot registration, order sorting |
| SimLoop XR | 5 | setAnimationLoop, frame clamping |
| XR Manager | 8 | Platform detection, WebGPU guard |
| XR Hit-Test | 5 | Reticle, placement, dispose |
| Step Serializer | 5 | RVLogicStep to RVStepNode conversion |
| App Config | 15 | Fetch fallbacks, lock guards, config override merge, store integration |

## Debug Logging

Category-based structured logging via `rv-debug.ts`. Zero overhead in production.

```
?debug=all              # URL parameter
?debug=playback,loader  # Specific categories
```

Categories: `loader`, `playback`, `drive`, `transport`, `sensor`, `logic`, `signal`, `erratic`, `parity`

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| three | ^0.171.0 | 3D rendering (WebGL + WebGPU + WebXR) |
| @dimforge/rapier3d-compat | ^0.14.0 | Physics engine (WASM) |
| react + react-dom | ^19 | HMI overlay |
| @mui/material | ^7 | UI components |
| echarts | ^5 | Charts |
| vite | ^6.1.0 | Build tool + dev server |
| vitest | ^4 | Test runner |
| typescript | ^5.7 | Compiler |

## Camera Controls

- **Right mouse**: Orbit
- **Middle mouse**: Pan
- **Scroll**: Zoom
- Damping enabled (factor 0.08)
- Auto-fit to model bounding box after load

## Known Limitations

- `controllerScale` hardcoded to 1000 (mm→m)
- Only `Drive_ErraticPosition` behavior animated (other DriveBehaviours not ported)
- Materials may differ from Unity URP (PBR mapping differences)
- OnSignal spawn mode not implemented for Sources

## Extending

See **[doc-extending-webviewer.md](doc-extending-webviewer.md)** for:
- Plugin development (lifecycle callbacks, UI slots, events)
- React hooks reference
- UI slot system and layout
- Chart panel integration
- Testing patterns
- Existing plugins reference

Plugins can read deployment config via `getAppConfig()` from `rv-app-config.ts` to adjust behavior based on `settings.json` values. Custom tooltips can be added via `tooltipRegistry.register()` — see [Tooltip System](#tooltip-system) above.
