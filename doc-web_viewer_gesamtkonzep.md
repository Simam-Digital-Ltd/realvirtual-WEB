# realvirtual WEB — Gesamtkonzept

## Technische Spezifikation für den Browser-basierten 3D-HMI

**Version:** 2.0
**Stand:** März 2026
**Status:** Produktion — Kernfunktionalität implementiert und im Einsatz

---

# Teil I — Strategie und Überblick

---

## 1. Vision

Der realvirtual WEB erweitert die realvirtual-Plattform um einen browserbasierten 3D-HMI. Während Unity das Werkzeug für Engineering und Virtual Commissioning bleibt, bietet der realvirtual WEB eine Zero-Install-Lösung für Monitoring, Präsentation, Schulung und Remote-Zugriff.

### Zwei-Plattform-Strategie

- **Unity** = Engineering, Virtual Commissioning, PLC-Test, hochperformante Simulation
- **Three.js realvirtual WEB** = Monitoring, Präsentation, Remote-Zugriff, Zero Install

Diese Plattformen sind komplementär, nicht konkurrierend. Sie teilen dieselbe Datenbasis (GLB mit rv_extras) und dieselben Konzepte (Drives, Sensoren, Logic Steps).

### Alleinstellungsmerkmal

Kein Wettbewerber bietet einen durchgängigen Workflow von Virtual Commissioning (Unity) bis Web-Monitoring (Three.js) aus einer Hand mit gemeinsamer Datenbasis. Hightopo baut hübsche Dashboards ohne PLC-Integration. Sym3 hat SCADA-Konnektivität ohne Unity-Workflow. realvirtual hat beides.

---

## 2. Betriebsmodi

### Live-Modus

Der realvirtual Core (Unity Headless oder .NET Server) hält die PLC-Verbindung, berechnet Simulation und sendet fertige Transforms plus Signalwerte per WebSocket. Der Browser ist ein Renderer — er setzt empfangene Werte auf die Szene und interpoliert für weiche Darstellung.

### Standalone-Modus

Kein Core nötig. Der Browser lädt das GLB mit eingebetteten TypeScript-Komponenten (Drive, Sensor, LogicStep, TransportSurface) und spielt aufgezeichnete Signaldaten ab oder führt eine eigenständige Ablaufsimulation aus. Für Vertrieb, Schulung und Demos.

### Direct-Modus

Kein Core nötig. Der Browser kommuniziert direkt mit einer Siemens S7-1500 per REST API oder über MQTT via Broker. Für reines Monitoring ohne eigene Serverinfrastruktur.

---

## 3. Technologie-Stack

| Schicht | Technologie | Zweck |
|---------|-----------|-------|
| Sprache | TypeScript | Typsicher, C#-nah |
| 3D-Engine | Three.js (direkt, imperativ) | Rendering, Szenegraph |
| UI-Framework | React (nur Overlay, nicht 3D) | HMI-Panels, Alarme, Eingaben |
| Charts | Apache ECharts + SVG Sparklines | Signal-Visualisierung |
| Kommunikation | WebSocket, MQTT, REST | Live-Daten |
| Build | Vite + TypeScript | Schnelles Dev und Build |

Der 3D-Core ist framework-agnostisch — kein React, keine Abhängigkeit. Die React-UI-Schicht liegt darüber und nutzt den Core über eine saubere API.

---

## 4. Performance-Vergleich: Three.js vs. Unity WebGL

| Kriterium | Three.js | Unity WebGL |
|-----------|---------|-------------|
| Initialer Download | 6–16 MB (Three.js + GLB) | 80–100 MB (Runtime + Szene) |
| Ladezeit | 2–5 Sekunden | 10–30 Sekunden |
| Rendering | Direkt WebGL/WebGPU | WASM-Emulationsschicht |
| FPS (500K Polygone) | 55–60 fps | 30–45 fps |
| RAM-Verbrauch | 50–100 MB | 150–300 MB |
| Threading | Web Worker möglich | Single-threaded |
| Mobile | Gut | Problematisch |

Three.js ist für den realvirtual WEB in jeder Hinsicht überlegen. Unity WebGL wäre nur sinnvoll, wenn die Unity-Szene 1:1 im Browser gezeigt werden soll — was hier nicht der Fall ist.

---

## 5. Deployment-Strategie

### Drei Produktvarianten

| Variante | Server | Datenquelle | Anwendung |
|----------|--------|------------|-----------|
| **realvirtual WEB Live** | realvirtual Core | WebSocket (Transforms + Signale) | Monitoring, HMI, Full Simulation |
| **realvirtual WEB Standalone** | Keiner (statisches Hosting) | Recording-Datei oder Eigenberechnung | Vertrieb, Schulung, Demos |
| **realvirtual WEB Direct** | Nur MQTT-Broker (optional) | REST an S7 Web API oder MQTT | Monitoring ohne Server |

Alle drei Varianten nutzen denselben realvirtual WEB Code. Nur die Datenquelle unterscheidet sich.

### Stabilität des Core

Für den Live-Modus muss der Core als Dienst laufen — Docker-Container oder Windows-Service. Automatischer Neustart, PLC-Reconnect, Health-Check-Endpoints. Der Core ist das Produkt, realvirtual WEB ist die Oberfläche.

---

## 6. Lizenzmodell: AGPL + Commercial Dual Licensing

### Open Source (AGPL)

Der realvirtual WEB-Core wird unter AGPL veröffentlicht. AGPL schließt die SaaS-Lücke: Wenn Nutzer über ein Netzwerk mit der Software interagieren, gilt das als Verteilung — der gesamte darauf aufbauende Code muss ebenfalls unter AGPL veröffentlicht werden.

Für einen realvirtual WEB greift die AGPL praktisch immer im kommerziellen Kontext — er wird per Definition über ein Netzwerk genutzt.

### Commercial License (kostenpflichtig)

Unternehmen, die realvirtual WEB in geschlossene, proprietäre Produkte einbauen wollen, kaufen die kommerzielle Lizenz. Kein Zwang zur Offenlegung.

### Was Open Source ist (AGPL)

Three.js realvirtual WEB Core, GLB Loader mit rv_extras Parsing, Drive/Sensor/Transport als TypeScript-Komponenten, SimulationLoop, Scene Registry und Volltext-Suche, Highlight-System, MQTT und REST Signal-Adapter, Basis-UI-Komponenten, Recording-Playback, Dokumentation und Beispiel-GLBs.

### Was kommerziell bleibt

Unity GLB-Exporter mit rv_extras, alle PLC-Interfaces (S7, ADS, OPC UA, Fanuc, EtherNet/IP), realvirtual Core als WebSocket-Server, CAD-Import-Pipeline, Kinematik-Editor in Unity, Advanced HMI Features, Support und Wartung.

### Contributor License Agreement (CLA)

Bei externen Beiträgen (Pull Requests) muss ein CLA unterzeichnet werden, damit die Dual-Licensing-Möglichkeit erhalten bleibt.

---

# Teil II — GLB Export aus Unity

---

## 7. Export-Prinzipien

Der GLB-Export erzeugt eine einzelne, selbstbeschreibende Datei mit Geometrie, Materialien, Texturen, der korrekten kinematischen Hierarchie und sämtlichen Metadaten als rv_extras.

- **Single Source of Truth:** Das Unity-Projekt ist der Master.
- **Edit-Mode-Export:** Die kinematische Hierarchie wird temporär aufgebaut, exportiert und rückgängig gemacht. Kein Play Mode nötig.
- **Selbstbeschreibend:** Alle Informationen in den rv_extras — keine externen Konfigurationsdateien.
- **Nicht-destruktiv:** Der Export verändert die Unity-Szene nicht dauerhaft.

---

## 8. Export-Workflow

1. **Pre-Export-Validierung:** Kinematik-Konfiguration, doppelte rv_ids prüfen.
2. **Editor-Zustand sichern:** Parent-Child-Beziehungen und Transforms aller betroffenen Nodes.
3. **Kinematik temporär aufbauen:** Dieselbe Umgruppierungslogik wie beim Play-Mode-Start, aber isoliert.
4. **Mesh-Optimierung:** LOD, Mesh-Vereinigung, Textur-Kompression.
5. **rv_extras erzeugen:** Metadaten aus realvirtual-Komponenten extrahieren.
6. **GLB schreiben:** Binäres glTF mit temporärer kinematischer Hierarchie.
7. **Kinematik rückbauen:** Originalzustand wiederherstellen.
8. **Post-Export-Validierung:** Dateigröße, Node-Anzahl, rv_extras-Vollständigkeit.

Der gesamte Vorgang läuft in einem `try/finally`-Block. Zusätzlich wird der Zustand über `Undo.RegisterCompleteObjectUndo` im Unity-Undo-System registriert.

---

## 9. rv_extras Schema

### Root-Level

Jeder rv_extras-Block beginnt mit:

```json
{
  "rv_version": 1,
  "rv_id": "string — eindeutige ID",
  "rv_type": "string — Komponententyp",
  "rv_name": "string — Anzeigename (optional)",
  "rv_group": "string — Gruppenzugehörigkeit (optional)",
  "rv_tags": ["string — Freitext-Tags für Suche (optional)"],
  "rv_description": "string — Beschreibungstext (optional)"
}
```

### Komponententypen (rv_type)

| rv_type | Beschreibung |
|---------|-------------|
| `Kinematic` | Kinematik-Node (Achse, Lineareinheit) — mit Drive |
| `Drive` | Antrieb ohne eigene Kinematik |
| `Sensor` | Sensor (Lichtschranke, Proximity, etc.) |
| `TransportSurface` | Förderband, Rollenbahn |
| `Source` | Teile-Quelle |
| `Sink` | Teile-Senke |
| `Gripper` | Greifer |
| `MU` | Moving Unit — das transportierte Teil |
| `LogicStep` | Ablaufschritt in einer Sequenz |
| `Cam` | Kurvenscheibe |
| `Group` | Logische Gruppierung (Station, Zelle) |
| `Camera` | Kamera-Preset |
| `Root` | Szenen-Root mit globaler Konfiguration |

Die Typnamen sind identisch zu den C#-Klassennamen in realvirtual.

### Kinematik-Node

