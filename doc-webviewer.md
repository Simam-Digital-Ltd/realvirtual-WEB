# realvirtual Web Viewer

Internal documentation for the Three.js-based GLB viewer that loads realvirtual exports and runs transport simulation, sensor collision, LogicStep sequencing, and drive animation in the browser.

## Architecture Overview

```
Assets/realvirtual-WebViewer~/          <- ~ suffix: Unity ignores this folder
├── index.html                          <- Single HTML file with overlay UI
├── package.json                        <- Vite + Three.js r171 + TypeScript 5.7
├── vite.config.ts
├── tsconfig.json
├── public/models/                      <- Drop GLB files here for the model selector
├── src/
│   ├── main.ts                         <- Entry point: viewer creation, plugin registration, HMI init
│   ├── core/
│   │   ├── rv-viewer.ts                <- RVViewer facade (scene, sim loop, plugin dispatch, events)
│   │   ├── rv-events.ts                <- Typed EventEmitter<TEvents> with untyped overloads
│   │   ├── rv-plugin.ts                <- RVViewerPlugin interface (lifecycle callbacks)
│   │   ├── rv-ui-plugin.ts             <- RVUIPlugin interface + UISlot types (React HMI slots)
│   │   └── rv-ui-registry.ts           <- UIPluginRegistry (slot component lookup)
│   ├── plugins/
│   │   ├── sensor-monitor-plugin.ts    <- Event-based sensor monitoring (via onChanged, NOT polling)
│   │   ├── transport-stats-plugin.ts   <- Transport statistics with 10Hz RingBuffer sampling
│   │   ├── camera-events-plugin.ts     <- Camera animation done events
│   │   └── drive-order-plugin.ts       <- Topological drive sorting for CAM/Gear dependencies
│   ├── hooks/
│   │   ├── use-viewer.ts               <- React context hook for RVViewer access
│   │   ├── use-plugin.ts               <- usePlugin<T>(id) for type-safe plugin access
│   │   ├── use-simulation-event.ts     <- useSimulationEvent(event, callback) subscription hook
│   │   ├── use-slot.ts                 <- useSlot(slot) for UI plugin slot rendering
│   │   ├── use-sensor-state.ts         <- Event-based sensor state (no polling)
│   │   ├── use-transport-stats.ts      <- Transport stats from TransportStatsPlugin
│   │   ├── use-interface-status.ts     <- Interface connection status via events
│   │   ├── use-drives.ts               <- Drive list and hover state
│   │   ├── use-signal.ts               <- Signal store subscriptions
│   │   ├── use-drive-chart.ts          <- Drive chart toggle state
│   │   └── use-drive-filter.ts         <- Drive search/filter state
│   ├── hmi/                            <- React HMI components (MUI-based)
│   │   ├── hmi-entry.ts                <- HMI initialization (React root)
│   │   ├── App.tsx                     <- Root layout with TopBar, Sidebar, Panels
│   │   ├── HMIShell.tsx                <- Slot-based rendering via SlotRenderer
│   │   └── ...                         <- TopBar, LeftSidebar, RightPanel, etc.
│   ├── rv-node-registry.ts             <- Centralized object discovery (path, type, hierarchy)
│   ├── rv-scene-loader.ts              <- GLB loading, component construction, registry population
│   ├── rv-drive.ts                     <- RVDrive class (ported from Drive.cs)
│   ├── rv-drives-playback.ts           <- Frame-based recording playback for drives
│   ├── rv-erratic.ts                   <- RVErraticDriver (ported from Drive_ErraticPosition.cs)
│   ├── rv-transport-surface.ts         <- AABB-based conveyor surface simulation
│   ├── rv-transport-manager.ts         <- Central coordinator: Sources -> Transport -> Sensors -> Sinks
│   ├── rv-mu.ts                        <- RVMovingUnit (Moving Unit on transport)
│   ├── rv-source.ts                    <- MU spawner (interval/distance modes)
│   ├── rv-sink.ts                      <- MU consumer (deletes MUs entering its AABB)
│   ├── rv-sensor.ts                    <- AABB overlap detection for sensors
│   ├── rv-aabb.ts                      <- Axis-aligned bounding box with BoxCollider support
│   ├── rv-signal-store.ts              <- PLC signal pub/sub store (bool/int/float)
│   ├── rv-ring-buffer.ts              <- Generic RingBuffer (used by plugins for history/stats)
│   ├── rv-logic-step.ts                <- LogicStep base + step types (SetSignal, WaitForSensor, etc.)
│   ├── rv-logic-engine.ts              <- Builds LogicStep trees from GLB extras
│   ├── rv-simulation-loop.ts           <- Fixed-timestep accumulator loop (60Hz, setAnimationLoop for XR)
│   ├── rv-xr-manager.ts               <- XR session management, VR/AR buttons, WebGPU guard
│   ├── rv-xr-hit-test.ts              <- AR hit-test reticle and model placement
│   ├── rv-debug.ts                     <- Structured debug logging (category-based, toggleable)
│   ├── rv-extras-validator.ts          <- Dev-mode GLB extras parity validator (C#↔TS drift detection)
│   └── rv-test-runner.ts               <- In-browser test runner overlay
└── tests/
    ├── glb-extras.test.ts              <- GLB structure validation (21 tests)
    ├── rv-node-registry.test.ts        <- NodeRegistry unit tests (34 tests)
    ├── rv-aabb.test.ts                 <- AABB overlap/update tests (7 tests)
    ├── rv-transport.test.ts            <- Transport surface, MU lifecycle (17 tests)
    ├── rv-signal-store.test.ts         <- Signal pub/sub tests (15 tests)
    ├── rv-logic-steps.test.ts          <- LogicStep sequencing tests (33 tests)
    ├── rv-drives-playback.test.ts      <- Recording playback tests (10 tests)
    ├── rv-events-typed.test.ts         <- Typed EventEmitter tests (7 tests)
    ├── rv-plugin-lifecycle.test.ts     <- Plugin lifecycle + isolation tests (8 tests)
    ├── rv-sensor-monitor-plugin.test.ts <- SensorMonitor callback pattern tests (6 tests)
    ├── rv-ui-registry.test.ts          <- UI plugin registry tests (5 tests)
    ├── rv-simulation-loop-xr.test.ts   <- SimulationLoop XR compat tests (5 tests)
    ├── rv-xr-manager.test.ts           <- XR manager platform detection tests (8 tests)
    ├── rv-xr-hit-test.test.ts          <- AR hit-test reticle tests (5 tests)
    └── mocks/
        └── webxr-mock.ts              <- WebXR API mock for headless testing
```

