# realvirtual Web Viewer

Three.js-based GLB viewer that loads realvirtual exports and runs transport simulation, sensor collision, LogicStep sequencing, and drive animation in the browser. Supports WebGL, WebGPU, and WebXR (VR/AR).

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
npm run test:watch   # Watch mode
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
│   │   ├── rv-drive-hover.ts            # Drive hover/click detection
│   │   ├── rv-highlight-manager.ts      # Object highlight system
│   │   ├── rv-replay-recording.ts       # DrivesRecorder replay
│   │   ├── rv-simulation-loop.ts        # Fixed 60Hz accumulator loop (XR-compatible)
│   │   ├── rv-xr-manager.ts            # WebXR session management (VR/AR)
│   │   ├── rv-xr-hit-test.ts           # AR hit-test reticle
│   │   ├── rv-physics-world.ts          # Rapier.js physics world wrapper
│   │   ├── rapier-physics-plugin.ts     # Physics-based transport (replaces kinematic)
│   │   ├── rv-debug.ts                  # Structured category-based debug logging
│   │   └── rv-extras-validator.ts       # Dev-mode GLB extras parity checker
│   └── hmi/                             # React HMI layout components (MUI-based)
│       ├── hmi-entry.ts                 # HMI initialization (React root)
│       ├── App.tsx                      # Root layout
│       ├── HMIShell.tsx                 # SlotRenderer for plugin UI
│       ├── KpiBar.tsx                   # Top KPI card container (slot: kpi-bar)
│       ├── ButtonPanel.tsx              # Left sidebar with nav buttons (slot: button-group)
│       ├── MessagePanel.tsx             # Right message panel (slot: messages)
│       ├── TopBar.tsx, BottomBar.tsx     # Top/bottom bars
│       ├── KpiCard.tsx, TileCard.tsx     # Reusable card components
│       ├── ChartPanel.tsx               # Draggable/resizable chart overlay
│       └── ...                          # Settings, tooltips, search
├── plugins/                             # Non-core plugins
│   ├── sensor-monitor-plugin.ts         # Event-based sensor monitoring
│   ├── transport-stats-plugin.ts        # Transport statistics (10Hz RingBuffer)
│   ├── camera-events-plugin.ts          # Camera animation done events
│   ├── drive-order-plugin.ts            # Topological drive sorting for CAM/Gear
│   └── kpi-demo-plugin.ts              # Static demo KPI data
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
    └── kpi-utils.test.ts                # KPI utilities (40 tests)
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

All extensions use the unified `RVViewerPlugin` interface:

```typescript
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
Central pub/sub for PLC signals (bool/int/float), addressed by hierarchy path. Change-only notification.

### Drive Physics
Ported from Drive.cs — acceleration/deceleration, position limits, rotation and linear movement. CAM/Gear master-slave dependencies resolved via topological sort.

### WebXR (VR/AR)
VR on Quest, Vision Pro, PCVR. AR with hit-test surface detection and model placement. Uses `setAnimationLoop` for XR frame callback.

## Renderer Support

- **WebGL** (default): Stable, all browsers
- **WebGPU**: Three.js r171+ `WebGPURenderer` with WebGL2 fallback

Selection persists via URL parameter (`?renderer=webgpu`) or localStorage.

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

**226 tests** running in real Chromium via Vitest v4 + Playwright:

```bash
npm test              # All tests, headless
npm run test:watch    # Watch mode
```

Test GLB: Export from Unity demo scene → `public/models/tests.glb`.

| Suite | Tests | Validates |
|-------|-------|-----------|
| GLB structure | 21 | File loads, extras, component properties |
| NodeRegistry | 34 | Path computation, type queries, hierarchy traversal |
| Transport | 17 | Linear/radial movement, MU lifecycle, surface transfer |
| LogicSteps | 33 | All step types, containers, looping, integration |
| SignalStore | 15 | Pub/sub, change notification, bulk updates |
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