```json
{
  "rv_type": "Kinematic",
  "rv_id": "axis_j2",
  "rv_kinematic": {
    "type": "rotary",
    "axis": [0, 0, 1],
    "offset": 0.0,
    "reverse": false
  },
  "rv_drive": {
    "max_speed": 180.0,
    "acceleration": 360.0,
    "deceleration": 360.0,
    "speed_unit": "deg_per_s",
    "position_unit": "deg"
  },
  "rv_limits": {
    "active": true,
    "lower": -170.0,
    "upper": 170.0
  },
  "rv_signals": {
    "position": "PLC1.DB100.DBD0",
    "speed": "PLC1.DB100.DBD4",
    "target_position": "PLC1.DB100.DBD8",
    "is_moving": "PLC1.DB100.DBX12.0",
    "error": "PLC1.DB100.DBX12.1"
  }
}
```

### Sensor

```json
{
  "rv_type": "Sensor",
  "rv_id": "sensor_lb_12",
  "rv_sensor": {
    "sensor_type": "light_barrier",
    "mode": "raycast",
    "ray_direction": [1, 0, 0],
    "ray_length": 0.8,
    "normally_open": true
  },
  "rv_signals": {
    "state": "PLC1.DB300.DBX0.0",
    "fault": "PLC1.DB300.DBX0.1"
  },
  "rv_visual": {
    "show_beam": true,
    "beam_color_active": "#ff000088",
    "beam_color_inactive": "#00ff0044"
  }
}
```

### TransportSurface

```json
{
  "rv_type": "TransportSurface",
  "rv_id": "conv_01",
  "rv_transport": {
    "direction": [1, 0, 0],
    "length": 3.5,
    "width": 0.6,
    "next_surface": "conv_02",
    "sensors": [
      { "sensor_ref": "sensor_lb_01", "position": 0.5 },
      { "sensor_ref": "sensor_lb_02", "position": 3.2 }
    ]
  },
  "rv_drive": {
    "max_speed": 2.0,
    "acceleration": 1.0,
    "deceleration": 1.5,
    "is_continuous": true
  },
  "rv_signals": {
    "speed": "PLC1.DB200.DBD0",
    "running": "PLC1.DB200.DBX4.0"
  }
}
```

### LogicStep (Sequencer)

```json
{
  "rv_type": "Sequencer",
  "rv_id": "seq_main",
  "rv_sequence": {
    "initial_step": "step_01",
    "loop": true,
    "steps": [
      {
        "id": "step_01",
        "name": "Förderband starten",
        "conditions": [],
        "actions": [
          { "type": "drive_at_speed", "target": "drive_conv_01", "value": 0.5 }
        ],
        "nextStep": "step_02"
      },
      {
        "id": "step_02",
        "name": "Warten auf Sensor",
        "conditions": [
          { "type": "sensor_active", "target": "sensor_lb_01" }
        ],
        "actions": [
          { "type": "drive_stop", "target": "drive_conv_01" }
        ],
        "nextStep": "step_03"
      }
    ]
  }
}
```

### Signal-Referenzen mit Typen und Arrays

```json
"rv_signals": {
  "position": { "address": "PLC1.DB100.DBD0", "type": "float", "direction": "read" },
  "speed": { "address": "PLC1.DB100.DBD4", "type": "float", "direction": "read" },
  "target": { "address": "PLC1.DB200.DBD0", "type": "float", "direction": "write" },
  "start": { "address": "PLC1.DB200.DBX0.0", "type": "bool", "direction": "write" },
  "axis_positions": { "address": "PLC1.DB100.DBD0[6]", "type": "float[]", "length": 6, "direction": "read" },
  "temp_profile": { "address": "PLC1.DB200.DBD0[20]", "type": "float[]", "length": 20, "direction": "read" },
  "cam_table": { "address": "PLC1.DB300.DBD0[360]", "type": "float[]", "length": 360, "direction": "read" }
}
```

### UI-Konfiguration pro Node

```json
{
  "rv_ui": {
    "label": "Förderband Hauptantrieb",
    "show_status_badge": true,
    "show_value_label": true,
    "value_label_signal": "PLC1.DB200.DBD0",
    "value_label_unit": "m/s",
    "show_sparkline": "PLC1.DB200.DBD0",
    "lod_distances": {
      "badge_only": 20.0,
      "with_label": 10.0,
      "with_sparkline": 5.0
    },
    "selectable": true,
    "layer": "mechanical",
    "documentation_url": "https://docs.example.com/conveyor01"
  }
}
```

### Alarm-Konfiguration

```json
{
  "rv_alarms": [
    {
      "id": "alm_overcurrent",
      "signal": "PLC1.DB100.DBD20",
      "condition": "above",
      "threshold": 15.0,
      "severity": "critical",
      "message": "Überstrom erkannt — Antrieb prüfen",
      "delay_ms": 500,
      "auto_clear": true
    }
  ]
}
```

### Kamera-Presets

```json
{
  "rv_type": "Camera",
  "rv_id": "cam_overview",
  "rv_camera": {
    "position": [10, 8, 12],
    "target": [0, 0, 0],
    "fov": 45,
    "transition_ms": 800,
    "is_default": true,
    "auto_highlight": [],
    "auto_open_panel": null
  }
}
```

### Root-Node

```json
{
  "rv_type": "Root",
  "rv_scene": {
    "version": "1.0.0",
    "exported_at": "2025-03-05T14:30:00Z",
    "exported_from": "realvirtual Professional 4.8",
    "coordinate_system": "left_handed_y_up",
    "unit": "meter"
  },
  "rv_viewer_config": {
    "theme": "dark",
    "default_camera_preset": "cam_overview",
    "ui": {
      "alarm_sound": true,
      "max_sparklines": 30,
      "max_echarts_instances": 10,
      "signal_buffer_size": 3000
    }
  },
  "rv_ws_config": {
    "default_url": "ws://localhost:8080",
    "reconnect_interval_ms": 2000,
    "max_reconnect_interval_ms": 30000
  }
}
```

---

## 10. Mesh-Optimierung und Koordinatensystem

### Qualitätsstufen

| Stufe | Ziel-Polygonzahl | Anwendung |
|-------|-----------------|-----------|
| Low | <100.000 | Mobile, schwache Geräte |
| Medium | <500.000 | Standard Desktop/Tablet |
| High | <2.000.000 | Leistungsstarke Workstations |

DRACO-Kompression standardmäßig aktiv (60–90% Reduktion). Texturen auf konfiguriertes Maximum skaliert.

### Koordinatensystem-Konvertierung

Unity (linkshändig, Y-up) → glTF (rechtshändig, Y-up): Z-Achse spiegeln. Standard-glTF-Exporter handhaben dies automatisch. rv_extras-Achsvektoren müssen separat konvertiert werden.

---

# Teil III — Three.js realvirtual WEB Core

---

## 11. TypeScript als Sprache

TypeScript ist C# für den Browser. Die Portierung von C#-Drive-Modellen ist fast mechanisch — KI-gestützte Konvertierung funktioniert hervorragend.

| C# | TypeScript |
|----|-----------|
| `float` | `number` |
| `bool` | `boolean` |
| `Mathf.Clamp(v, min, max)` | `Math.max(min, Math.min(max, v))` |
| `public float Speed { get; }` | `get speed(): number` |
| `enum DriveState` | `enum DriveState` |
| `List<T>` | `T[]` |
| `Dictionary<K,V>` | `Map<K,V>` |

Performance: JavaScript liegt bei reiner Numerik bei 60–80% der C#-Performance. Für Drive-Berechnungen irrelevant — der Bottleneck ist immer das Rendering.

Perspektive: C# als WebAssembly (WASM) via .NET Native AOT. Kein TypeScript-Port nötig. Toolchain noch jung, aber als Langzeitperspektive sinnvoll.

---

## 12. Komponentensystem

> **Implementierungsstand:** Vollständig implementiert mit deklarativem Schema-System und zwei-Phasen-Initialisierung.

Jede realvirtual-Komponente existiert als TypeScript-Klasse:

```typescript
// Implementierte Komponenten (Stand März 2026)
class RVDrive            // Antrieb mit Physik und Behavior-System
class RVSensor           // AABB-Collision + Raycast Modi
class RVTransportSurface // Linear + Radial (Drehtisch) mit Textur-Animation
class RVSource           // Dual-Rendering: InstancedMesh + Clone-Fallback
class RVSink             // Deferred MU-Removal
class RVGrip             // Pick/Place mit Sensor- und Range-Erkennung
class RVGripTarget       // Platzierungs-Ziel mit Occupancy-Tracking
class RVLogicStep        // Composite Pattern: Serial/Parallel Container + Leaf Steps
class RVMovingUnit       // Clone-basiert
class InstancedMovingUnit // InstancedMesh-basiert (Performance)
class RVConnectSignal    // Signal-Brücke (Port von ConnectSignal.cs)
class RVErratic          // Drive Behavior: zufällige Positionierung
class RVDriveSimple      // Drive Behavior: einfache Geschwindigkeitssteuerung
class RVDriveCylinder    // Drive Behavior: Zylinder mit Signalsteuerung
```

### Schema-basierte Komponentenerstellung (ComponentRegistry)

Components werden **nicht** manuell verdrahtet, sondern über ein **deklaratives Schema-System** automatisch konfiguriert:

```typescript
// Jede Komponente definiert ihr Schema
static readonly schema = {
  TargetSpeed:    { type: 'number', default: 100 },
  Acceleration:   { type: 'number', default: 100 },
  UseLimits:      { type: 'boolean', default: false },
  Direction:      { type: 'enum', enumMap: { LinearX: 0, RotationZ: 5 } },
  DriveReference: { type: 'componentRef' },   // Referenz auf andere Komponente
  Axis:           { type: 'vector3', unityCoords: true },  // Auto-Konvertierung
};
```

**Zwei-Phasen-Initialisierung (Awake/Start-Pattern):**

1. **Phase 1 "Awake":** GLB-Traverse erstellt alle Komponenten, wendet Schemas an, registriert Nodes
2. **Phase 2 "Start":** Zweiter Pass löst ComponentRefs auf und ruft `init()` auf allen Komponenten auf

Dies erlaubt zirkuläre Referenzen zwischen Komponenten (z.B. Drive → Sensor → Drive).