> **WICHTIG:** The `~` suffix is critical. Without it Unity would try to import `node_modules/` (thousands of JS/TS files).

## How It Works

### Data Flow

```
Unity GLB Export (UnityGLTF + GLBComponentSerializer)
  |
  v
GLB file with node.extras.realvirtual.{Drive, TransportSurface, Sensor, Source, Sink, MU, ...}
  |
  v
Three.js GLTFLoader -> node.userData.realvirtual.*
  |
  v
rv-scene-loader.ts: Two-phase construction
  Phase 1: Traverse GLB, register all nodes in NodeRegistry
  Phase 2: Construct typed instances (RVDrive, RVSensor, RVSource, etc.), register in NodeRegistry
  |
  v
LoadResult { drives[], transportManager, signalStore, registry, logicEngine, playback }
  |
  v
viewer.use(plugin) — Register core plugins (SensorMonitor, TransportStats, CameraEvents, DriveOrder)
  |
  v
SimulationLoop (60Hz fixedUpdate):
  1. logicEngine.update(dt)              -- LogicStep sequencing
  2. playback?.update(dt)                -- Recording playback
  3. Plugins Pre (onFixedUpdatePre)      -- ErraticDriver, ReplayRecording, Interface input
  4. drives.forEach(d.update(dt))        -- Drive physics (sorted: master before slave)
  5. transportManager.update(dt)         -- Sources -> Transport -> Sensors -> Sinks
     (skipped if _physicsPluginActive)      (future: Rapier plugin replaces this)
  6. Plugins Post (onFixedUpdatePost)    -- SensorMonitor, TransportStats, DriveRecorder
  7. Plugins Render (onRender)           -- Camera events, visual overlays
```

### NodeRegistry (Centralized Object Discovery)

The `NodeRegistry` is the single source of truth for all object lookups. It mirrors Unity's discovery API:

```typescript
NodeRegistry
├── computeNodePath(node)              -- Canonical path computation (static)
├── registerNode(path, node)           -- Phase 1: raw Object3D registration
├── register(type, path, instance)     -- Phase 2: typed instance registration
│
├── getNode(path)                      -- Object3D by path (with suffix matching)
├── getByPath<T>(type, path)           -- Typed instance by path + type
├── getAll<T>(type)                    -- All instances of a type (FindObjectsOfType)
│
├── findInParent<T>(node, type)        -- Walk UP hierarchy (GetComponentInParent)
├── findInChildren<T>(node, type)      -- Walk DOWN hierarchy (GetComponentInChildren)
├── findAllInChildren<T>(node, type)   -- Walk DOWN, collect all (GetComponentsInChildren)
│
├── resolve(ref: ComponentRef)         -- ComponentReference resolution from GLB extras
└── clear()                            -- Reset for scene reload
```

**Path suffix matching**: `getNode("Conveyor/Motor")` matches `"CellA/Conveyor/Motor"`. This handles relative paths from GLB ComponentReferences.

**Type tags**: Components are registered with string type tags: `'Drive'`, `'Sensor'`, `'Source'`, `'Sink'`, `'MU'`, `'TransportSurface'`, etc.

**Two-phase build**:
1. During GLB traverse: `registry.registerNode(path, node)` for every node with `userData.realvirtual`
2. After construction: `registry.register('Drive', path, driveInstance)` for each typed component

### GLB Extras Format (from Unity Export)

The realvirtual GLB export pipeline (`GLBExportPluginRefactored.cs` + `GLBComponentSerializer.cs`) stores all component data in `node.extras.realvirtual`. Enums are serialized as strings. Component references are serialized as `ComponentReference` objects with hierarchy paths.

