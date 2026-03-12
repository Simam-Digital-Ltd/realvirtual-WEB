# Extending the realvirtual Web Viewer

Guide for building custom plugins, adding UI components, and extending the viewer with new functionality.

## Architecture at a Glance

```
main.ts
  viewer.use(new MyPlugin())    // Plugin with lifecycle hooks + optional UI slots

rv-viewer.ts (Core)
  plugins[] → onModelLoaded → onFixedUpdatePre → [drives] → [transport] → onFixedUpdatePost → onRender

HMIShell.tsx (React)
  SlotRenderer('kpi-bar')    → renders all registered kpi-bar components
  SlotRenderer('messages')   → renders all registered message components
  ...
```

Two extension points:

1. **Plugins** — lifecycle callbacks, simulation data, event emission, optional UI slot registration
2. **Events** — typed pub/sub between plugins and UI

---

## 1. Core Plugins

### The RVViewerPlugin Interface

```typescript
// src/core/rv-plugin.ts

interface RVViewerPlugin {
  readonly id: string;                  // Unique ID, e.g. 'my-analytics'
  readonly order?: number;              // Execution order (lower = earlier, default: 100)
  readonly handlesTransport?: boolean;  // true = replaces kinematic transport
  readonly slots?: UISlotEntry[];       // Optional UI components for HMI layout slots

  onModelLoaded?(result: LoadResult, viewer: RVViewer): void;
  onModelCleared?(viewer: RVViewer): void;
  onFixedUpdatePre?(dt: number): void;   // 60Hz, BEFORE drive physics
  onFixedUpdatePost?(dt: number): void;  // 60Hz, AFTER drive physics + transport
  onRender?(frameDt: number): void;      // Per render frame
  dispose?(): void;                      // Cleanup on viewer destroy
}
```

### Execution Order in fixedUpdate

```
1. LogicEngine.fixedUpdate(dt)         — LogicStep sequencing
2. ReplayRecordings[].fixedUpdate(dt)  — Recording playback (legacy, not yet a plugin)
3. prePlugins[].onFixedUpdatePre(dt)   — Set drive targets, apply interface data
4. ErraticDrivers[].update(dt)         — Random drive targets (legacy, not yet a plugin)
5. drives[].update(dt)                 — Drive physics (sorted by DriveOrderPlugin)
6. transportManager.update(dt)         — MU movement, sensors (skipped if handlesTransport)
7. postPlugins[].onFixedUpdatePost(dt) — Read results, sample data, emit events
8. driveRecorder.sample(dt)            — Drive recording (legacy, not yet a plugin)
```

> **Note:** Steps 2, 4, and 8 are legacy hardcoded calls that predate the plugin system.
> They will be migrated to `onFixedUpdatePre` / `onFixedUpdatePost` plugins in a future
> refactoring pass. New features should always use the plugin system.

Plugins are cached into per-phase arrays sorted by `order`. Each callback is wrapped in try/catch — a faulty plugin cannot crash the simulation.

### Example: Data-Only Plugin (No Lifecycle)

The simplest plugin just holds data. No callbacks needed.

```typescript
// src/plugins/my-config-plugin.ts
import type { RVViewerPlugin } from '../core/rv-plugin';

export class MyConfigPlugin implements RVViewerPlugin {
  readonly id = 'my-config';

  // Public data accessible from React via usePlugin()
  readonly apiUrl: string;
  readonly refreshRate: number;

  constructor(config: { apiUrl: string; refreshRate?: number }) {
    this.apiUrl = config.apiUrl;
    this.refreshRate = config.refreshRate ?? 1000;
  }
}
```

Register and access:

```typescript
// main.ts
viewer.use(new MyConfigPlugin({ apiUrl: 'https://api.example.com' }));

// Any React component
const config = usePlugin<MyConfigPlugin>('my-config');
console.log(config?.apiUrl);
```

### Example: Simulation Plugin (Pre/Post Callbacks)

A plugin that sets drive targets before physics and reads results after:

```typescript
// src/plugins/oscillator-plugin.ts
import type { RVViewerPlugin } from '../core/rv-plugin';
import type { LoadResult } from '../core/engine/rv-scene-loader';
import type { RVViewer } from '../core/rv-viewer';
import type { RVDrive } from '../core/engine/rv-drive';

export class OscillatorPlugin implements RVViewerPlugin {
  readonly id = 'oscillator';
  readonly order = 50;  // Run before default (100)

  private drives: RVDrive[] = [];
  private elapsed = 0;

  onModelLoaded(result: LoadResult, viewer: RVViewer): void {
    // Pick drives to oscillate
    this.drives = viewer.drives.filter(d => d.name.startsWith('Osc_'));
  }

  onFixedUpdatePre(dt: number): void {
    this.elapsed += dt;
    for (const drive of this.drives) {
      // Set target position — drive physics handles acceleration/deceleration
      drive.targetPosition = Math.sin(this.elapsed * 2) * 500;  // ±500mm
    }
  }

  onFixedUpdatePost(dt: number): void {
    // Read actual positions after physics
    for (const drive of this.drives) {
      if (drive.isAtTarget) {
        // Could emit events, log data, etc.
      }
    }
  }

  onModelCleared(): void {
    this.drives = [];
    this.elapsed = 0;
  }
}
```

### Example: Event-Emitting Plugin

Plugins can emit typed events that React components subscribe to:

```typescript
// src/plugins/alarm-plugin.ts
import type { RVViewerPlugin } from '../core/rv-plugin';
import type { RVViewer } from '../core/rv-viewer';

export class AlarmPlugin implements RVViewerPlugin {
  readonly id = 'alarm';

  private viewer: RVViewer | null = null;
  private checkInterval = 0;
  private elapsed = 0;

  onModelLoaded(_result: any, viewer: RVViewer): void {
    this.viewer = viewer;
  }

  onFixedUpdatePost(dt: number): void {
    this.elapsed += dt;
    this.checkInterval += dt;
    if (this.checkInterval < 1.0) return;  // Check every second
    this.checkInterval = 0;

    // Example: emit custom event (untyped overload)
    if (someCondition) {
      this.viewer?.emit('alarm:triggered', {
        severity: 'warning',
        message: 'Temperature exceeded threshold',
        time: this.elapsed,
      });
    }
  }

  onModelCleared(): void {
    this.viewer = null;
    this.elapsed = 0;
  }
}
```

Subscribe in React:

```typescript
// In a component
const viewer = useViewer();

useEffect(() => {
  return viewer.on('alarm:triggered', (data) => {
    console.log('Alarm:', data);
  });
}, [viewer]);
```

For type safety on custom events, extend `ViewerEvents` in `rv-viewer.ts`:

```typescript
export interface ViewerEvents {
  // ... existing events ...
  'alarm:triggered': { severity: string; message: string; time: number };
}
```

### Retroactive Registration

If a plugin is registered after a model is already loaded, `onModelLoaded` is called immediately:

```typescript
// Model loaded at t=0
await viewer.loadModel('scene.glb');

// Plugin registered at t=5 — onModelLoaded fires right away
viewer.use(new LatePlugin());
```

### Plugin Order

The `order` property controls execution order within each phase (Pre, Post, Render). Lower values run first:

| order | Intended Use |
|-------|-------------|
| 0 | Infrastructure (DriveOrderPlugin, physics) |
| 50 | Interface data exchange |
| 100 | Default (most plugins) |
| 200 | Analytics, recording |

---

## 2. Events

### Built-in Event Types

```typescript
interface ViewerEvents {
  // Core
  'model-loaded':       { result: LoadResult };
  'model-cleared':      void;
  'drive-hover':        { drive: RVDrive | null; clientX: number; clientY: number };
  'drive-focus':        { drive: RVDrive | null; node: Object3D | null };

  // Simulation (emitted by plugins)
  'sensor-changed':     { sensorPath: string; occupied: boolean };
  'mu-spawned':         { totalSpawned: number };
  'mu-consumed':        { totalConsumed: number };
  'drive-at-target':    { drivePath: string; position: number };

  // Interface
  'interface-connected':    { interfaceId: string; type: string };
  'interface-disconnected': { interfaceId: string; reason?: string };
  'interface-error':        { interfaceId: string; error: string };

  // UI
  'camera-animation-done':  { targetPath?: string };
  'object-clicked':         { path: string; node: Object3D };
  'panel-opened':           { panelId: string };
  'panel-closed':           { panelId: string };
}
```

### Emitting Events