### NodeRegistry als Unity-ähnliches Component-System

Components werden über die `NodeRegistry` an Three.js Nodes gebunden:

```typescript
// FindObjectsOfType<RVDrive>()
const drives = registry.getAll<RVDrive>('Drive');

// GetComponent<RVSensor>(path)
const sensor = registry.getByPath<RVSensor>('Sensor', 'Robot/EntrySensor');

// GetComponentInParent<RVDrive>(node)
const drive = registry.findInParent<RVDrive>(node, 'Drive');

// GetComponentInChildren<RVSensor>(node)
const sensors = registry.findAllInChildren<RVSensor>(node, 'Sensor');
```

---

## 13. Scene-Boot und Ladereihenfolge

> **Implementierungsstand:** Vollständig implementiert in `rv-scene-loader.ts` (~680 Zeilen).

```
1. GLB laden (DRACO-komprimiert, ~2-8 MB typisch)
2. Phase 1 "Awake" — Einzelner GLB-Traverse:
   a. Node-Map aufbauen (Pfad → Object3D, reverse: Object3D → Pfad)
   b. Name-Deduplizierung (Three.js Spaces → Underscores, Alias-Registrierung)
   c. Signale in SignalStore registrieren (VOR Komponenten)
   d. Components per Schema instanziieren und konfigurieren
   e. Drive Behaviors zuweisen (ErraticPosition, Simple, Cylinder)
   f. BVH-Berechnung für Raycasting
3. Phase 2 "Start" — Zweiter Pass:
   a. ComponentRefs auflösen (zirkuläre Referenzen möglich)
   b. init() auf allen Komponenten aufrufen
   c. TransportSurface-Ketten verketten
   d. Sensor-Signal-Registrierung
4. Szene in Three.js Scene einhängen
5. Kamera auf Bounding Box einpassen
6. Plugin-Hooks aufrufen (onModelLoaded)
7. Simulation-Loop läuft bereits (gestartet im Constructor)
```

**Rückgabe:** `LoadResult` mit `drives[]`, `signalStore`, `registry`, `playback`, `logicEngine`, `boundingBox`, `triangleCount`, `groups`.

Die kinematische Hierarchie ist im GLB bereits korrekt (durch den Unity-Exporter). Der Browser muss kein Reparenting durchführen.

---

## 14. NodeRegistry und Suche

> **Implementierungsstand:** Vollständig implementiert in `rv-node-registry.ts` (~394 Zeilen).

### NodeRegistry

Multi-Layer-Lookup mit O(1)-Zugriff:

```typescript
class NodeRegistry {
  // Datenstrukturen
  nodes: Map<path, Object3D>           // Primär: Pfad → Node
  nodePaths: Map<Object3D, path>       // Reverse: Node → Pfad
  components: Map<path, Map<type, T>>  // Typisierte Komponenten
  typeIndex: Map<type, Set<path>>      // Typ → alle Pfade (für getAll)
  suffixMap: Map<segment, paths[]>     // Letztes Segment → Pfade (O(1) Suffix-Match)

  // Unity-ähnliche API
  getNode(path): Object3D                          // Pfad-Lookup + Normalisierung + Suffix-Fallback
  getPathForNode(node): string                     // Reverse-Lookup
  getByPath<T>(type, path): T                      // Typisierter Pfad-Lookup
  getAll<T>(type): T[]                             // FindObjectsOfType<T>()
  findInParent<T>(node, type): T                   // GetComponentInParent<T>()
  findInChildren<T>(node, type): T                 // GetComponentInChildren<T>()
  findAllInChildren<T>(node, type): T[]            // GetComponentsInChildren<T>()
  resolve(ref): { drive?, sensor?, signalAddress? } // ComponentRef auflösen
}
```

### Suche

Implementiert über `viewer.filterNodes(term)`:
- Case-insensitive Substring-Match über alle registrierten Node-Pfade
- Ergebnisse als `filteredNodes[]` und `filteredDrives[]` auf realvirtual WEB
- Treffer werden im 3D-Raum gehighlightet (bis `MAX_HIGHLIGHT_RESULTS = 20`)
- Kamera kann per Klick auf Ergebnis fokussieren

---

## 15. Simulations-Loop: FixedUpdate im Browser

> **Implementierungsstand:** Vollständig implementiert. 50 Hz FixedUpdate + Render-on-Demand.

### Accumulator-Pattern (implementiert)

```typescript
class SimulationLoop {
  private fixedTimeStep = 1 / 50;  // 20ms = 50 Hz (wie Unity)
  private accumulator = 0;
}
```

### fixedUpdate() Reihenfolge (tatsächlich implementiert)

```
1. Recording Playback       — DrivesRecorder (wenn aktiv)
2. LogicStep Engine          — Sequencer (wenn aktiv)
3. ReplayRecording           — einzelne Replays (wenn aktiv)
4. Plugin Pre Hooks          — Interface-Signale, CAM-Input
5. Core Drive Physics        — drive.update(dt) für alle Drives
6. MU Spawn/Despawn Check    — Shadow-Dirty-Flag setzen
7. Core Transport            — transportManager.update(dt) (übersprungen bei Physics-Plugin)
8. Texture Animation         — Band-Textur-Scrolling (immer)
9. Plugin Post Hooks         — Recorder, Sensor-Monitor, Interface-Readback
```

### render() Reihenfolge (tatsächlich implementiert)

```
1. FPS-Counter Update (alle 500ms)
2. Kamera-Animation (Cubic Ease-Out)
3. Damping: 60 Frames nach User-Input weiterrendern
4. OrbitControls Update
5. Highlighter Update (Tracked-Modus)
6. Render-on-Demand: GPU-Render überspringen wenn _renderDirty=false
7. Plugin Render Hooks
8. Hover-Events emittieren
9. Stats-GL Update
```

### Render-on-Demand (Performance-Feature)

Anstatt jeden Frame zu rendern, nutzt realvirtual WEB ein **Dirty-Flag-System**:
- `_renderDirty` — nur rendern wenn sich etwas Sichtbares ändert
- `_shadowsDirty` — Shadow Map nur neu berechnen wenn Geometrie sich bewegt
- `_dampingFramesRemaining` — nach User-Input 60 Frames weiterrendern (Smooth Decay)
- Ergebnis: **0% GPU-Last bei statischer Szene**

| Callback | Unity-Pendant | Verwendung |
|----------|--------------|------------|
| `onFixedUpdate(dt)` | `FixedUpdate()` | Drive-Berechnung, Transport, LogicSteps |
| `onRender()` | Internes Rendering | `renderer.render(scene, camera)` |

---

## 16. Drive-Modell

> **Implementierungsstand:** Vollständig implementiert in `rv-drive.ts` (~274 Zeilen) mit Behavior-System.

### Properties (identisch zu C#-Namensgebung)

```typescript
class RVDrive {
  Direction: DriveDirection;        // LinearX/Y/Z, RotationX/Y/Z, Virtual
  TargetSpeed: number;              // mm/s oder °/s
  Acceleration: number;             // mm/s² oder °/s²
  UseAcceleration: boolean;
  UseLimits: boolean;
  LowerLimit: number;
  UpperLimit: number;
  Offset: number;
  ReverseDirection: boolean;

  // Laufzeit-Status
  currentPosition: number;
  currentSpeed: number;
  isRunning: boolean;
  jogForward: boolean;              // Endlosfahrt (Förderbänder)
  jogBackward: boolean;
  positionOverwrite: boolean;       // Für Recording-Playback
}
```

### Drive Behaviors (datengetrieben)

Drives können durch **Behaviors** erweitert werden — identisch zum C#-Pattern:

```typescript
// Automatisch per Schema aus rv_extras instanziiert
const DRIVE_BEHAVIOR_MAP = {
  'Drive_ErraticPosition': RVErratic,    // Zufällige Positionierung
  'Drive_Simple':          RVDriveSimple, // Geschwindigkeitssteuerung per Signal
  'Drive_Cylinder':        RVDriveCylinder, // Zylinder mit Endlagensignalen
};
```

Behaviors werden VOR der Physik aufgerufen und können `targetSpeed`, `targetPosition` etc. setzen.

### Berechnung pro Tick

1. Idle-Check (Early Return)
2. Jog-Modus: Nur Geschwindigkeit setzen (Förderbänder)
3. Standard: `position += speed * dt` mit Beschleunigung/Verzögerung
4. Limits anwenden
5. Rotation: Quaternion-Komposition über Euler-Achse
6. `onAfterUpdate` Callback (für Feedback-Signale wie Endlagenschalter)

---

## 17. TransportSurface

> **Implementierungsstand:** Vollständig implementiert in `rv-transport-surface.ts` (~299 Zeilen).

### Zwei Transport-Modi

**Linear:** Position += Richtung × Geschwindigkeit × dt (Standard-Förderbänder)

**Radial:** MU wird um das Zentrum der Surface rotiert (Drehtische, Kurven). Unterstützt Turntable-Rotation für Rundtaktmaschinen.

### Textur-Animation (implementiert)

- Texturen werden geklont für unabhängige Offset-Steuerung pro Surface
- Linear: UV scrollt entlang der lokalen Transportrichtung
- Radial: UV-U rotiert basierend auf Winkelgeschwindigkeit
- Unabhängig vom MU-Transport — Animation läuft auch ohne MUs

### Auto-Start

Wenn ein Drive `targetSpeed > 0` hat aber nicht joggt, wird automatisch `drive.jogForward = true` gesetzt. Dies ermöglicht sofortigen Start beim Laden eines Modells.

### Verkettung und MU-Management

- TransportSurfaces über `next_surface` in rv_extras verknüpft
- Referenzen werden in Phase 2 (Start) aufgelöst
- MU-Übergabe: MU am Streckenende → nächste TransportSurface
- Drive-Referenz: Explizit per `DriveReference` oder Parent-Walk-Up

---

## 18. Sensor

> **Implementierungsstand:** Vollständig implementiert in `rv-sensor.ts` (~402 Zeilen) mit zwei Erkennungsmodi.

### Zwei Erkennungsmodi

**Collision (AABB-Overlap):** Sensor hat eine BoxCollider-Geometrie aus dem GLB. Prüft Overlap mit MU-AABBs. O(1) pro Test.

