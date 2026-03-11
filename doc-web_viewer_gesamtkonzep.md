# realvirtual Web Viewer — Gesamtkonzept

## Technische Spezifikation für den Browser-basierten 3D-HMI Viewer

**Version:** 1.0  
**Stand:** März 2025  
**Status:** Konzeptphase

---

# Teil I — Strategie und Überblick

---

## 1. Vision

Der realvirtual Web Viewer erweitert die realvirtual-Plattform um einen browserbasierten 3D-HMI. Während Unity das Werkzeug für Engineering und Virtual Commissioning bleibt, bietet der Web-Viewer eine Zero-Install-Lösung für Monitoring, Präsentation, Schulung und Remote-Zugriff.

### Zwei-Plattform-Strategie

- **Unity** = Engineering, Virtual Commissioning, PLC-Test, hochperformante Simulation
- **Three.js Web Viewer** = Monitoring, Präsentation, Remote-Zugriff, Zero Install

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

Three.js ist für den Web-Viewer in jeder Hinsicht überlegen. Unity WebGL wäre nur sinnvoll, wenn die Unity-Szene 1:1 im Browser gezeigt werden soll — was hier nicht der Fall ist.

---

## 5. Deployment-Strategie

### Drei Produktvarianten

| Variante | Server | Datenquelle | Anwendung |
|----------|--------|------------|-----------|
| **Web Viewer Live** | realvirtual Core | WebSocket (Transforms + Signale) | Monitoring, HMI, Full Simulation |
| **Web Viewer Standalone** | Keiner (statisches Hosting) | Recording-Datei oder Eigenberechnung | Vertrieb, Schulung, Demos |
| **Web Viewer Direct** | Nur MQTT-Broker (optional) | REST an S7 Web API oder MQTT | Monitoring ohne Server |

Alle drei Varianten nutzen denselben Viewer-Code. Nur die Datenquelle unterscheidet sich.

### Stabilität des Core

Für den Live-Modus muss der Core als Dienst laufen — Docker-Container oder Windows-Service. Automatischer Neustart, PLC-Reconnect, Health-Check-Endpoints. Der Core ist das Produkt, der Browser-Viewer ist die Oberfläche.

---

## 6. Lizenzmodell: AGPL + Commercial Dual Licensing

### Open Source (AGPL)

Der Web-Viewer-Core wird unter AGPL veröffentlicht. AGPL schließt die SaaS-Lücke: Wenn Nutzer über ein Netzwerk mit der Software interagieren, gilt das als Verteilung — der gesamte darauf aufbauende Code muss ebenfalls unter AGPL veröffentlicht werden.

Für einen Web-Viewer greift die AGPL praktisch immer im kommerziellen Kontext — er wird per Definition über ein Netzwerk genutzt.

### Commercial License (kostenpflichtig)

Unternehmen, die den Viewer in geschlossene, proprietäre Produkte einbauen wollen, kaufen die kommerzielle Lizenz. Kein Zwang zur Offenlegung.

### Was Open Source ist (AGPL)

Three.js Viewer Core, GLB Loader mit rv_extras Parsing, Drive/Sensor/Transport als TypeScript-Komponenten, SimulationLoop, Scene Registry und Volltext-Suche, Highlight-System, MQTT und REST Signal-Adapter, Basis-UI-Komponenten, Recording-Playback, Dokumentation und Beispiel-GLBs.

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

# Teil III — Three.js Viewer-Core

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

Jede realvirtual-Komponente existiert als TypeScript-Klasse mit identischem Namen wie in C#:

```typescript
interface RVComponent {
  readonly type: string;
  update(dt: number): void;
}

class Drive implements RVComponent { }
class Sensor implements RVComponent { }
class TransportSurface implements RVComponent { }
class Source implements RVComponent { }
class Sink implements RVComponent { }
class Gripper implements RVComponent { }
class LogicStep implements RVComponent { }
class MU implements RVComponent { }
class Cam implements RVComponent { }
```

Components werden über `userData` an Three.js Nodes gehängt — konzeptionell identisch zu Unity's Component-System:

```typescript
// Wie AddComponent<Drive>()
node.userData.rvComponent = new Drive(extras, node);

// Wie GetComponent<Drive>()
const drive = node.userData.rvComponent as Drive;
```

### Factory

```typescript
class ComponentFactory {
  static create(extras: any, node: THREE.Object3D): RVComponent | null {
    switch (extras.rv_type) {
      case "Kinematic":        return new Drive(extras, node);
      case "Drive":            return new Drive(extras, node);
      case "Sensor":           return new Sensor(extras, node);
      case "TransportSurface": return new TransportSurface(extras, node);
      case "Source":           return new Source(extras, node);
      case "Sink":             return new Sink(extras, node);
      case "Gripper":          return new Gripper(extras, node);
      case "LogicStep":        return new LogicStep(extras, node);
      case "MU":               return new MU(extras, node);
      case "Cam":              return new Cam(extras, node);
      default:                 return null;
    }
  }
}
```

---

## 13. Scene-Boot und Ladereihenfolge

```
1. GLB laden
2. Node-Map aufbauen (rv_id → THREE.Object3D)
3. Basis-Transforms speichern (Ruhezustand)
4. Components anhängen (Drive, Sensor, etc. aus rv_extras)
5. Referenzen auflösen (TransportSurface-Ketten, Sensor-Zonen, Sequencer)
6. Scene-Registry aufbauen (Typ-Index, Such-Index)
7. Szene in Three.js einhängen
8. Datenquelle verbinden (WebSocket / MQTT / REST / Recording)
9. Simulation-Loop starten
```

Die kinematische Hierarchie ist im GLB bereits korrekt (durch den Unity-Exporter). Der Browser muss kein Reparenting durchführen.

---

## 14. Scene-Registry und Volltext-Suche

### Registry

Einmalig beim Laden aufgebaut — O(1)-Lookups danach:

```typescript
class RVScene {
  // Wie FindObjectsOfType<Drive>()
  findByType(type: string): THREE.Object3D[] { }

  // Wie GetComponent auf spezifischem Objekt
  findById(id: string): THREE.Object3D | undefined { }
}
```

### Volltext-Suche

Alle suchbaren Felder (rv_id, rv_name, rv_type, rv_group, rv_tags, Signal-Adressen) werden in einen Lowercase-String pro Node zusammengefasst. Suche prüft ob alle Suchbegriffe enthalten sind. Bei 1000 Nodes unter einer Millisekunde.

Suchergebnisse werden im 3D-Raum visualisiert: Treffer highlighten, Rest abdunkeln, Kamera fokussieren.

---

## 15. Simulations-Loop: FixedUpdate im Browser

### Das Problem

`requestAnimationFrame` ist nicht garantiert regelmäßig. Garbage Collection, Tab-Wechsel, CPU-Last — alles stört das Timing. Drive-Berechnungen mit variablem deltaTime führen zu Sprüngen.

### Die Lösung: Accumulator-Pattern

```typescript
class SimulationLoop {
  private fixedTimeStep = 1 / 60;  // 16.6ms
  private accumulator = 0;

  onFixedUpdate: ((dt: number) => void) | null = null;  // Drives, Logik
  onUpdate: ((dt: number) => void) | null = null;        // Kamera, UI
  onRender: (() => void) | null = null;                   // Three.js

  private tick = (): void => {
    const frameTime = Math.min(elapsed, 0.1);  // Cap bei 100ms
    this.accumulator += frameTime;

    while (this.accumulator >= this.fixedTimeStep) {
      this.onFixedUpdate?.(this.fixedTimeStep);  // Immer gleiches dt
      this.accumulator -= this.fixedTimeStep;
    }

    this.onUpdate?.(frameTime);
    this.onRender?.();
    requestAnimationFrame(this.tick);
  };
}
```

| Callback | Unity-Pendant | Verwendung |
|----------|--------------|------------|
| `onFixedUpdate(dt)` | `FixedUpdate()` | Drive-Berechnung, Signal-Verarbeitung |
| `onUpdate(dt)` | `Update()` | Kamera, UI-Overlays, LOD |
| `onRender()` | Internes Rendering | `renderer.render(scene, camera)` |