```typescript
// Typed (compile-time checked):
viewer.emit('sensor-changed', { sensorPath: 'Cell/Sensor1', occupied: true });

// Custom/untyped (for plugin-specific events):
viewer.emit('my-plugin:data-ready', { values: [1, 2, 3] });
```

### Subscribing to Events

```typescript
// Returns unsubscribe function
const off = viewer.on('sensor-changed', (data) => {
  console.log(data.sensorPath, data.occupied);
});
off();  // Unsubscribe

// In React — auto-cleanup via useEffect
useSimulationEvent('sensor-changed', (data) => {
  // Callback ref is stable — no re-subscriptions on re-render
});
```

---

## 3. UI Slots (React Components in Plugins)

Plugins can provide UI by declaring a `slots` array on `RVViewerPlugin`. Slot entries are automatically registered into the HMI layout when `viewer.use()` is called.

### Available Layout Slots

```
+------------------------------------------------------------+
|           [kpi-bar] KPI cards, horizontal                  |
| +--------+                                    +---------+  |
| |        |                                    |         |  |
| |[button-|                                    |[messages|  |
| | group] |                                    | ]       |  |
| |        |            3D Scene                |         |  |
| |        |                                    |         |  |
| +--------+                                    +---------+  |
|                                    +-------------------+   |
|                                    | [views]           |   |
|                                    | Charts, tables    |   |
|                                    +-------------------+   |
|           [search-bar] Search field                        |
+------------------------------------------------------------+
```

| Slot | Position | Typical Content |
|------|----------|----------------|
| `kpi-bar` | Top center | KPI badge cards |
| `button-group` | Left sidebar | Navigation icon buttons |
| `search-bar` | Bottom center | Search/filter fields |
| `messages` | Right sidebar | Notifications, status tiles |
| `views` | Bottom right | Expandable panels, charts |
| `settings-tab` | Settings dialog | Additional tabs |

### UISlotEntry Type

```typescript
// src/core/rv-ui-plugin.ts

type UISlot = 'kpi-bar' | 'button-group' | 'search-bar' | 'messages' | 'views' | 'settings-tab';

interface UISlotEntry {
  slot: UISlot;
  component: ComponentType<{ viewer: RVViewer }>;
  order?: number;    // Sort order within slot (lower = first)
  label?: string;    // For settings-tab: tab label
}
```

### Example: Plugin with KPI Card

```typescript
// src/plugins/energy-plugin.ts
import type { RVViewerPlugin } from '../core/rv-plugin';
import type { UISlotEntry } from '../core/rv-ui-plugin';
import type { RVViewer } from '../core/rv-viewer';

function EnergyKpiCard({ viewer }: { viewer: RVViewer }) {
  return (
    <div style={{ padding: 8, background: 'rgba(0,0,0,0.6)', borderRadius: 8 }}>
      <div style={{ fontSize: 12, color: '#aaa' }}>Energy</div>
      <div style={{ fontSize: 24, color: '#4fc3f7' }}>42 kWh</div>
    </div>
  );
}

export class EnergyPlugin implements RVViewerPlugin {
  readonly id = 'energy';
  readonly slots: UISlotEntry[] = [
    { slot: 'kpi-bar', component: EnergyKpiCard, order: 40 },
  ];
}
```

Register:

```typescript
// main.ts
viewer.use(new EnergyPlugin());
```

The component appears automatically in the top KPI bar, sorted after existing cards (order 40).

### Example: Plugin with Settings Tab

```typescript
export class DebugPlugin implements RVViewerPlugin {
  readonly id = 'debug';
  readonly slots: UISlotEntry[] = [
    { slot: 'settings-tab', component: DebugSettingsTab, label: 'Debug', order: 200 },
  ];
}

function DebugSettingsTab({ viewer }: { viewer: RVViewer }) {
  return (
    <div>
      <h3>Debug Settings</h3>
      <label>
        <input type="checkbox" onChange={() => /* toggle debug */ } />
        Enable verbose logging
      </label>
    </div>
  );
}
```

### Rendering Slots in Custom Components

Use the `useSlot` hook to render slot content anywhere:

```typescript
import { useSlot } from '../hooks/use-slot';
import { useViewer } from '../hooks/use-viewer';

function CustomPanel() {
  const viewer = useViewer();
  const kpiEntries = useSlot('kpi-bar');

  return (
    <div>
      {kpiEntries.map((entry, i) => {
        const Comp = entry.component;
        return <Comp key={i} viewer={viewer} />;
      })}
    </div>
  );
}
```