**Raycast (Slab-Methode):** Ray-AABB-Intersection mit konfigurierter Richtung und Länge. Kein Mesh-Traversal, O(1) pro Test. Gibt nächsten Treffer zurück.

### Visualisierung (implementiert)

**Collision-Modus:** Semi-transparente Box — gelb = frei, rot = belegt.

**Raycast-Modus:** Tube-Geometry orientiert entlang der Ray-Richtung, farbcodiert nach Status.

### Signal-Integration

- Sensor-Name wird im SignalStore registriert
- `onChanged` Callback bei Zustandsänderung
- `occupiedMU` Referenz für Grip-Erkennung (welches MU ist im Sensor?)
- Flanken-Erkennung für Event-basierte Abläufe

---

## 19. LogicStep / Sequencer

> **Implementierungsstand:** Vollständig implementiert in `rv-logic-step.ts` (~490 Zeilen) mit Composite Pattern.

### Architektur: Composite Pattern (wie Unity)

LogicSteps verwenden ein Container/Leaf-Pattern — identisch zum Unity-Konzept:

**Container:**

| Typ | Verhalten |
|-----|-----------|
| `SerialContainer` | Kinder sequenziell ausführen, optional Loop. Trackt Cycle-Times (min/max/median) |
| `ParallelContainer` | Alle Kinder gleichzeitig starten, warten bis alle fertig |

**Leaf Steps:**

| Typ | Verhalten | Blockierend? |
|-----|-----------|-------------|
| `Delay` | Warten für Duration (elapsed += dt) | Ja |
| `SetSignalBool` | Signal sofort setzen | Nein |
| `WaitForSignalBool` | Signal pollen bis Wert passt | Ja |
| `WaitForSensor` | Sensor-Occupied-Status pollen | Ja |
| `DriveTo` | Drive auf Position fahren, fertig wenn erreicht | Ja |
| `SetDriveSpeed` | Geschwindigkeit setzen | Nein |
| `RVEnable` | Sichtbarkeit togglen | Nein |

### State Machine pro Step

Jeder Step hat einen Zustand: `Idle → Active → Waiting → Finished`

### Cycle-Time Tracking (SerialContainer)

SerialContainer tracken automatisch Zykluszeiten:
- Minimale, maximale und mediane Zykluszeit
- Angezeigt in der Hierarchy-Browser UI mit Live-Status

### HMI Integration

Die HierarchyBrowser-Komponente zeigt LogicStep-Status live:
- Active = grüner Puls-Punkt
- Waiting = orangener Puls-Punkt
- Container zeigt Fortschritt (z.B. "3/7 Steps")

Mehrere parallele Sequencer möglich — jede Station ihren eigenen Ablauf.

---

## 20. Kinematische Hierarchie

Die Hierarchie im GLB entspricht der kinematischen Kette. Three.js propagiert Transforms automatisch durch die Hierarchie — genau wie Unity.

### Roboter-Beispiel

```
robot_base
  └── axis_j1 (rotary, Y) ← dreht alles darunter
        └── axis_j2 (rotary, Z) ← dreht J3–J6 mit
              └── axis_j3 (rotary, Z)
                    └── axis_j4 (rotary, X)
                          └── axis_j5 (rotary, Z)
                                └── axis_j6 (rotary, X)
                                      └── tool_flange
```

Jeder Node setzt nur seine eigene lokale Rotation auf Basis-Position plus Drive-Output.

---

## 21. Raycasting und Objekt-Selektion

Three.js Raycaster für Klick-Interaktion. Bei 500–2000 Meshes unter einer Millisekunde. Trifft einen Mesh → Parent-Suche zum nächsten rv_extras-Node (wie `GetComponentInParent<>()` in Unity).

---

## 22. Highlight-System

> **Implementierungsstand:** Implementiert in `rv-highlight-manager.ts` mit orangem Overlay.

### Implementierte API

```typescript
viewer.highlightByPath(path, tracked?)  // Oranges Overlay auf Node-Hierarchie
viewer.clearHighlight()                  // Highlight entfernen
```

- **tracked = true:** Overlays folgen bewegten Teilen jeden Frame (für laufende Drives)
- **Sensor-Erkennung:** Automatisch inkl. Sensor-Visualisierung im Highlight
- **depthTest: false** — auch durch Gehäuse sichtbar

| Modus | Beschreibung | Einsatz |
|-------|-------------|---------|
| Orange Overlay | Halbtransparentes Material über Mesh-Hierarchy | Selektion, Suche, Hover |
| Tracked | Overlay-Position wird per-Frame aktualisiert | Laufende Drives/MUs |

---

## 23. Kameraführung

OrbitControls als Standard. Kamera-Presets mit Smooth-Transition (Ease-Out Cubic). Fokus auf Objekt bei Doppelklick (Bounding-Box-basiert). FlyControls für Walkthrough-Modus.

---

# Teil IV — PLC-Konnektivität

---

## 24. Verbindungswege Browser → PLC

### Stufe 1: REST direkt (S7-1500 Web API)

```
Browser ←HTTPS/REST 2–5 Hz→ S7-1500
```

Siemens bietet ein offizielles npm-Paket: `@siemens/simatic-s7-webserver-api` (TypeScript). Kein Server nötig. Polling alle 200–500ms. Für Status, KPIs, Alarme ausreichend. GLB plus realvirtual WEB können direkt auf der PLC als Web-App gehostet werden.

Einschränkung: Kein Push, kein WebSocket. Nicht geeignet für flüssige 3D-Animation.

### Stufe 2: MQTT mit WebSocket

```
Browser ←MQTT/WebSocket→ MQTT Broker ←MQTT/TCP→ S7-1500
```

Die S7-1500 hat einen offiziellen MQTT-Client-Baustein (`LMQTT_Client`). Der Broker (z.B. Mosquitto) unterstützt MQTT over WebSocket. Push-basiert, kein Polling. Update-Rate 20–100Hz. Braucht nur einen Broker, keinen eigenen Server.

### Stufe 3: WebSocket-Proxy

```
Browser ←WebSocket→ Node.js Proxy ←REST/S7→ PLC
```

Leichtgewichtiger Node.js-Prozess, der die S7 pollt und per WebSocket weiterleitet. Flexibel, aber erfordert einen Server-Prozess.

### Stufe 4: realvirtual Core

```
Browser ←WebSocket→ Core ←S7/ADS/OPC UA→ PLC
```

Volle Power: Alle PLC-Protokolle, Drive-Simulation, Sensor-Emulation, Alarm-Management.

---

## 25. Offenes WebSocket-Protokoll: Eigene Bridge des Kunden

### Prinzip

Der realvirtual WEB definiert ein offenes, dokumentiertes WebSocket-Protokoll. Jeder kann eine eigene Bridge bauen — realvirtual WEB ist agnostisch gegenüber der Datenquelle. Ob die Daten von einer Siemens S7, einer Beckhoff CX, einer Codesys-Runtime, einer Rockwell ControlLogix oder einem komplett proprietären System kommen, ist realvirtual WEB egal. Solange die Nachrichten dem Protokoll entsprechen, funktioniert alles.

Das heißt: Der Endkunde, der Maschinenbauer oder der Systemintegrator kann seine eigene Bridge in jeder beliebigen Sprache entwickeln — Python, Node.js, C#, Go, C++, Rust — und realvirtual WEB damit verbinden. Die Bridge liest Daten aus dem eigenen System und sendet sie im rv-Protokoll per WebSocket.

### Nachrichtentypen: Bridge → realvirtual WEB

**Signal-Update (hochfrequent):**

```json
{
  "type": "signals",
  "timestamp": 1709567890123,
  "values": {
    "PLC1.DB100.DBD0": 1.452,
    "PLC1.DB100.DBX4.0": true,
    "PLC1.DB200.DBW10": 847,
    "PLC1.DB100.DBD0[6]": [12.5, -45.0, 90.0, 0.0, 33.2, -15.8]
  }
}
```

**Transform-Update (hochfrequent, optional — nur wenn Bridge Transforms berechnet):**

```json
{
  "type": "transforms",
  "timestamp": 1709567890123,
  "data": {
    "axis_j1": { "p": [0, 0.5, 0], "r": [0, 0.707, 0, 0.707] },
    "axis_j2": { "p": [0, 1.2, 0], "r": [0, 0, 0.259, 0.966] }
  }
}
```

**Alarm:**

```json
{
  "type": "alarm",
  "id": "alm_001",
  "timestamp": 1709567890123,
  "severity": "critical",
  "message": "Überstrom erkannt",
  "rv_ref": "drive_conv_03",
  "signal_ref": ["PLC1.DB100.DBD20"]
}
```

**Alarm aufgehoben:**

```json
{
  "type": "alarm_clear",
  "id": "alm_001",
  "timestamp": 1709567895000
}
```

**Anlagenzustand (niederfrequent, ~1 Hz):**

```json
{
  "type": "state",
  "mode": "auto",
  "running": true,
  "error": false,
  "kpis": {
    "oee": 87.2,
    "cycle_time": 11.3,
    "parts_per_hour": 312
  }
}
```

**Sync-Antwort (einmalig bei Verbindungsaufbau):**

```json
{
  "type": "sync_response",
  "alarms": [ ... alle aktiven Alarme ... ],
  "state": { "mode": "auto", "running": true },
  "signals": { ... aktuelle Werte aller Signale ... }
}
```

**Signal-Historie (auf Anfrage):**

```json
{
  "type": "signal_history",
  "signal": "PLC1.DB100.DBD0",
  "interval_ms": 100,
  "data": [1.44, 1.45, 1.45, 1.46, 1.45, 1.44]
}
```

### Nachrichtentypen: realvirtual WEB → Bridge

```json
{ "type": "sync_request" }
{ "type": "set_signal", "signal": "PLC1.DB200.DBX0.0", "value": true }
{ "type": "acknowledge_alarm", "id": "alm_001" }
{ "type": "subscribe_signal", "signal": "PLC1.DB100.DBD0" }
{ "type": "unsubscribe_signal", "signal": "PLC1.DB100.DBD0" }
{ "type": "request_history", "signal": "PLC1.DB100.DBD0", "duration_s": 300 }
```

### Zwei Modi der Bridge