Standalone-Modus: FixedUpdate essentiell. Live-Modus: Einfaches Lerp im Update reicht.

---

## 16. Drive-Modell

### Berechnung pro Tick

1. Bremsweg: `s = v² / (2 * a)`
2. Entscheidung: Beschleunigen oder Bremsen basierend auf Restdistanz vs. Bremsweg
3. Geschwindigkeit anpassen mit Rampe
4. Position aktualisieren: `position += speed * deltaTime`
5. Limits prüfen
6. Zielerkennung

Identisch zur C#-Version — gleiche Formeln, gleiche Reihenfolge. Unit Tests können dieselben Ein-/Ausgabe-Paare verwenden.

### Steuerung

```typescript
drive.moveToPosition(1.5);    // Positionierung
drive.moveAtSpeed(0.5);       // Endlosfahrt (Förderband)
drive.stop();                  // Verzögerung bis Stillstand
```

---

## 17. TransportSurface

Die komplexeste Komponente — verwaltet Teile (MUs) auf einer Transportstrecke.

### Kernlogik

- Liste von MUs mit Position auf der Strecke
- Pro Tick: Alle MUs um `speed * dt` entlang der Transportrichtung bewegen
- 3D-Position aus Streckenstart + Richtung × Position berechnen
- Stau-Logik: MU darf nicht in vorheriges MU reinfahren
- Übergabe: MU am Streckenende → nächste TransportSurface via `next_surface`
- Sensor-Zonen: Positionsbasierte Erkennung der passierenden MUs
- Band-Animation: Textur-Offset auf dem Belt-Mesh

### Verkettung

TransportSurfaces werden über `next_surface` im rv_extras verknüpft. Beim Laden werden die Referenzen aufgelöst und die Nachbar-Surfaces verlinkt.

---

## 18. Sensor mit Raycast

Three.js hat einen eingebauten Raycaster — keine Physik-Engine nötig.

### Prinzip

Der Sensor schießt pro Tick einen Strahl in die konfigurierte Richtung. Trifft der Strahl ein MU oder ein detektierbares Objekt, wird der Sensor aktiv. Flanken-Erkennung (Aktivierung/Deaktivierung) löst Callbacks aus.

### Visualisierung

Der Sensorstrahl wird als Three.js Line gerendert — rot bei Treffer, grün bei frei. Ein kleiner Sphere-Marker zeigt den Trefferpunkt.

### Performance-Optimierung

- **Layer-Filter:** Sensoren raycasten nur gegen Layer 2 (MUs und detektierbare Objekte). Maschinengeometrie wird ignoriert.
- **Intervall-Drosselung:** Nicht jeden Frame raycasten — alle 2–3 Frames reicht.
- **Bounding-Box Vorprüfung:** Ist überhaupt ein MU in der Nähe?

Mit diesen Maßnahmen laufen auch 50 Raycast-Sensoren problemlos im Browser.

---

## 19. LogicStep / Sequencer

LogicSteps definieren Abläufe: Warte auf Bedingung → führe Aktionen aus → gehe zum nächsten Step.

### Bedingungstypen

| Typ | Beschreibung |
|-----|-------------|
| `signal_equals` | Signal hat bestimmten Wert |
| `drive_at_target` | Drive hat Zielposition erreicht |
| `sensor_active` | Sensor ist belegt |
| `delay` | Zeitverzögerung abgelaufen |

### Aktionstypen

| Typ | Beschreibung |
|-----|-------------|
| `drive_to_position` | Drive auf Position fahren |
| `drive_at_speed` | Drive mit Geschwindigkeit fahren |
| `drive_stop` | Drive stoppen |
| `set_signal` | Signalwert setzen |

LogicSteps laufen im FixedUpdate und werden sowohl im Standalone-Modus (Eigenberechnung) als auch im Live-Modus (als Animationssequenzer getriggert durch PLC-Signale) verwendet.

Mehrere parallele Sequencer sind möglich — jede Station ihren eigenen Ablauf.

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

Vier Modi, alle basierend auf `depthTest: false` — auch durch Gehäuse sichtbar:

| Modus | Beschreibung | Einsatz |
|-------|-------------|---------|
| X-Ray | Halbtransparent durch alles | Suchergebnisse |
| Outline | Leuchtkontur per Shader | Selektion |
| Pulse | Periodisch pulsierend | Aktive Alarme |
| Bounding Box | Wireframe-Kasten | Gruppenauswahl |

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

Siemens bietet ein offizielles npm-Paket: `@siemens/simatic-s7-webserver-api` (TypeScript). Kein Server nötig. Polling alle 200–500ms. Für Status, KPIs, Alarme ausreichend. GLB plus Viewer können direkt auf der PLC als Web-App gehostet werden.

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

Der realvirtual Web Viewer definiert ein offenes, dokumentiertes WebSocket-Protokoll. Jeder kann eine eigene Bridge bauen — der Viewer ist agnostisch gegenüber der Datenquelle. Ob die Daten von einer Siemens S7, einer Beckhoff CX, einer Codesys-Runtime, einer Rockwell ControlLogix oder einem komplett proprietären System kommen, ist dem Viewer egal. Solange die Nachrichten dem Protokoll entsprechen, funktioniert alles.

Das heißt: Der Endkunde, der Maschinenbauer oder der Systemintegrator kann seine eigene Bridge in jeder beliebigen Sprache entwickeln — Python, Node.js, C#, Go, C++, Rust — und den Viewer damit verbinden. Die Bridge liest Daten aus dem eigenen System und sendet sie im rv-Protokoll per WebSocket.

### Nachrichtentypen: Bridge → Viewer

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

### Nachrichtentypen: Viewer → Bridge

```json
{ "type": "sync_request" }
{ "type": "set_signal", "signal": "PLC1.DB200.DBX0.0", "value": true }
{ "type": "acknowledge_alarm", "id": "alm_001" }
{ "type": "subscribe_signal", "signal": "PLC1.DB100.DBD0" }
{ "type": "unsubscribe_signal", "signal": "PLC1.DB100.DBD0" }
{ "type": "request_history", "signal": "PLC1.DB100.DBD0", "duration_s": 300 }
```

### Zwei Modi der Bridge

**Signal-Modus (einfach):** Die Bridge sendet nur rohe Signalwerte (`type: "signals"`). Der Viewer hat die Drive-Modelle in TypeScript und berechnet Transforms selbst aus den empfangenen Signalwerten. Die Bridge muss nichts über Kinematik wissen — sie liest PLC-Variablen und schickt sie weiter.

**Transform-Modus (vollständig):** Die Bridge berechnet auch die Transforms und sendet fertige Positionen/Rotationen (`type: "transforms"`). Der Viewer setzt sie direkt auf die Nodes. Das ist der Modus, den der realvirtual Core nutzt.

Der Signal-Modus ist für Kunden einfacher zu implementieren — sie müssen nur Variablen lesen und als JSON senden. Der Viewer erledigt den Rest. Das senkt die Einstiegshürde massiv.

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

Das sind 25 Zeilen für eine funktionierende Bridge von S7 zum Web-Viewer. In Node.js, Go oder C# wäre es ähnlich kompakt.

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

- **Keine Vendor-Lock-in:** Der Viewer ist nicht an realvirtual Core gebunden. Kunden können ihre eigene Infrastruktur nutzen.
- **Niedrige Einstiegshürde:** Eine minimale Bridge ist 25–30 Zeilen Code. Das schafft jeder Automatisierungsingenieur mit Basis-Programmierkenntnissen.
- **Jede SPS, jedes System:** Siemens, Beckhoff, Codesys, Rockwell, Mitsubishi, Fanuc, OPC UA Server, MQTT Broker, proprietäre Systeme — alles was Daten liefern kann, kann angebunden werden.
- **Community-Bridges:** Mit dem AGPL-Viewer können Community-Mitglieder Bridges für verschiedene Systeme beitragen und teilen.
- **Testbarkeit:** Das Protokoll ist JSON-basiert. Man kann mit einem einfachen WebSocket-Client (z.B. Browser-DevTools) Testdaten an den Viewer senden.

### Protokoll-Dokumentation