---

## 4. React Hooks Reference

| Hook | Returns | Purpose |
|------|---------|---------|
| `useViewer()` | `RVViewer` | Access the viewer instance |
| `usePlugin<T>(id)` | `T \| undefined` | Type-safe plugin access |
| `useSimulationEvent(event, cb)` | void | Subscribe to typed events (auto-cleanup) |
| `useSlot(slot)` | `UISlotEntry[]` | Get registered components for a layout slot |
| `useKpiData()` | `KpiDemoPlugin \| undefined` | Access KPI demo data plugin |
| `useSensorState(path)` | `boolean` | Event-based sensor occupied state |
| `useTransportStats(ms?)` | `{ spawned, consumed }` | Polled transport counters |
| `useInterfaceStatus(id)` | `boolean` | Interface connection state |
| `useDrives()` | drive list + hover state | All loaded drives |
| `useSignal(path)` | signal value | Signal store subscription |

### Writing Custom Hooks

```typescript
// hooks/use-alarm.ts
import { useState } from 'react';
import { useSimulationEvent } from './use-simulation-event';

export function useAlarm() {
  const [alarms, setAlarms] = useState<string[]>([]);

  useSimulationEvent('alarm:triggered', (data) => {
    setAlarms(prev => [...prev.slice(-9), data.message]);  // Keep last 10
  });

  return alarms;
}
```

---

## 5. Plugins with Both Data and UI

A common pattern: one plugin handles data/simulation AND provides UI via slots.

### Step 1: Plugin (data + events + UI slots)

```typescript
// src/plugins/cycle-counter-plugin.ts
import type { RVViewerPlugin } from '../core/rv-plugin';
import type { UISlotEntry } from '../core/rv-ui-plugin';
import type { LoadResult } from '../core/engine/rv-scene-loader';
import type { RVViewer } from '../core/rv-viewer';

export interface CycleCounterData {
  totalCycles: number;
  cyclesPerMinute: number;
  lastCycleTime: number;
}

function CycleCounterCard({ viewer }: { viewer: RVViewer }) {
  const data = useCycleCounter();
  if (!data) return null;

  return (
    <KpiCard
      label="Cycles"
      value={data.totalCycles.toString()}
      unit="total"
      secondary={`${data.cyclesPerMinute.toFixed(1)}/min`}
    />
  );
}

export class CycleCounterPlugin implements RVViewerPlugin {
  readonly id = 'cycle-counter';

  // UI slot entries — rendered automatically by HMI layout
  readonly slots: UISlotEntry[] = [
    { slot: 'kpi-bar', component: CycleCounterCard, order: 50 },
  ];

  private viewer: RVViewer | null = null;
  private _data: CycleCounterData = { totalCycles: 0, cyclesPerMinute: 0, lastCycleTime: 0 };

  get data(): Readonly<CycleCounterData> { return this._data; }

  onModelLoaded(_result: LoadResult, viewer: RVViewer): void {
    this.viewer = viewer;
  }

  onFixedUpdatePost(dt: number): void {
    // ... count cycles, update _data ...
    if (cycleCompleted) {
      this._data.totalCycles++;
      this.viewer?.emit('cycle-counter:cycle', { total: this._data.totalCycles });
    }
  }

  onModelCleared(): void {
    this._data = { totalCycles: 0, cyclesPerMinute: 0, lastCycleTime: 0 };
    this.viewer = null;
  }
}
```

### Step 2: React Hook (optional, for polling plugin data)

```typescript
// hooks/use-cycle-counter.ts
import { useState, useEffect } from 'react';
import { usePlugin } from './use-plugin';
import type { CycleCounterPlugin } from '../plugins/cycle-counter-plugin';

export function useCycleCounter() {
  const plugin = usePlugin<CycleCounterPlugin>('cycle-counter');
  const [data, setData] = useState(plugin?.data);

  useEffect(() => {
    if (!plugin) return;
    const id = setInterval(() => setData({ ...plugin.data }), 500);
    return () => clearInterval(id);
  }, [plugin]);

  return data;
}
```

### Step 3: Register