**Signal-Modus (einfach):** Die Bridge sendet nur rohe Signalwerte (`type: "signals"`). realvirtual WEB hat die Drive-Modelle in TypeScript und berechnet Transforms selbst aus den empfangenen Signalwerten. Die Bridge muss nichts über Kinematik wissen — sie liest PLC-Variablen und schickt sie weiter.

**Transform-Modus (vollständig):** Die Bridge berechnet auch die Transforms und sendet fertige Positionen/Rotationen (`type: "transforms"`). realvirtual WEB setzt sie direkt auf die Nodes. Das ist der Modus, den der realvirtual Core nutzt.

Der Signal-Modus ist für Kunden einfacher zu implementieren — sie müssen nur Variablen lesen und als JSON senden. realvirtual WEB erledigt den Rest. Das senkt die Einstiegshürde massiv.

### Beispiel: Minimale Bridge in Python

```python
import asyncio
import websockets
import json
import snap7  # S7-Kommunikation

plc = snap7.client.Client()
plc.connect("192.168.1.10", 0, 1)

async def bridge(websocket):
    while True:
        # Signale aus der PLC lesen
        db = plc.db_read(100, 0, 20)
        speed = snap7.util.get_real(db, 0)
        position = snap7.util.get_real(db, 4)
        running = snap7.util.get_bool(db, 8, 0)

        # Im rv-Protokoll senden
        await websocket.send(json.dumps({
            "type": "signals",
            "timestamp": int(time.time() * 1000),
            "values": {
                "PLC1.DB100.DBD0": speed,
                "PLC1.DB100.DBD4": position,
                "PLC1.DB100.DBX8.0": running
            }
        }))

        await asyncio.sleep(0.05)  # 20 Hz

async def main():
    async with websockets.serve(bridge, "0.0.0.0", 8080):
        await asyncio.Future()

asyncio.run(main())
```

Das sind 25 Zeilen für eine funktionierende Bridge von S7 zum realvirtual WEB. In Node.js, Go oder C# wäre es ähnlich kompakt.

### Beispiel: Minimale Bridge in Node.js

```javascript
const WebSocket = require('ws');
const nodes7 = require('nodes7');

const plc = new nodes7();
plc.initiateConnection({ host: '192.168.1.10', port: 102 });
plc.addItems(['DB100,REAL0', 'DB100,REAL4', 'DB100,X8.0']);

const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws) => {
  const interval = setInterval(() => {
    plc.readAllItems((err, values) => {
      ws.send(JSON.stringify({
        type: "signals",
        timestamp: Date.now(),
        values: {
          "PLC1.DB100.DBD0": values['DB100,REAL0'],
          "PLC1.DB100.DBD4": values['DB100,REAL4'],
          "PLC1.DB100.DBX8.0": values['DB100,X8.0']
        }
      }));
    });
  }, 50);

  ws.on('close', () => clearInterval(interval));
});
```

### Vorteile des offenen Protokolls

- **Keine Vendor-Lock-in:** realvirtual WEB ist nicht an realvirtual Core gebunden. Kunden können ihre eigene Infrastruktur nutzen.
- **Niedrige Einstiegshürde:** Eine minimale Bridge ist 25–30 Zeilen Code. Das schafft jeder Automatisierungsingenieur mit Basis-Programmierkenntnissen.
- **Jede SPS, jedes System:** Siemens, Beckhoff, Codesys, Rockwell, Mitsubishi, Fanuc, OPC UA Server, MQTT Broker, proprietäre Systeme — alles was Daten liefern kann, kann angebunden werden.
- **Community-Bridges:** Mit dem AGPL-lizenzierten realvirtual WEB können Community-Mitglieder Bridges für verschiedene Systeme beitragen und teilen.
- **Testbarkeit:** Das Protokoll ist JSON-basiert. Man kann mit einem einfachen WebSocket-Client (z.B. Browser-DevTools) Testdaten an realvirtual WEB senden.

### Protokoll-Dokumentation

Das WebSocket-Protokoll wird als eigenes Dokument veröffentlicht — inklusive JSON-Schema-Definitionen, Beispielen für alle Nachrichtentypen, und einer Referenz-Bridge-Implementierung in Python und Node.js. Das ist der zentrale Integrationspunkt für Kunden und Partner.

---

## 26. Multi-Interface-Architektur: Austauschbare Signal-Adapter

### Prinzip

Der SignalStore im Browser ist die universelle Drehscheibe. Zwischen SignalStore und der Außenwelt sitzen austauschbare Signal-Adapter — jeder Adapter implementiert dasselbe Interface, spricht aber ein anderes Protokoll. realvirtual WEB weiß nicht, woher die Daten kommen. Er kennt nur den SignalStore.

```
┌──────────────────────────────────────────────────┐
│                    Browser                        │
│                                                   │
│  ┌─ SignalStore ──────────────────────────────┐  │
│  │  set() / get() / subscribe()               │  │
│  └──────────┬─────────┬──────────┬────────────┘  │
│             │         │          │                │
│  ┌──────────┴──┐ ┌────┴────┐ ┌──┴───────────┐   │
│  │  Beckhoff   │ │  MQTT   │ │  rv WebSocket │   │
│  │  HMI/WS    │ │  over   │ │  (eigenes     │   │
│  │  Adapter   │ │  WS     │ │  Protokoll)   │   │
│  └──────┬──────┘ └────┬────┘ └──┬────────────┘   │
│         │             │         │                 │
│  ┌──────┴──┐   ┌──────┴──┐  ┌──┴──────────┐     │
│  │  Keba   │   │  REST   │  │  Recording  │     │
│  │  WS     │   │  S7 API │  │  Playback   │     │
│  │  Adapter│   │  Adapter│  │  Adapter    │     │
│  └──────┬──┘   └────┬────┘  └──┬──────────┘     │
└─────────┼────────────┼─────────┼─────────────────┘
          │            │         │
    Beckhoff PLC   S7-1500   Datei/CDN
    (TwinCAT)    (Web API)
```

### Interface-Definition

Alle Adapter implementieren dasselbe TypeScript-Interface:

```typescript
interface ISignalAdapter {
  readonly name: string;
  readonly connected: boolean;

  connect(config: AdapterConfig): Promise<void>;
  disconnect(): void;

  // Wird vom Adapter aufgerufen wenn neue Werte kommen
  onSignals: ((values: Record<string, any>) => void) | null;
  onAlarm: ((alarm: AlarmMessage) => void) | null;
  onState: ((state: StateMessage) => void) | null;

  // Wert an PLC schreiben
  writeSignal(address: string, value: any): void;

  // Sync nach Reconnect
  requestSync(): void;
}
```

### Vorhandene Adapter

Alle folgenden Adapter existieren konzeptionell als Pendant zu den Unity-Implementierungen. Die WebSocket-basierten Adapter sind fast 1:1 im Browser nutzbar, da der Browser WebSocket nativ unterstützt.

**rv WebSocket (eigenes Protokoll):**
Das realvirtual-eigene WebSocket-Protokoll wie in Kapitel 25 definiert. Verbindet zum realvirtual Core oder zu jeder kundenspezifischen Bridge, die das rv-Protokoll implementiert.

```typescript
class RVWebSocketAdapter implements ISignalAdapter {
  readonly name = "rv-websocket";
  private ws: WebSocket | null = null;

  async connect(config: AdapterConfig): Promise<void> {
    this.ws = new WebSocket(config.url);  // z.B. ws://core:8080
    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      switch (msg.type) {
        case "signals":    this.onSignals?.(msg.values); break;
        case "transforms": this.onTransforms?.(msg.data); break;
        case "alarm":      this.onAlarm?.(msg); break;
        case "state":      this.onState?.(msg); break;
      }
    };
  }

  writeSignal(address: string, value: any): void {
    this.ws?.send(JSON.stringify({
      type: "set_signal", signal: address, value
    }));
  }
}
```

**Beckhoff ADS über WebSocket (TwinCAT HMI):**
Beckhoff bietet mit dem TwinCAT HMI Server eine native WebSocket-Schnittstelle zu ADS-Variablen. Der Browser kann direkt subscriben — kein Proxy nötig.

```typescript
class BeckhoffHMIAdapter implements ISignalAdapter {
  readonly name = "beckhoff-hmi";

  // TwinCAT HMI WebSocket spricht ein eigenes Protokoll
  // mit Symbol-basiertem Subscribe/Read/Write
  async connect(config: AdapterConfig): Promise<void> {
    // Verbindung zum TwinCAT HMI Server
    // Subscribe auf konfigurierte Symbole
    // Updates fließen push-basiert
  }
}
```

**MQTT über WebSocket:**
MQTT-Broker wie Mosquitto unterstützen MQTT over WebSocket. Der Browser subscribed direkt auf Topics — push-basiert, kein Polling.

```typescript
class MQTTAdapter implements ISignalAdapter {
  readonly name = "mqtt";
  private client: MqttClient | null = null;

  async connect(config: AdapterConfig): Promise<void> {
    this.client = mqtt.connect(config.url);  // ws://broker:9001
    this.client.subscribe(config.topicPrefix + "/#");
    this.client.on("message", (topic, payload) => {
      const address = topic.replace(config.topicPrefix + "/", "");
      const value = this.parsePayload(payload);
      this.onSignals?.({ [address]: value });
    });
  }

  writeSignal(address: string, value: any): void {
    this.client?.publish(
      this.topicPrefix + "/" + address,
      String(value)
    );
  }
}
```

**Keba WebSocket:**
Keba-Steuerungen (z.B. KeMotion) bieten ein WebSocket-Interface für Variablenzugriff. Der Adapter spricht das Keba-spezifische Protokoll.

```typescript
class KebaAdapter implements ISignalAdapter {
  readonly name = "keba";
  // Keba-spezifisches WebSocket-Protokoll
  // Variable Read/Write/Subscribe
}
```

**REST Polling (S7-1500 Web API):**
Für die direkte Anbindung an die Siemens S7-1500 ohne WebSocket. Polling-basiert.

```typescript
class RESTS7Adapter implements ISignalAdapter {
  readonly name = "rest-s7";
  private pollInterval: number | null = null;

  async connect(config: AdapterConfig): Promise<void> {
    this.pollInterval = window.setInterval(async () => {
      const values = await this.readSignals(config.signals);
      this.onSignals?.(values);
    }, config.pollRate ?? 200);
  }
}
```