```json
{
  "name": "ConveyorEntry1",
  "extras": {
    "realvirtual": {
      "Drive": {
        "_fullTypeName": "realvirtual.Drive",
        "_enabled": true,
        "Direction": "LinearX",
        "TargetSpeed": 500.0,
        "Acceleration": 100.0,
        "UseLimits": false
      },
      "TransportSurface": {
        "_fullTypeName": "realvirtual.TransportSurface",
        "SurfaceSpeed": 500.0,
        "SurfaceOnStart": true,
        "BoxCollider": { "center": [0,0.5,0], "size": [2,0.1,0.5] }
      },
      "Sensor": {
        "_fullTypeName": "realvirtual.Sensor",
        "InvertSignal": false,
        "BoxCollider": { "center": [0,0,0], "size": [0.1,0.2,0.5] }
      },
      "Source": {
        "_fullTypeName": "realvirtual.Source",
        "SpawnMode": "Interval",
        "SpawnInterval": 3.0,
        "ThisObjectAsMU": {
          "type": "ComponentReference",
          "path": "DemoCell/MUTemplate",
          "componentType": "realvirtual.MU"
        }
      }
    }
  }
}
```

Three.js GLTFLoader makes `extras` available as `node.userData`.

### Transport Simulation

Non-physics AABB-based transport. No rigidbodies or physics engine involved.

**Update order** (every 60Hz tick):
1. **Sources** spawn MUs (interval or distance-based)
2. **TransportSurfaces** move MUs along their drive direction
3. **Sensors** check AABB overlap with MUs, update signal store
4. **Sinks** consume MUs entering their AABB