```typescript
// main.ts
viewer.use(new CycleCounterPlugin());
```

The plugin runs at 60Hz (data), emits events, AND renders a KPI card — all from a single `viewer.use()` call.

---

## 6. Floating Chart Panels

Use `ChartPanel` to create draggable, resizable overlay panels (same as the drive chart and KPI charts):

```typescript
import { ChartPanel } from './ChartPanel';

interface Props {
  open: boolean;
  onClose: () => void;
}

function MyChartPanel({ open, onClose }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);

  return (
    <ChartPanel
      open={open}
      onClose={onClose}
      title="My Chart"
      titleColor="#66bb6a"
      subtitle="Last 24 hours"
      defaultWidth={750}
      defaultHeight={340}
      zIndex={1400}
    >
      <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
    </ChartPanel>
  );
}
```

`ChartPanel` features:
- Drag via title bar
- Resize via bottom-right corner handle
- ESC key to close
- Expand/collapse toggle (full-width)
- Glassmorphism dark theme (MUI Paper)

### Wiring Chart Panels to KPI Badges

Chart panels render in `App.tsx` (outside `HMIShell`) to avoid `pointer-events: none` blocking. The pattern:

```typescript
// App.tsx
const [openChart, setOpenChart] = useState<string | null>(null);
const toggle = (id: string) => setOpenChart(prev => prev === id ? null : id);

// Pass toggle to TopBar/KpiCards
<TopBar onKpiClick={toggle} />

// Render chart overlays as siblings
<MyChart open={openChart === 'my-chart'} onClose={() => setOpenChart(null)} />
```

### z-index Hierarchy

| Layer | z-index | Content |
|-------|---------|---------|
| HMIShell | 1000 | Main HMI overlay |
| TopBar | 1200 | Top bar with KPI badges |
| KPI Charts | 1400 | OEE, Parts/h, Cycle Time panels |
| Drive Chart | 1500 | Drive chart overlay |

---

## 7. Testing Plugins

Tests use Vitest in headless Chromium. Create `tests/<name>.test.ts`:

```typescript
// tests/my-plugin.test.ts
import { describe, it, expect } from 'vitest';
import { MyPlugin } from '../src/plugins/my-plugin';

describe('MyPlugin', () => {
  it('has correct id', () => {
    const plugin = new MyPlugin();
    expect(plugin.id).toBe('my-plugin');
  });

  it('generates valid data', () => {
    const plugin = new MyPlugin();
    expect(plugin.data.length).toBeGreaterThan(0);
    expect(plugin.data.every(d => d.value >= 0)).toBe(true);
  });
});
```

Run tests:

```bash
cd Assets/realvirtual-WebViewer~
npm test              # All tests, headless
npm run test:watch    # Watch mode
```

### Testing Core Plugin Lifecycle

Use a minimal mock to test plugin dispatch without the full viewer:

```typescript
class MockHost {
  plugins: any[] = [];
  prePlugins: any[] = [];
  postPlugins: any[] = [];
  drives: any[] = [];
  private _lastLoadResult: any = null;

  use(plugin: any): this {
    if (this.plugins.some(p => p.id === plugin.id)) return this;
    this.plugins.push(plugin);
    if (plugin.onFixedUpdatePre) this.prePlugins.push(plugin);
    if (plugin.onFixedUpdatePost) this.postPlugins.push(plugin);
    if (this.drives.length > 0 && this._lastLoadResult && plugin.onModelLoaded) {
      plugin.onModelLoaded(this._lastLoadResult, this);
    }
    return this;
  }

  simulateLoad(result: any) {
    this._lastLoadResult = result;
    this.drives = [{ name: 'TestDrive' }];
    for (const p of this.plugins) p.onModelLoaded?.(result, this);
  }

  tick(dt: number) {
    for (const p of this.prePlugins) try { p.onFixedUpdatePre!(dt); } catch {}
    for (const p of this.postPlugins) try { p.onFixedUpdatePost!(dt); } catch {}
  }
}
```

---

## 8. Checklist: Adding a New Feature

1. **Create plugin** in `src/plugins/`:
   - Implement `RVViewerPlugin`
   - Add lifecycle callbacks (`onModelLoaded`, `onFixedUpdatePre/Post`, etc.) as needed
   - Add `slots` array for UI components (KPI cards, buttons, messages, etc.)
   - Set `order` if execution timing matters