**Recording Playback:**
Kein Live-System — spielt aufgezeichnete Signaldaten aus einer Datei ab. Für Standalone-Modus.

```typescript
class RecordingAdapter implements ISignalAdapter {
  readonly name = "recording";
  private data: RecordedFrame[] = [];
  private playbackIndex = 0;

  async connect(config: AdapterConfig): Promise<void> {
    const response = await fetch(config.recordingUrl);
    this.data = await response.json();
    // Playback im SimulationLoop-Takt
  }
}
```

### Adapter-Auswahl und Konfiguration

realvirtual WEB wählt den Adapter basierend auf der Konfiguration — entweder aus dem GLB Root-Node, aus URL-Parametern, oder aus einem Verbindungsdialog:

```typescript
function createAdapter(config: ViewerConfig): ISignalAdapter {
  switch (config.adapter) {
    case "rv-websocket":  return new RVWebSocketAdapter();
    case "beckhoff-hmi":  return new BeckhoffHMIAdapter();
    case "mqtt":          return new MQTTAdapter();
    case "keba":          return new KebaAdapter();
    case "rest-s7":       return new RESTS7Adapter();
    case "recording":     return new RecordingAdapter();
    default:              return new RVWebSocketAdapter();
  }
}

// Adapter an SignalStore binden
const adapter = createAdapter(config);
adapter.onSignals = (values) => signalStore.setMany(values);
adapter.onAlarm = (alarm) => alarmManager.handleAlarm(alarm);
await adapter.connect(config);
```

### Mehrere Adapter gleichzeitig

In komplexen Anlagen können mehrere Adapter parallel laufen — z.B. Beckhoff für die Antriebe und MQTT für IoT-Sensoren. Alle schreiben in denselben SignalStore. Die Signal-Adressen sind durch Präfixe eindeutig:

```typescript
const beckhoffAdapter = new BeckhoffHMIAdapter();
const mqttAdapter = new MQTTAdapter();

beckhoffAdapter.onSignals = (values) => signalStore.setMany(values);
mqttAdapter.onSignals = (values) => signalStore.setMany(values);

// Signale: "Beckhoff1.GVL.nSpeed" und "MQTT1.sensors/temp01"
// Beide landen im gleichen SignalStore
```

### Eigene Adapter entwickeln

Kunden und Integratoren können eigene Adapter entwickeln, die das `ISignalAdapter`-Interface implementieren. Der Adapter wird als npm-Paket oder als lokale TypeScript-Datei eingebunden. Das ist der erweiterbare Punkt des Systems — neue Steuerungen anbinden, ohne realvirtual WEB-Core zu ändern.

---

## 27. WebSocket-Performance

| Szenario | Zykluszeit |
|----------|-----------|
| Localhost | ~2ms |
| LAN | 5–10ms |
| WLAN | 10–15ms |
| Cloud (regional) | 50–90ms |

Für 3D-HMI mehr als ausreichend. Client-Interpolation macht 30fps Server-Updates zu 60fps Rendering.

### Bandbreite (200 Objekte, 50 Signale, 30fps)

| Format | Bandbreite/Client |
|--------|------------------|
| JSON | ~700 KB/s |
| JSON + Delta | ~140 KB/s |
| Binary + Delta | ~38 KB/s |

---

## 28. Reconnect und Browser-Lifecycle

Der Browser ist stateless. Bei Reload, Tab-Wechsel oder Verbindungsabbruch:

1. WebSocket Reconnect mit exponentiellem Backoff (1s, 2s, 4s, max 30s)
2. `sync_request` an Core → Antwort mit aktuellem Gesamtzustand
3. URL-Parameter auslesen für Kamera-Position und Selektion
4. realvirtual WEB-Zustand aus localStorage wiederherstellen (Watchlist, Panel-Layout)
5. GLB aus Browser-Cache (ETag) — kein Re-Download

Der Core ist die Wahrheit. Der Browser ist eine Ansicht, die jederzeit komplett neu aufgebaut werden kann.

---

# Teil V — HMI Overlay und Meldungssystem

---

## 29. Drei UI-Ebenen

> **Status:** Konzeptionell — noch nicht implementiert. Aktuell nur Ebene 3 (Screen-Space fest) realisiert.

### Ebene 1 — World-Space (im 3D-Raum)

HTML-Elemente an Maschinenknoten per CSS2DRenderer. Status-Badges, Wert-Labels, Mini-Sparklines, Alarm-Marker. LOD-gesteuert: weiter weg = weniger Detail.

### Ebene 2 — Screen-Space mit 3D-Referenz (schwebende Panels)

HTML-Panels mit Verbindungslinie zum 3D-Objekt. Signal-Detail-Panels, Alarm-Details, Sensor-Info, Drive-Dashboard. Verschiebbar, fixierbar, minimierbar.

### Ebene 3 — Screen-Space fest (Dashboard-Bereiche)

Fixe Bereiche am Bildschirmrand: Top-Bar (Status, KPIs), Right Panel (Alarm-Liste), Bottom Bar (Toolbar, Kamera-Presets), Left Panel (Signal-Watchlist).

Alle drei Ebenen sind durchlässig: Klick in Ebene 3 navigiert zu Ebene 1 und öffnet Ebene 2.

---

## 30. Meldungssystem

> **Status:** Konzeptionell — noch nicht implementiert. Grundlage (SignalStore + Events) vorhanden.

Jede Meldung hat eine `rv_ref` — die Referenz auf einen Node im GLB. Klick auf Meldung → Kamera fährt zum Node, Node wird highlighted, Detail-Panel öffnet sich.

Meldungsquellen: PLC-Alarme (über Core), Schwellwert-Überwachung, Zustandsänderungen, manuelle Notizen.

Meldungsfluss: Signal ändert sich → Core erkennt Alarm → WebSocket sendet Meldung → realvirtual WEB: Alarm-Liste + Marker + Highlight + optionaler Sound.

---

# Teil VI — React HMI Binding

---

## 31. SignalStore

> **Implementierungsstand:** Vollständig implementiert in `rv-signal-store.ts` (~252 Zeilen).

Zentraler, framework-agnostischer Wert-Speicher mit **Dual-Adressierung** (Name + Pfad):

```typescript
class SignalStore {
  // Primär: By Name
  set(name: string, value: boolean | number): void { }
  get(name: string): boolean | number | undefined { }
  getBool(name: string): boolean { }
  getFloat(name: string): number { }
  getInt(name: string): number { }
  subscribe(name: string, cb: (v) => void): () => void { }

  // Sekundär: By Hierarchy Path (mit Lazy-Caching)
  setByPath(path: string, value): void { }
  getByPath(path: string): boolean | number | undefined { }
  subscribeByPath(path: string, cb): () => void { }

  // Bulk (WebSocket/Interface)
  setMany(updates: Record<string, any>): void { }     // Single Version Bump

  // Version Tracking (für React Dirty-Checks)
  _version: number;  // Monotonisch steigend
}
```

- **Zwei Adressierungen:** `byName` Map (primär) + `pathToName` Map (Pfad-zu-Name Resolution)
- **Lazy Resolution:** Pfad-Lookups werden gecacht (`resolveCache`)
- **Version Tracking:** Monotonisch steigende `_version` für React useSyncExternalStore

---

## 32. React Hooks

> **Status:** Konzeptionell — noch nicht als dedizierte Hooks implementiert. Signal-Zugriff erfolgt aktuell direkt über `viewer.signalStore` mit `subscribe()` / `subscribeByPath()`.

```typescript
function useSignal(address: string): any { }            // Wert lesen
function useSignalWrite(address: string): (v: any) => void { }  // Wert schreiben
function useSignalHistory(address: string, max: number): number[] { }  // Ringbuffer
```

Die Hooks sind die einzige Brücke zwischen SignalStore und React. Jede Komponente bindet sich über eine Adresse an einen Wert. Die Datenquelle ist austauschbar.

---

## 33. UI-Komponentenbibliothek

> **Status:** Konzeptionell — noch nicht implementiert. Aktuelle HMI-Komponenten: TopBar, BottomBar, LeftPanel, PropertyInspector, HierarchyBrowser, KpiCard, ChartPanel, ButtonPanel, MessagePanel, TileCard (siehe Abschnitt 39).

### Anzeige-Komponenten (Lesen)

| Komponente | Beschreibung |
|------------|-------------|
| `SignalDisplay` | Numerischer Wert mit Label und Einheit |
| `StatusIndicator` | Boolean als farbiger Punkt |
| `StateDisplay` | Enum/Int als benannter Zustand mit Farbe |
| `Sparkline` | Inline-Trend ohne Achsen (SVG) |
| `Gauge` | Kreisanzeige mit Farbbereichen (ECharts) |
| `SignalChart` | Zeitreihe mit Schwellwerten (ECharts) |

### Eingabe-Komponenten (Schreiben)

| Komponente | Beschreibung |
|------------|-------------|
| `PushButton` | Momentan-Taster (gedrückt = true) |
| `PushButtonWithFeedback` | Taster mit Rückmelde-LED |
| `ToggleSwitch` | Ein/Aus-Schalter |
| `SelectorSwitch` | Wahlschalter mit Positionen |
| `ValueSlider` | Kontinuierliche Sollwerteingabe |
| `NumericInput` | Direkte Zahleneingabe mit Bestätigung |

### Zusammengesetzte Panels

Automatisch generiert aus rv_extras:

```tsx
function AutoPanel({ rvId }) {
  const node = rvScene.findById(rvId);
  switch (node.userData.rv_type) {
    case "Drive":     return <DrivePanel config={node.userData} />;
    case "Sensor":    return <SensorPanel config={node.userData} />;
    case "Group":     return <GroupPanel config={node.userData} />;
    default:          return <GenericSignalPanel config={node.userData} />;
  }
}
```

---

## 34. Schreib-Schutz

> **Status:** Konzeptionell — noch nicht implementiert.

Signal-Richtung wird aus rv_extras gelesen (`direction: "read"` oder `"write"`). Eingabe-Komponenten prüfen Schreibbarkeit. Nicht-schreibbare Signale werden automatisch als reine Anzeige dargestellt.