Das WebSocket-Protokoll wird als eigenes Dokument veröffentlicht — inklusive JSON-Schema-Definitionen, Beispielen für alle Nachrichtentypen, und einer Referenz-Bridge-Implementierung in Python und Node.js. Das ist der zentrale Integrationspunkt für Kunden und Partner.

---

## 26. Multi-Interface-Architektur: Austauschbare Signal-Adapter

### Prinzip

Der SignalStore im Browser ist die universelle Drehscheibe. Zwischen SignalStore und der Außenwelt sitzen austauschbare Signal-Adapter — jeder Adapter implementiert dasselbe Interface, spricht aber ein anderes Protokoll. Der Viewer weiß nicht, woher die Daten kommen. Er kennt nur den SignalStore.

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

Der Viewer wählt den Adapter basierend auf der Konfiguration — entweder aus dem GLB Root-Node, aus URL-Parametern, oder aus einem Verbindungsdialog:

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

Kunden und Integratoren können eigene Adapter entwickeln, die das `ISignalAdapter`-Interface implementieren. Der Adapter wird als npm-Paket oder als lokale TypeScript-Datei eingebunden. Das ist der erweiterbare Punkt des Systems — neue Steuerungen anbinden, ohne den Viewer-Core zu ändern.

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
4. Viewer-Zustand aus IndexedDB wiederherstellen (Watchlist, Panel-Layout)
5. GLB aus Browser-Cache (ETag) — kein Re-Download

Der Core ist die Wahrheit. Der Browser ist eine Ansicht, die jederzeit komplett neu aufgebaut werden kann.

---

# Teil V — HMI Overlay und Meldungssystem

---

## 29. Drei UI-Ebenen

### Ebene 1 — World-Space (im 3D-Raum)

HTML-Elemente an Maschinenknoten per CSS2DRenderer. Status-Badges, Wert-Labels, Mini-Sparklines, Alarm-Marker. LOD-gesteuert: weiter weg = weniger Detail.

### Ebene 2 — Screen-Space mit 3D-Referenz (schwebende Panels)

HTML-Panels mit Verbindungslinie zum 3D-Objekt. Signal-Detail-Panels, Alarm-Details, Sensor-Info, Drive-Dashboard. Verschiebbar, fixierbar, minimierbar.

### Ebene 3 — Screen-Space fest (Dashboard-Bereiche)

Fixe Bereiche am Bildschirmrand: Top-Bar (Status, KPIs), Right Panel (Alarm-Liste), Bottom Bar (Toolbar, Kamera-Presets), Left Panel (Signal-Watchlist).

Alle drei Ebenen sind durchlässig: Klick in Ebene 3 navigiert zu Ebene 1 und öffnet Ebene 2.

---

## 30. Meldungssystem

Jede Meldung hat eine `rv_ref` — die Referenz auf einen Node im GLB. Klick auf Meldung → Kamera fährt zum Node, Node wird highlighted, Detail-Panel öffnet sich.

Meldungsquellen: PLC-Alarme (über Core), Schwellwert-Überwachung, Zustandsänderungen, manuelle Notizen.

Meldungsfluss: Signal ändert sich → Core erkennt Alarm → WebSocket sendet Meldung → Viewer: Alarm-Liste + Marker + Highlight + optionaler Sound.

---

# Teil VI — React HMI Binding

---

## 31. SignalStore

Zentraler, framework-agnostischer Wert-Speicher. Alle Daten fließen hindurch — egal ob WebSocket, MQTT, REST oder lokale Simulation.

```typescript
class SignalStore {
  set(address: string, value: any): void { }          // Einzelwert oder Array
  get(address: string): any { }
  subscribe(address: string, cb: (v: any) => void): () => void { }
  setMany(updates: Record<string, any>): void { }     // Bulk für WebSocket
  write(address: string, value: any): boolean { }     // Mit Schreibschutz
}
```

### Arrays im SignalStore

Signale können Arrays sein — Achspositionen (6 Werte), Temperaturprofile (20 Messpunkte), Cam-Tabellen (360 Werte). Für große Arrays TypedArrays (Float32Array) verwenden — schnellerer Vergleich, weniger Speicher.