**Key concepts**:
- Each MU tracks its `currentSurface` (the transport surface it's on)
- Surface transfer: when an MU leaves one surface's AABB and overlaps another, it's handed off
- MUs inherit surface speed from their current transport surface's drive
- Sources clone a hidden template MU node from the GLB

### Signal Store

Central pub/sub store for PLC signals. Addressed by hierarchy path (e.g. `"DemoCell/Signals/ConveyorStart"`). Supports bool, int, and float values. Only notifies listeners on actual value changes.

Used by:
- **LogicSteps** (SetSignalBool, WaitForSignalBool read/write signals)
- **Sensors** (write occupancy state)
- **TransportSurfaces** (read start/stop signals)

### LogicStep Engine

Port of Unity's LogicStep sequencing system. Builds step trees from GLB extras.

**Available step types**:

| Step Type | Blocking | Purpose |
|-----------|----------|---------|
| `SerialContainer` | Yes | Executes children sequentially, auto-loops |
| `ParallelContainer` | Yes | Executes all children simultaneously |
| `SetSignalBool` | No | Sets a boolean signal |
| `WaitForSignalBool` | Yes | Waits for signal true/false |
| `WaitForSensor` | Yes | Waits for sensor occupied/not-occupied |
| `Delay` | Yes | Waits N seconds |
| `DriveToPosition` | Yes | Moves drive to target |
| `SetDriveSpeed` | No | Changes drive speed |
| `Enable` | No | Enables/disables a GameObject |

### Drive Transform Calculation

Ported from `Drive.cs:820-865`:

**Rotation:**
```
localRotation = baseQuaternion * Euler(axisVector * degToRad(position + offset))
```

**Linear:**
```
localPosition = basePosition + axisVector * ((position + offset) / controllerScale)
```

Where:
- `axisVector` from Direction enum: `"RotationZ"` -> `(0, 0, 1)`, etc.
- `baseQuaternion` / `basePosition` = rest transform from GLB
- `controllerScale` = 1000 (mm->m, hardcoded for PoC)

### Drives Playback

Frame-based recording playback. Reads `CompactRecording` data (fixedDeltaTime, positions array) and applies recorded positions to drives each frame. Supports looping, seeking by percentage, and accumulator-based frame advancement.

Uses `NodeRegistry.getByPath('Drive', path)` to bind recording drive entries to runtime `RVDrive` instances.

### Coordinate System

UnityGLTF converts from Unity (left-hand) to glTF (right-hand, Y-up) automatically. The local transforms in the GLB already account for the X-axis flip. Drive directions use simple axis vectors in local space:

| Direction  | Axis Vector |
|------------|-------------|
| LinearX    | (1, 0, 0)   |
| LinearY    | (0, 1, 0)   |
| LinearZ    | (0, 0, 1)   |
| RotationX  | (1, 0, 0)   |
| RotationY  | (0, 1, 0)   |
| RotationZ  | (0, 0, 1)   |
| Virtual    | skipped     |

### AABB Collision

`RVAABB` provides axis-aligned bounding box overlap detection. Constructed from GLB `BoxCollider` data (center + size). Handles the glTF X-axis flip (negates center.x). Updated each frame from the owning node's world position.

Used by TransportSurfaces (MU containment), Sensors (MU detection), and Sinks (MU consumption).

### Erratic Driver

Port of `Drive_ErraticPosition.cs`. Continuously picks random targets between drive limits. When the current target is reached (within 0.01 tolerance), picks a new one. Only drives that have a `Drive_ErraticPosition` behavior in their GLB extras are animated.

### Simulation Loop

Accumulator-based fixed timestep (identical to Unity's FixedUpdate pattern):
- Fixed step: 1/60s (16.67ms)
- Frame time clamped to 100ms max (prevents spiral of death)
- `onFixedUpdate`: logic engine, playback, **plugins pre**, drive physics, transport, **plugins post**
- `onRender`: controls update + Three.js render + **plugins render** + stats

The plugin system hooks into the fixed update loop at two points:
1. **Pre-plugins** (before drive physics): Set drive targets, apply interface data
2. **Post-plugins** (after drive physics + transport): Sample results, emit events

### Plugin System (Plan 062)

Three-pillar extension system for the WebViewer:

1. **Core Plugins** (`RVViewerPlugin`): Register lifecycle callbacks via `viewer.use(plugin)`
2. **Typed Event Bus** (`EventEmitter<ViewerEvents>`): Type-safe pub/sub for simulation and UI events
3. **UI Plugins** (`RVUIPlugin`): Register React components into HMI layout slots via `viewer.useUI(uiPlugin)`

#### Core Plugin Interface

```typescript
interface RVViewerPlugin {
  readonly id: string;                    // Unique plugin ID
  readonly order?: number;                // Sort order (lower = earlier, default: 100)
  readonly handlesTransport?: boolean;    // If true, kinematic transport is skipped
  onModelLoaded?(result, viewer): void;   // After GLB load (also retroactive)
  onModelCleared?(viewer): void;          // Before state reset
  onFixedUpdatePre?(dt): void;            // Before drive physics (60Hz)
  onFixedUpdatePost?(dt): void;           // After drive physics + transport (60Hz)
  onRender?(frameDt): void;               // After renderer.render()
  dispose?(): void;                       // Cleanup
}
```

Plugins are cached into per-phase arrays (`prePlugins[]`, `postPlugins[]`, `renderPlugins[]`) sorted by `order`. Each callback is wrapped in try/catch — a faulty plugin cannot freeze the simulation.

#### Plugin Registration

```typescript
// main.ts
viewer
  .use(new DriveOrderPlugin())       // Sorts drives for CAM/Gear dependencies
  .use(new SensorMonitorPlugin())    // Event-based sensor monitoring
  .use(new TransportStatsPlugin())   // 10Hz transport statistics sampling
  .use(new CameraEventsPlugin());    // Camera animation done events
```

#### Built-in Core Plugins

| Plugin | ID | Phase | Purpose |
|--------|----|-------|---------|
| DriveOrderPlugin | `drive-order` | onModelLoaded | Topological sort of drives for CAM/Gear |
| SensorMonitorPlugin | `sensor-monitor` | onFixedUpdatePost | Emits `sensor-changed` via `sensor.onChanged` |
| TransportStatsPlugin | `transport-stats` | onFixedUpdatePost | Samples spawn/consume counters at 10Hz |
| CameraEventsPlugin | `camera-events` | onRender | Emits `camera-animation-done` |

#### Typed Event Bus

`RVViewer` extends `EventEmitter<ViewerEvents>` with both typed and untyped overloads:

```typescript
// Typed (compile-time checked):
viewer.on('sensor-changed', (data) => { /* data: { sensorPath: string; occupied: boolean } */ });

// Untyped (for custom plugin events):
viewer.on('my-plugin:custom', (data) => { /* data: unknown */ });

// Unsubscribe:
const off = viewer.on('sensor-changed', handler);
off(); // removes listener
```

**Event categories**: model-loaded, model-cleared, drive-hover, drive-focus, sensor-changed, mu-spawned, mu-consumed, drive-at-target, interface-connected, interface-disconnected, interface-error, camera-animation-done, object-clicked, panel-opened, panel-closed.

#### UI Plugin System

UI plugins register React components into named layout slots:

```typescript
type UISlot = 'kpi-bar' | 'button-group' | 'search-bar' | 'messages' | 'views' | 'settings-tab';

interface RVUIPlugin {
  readonly id: string;
  readonly slots: UISlotEntry[];   // { slot, component, order?, label? }
}
```

`HMIShell.tsx` contains a `SlotRenderer` component that renders all components for a given slot. The existing hardcoded HMI layout remains functional alongside slots.

#### React Hooks

| Hook | Purpose |
|------|---------|
| `usePlugin<T>(id)` | Type-safe plugin access from React |
| `useSimulationEvent(event, cb)` | Subscribe to viewer events with auto-cleanup |
| `useSlot(slot)` | Get all UISlotEntries for a slot |
| `useSensorState(path)` | Event-based sensor occupied state |
| `useTransportStats(refreshMs?)` | Transport counters from TransportStatsPlugin |
| `useInterfaceStatus(id)` | Interface connection status via events |

#### Physics Plugin Flag

When a plugin sets `handlesTransport: true`, the kinematic `transportManager.update(dt)` in the core loop is skipped. This prepares for the Rapier.js physics plugin (Plan 059) that replaces kinematic transport with physics-based simulation.

### WebXR Support (Plan 061)

The viewer supports **VR** and **AR** via the WebXR Device API. No native build required — same GLB export, rendered in the browser on Quest, Vision Pro, PCVR, or Android ARCore devices.

#### SimulationLoop + XR Frame Callback

The `SimulationLoop` accepts an optional `renderer` parameter. When provided, it uses `renderer.setAnimationLoop()` instead of `requestAnimationFrame`. This is critical because in an active XR session, `requestAnimationFrame` is **not called** — the XR compositor manages the frame callback. The accumulator-based 60Hz fixed timestep is completely unchanged.

```typescript
// Desktop: wraps rAF internally. XR: uses XR frame callback.
const loop = new SimulationLoop(renderer);
loop.start();  // Uses setAnimationLoop automatically
```

#### XR Session Lifecycle

On `sessionstart`: controls disabled, shadow maps disabled (mobile XR perf), resize handler removed, background saved.
On `sessionend`: everything restored (controls, shadows, resize, background). Camera animation is skipped during XR sessions.

#### RVXRManager

Central XR management class:

| Method | Purpose |
|--------|---------|
| `checkSupport()` | Async platform detection (VR + AR) |
| `isXRCapable(renderer)` | WebGPU guard (XR only works with WebGLRenderer) |
| `enableVR(renderer, scene)` | Creates VRButton, hooks session lifecycle |
| `enableAR(renderer, scene, domOverlay?)` | Creates ARButton with hit-test + dom-overlay |
| `setupControllers(renderer, scene)` | XR controller models + grips |

**WebGPU Guard**: Three.js r171 `WebGPURenderer` has no real `WebXRManager`. XR buttons are hidden when WebGPU is active.

#### AR Hit-Test (RVXRHitTester)

Surface detection using the WebXR Hit Test API. Shows a green reticle ring on detected surfaces. Tap to place the loaded GLB model at the reticle position.

#### XR Drive Interaction

`RVDriveHover` supports both mouse and XR controller input:
- Desktop: `PointerEvent` -> NDC -> `raycaster.setFromCamera()`
- XR: `updateFromXRController(origin, direction)` -> `raycaster.ray.set()`

The `registry.findInParent('Drive')` lookup is identical in both modes.

#### Renderer: alpha: true

The WebGLRenderer is always created with `alpha: true` (~1-2% overhead, negligible). This is required for AR passthrough. A runtime renderer recreate would be expensive (material recompilation + flicker).

#### HTTPS Requirement

WebXR requires a Secure Context. Vite dev server supports `HTTPS=1 npm run dev` via the `server.https` config.

### Debug Logging

Structured, category-based debug logging via `rv-debug.ts`. Zero overhead in production (guarded by category set).

**Categories**: `loader`, `playback`, `drive`, `transport`, `sensor`, `logic`, `signal`, `erratic`, `parity`

**Enabling**:
- URL parameter: `?debug=all` or `?debug=playback,loader`
- localStorage: `localStorage.setItem('rv-debug', 'playback,loader')`
- Runtime: `enableDebug('playback')` / `disableDebug('playback')`
- Dev mode default: `loader` category enabled automatically

**API**:
```typescript
import { debug, debugWarn, debugError } from './rv-debug';

debug('playback', `play() from frame ${startFrame}`);     // Only prints if 'playback' active
debugWarn('playback', `Drive not found: "${path}"`);       // Always prints (tagged)
debugError('loader', `Failed to load: ${url}`);            // Always prints (tagged)
```

**Output format**: `[category] message`

### GLB Extras Parity Validation

Dev-mode validator (`rv-extras-validator.ts`) that catches C#→TypeScript drift when new fields are added to Unity components. Active only in dev builds (`import.meta.env.DEV`). Zero production overhead.

**How it works**:
1. Each TypeScript parser calls `validateExtras('Drive', driveData)` after parsing
2. The validator checks every field in the GLB data against two lists:
   - **CONSUMED**: Fields the TypeScript parser actively reads and uses
   - **IGNORED**: Fields intentionally skipped (runtime status, Unity-only features)
3. Any field not in either list is collected as "unhandled"
4. At the end of GLB load, `printParitySummary()` prints a single consolidated warning

**Example console output**:
```
[Parity] 3 unhandled GLB extras field(s) — add to CONSUMED or IGNORED in rv-extras-validator.ts:
  Drive.SpeedOverride = 0
  Drive.SmoothAcceleration = false
  Sensor.NewField = "value"
```

**Workflow**: When you add a new field to a C# component and re-export GLB, the browser console immediately tells you which TypeScript parsers need updating.

**C# reference comments**: Each TypeScript parser function includes a comment pointing to the C# source file (e.g., `// C# source: Drive.cs (Packages/io.realvirtual.starter/Runtime/Components/Drive.cs)`).

## Renderer Support

The viewer supports both **WebGL** and **WebGPU** rendering:

- **WebGL** (default): Stable, works in all browsers
- **WebGPU**: Selectable via dropdown. Uses Three.js r171+ `WebGPURenderer` with automatic WebGL2 fallback

WebGPU compatibility fixes applied automatically:
- Missing UV attributes get dummy UVs (WebGPU TSL shader requires them)
- Uint16 index buffers converted to Uint32 (prevents range errors)

Renderer selection persists via URL parameter (`?renderer=webgpu`).

## Scene Persistence

The viewer automatically remembers the last loaded model and renderer using `localStorage`:

| Key | Purpose |
|-----|---------|
| `rv-webviewer-last-model` | URL of the last loaded GLB model |
| `rv-webviewer-renderer` | Renderer type (`webgl` or `webgpu`) |

**Load priority**: URL parameter `?model=...` > localStorage > auto-select (if only one model exists).

On revisit, the last scene loads automatically with the animated loading screen.

## Loading Screen

A fullscreen loading overlay with the realvirtual logo appears during model loading:
- **Animated logo** with pulsing glow effect (`public/logo.png`)
- **Speed lines** rotating around the logo
- **Orbiting dot** with motion trail for a sense of speed
- **Sweeping progress bar** in the brand pink color
- **Model name** displayed below the logo
- Fades out smoothly (0.5s transition) when loading completes

The overlay is shown on initial load and on every model switch.

## UI Overlays

All UI is pure HTML/CSS overlay on the Three.js canvas -- no UI framework.

| Panel | Position | Content |
|-------|----------|---------|
| Loading overlay | Fullscreen | Animated logo with speed lines, progress bar, model name |
| Title bar | Top-left | "realvirtual Web Viewer PoC" |
| Model/Renderer selector | Top-center | Dropdowns for renderer type and GLB model |
| Stats panel | Top-right | FPS, frame time, triangles, draw calls, geometries, textures, programs, heap, renderer type, drive count, GLB size, load time |
| Performance budget | Bottom-right | Bar chart showing % of budget used (triangles, draw calls, frame time, textures, geometries, heap) with color coding (green/yellow/orange/red) |
| Drive panel | Bottom-left | Live list of all drives with current position, direction, and running state |

### Performance Budget Limits

| Metric | Limit | Warning |
|--------|-------|---------|
| Triangles | 5M | >50% |
| Draw Calls | 1500 | >50% |
| Frame Time | 33ms (30fps) | target: 16ms (60fps) |
| Textures | 150 | >50% |
| Geometries | 2000 | >50% |
| JS Heap | 1.5 GB | >50% |

## Development

### Prerequisites

- Node.js (18+)
- npm

### Setup & Run

```bash
cd Assets/realvirtual-WebViewer~
npm install
npm run dev        # Starts Vite dev server with HMR
```

Or use the `/webviewer` command in Claude Code which does the same.

### Adding Test Models

Place `.glb` files in `Assets/realvirtual-WebViewer~/public/models/`. They appear automatically in the model selector dropdown. Vite discovers them via `import.meta.glob`.

### Build for Production

```bash
npm run build      # Output in dist/
npm run preview    # Preview production build
```

### Camera Controls

- **Right mouse**: Orbit
- **Middle mouse**: Pan
- **Scroll**: Zoom
- Damping enabled (factor 0.08)

Camera auto-fits to model bounding box after loading. Shadow camera adjusts to cover the model.

## Lighting

Unity-like setup:
- **Hemisphere light**: sky `#e8e8e8`, ground `#888888`, intensity 0.9
- **Directional light**: white, intensity 2.2, soft shadow (2048x2048), bias -0.0005, shadow intensity 0.5
- **Fill light**: `#d0d0d0`, intensity 0.4, from opposite direction
- **Ground**: Checkerboard plane (200 tiles across 100m), receives shadows

Transparent/alpha materials are detected and excluded from `castShadow` to avoid shadow artifacts on fences, grids etc.

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| three | ^0.171.0 | 3D rendering (WebGL + WebGPU + WebXR) |
| stats.js | ^0.17.0 | FPS counter |
| @types/three | ^0.171.0 | TypeScript types |
| @types/webxr | ^0.5.0 | WebXR Device API types |
| typescript | ^5.7.0 | Compiler |
| vite | ^6.1.0 | Build tool + dev server |

## Testing

### Framework: Vitest + Playwright (Browser Mode)

Tests run in a real Chromium browser via **Vitest v4** with the **@vitest/browser-playwright** provider. This means tests use the actual Three.js GLTFLoader in a real browser context -- no Node.js mocking or DOM simulation.

### Running Tests

```bash
cd Assets/realvirtual-WebViewer~
npm test              # Run all tests once (headless Chromium)
npm run test:watch    # Watch mode for development
```

### Test Coverage: 181 Tests

| Suite | File | Tests | What It Validates |
|-------|------|-------|-------------------|
| GLB structure | `glb-extras.test.ts` | 21 | File loads, extras structure, Drive/TransportSurface/Sensor/Source/Sink/MU properties |
| NodeRegistry | `rv-node-registry.test.ts` | 34 | Path computation, node/component registration, type queries, hierarchy traversal, ComponentRef resolution, suffix matching, duplicate names |
| AABB | `rv-aabb.test.ts` | 7 | Overlap detection, position update, BoxCollider center offset, X-flip |
| Transport | `rv-transport.test.ts` | 17 | Linear/radial movement, surface transfer, MU lifecycle, source spawn, sink consume |
| SignalStore | `rv-signal-store.test.ts` | 15 | Get/set/subscribe, change notification, bulk updates, clear |
| LogicSteps | `rv-logic-steps.test.ts` | 33 | Serial/Parallel containers, all step types, nested containers, looping, drive/sensor/signal integration |
| DrivesPlayback | `rv-drives-playback.test.ts` | 10 | Frame advancement, looping, seeking, stop/play, missing drives |
| EventEmitter | `rv-events-typed.test.ts` | 7 | Typed on/emit, unsubscribe, void events, custom events, removeAll |
| Plugin Lifecycle | `rv-plugin-lifecycle.test.ts` | 8 | onModelLoaded order, retroactive load, duplicate ID, exception isolation, Pre/Post ordering |
| SensorMonitor | `rv-sensor-monitor-plugin.test.ts` | 6 | onChanged callback, original callback preservation, cleanup, RingBuffer capacity |
| UI Registry | `rv-ui-registry.test.ts` | 5 | Slot registration, order sorting, settings tabs, multi-plugin, default order |
| SimLoop XR | `rv-simulation-loop-xr.test.ts` | 5 | setAnimationLoop vs rAF, stop cleanup, tick callback, frame time clamping |
| XR Manager | `rv-xr-manager.test.ts` | 8 | Platform detection (no XR, VR+AR, partial), WebGPU guard, session state, dispose |
| XR Hit-Test | `rv-xr-hit-test.test.ts` | 5 | Reticle visibility, scene attachment, reset, dispose, placeModel guard |

### Test Fixture: tests.glb

The test GLB must be exported from Unity's demo scene and placed at `public/models/tests.glb`. Tests gracefully skip with a clear message when the file is missing or empty.

Export steps:
1. Open DemoRealvirtual scene in Unity
2. Use GLB Export menu to export the scene
3. Copy the exported `.glb` to `public/models/tests.glb`

### How Browser Tests Work

```
Vitest starts Vite dev server (auto port)
  -> Launches headless Chromium via Playwright
    -> Browser loads Three.js + GLTFLoader
      -> Fetches /models/tests.glb from dev server
        -> GLTFLoader.parse() -> Scene Graph with userData.realvirtual.*
          -> Tests assert on component data structure
```

### Test Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| vitest | ^4.0.18 | Test runner |
| @vitest/browser | ^4.0.18 | Browser test mode |
| @vitest/browser-playwright | ^4.0.18 | Playwright provider (factory API) |
| playwright | ^1.58.2 | Browser automation |

### Adding New Tests

Create `tests/<name>.test.ts` files. They're auto-discovered via the `tests/**/*.test.ts` glob in `vite.config.ts`. All tests run in the browser context with full access to Three.js, WebGL, and the DOM.

## Known Limitations

- `controllerScale` hardcoded to 1000 (mm->m). Future: read from GLB root extras via `AfterSceneExport()`
- No WebSocket integration yet (planned: live drive data from Unity simulation)
- Only `Drive_ErraticPosition` behavior is animated. Other behaviors (Drive_Speed, Drive_Sequence, etc.) not ported
- Materials may look different from Unity URP (PBR mapping differences)
- Kinematic chain correctness depends on GLB export hierarchy (Plan 050)
- Transport is non-physics (AABB-based), no friction or gravity simulation. Physics-based transport via Rapier.js is planned as a plugin (Plan 059)
- OnSignal spawn mode not implemented for Sources

## Related Plans

- **Plan 050** -- GLB Kinematic Export: Ensures correct hierarchy for kinematic chains (robot axes)
- **Plan 051** -- Three.js GLB Viewer PoC: The original concept document
- **Plan 053** -- WebViewer TransportSurface & Sensor Simulation: AABB-based transport, sensor collision, MU lifecycle
- **Plan 055** -- WebViewer Transport Simulation Bugs: Source spawning, distance mode, template lookup fixes
- **Plan 059** -- Rapier.js Conveyor Physics: Physics-based transport via Rapier plugin (replaces kinematic)
- **Plan 061** -- WebXR VR/AR: WebXR Device API for VR (Quest, Vision Pro, PCVR) and AR (Passthrough, Hit-Test)
- **Plan 062** -- Plugin & Event System: Core plugin lifecycle, typed events, React UI slots

## File Reference

| File | Lines | Purpose |
|------|-------|---------|
| `src/main.ts` | ~150 | Entry point: viewer creation, core plugin registration, HMI initialization, model loading |
| `src/core/rv-viewer.ts` | ~600 | RVViewer facade: Three.js scene, sim loop, plugin dispatch, typed events, camera, lighting |
| `src/core/rv-events.ts` | ~58 | Generic `EventEmitter<TEvents>` with typed + untyped overloads for backwards compatibility |
| `src/core/rv-plugin.ts` | ~44 | `RVViewerPlugin` interface: lifecycle callbacks (onModelLoaded, onFixedUpdatePre/Post, onRender, dispose) |
| `src/core/rv-ui-plugin.ts` | ~42 | `RVUIPlugin` interface, `UISlot` type (6 slots), `UISlotEntry` + `UISlotProps` types |
| `src/core/rv-ui-registry.ts` | ~26 | `UIPluginRegistry`: register, getSlotComponents(slot), getSettingsTabs() |
| `src/plugins/sensor-monitor-plugin.ts` | ~60 | Event-based sensor monitoring via `sensor.onChanged` wrapping, RingBuffer history |
| `src/plugins/transport-stats-plugin.ts` | ~60 | Transport counters sampled at 10Hz into RingBuffers, emits mu-spawned/mu-consumed |
| `src/plugins/camera-events-plugin.ts` | ~30 | Watches camera animation state, emits camera-animation-done |
| `src/plugins/drive-order-plugin.ts` | ~60 | Topological sort of viewer.drives[] for CAM/Gear dependencies (Kahn's algorithm) |
| `src/hooks/use-plugin.ts` | ~10 | `usePlugin<T>(id)` hook for type-safe plugin access |
| `src/hooks/use-simulation-event.ts` | ~15 | `useSimulationEvent(event, cb)` with stable callback ref and auto-cleanup |
| `src/hooks/use-slot.ts` | ~10 | `useSlot(slot)` returns UISlotEntries for HMI rendering |
| `src/hooks/use-sensor-state.ts` | ~15 | Event-based sensor occupied state (no polling) |
| `src/hooks/use-transport-stats.ts` | ~20 | Polls TransportStatsPlugin RingBuffer at configurable interval |
| `src/hooks/use-interface-status.ts` | ~20 | Interface connection status via events with cleanup |
| `src/rv-node-registry.ts` | ~293 | Centralized object discovery: path-based lookup, type queries (getAll), hierarchy traversal (findInParent/findInChildren), ComponentReference resolution |
| `src/rv-scene-loader.ts` | ~547 | GLB loading (GLTFLoader + DRACOLoader), two-phase component construction, NodeRegistry population, shadow setup, WebGPU compat fixes |
| `src/rv-logic-step.ts` | ~392 | LogicStep base class + all step types: SerialContainer, ParallelContainer, SetSignalBool, WaitForSignalBool, WaitForSensor, Delay, DriveToPosition, SetDriveSpeed, Enable |
| `src/rv-logic-engine.ts` | ~245 | Builds LogicStep trees from GLB extras using NodeRegistry for drive/sensor/signal resolution |
| `src/rv-drive.ts` | ~205 | RVDrive class: drive config, physics update (speed/accel/limits), transform application (rotation via quaternion, linear via position offset) |
| `src/rv-drives-playback.ts` | ~167 | Frame-based recording playback with accumulator, looping, seeking. Uses NodeRegistry for drive binding |
| `src/rv-transport-manager.ts` | ~142 | Central transport coordinator: update order Sources -> Transport -> Sensors -> Sinks, MU lifecycle management |
| `src/rv-test-runner.ts` | ~112 | In-browser test runner with overlay UI for visual verification |
| `src/rv-transport-surface.ts` | ~109 | AABB-based conveyor surface: moves MUs along drive direction at surface speed |
| `src/rv-source.ts` | ~105 | MU spawner: interval and distance-based modes, template cloning |
| `src/rv-signal-store.ts` | ~95 | PLC signal pub/sub store: bool/int/float values, change-only notification, subscribe/unsubscribe |
| `src/rv-aabb.ts` | ~91 | Axis-aligned bounding box: overlap detection, world-position update, BoxCollider center/size with X-flip |
| `src/rv-erratic.ts` | ~71 | RVErraticDriver: random target picker, port of Drive_ErraticPosition.CalcFixedUpdate() |
| `src/rv-mu.ts` | ~66 | RVMovingUnit: node wrapper with currentSurface tracking, half-size for AABB, disposal |
| `src/rv-sensor.ts` | ~65 | RVSensor: AABB overlap check against MUs, writes occupied state to SignalStore |
| `src/rv-extras-validator.ts` | ~278 | Dev-mode GLB extras parity validator: CONSUMED/IGNORED field maps for all component types, printParitySummary() for consolidated warnings |
| `src/rv-debug.ts` | ~88 | Structured debug logging: category-based (loader, playback, drive, transport, sensor, logic, signal, erratic, parity), URL/localStorage toggle, zero-cost when disabled |
| `src/rv-simulation-loop.ts` | ~100 | Fixed-timestep accumulator loop (60Hz), setAnimationLoop for XR, rAF fallback |
| `src/rv-xr-manager.ts` | ~95 | XR session management: platform detection, VR/AR buttons, controller setup, WebGPU guard |
| `src/rv-xr-hit-test.ts` | ~75 | AR hit-test: reticle on surfaces, model placement, WebXR Hit Test API |
| `src/rv-sink.ts` | ~44 | RVSink: AABB-based MU consumer, marks MUs for removal |
| `index.html` | ~250 | HTML structure with CSS for loading overlay and all UI panels |
| `public/logo.png` | - | realvirtual brand logo (512x512 PNG) for loading screen |