---

## 35. Performance-Richtlinien

> **Status:** Teilweise implementiert — Render-on-Demand, Raycasting-Throttling und Highlight-Pooling sind umgesetzt (siehe Abschnitt 45). World-Space-UI und ECharts-Optimierungen sind konzeptionell.

### UI-Rendering
- Max. 50 World-Space-Elemente gleichzeitig sichtbar (LOD)
- Max. 10–15 ECharts-Instanzen, max. 30 SVG-Sparklines
- Gleichheitsprüfung im Store verhindert unnötige Re-Renders
- ECharts-Updates im `requestAnimationFrame` batchen

### Daten
- Ringbuffer pro Signal: max. 3000–30.000 Einträge
- Signal-Daten als TypedArray (Float32Array) für große Arrays
- Delta-Compression für WebSocket
- Inaktive Panels zerstören ihre ECharts-Instanzen

### 3D
- CSS2DRenderer für flache Overlays (performanter als CSS3D)
- Highlight-Meshes nur bei Bedarf erzeugen
- Raycasts nur bei Maus-Events (Hover: max. 1x pro Frame)

---

# Teil VII — Implementierungsplan

---

## 36. Phasen und Implementierungsstand

### Phase 1 — Minimal Viable Product ✅ FERTIG

- ✅ GLB-Export mit korrekter Kinematik und Drive-Parametern
- ✅ Three.js: GLB laden, Scene-Boot, Drive-Komponenten
- ✅ SimulationLoop mit FixedUpdate (50 Hz Accumulator)
- ✅ Basis-Kamerasteuerung (OrbitControls)
- ✅ WebSocket-Anbindung für Live-Modus
- ✅ Signal-Anzeige und SignalStore

### Phase 2 — HMI Features ✅ FERTIG

- ✅ Vollständige rv_extras (Sensoren, TransportSurface, Gruppen, Grip, Source, Sink)
- ✅ React UI: TopBar, BottomBar, ButtonPanel, HierarchyBrowser, PropertyInspector
- ✅ Volltext-Suche mit 3D-Highlighting
- ✅ Kamera-Presets und Animation
- ✅ Plugin-System mit Lifecycle-Hooks
- ✅ Visual Settings (Lighting, Shadows, Tone Mapping)
- ⬜ Alarm/Meldungssystem (konzeptionell)
- ⬜ MQTT und REST Signal-Adapter (konzeptionell)

### Phase 3 — Standalone und Extended ✅ GROßTEILS FERTIG

- ✅ LogicStep/Sequencer mit Composite Pattern (Serial/Parallel Container)
- ✅ TransportSurface mit MU-Management (Linear + Radial)
- ✅ Sensor: AABB-Collision + Raycast mit Visualisierung
- ✅ Recording/Playback (DrivesPlayback mit Sequenzen)
- ✅ Source mit Dual-Rendering (InstancedMesh + Clone)
- ✅ Grip/GripTarget mit Pick/Place
- ✅ Rapier WASM Physics Plugin (optional)
- ⬜ Binary WebSocket Protocol (noch JSON)
- ⬜ Docker-Deployment für Core

### Phase 4 — Polish und Release 🔄 IN ARBEIT

- ✅ Render-on-Demand (Dirty-Flag-System)
- ✅ WebGPU-Unterstützung (Auto-Detection mit WebGL-Fallback)
- ✅ WebXR VR/AR Support (Quest 3)
- ✅ Groups mit Visibility/Isolation
- ✅ Maintenance Panel (Step-by-Step Guide)
- ✅ Machine Control Panel (PackML-Demo)
- ✅ KPI Cards und Demo-HMI
- ✅ LeftPanelManager für skalierbare Panel-Koordination
- ✅ Debug-System mit Kategorien
- ✅ Mobile-Responsive Layout
- ✅ Firebase Demo-Hosting
- ⬜ AGPL-Veröffentlichung (vorbereitet)
- ⬜ Vollständige Dokumentation

---

## 37. Architektur-Diagramm

```
┌──────────────────────────────────────────────────────────────────┐
│                          Browser                                  │
│                                                                   │
│  ┌─── React UI (Ebene 2+3) ──────────────────────────────────┐  │
│  │  Alarm-Liste │ KPI-Bar │ Watchlist │ Panels │ Eingaben     │  │
│  │  SignalStore ← useSignal() → Komponenten                   │  │
│  │  ContextMenuStore │ UIContextStore │ LeftPanelManager      │  │
│  │  Settings-Tabs (Model, Visual, Physics, Interfaces, Dev)   │  │
│  └──────────────────────────┬─────────────────────────────────┘  │
│                              │                                    │
│  ┌─── CSS2DRenderer (Ebene 1) ────────────────────────────────┐  │
│  │  Status-Badges │ Wert-Labels │ Sparklines │ Alarm-Icons    │  │
│  └──────────────────────────┬─────────────────────────────────┘  │
│                              │                                    │
│  ┌─── Three.js Core ────────┴────────────────────────────────┐  │
│  │                                                            │  │
│  │  RVViewer ─┬─ CameraManager (FOV, Projektion, Animation)  │  │
│  │            └─ VisualSettingsManager (Licht, Schatten, DPR) │  │
│  │                                                            │  │
│  │  Drive │ Sensor │ TransportSurface │ LogicStep │ Grip      │  │
│  │  NodeRegistry │ SelectionManager │ HighlightManager        │  │
│  │  SignalStore │ Raycaster │ OrbitControls │ SimulationLoop   │  │
│  │  Constants (MM_TO_METERS, DRAG_THRESHOLD_PX, DPR_CAP)     │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                    │
│  ┌─── Datenquellen (austauschbar) ────────────────────────────┐  │
│  │  WebSocket │ MQTT/WS │ REST (S7 API) │ Recording-File      │  │
│  └──────────────────────────┬─────────────────────────────────┘  │
└──────────────────────────────┼────────────────────────────────────┘
                               │
┌──────────────────────────────┼────────────────────────────────────┐
│  realvirtual Core │ MQTT Broker │ S7-1500 Web API (direkt)        │
│  ↕                  ↕              ↕                               │
│  S7 │ ADS │ OPC UA │ MQTT │ Fanuc │ EtherNet/IP                  │
└───────────────────────────────────────────────────────────────────┘
                               │
                     PLC / Robot Controller
```

### Architektur-Änderungen seit Originalkonzept

| Bereich | Änderung | Grund |
|---|---|---|
| **CameraManager** | Aus RVViewer extrahiert | Kamera-Logik (FOV, Projektion, Animation, Viewport-Offset) als eigene Klasse |
| **VisualSettingsManager** | Aus RVViewer extrahiert | Licht, Schatten, Tone Mapping, DPR als eigene Klasse |
| **ContextMenuStore** | Neu | Plugin-erweiterbare Kontextmenüs per Rechtsklick/Long-Press |
| **UIContextStore** | Neu | Kontext-abhängige UI-Sichtbarkeit (FPV, Planner, Maintenance, XR, Kiosk) |
| **SelectionManager** | Neu | Zentralisierte Objekt-Selektion mit Events und Highlight-Integration |
| **Settings-Tabs** | TopBar aufgeteilt | 1788→319 Zeilen; Tabs in `settings/` Verzeichnis extrahiert |
| **Constants** | Neu (`rv-constants.ts`) | Magic Numbers zentralisiert (MM_TO_METERS, DRAG_THRESHOLD_PX, DPR_CAP) |

---

# Teil VIII — Implementierte Systeme (nicht im Originalkonzept)

Die folgenden Systeme wurden während der Implementierung entwickelt und sind produktiv im Einsatz. Sie waren im Originalkonzept nicht enthalten.

---

## 38. Plugin-System

realvirtual WEB verwendet ein erweiterbares Plugin-System für modulare Funktionalität.

### Plugin Interface

```typescript
interface RVViewerPlugin {
  id: string;                               // Eindeutige Plugin-ID
  order?: number;                           // Ausführungsreihenfolge (Default: 100)
  slots?: UISlotEntry[];                    // UI-Slot-Registrierungen für React
  handlesTransport?: boolean;               // Physics-Plugin übernimmt Transport

  // Lifecycle Hooks
  onModelLoaded?(result: LoadResult, viewer: RVViewer): void;
  onModelCleared?(viewer: RVViewer): void;
  onFixedUpdatePre?(dt: number): void;      // Vor Drive-Physik
  onFixedUpdatePost?(dt: number): void;     // Nach Drive/Transport
  onRender?(frameDt: number): void;         // Letztes im Render-Pass
  onConnectionStateChanged?(state, viewer): void;
  dispose?(): void;
}
```

### Registrierung

```typescript
viewer
  .use(new InterfaceManager())      // WebSocket/MQTT/ctrlX Adapter
  .use(new RapierPhysicsPlugin())   // WASM Physik (optional)
  .use(new WebXRPlugin())           // VR/AR für Quest 3
  .use(new DriveOrderPlugin())      // Topologische Drive-Sortierung
  .use(new SensorMonitorPlugin())   // Sensor-Zustandsänderungen
  .use(new TransportStatsPlugin())  // MU/Surface Statistiken
  .use(new KpiDemoPlugin())         // KPI-Berechnungen
  .use(new DemoHMIPlugin())         // Demo-HMI (KPI Cards, Buttons, Overlays)
  .use(new MaintenancePlugin())     // Wartungs-Wizard
  .use(new MachineControlPlugin())  // PackML Machine Control Demo
  .use(new RvExtrasEditorPlugin()); // Hierarchy Browser + Property Inspector
```

### Plugin-Caching

Plugins werden bei Registrierung in gecachte Listen einsortiert (nach `order`). Nur Plugins mit relevanten Hooks werden pro Frame aufgerufen — O(1) statt O(n).

### UI-Slot-System

Plugins registrieren React-Komponenten in benannten Slots:

```typescript
const slots: UISlotEntry[] = [
  { slot: 'kpi-bar',      component: OeeKpi,        order: 10 },
  { slot: 'button-group', component: DrivesButton,   order: 10 },
  { slot: 'button-group', component: SensorsButton,  order: 20 },
  { slot: 'button-group', component: MaintenanceBtn, order: 40 },
];
```

---