2. **Create React hook** (if needed):
   - New file in `src/hooks/`
   - Use `usePlugin<T>(id)` or `useSimulationEvent()`

3. **Register in main.ts**:
   ```typescript
   viewer.use(new MyPlugin());
   ```

4. **Add tests** in `tests/`:
   - Test data generation, event emission, lifecycle behavior
   - Run `npm test` to verify

5. **Update README.md**:
   - Add new files to the architecture diagram and file reference table
   - Add new test suites to the test coverage table

---

## 9. Existing Plugins Reference

### Core Plugins

| Plugin | ID | Callbacks | Purpose |
|--------|----|-----------|---------|
| `RapierPhysicsPlugin` | `rapier-physics` | onModelLoaded, onFixedUpdatePre/Post, onModelCleared | Rapier.js physics-based transport (replaces kinematic) |
| `DriveOrderPlugin` | `drive-order` | onModelLoaded | Topological sort of drives for CAM/Gear master-slave |
| `SensorMonitorPlugin` | `sensor-monitor` | onModelLoaded, onFixedUpdatePost, onModelCleared | Event-based sensor change tracking via onChanged |
| `TransportStatsPlugin` | `transport-stats` | onModelLoaded, onFixedUpdatePost, onModelCleared | 10Hz spawn/consume counters in RingBuffers |
| `CameraEventsPlugin` | `camera-events` | onModelLoaded, onRender | Emits camera-animation-done |
| `KpiDemoPlugin` | `kpi-demo` | (none) | Static OEE/Parts/CycleTime demo data with seeded PRNG |
| `DemoHMIPlugin` | `demo-hmi` | (slots only) | Registers demo KPI cards, nav buttons, message tiles into HMI slots |

### Plugin Locations

| Plugin | File |
|--------|------|
| `RapierPhysicsPlugin` | `src/core/engine/rapier-physics-plugin.ts` |
| `DriveOrderPlugin` | `src/plugins/drive-order-plugin.ts` |
| `SensorMonitorPlugin` | `src/plugins/sensor-monitor-plugin.ts` |
| `TransportStatsPlugin` | `src/plugins/transport-stats-plugin.ts` |
| `CameraEventsPlugin` | `src/plugins/camera-events-plugin.ts` |
| `KpiDemoPlugin` | `src/plugins/kpi-demo-plugin.ts` |
| `DemoHMIPlugin` | `src/custom/demo-hmi-plugin.tsx` |

### Data Access Patterns

| Plugin | Public API | Hook |
|--------|-----------|------|
| `KpiDemoPlugin` | `.oeeData`, `.partsData`, `.cycleTimeData`, `.partsTarget`, `.taktTimeMs` | `useKpiData()` |
| `TransportStatsPlugin` | `.timeBuffer`, `.spawnedBuffer`, `.consumedBuffer` (RingBuffers) | `useTransportStats(ms?)` |
| `SensorMonitorPlugin` | `.eventHistory` (RingBuffer) | `useSensorState(path)` |

---

## 10. Key Design Decisions

**Why unified plugins with optional UI slots?**
A single `RVViewerPlugin` interface handles both simulation lifecycle and UI registration. Plugins declare `slots?: UISlotEntry[]` — if present, the HMI renders them; if absent, the plugin is data-only. This avoids the overhead of separate "core" and "UI" plugin classes for what is usually one logical feature. The plugin class itself has no React dependency — only the slot component functions use React.

**Why try/catch around every plugin callback?**
A single faulty plugin must never freeze the simulation. Errors are logged but execution continues.

**Why cached plugin arrays (prePlugins, postPlugins, renderPlugins)?**
Instead of checking `if (plugin.onFixedUpdatePre)` for every plugin at 60Hz, plugins are sorted into cached arrays once during `use()`. The hot path is a simple for-loop.

**Why handlesTransport flag?**
When a physics engine (Rapier.js) replaces the kinematic transport, it sets `handlesTransport: true`. The core loop skips `transportManager.update(dt)` automatically. No core code changes needed.

**Why render chart overlays outside HMIShell?**
`HMIShell` has `pointer-events: none` on its container so the 3D scene remains interactive. Chart panels need pointer events for drag/resize, so they render as siblings in `App.tsx`.