---

## 32. React Hooks

```typescript
function useSignal(address: string): any { }            // Wert lesen
function useSignalWrite(address: string): (v: any) => void { }  // Wert schreiben
function useSignalHistory(address: string, max: number): number[] { }  // Ringbuffer
```

Die Hooks sind die einzige Brücke zwischen SignalStore und React. Jede Komponente bindet sich über eine Adresse an einen Wert. Die Datenquelle ist austauschbar.

---

## 33. UI-Komponentenbibliothek

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

Signal-Richtung wird aus rv_extras gelesen (`direction: "read"` oder `"write"`). Eingabe-Komponenten prüfen Schreibbarkeit. Nicht-schreibbare Signale werden automatisch als reine Anzeige dargestellt.

---

## 35. Performance-Richtlinien

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

## 36. Phasen

### Phase 1 — Minimal Viable Viewer (4–6 Wochen)

- GLB-Export mit korrekter Kinematik und Drive-Parametern
- Three.js Viewer: GLB laden, Scene-Boot, Drive-Komponenten
- SimulationLoop mit FixedUpdate
- Basis-Kamerasteuerung (OrbitControls)
- WebSocket-Anbindung für Live-Modus
- Einfache Signal-Anzeige

### Phase 2 — HMI Features (6–8 Wochen)

- Vollständige rv_extras (Sensoren, TransportSurface, Gruppen)
- Alarm/Meldungssystem mit 3D-Referenzen
- React UI: Panels, Alarm-Liste, Signal-Charts
- Volltext-Suche mit 3D-Highlighting
- Kamera-Presets
- MQTT und REST Signal-Adapter

### Phase 3 — Standalone und Extended (8–10 Wochen)

- LogicStep/Sequencer für eigenständige Simulation
- TransportSurface mit MU-Management
- Sensor-Raycasting
- Recording/Playback
- Binary WebSocket Protocol
- Docker-Deployment für Core

### Phase 4 — Polish und Release (4–6 Wochen)

- S7 Direct-Modus (REST + MQTT)
- Mobile-Optimierung
- AGPL-Veröffentlichung des Viewer-Core
- Dokumentation und Beispiel-GLBs
- Performance-Optimierung

---

## 37. Architektur-Diagramm

```
┌──────────────────────────────────────────────────────────────┐
│                        Browser                                │
│                                                               │
│  ┌─── React UI (Ebene 2+3) ──────────────────────────────┐  │
│  │  Alarm-Liste │ KPI-Bar │ Watchlist │ Panels │ Eingaben │  │
│  │  SignalStore ← useSignal() → Komponenten               │  │
│  └────────────────────────┬───────────────────────────────┘  │
│                           │                                   │
│  ┌─── CSS2DRenderer (Ebene 1) ────────────────────────────┐  │
│  │  Status-Badges │ Wert-Labels │ Sparklines │ Alarm-Icons │  │
│  └────────────────────────┬───────────────────────────────┘  │
│                           │                                   │
│  ┌─── Three.js Core ─────┴───────────────────────────────┐  │
│  │                                                        │  │
│  │  RVScene │ Drive │ Sensor │ TransportSurface │ LogicStep│  │
│  │  Registry │ Search │ Highlight │ SimulationLoop        │  │
│  │  SignalStore │ Raycaster │ OrbitControls               │  │
│  └────────────────────────────────────────────────────────┘  │
│                           │                                   │
│  ┌─── Datenquellen (austauschbar) ────────────────────────┐  │
│  │  WebSocket │ MQTT/WS │ REST (S7 API) │ Recording-File  │  │
│  └────────────────────────┬───────────────────────────────┘  │
└───────────────────────────┼───────────────────────────────────┘
                            │
┌───────────────────────────┼───────────────────────────────────┐
│  realvirtual Core │ MQTT Broker │ S7-1500 Web API (direkt)    │
│  ↕                  ↕              ↕                           │
│  S7 │ ADS │ OPC UA │ MQTT │ Fanuc │ EtherNet/IP              │
└───────────────────────────────────────────────────────────────┘
                            │
                  PLC / Robot Controller
```