## 39. HMI-Implementierung

### Implementierte UI-Komponenten

| Komponente | Beschreibung | Status |
|------------|-------------|--------|
| **TopBar** | Rechts oben: Hierarchy/VR/Settings Buttons, Settings-Panel mit 6 Tabs | ✅ |
| **BottomBar** | Zentrierte Suche mit Live-Dropdown, Kamera-Presets | ✅ |
| **ButtonPanel** | Linke Sidebar mit Plugin-Buttons, Logo, Status-Indikator | ✅ |
| **HierarchyBrowser** | Vollständiger Szenenbaum mit Live-Signal-Werten und LogicStep-Status | ✅ |
| **PropertyInspector** | Komponentenfelder mit Editoren, Override-System, Live-Drive-Daten | ✅ |
| **GroupsOverlay** | Draggbare Gruppe-Visibility-Steuerung mit Isolationsmodus | ✅ |
| **MaintenancePanel** | Step-by-Step Wartungsanleitung mit ISA-101 Farben | ✅ |
| **MachineControlPanel** | PackML-Demo: State Machine, Mode Selector, 3D-Integration | ✅ |
| **KpiCards** | OEE, Parts/h, Cycle Time, Power mit Sparklines | ✅ |
| **WelcomeModal** | Onboarding-Dialog mit Feature-Highlights | ✅ |
| **DriveTooltip** | Hover/Pinned Tooltip mit Drive-Position und Speed | ✅ |
| **ChartPanel** | Wiederverwendbare draggbare/resizable Panel-Basis | ✅ |

### Settings-Tabs (TopBar)

1. **Model** — Modell-Auswahl, Renderer (WebGL/WebGPU)
2. **Visual** — Lighting, Tone Mapping, Shadows, Antialiasing
3. **Physics** — Rapier.js Toggle, Gravity, Friction, Substeps
4. **Interfaces** — WebSocket, ctrlX, MQTT, TwinCAT Konfiguration
5. **Dev Tools** — FPS Overlay, GPU Benchmark, Performance Budgets
6. **Tests** — Feature Test Runner

### LeftPanelManager (Panel-Koordination)

Koordiniert alle linken Panels — nur ein Panel gleichzeitig geöffnet ("Last One Wins"):

```typescript
viewer.leftPanelManager.toggle('hierarchy', 350);        // Hierarchy Browser
viewer.leftPanelManager.toggle('settings', 540);          // Settings Panel
viewer.leftPanelManager.toggle('machine-control', 320);   // Machine Control
```

ButtonPanel liest den aktiven Panel-Offset und verschiebt sich automatisch.

---

## 40. Moving Units (MU) — Hybrid-Rendering

### Zwei Rendering-Pfade

**InstancedMesh (Performance):** Für einfache Single-Mesh MUs (Boxen, Zylinder).
- Pre-allocated InstancedMesh mit Parallel-Float32Arrays für Positionen/Quaternions
- Swap-and-Pop Release für O(1) Entfernung
- Auto-Growth bei Pool-Erschöpfung (2x)
- IMUAccessor Interface für einheitlichen Zugriff

**Object3D Clone (Qualität):** Für komplexe Multi-Mesh MUs.
- Standard Three.js `clone()` mit Visibility-Wiederherstellung
- Flexibler, aber langsamer bei hoher MU-Anzahl

### Source (Spawner)

- Template-Analyse: `analyzeTemplate()` prüft ob Single-Mesh
- Single-Mesh → InstancedMesh Pool
- Multi-Mesh → Clone Fallback
- **Spawn-Modi:** Interval (Timer), Distance (Abstand zum letzten MU), OnSignal

### Sink

- Markiert MUs als `markedForRemoval = true`
- Tatsächliche Entfernung im Transport-Loop (deferred)
- Übersprungen für gegriffene MUs und instanced MUs

---

## 41. Grip-System (Pick & Place)

### Zwei Pick-Modi

**Sensor-basiert:** Verwendet `PartToGrip` Sensor's `occupiedMU` Referenz

**Range-basiert:** Sphere-AABB Overlap mit `GripRange` (mm)

### Zwei Place-Modi

**Auto:** Findet nächstes freies GripTarget innerhalb `GripTargetSearchRadius`

**Statisch:** Release an aktueller Position

### Signal-Steuerung

- `SignalPick` / `SignalPlace` als ComponentRefs
- Rising-Edge Detection (Flankenerkennung)
- `OneBitControl`: PlaceObjects = !PickObjects

### GripTarget

Einfacher Zustandscontainer: `occupiedBy: MU | null`, `isFree` Property, `AlignPosition`/`AlignRotation` Flags.

---

## 42. DrivesPlayback (Recording)

Frame-basiertes Recording-Playback System:

- **Format:** Flat Array (`positions[frame * driveCount + driveIndex]`)
- **Sequences:** Benannte Frame-Bereiche für Teilwiedergabe
- **Modi:** `play()` (Loop), `playSequence(name)` (Einmal), `seekToPercent(pct)`
- Setzt `drive.positionOverwrite = true` um Physics zu überspringen
- Deferred Release: Behält Overwrite einen extra Tick für `onAfterUpdate` Callbacks

---

## 43. Debug-System

Strukturiertes Logging mit Per-Kategorie Toggles:

```
?debug=all                  // Alle aktivieren
?debug=playback,loader      // Spezifische Kategorien
localStorage.setItem('rv-debug', 'loader,transport')
```

| Kategorie | Beschreibung |
|-----------|-------------|
| `loader` | GLB Loading, Node-Registrierung |
| `playback` | DrivesPlayback, ReplayRecording |
| `drive` | Drive Updates, positionOverwrite |
| `transport` | TransportSurface, MU-Bewegung |
| `sensor` | Sensor Collision, Occupancy |
| `logic` | LogicStep Execution |
| `signal` | Signal Store Changes |
| `erratic` | Erratic Driver |
| `grip` | Grip Pick/Place |
| `parity` | GLB Extras Parity Validation |

**Zero Overhead in Produktion:** Alle Debug-Ausgaben werden im Build eliminiert.

---

## 44. WebGPU und WebXR

### WebGPU

- Auto-Detection beim Start: WebGPU wenn Browser unterstützt, sonst WebGL Fallback
- Touch-Geräte verwenden immer WebGL (WebGPU auf Mobile noch instabil)
- `viewer.isWebGPU` Property zum Abfragen des aktiven Backends

### WebXR (VR/AR)

- Quest 3 Support via WebXR Plugin
- VR-Modus: Immersive Szenenansicht
- AR-Modus: Hit-Test für Platzierung
- Controller-Input: Select-Events
- QR-Code Modal für schnellen Mobile-Zugriff

---

## 45. Performance-Optimierungen (implementiert)

### Render-on-Demand

- `_renderDirty` Flag: GPU-Render nur wenn sich etwas ändert
- `_shadowsDirty` Flag: Shadow Map nur bei Geometrie-Änderung
- `_dampingFramesRemaining`: 60 Frames nach User-Input (Smooth Decay)
- **Ergebnis:** 0% GPU-Last bei statischer Szene

### InstancedMesh für MUs

- Hohe MU-Anzahlen (100+) mit nur einem Draw Call
- Parallel Float32Arrays für CPU-effiziente Position-Updates
- Swap-and-Pop für O(1) Allocation/Deallocation

### Sensor-Optimierung

- AABB-basierte Collision statt Mesh-Raycasting
- Slab-Methode für Ray-AABB (O(1) pro Test)
- Kein Mesh-Traversal nötig

### Plugin-Caching

- Plugins werden bei Registrierung in gecachte Lifecycle-Listen sortiert
- Pro Frame: Nur relevante Hooks aufgerufen (nicht alle Plugins iteriert)

### Extras-Validator (Dev-Only)

- Parity-Check zwischen C# Export und TypeScript Parser
- CONSUMED + IGNORED Listen pro Komponententyp
- Zeigt unbekannte Felder im GLB → hilft bei neuen Features
- Zero Overhead in Produktion

---

## 46. Implementierte Event-Liste

Das Event-System unterstützt typisierte Events:

| Event | Payload | Beschreibung |
|-------|---------|-------------|
| `model-loaded` | `{ result: LoadResult }` | GLB geladen und geparst |
| `model-cleared` | — | Modell entfernt |
| `drive-hover` | `{ drive, clientX, clientY }` | Drive-Hover (Backward-Compat) |
| `drive-focus` | `{ drive, node }` | Drive fokussiert (Tooltip gepinnt) |
| `sensor-changed` | `{ sensorPath, occupied }` | Sensor Zustandsänderung |
| `mu-spawned` | `{ totalSpawned }` | MU erzeugt |
| `mu-consumed` | `{ totalConsumed }` | MU vernichtet |
| `drive-at-target` | `{ drivePath, position }` | Drive hat Ziel erreicht |
| `object-hover` | `{ node, path }` | Generisches Objekt-Hover |
| `object-clicked` | `{ path }` | Klick auf 3D-Objekt |
| `object-focus` | `{ path }` | Doppelklick auf 3D-Objekt |
| `connection-state-changed` | `{ state, previous }` | Verbindungsstatus |
| `camera-animation-done` | `{ targetPath? }` | Kamera-Animation abgeschlossen |
| `machine-control-changed` | `{ state, mode, components }` | Machine Control Status |
| `xr-session-start/end` | — | WebXR Session |

---

## 47. Technologie-Stack (aktuell, März 2026)

| Schicht | Technologie | Version | Zweck |
|---------|-----------|---------|-------|
| Sprache | TypeScript | 5.x | Typsicher, C#-nah |
| 3D-Engine | Three.js | 0.172+ | Rendering, Szenegraph |
| GPU Backend | WebGPU / WebGL | Auto-Detection | Rendering |
| UI-Framework | React + MUI | 18.x + MUI 6 | HMI-Panels, Overlays |
| Charts | SVG Sparklines | — | Signal-Visualisierung |
| Physik | Rapier.js (WASM) | Optional | Kollision, Schwerkraft |
| VR/AR | WebXR API | — | Quest 3 Support |
| Build | Vite | 6.x | Schnelles Dev und Build |
| Test | Vitest | — | Unit Tests |
| Kommunikation | WebSocket, MQTT | — | Live-Daten |
