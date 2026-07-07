# Simam Intelligence Suite — Demo Readiness Plan

**Audience:** internal (you), to get the product to a cohesive, client-showable state.
**Last updated:** 2026-06-13

---

## 1. What this project actually is (plain English)

There are **two layers** stacked on top of each other:

### Layer A — the engine (`realvirtual WEB`, upstream)
A browser-based 3D digital-twin viewer. It loads a `.glb` factory model and runs a real
60 Hz physics/logic simulation in the browser: conveyors move, drives animate, sensors
detect, signals fire. This is mature, well-tested upstream tech. **You did not write this.**
It's the foundation.

### Layer B — the "Simam Intelligence Suite" (what *you* added)
A set of plugins and services bolted onto Layer A that turn the bare viewer into a
branded, "smart factory" product:

| Plugin / service | File | What it does |
|---|---|---|
| **OSM 3D Map** | `src/plugins/osm-map-plugin.tsx` | Satellite + 3D-building view of the Wakefield site with labels/workers/trucks |
| **Site Intelligence** | `src/plugins/site-intelligence-plugin.tsx` | Command-centre overlay panel (metrics, weather, shift info) |
| **Site Manager** | `src/plugins/site-manager-plugin.ts` | Breadcrumb nav (World › Site › Asset) + Firestore site list |
| **Alarm Radar** | `src/plugins/alarm-radar-plugin.tsx` | Watches signals for faults, pulses the 3D asset, "fly-to" list |
| **AI Assistant** | `src/plugins/ai-assistant-plugin.tsx` | Chat box for "show me X" / "status" / "reset" |
| **Maintenance Insight** | `src/plugins/maintenance-insight-plugin.tsx` | Glassy dashboard with MTBF / health / ECharts |
| **Historian** | `src/plugins/historian-plugin.ts` | Records drive data, 3D scrubbing timeline |
| **Firebase layer** | `src/core/rv-firebase.ts`, `dataconnect-service.ts` | Firestore + Storage + SQL (Data Connect) persistence |
| **Geospatial service** | `src/core/geospatial-service.ts` | Pulls live weather / flood / traffic from open APIs |

**The mental model:** Layer A is the *machine*. Layer B is the *story you tell about the
machine* — the dashboards, the map, the AI, the alarms. The demo lives or dies on Layer B
feeling real and polished.

---

## 2. The #1 problem: map overlay drift (and the fix)

**Symptom:** on the 3D map, the labels/workers/truck markers slide around, lag behind the
buildings, and don't stay glued to their real-world spot when you zoom or pan. Looks
unprofessional.

**Root cause — three compounding bugs in `osm-map-plugin.tsx`:**

1. **Overlay reprojection is event-driven, not frame-synced.** Markers are HTML/SVG
   elements positioned at `osmb.project(lat,lng)` pixel coordinates. Those coords are only
   recomputed on the map's discrete `'change'` event, then pushed through React state. The
   map canvas redraws every frame; the overlay catches up a beat later → **visible lag**.

2. **Workers & trucks only reproject on the 100 ms data timer**, not on view changes. Zoom
   without the timer ticking and they freeze, then jump to the new position.

3. **CSS `transition: all 0.5s/1s linear` on the markers** (lines ~220, ~247). Every time a
   projected position changes, CSS *animates* the marker sliding to it — so a zoom makes
   every marker float across the screen instead of sticking to the map. **This is the
   single worst offender visually.**

**The fix (P0 — do this first):**
- Drive reprojection from a `requestAnimationFrame` loop that runs while the map is open, so
  every marker's pixel position is recomputed *on the same frame the map redraws*. Decouple
  this "where on screen" update from the 100 ms "where in the world" data update.
- **Remove the positional CSS transitions** (transition opacity only, never `left`/`top`).
- Hide markers whose `project().z <= 0` (behind camera) — already done, keep it.
- Consider throttling label re-renders but never the reprojection.

Result: markers lock to the buildings like real map pins, even during continuous zoom.

---

## 3. "Real vs Mock" audit (critical before showing clients)

You need to know which bits are genuinely functional so you don't get caught out in a demo.

| Feature | Status | Notes |
|---|---|---|
| 3D factory simulation (drives, conveyors, sensors) | ✅ **Real** | Core engine, genuinely simulating |
| Satellite imagery + 3D buildings on map | ✅ **Real** | Esri tiles + OSM Buildings data |
| Weather / flood / traffic data | ✅ **Real** | Live: Open-Meteo, UK Env Agency, DfT |
| Alarm Radar | ✅ **Real** | Subscribes to actual fault/alarm signals |
| Historian (drive recording + scrub) | ✅ **Real** | Records real sim data |
| Firebase persistence | ✅ **Real** | Firestore / Storage / SQL wired |
| Site workers on map | ⚠️ **Mock** | 6 hardcoded people doing random drift |
| Trucks / logistics on map | ⚠️ **Mock** | Hardcoded trucks on canned routes |
| Maintenance MTBF / health numbers | ⚠️ **Mock** | "4,120h", "94%" are hardcoded literals |
| AI Assistant answers | ⚠️ **Mock** | Canned responses + keyword matching, no real LLM |

**This is fine for a demo** — but decide per feature: (a) keep as a clearly-labelled
"simulated" overlay, (b) wire to real data, or (c) cut it. The danger is mock data that
*looks* real and gets questioned ("is that a real truck?"). Recommendation: badge mock
layers as **"SIMULATED"** so they're honest and still impressive.

---

## 4. Demo polish roadmap (prioritised)

### P0 — Make what exists look correct (this week)
- [ ] **Fix map overlay drift** (Section 2). Biggest visual win.
- [ ] **Add "SIMULATED" badges** to mock layers (workers, trucks, maintenance numbers).
- [ ] **One coherent entry flow**: land → see factory → clear buttons to Map / Dashboard /
      Historian. Right now plugins each add their own buttons; audit the toolbar so it reads
      as one product, not five bolted-on tools.

### P1 — Cohesion & professionalism
- [ ] **Consistent visual language**: one glass style, one accent colour (`#20a1b1`), one
      font scale across all panels. Several panels reinvent their own styling.
- [ ] **Loading & empty states**: spinners and "no data yet" instead of blank/jumpy panels.
- [ ] **Smooth map ↔ 3D transition**: currently the map hard-swaps `#app` opacity to 0/hidden
      (lines ~589-606). A crossfade or "zoom from map into the building" would feel premium.
- [ ] **Wire one mock to real data** to prove depth — e.g. maintenance health driven by the
      Historian's real drive uptime instead of a hardcoded 94%.

### P2 — Interesting *functional* bits (the "wow", but real)
- [ ] **Measurement tool** — port from upstream (`MeasurementPanel.tsx`). Click two points,
      get a real distance. Already on the roadmap; low risk; genuinely useful.
- [ ] **7-Day Trend Overlay** — show a real recorded metric trending on a 3D asset.
- [ ] **PDF "Executive Brief"** — one-click report from live twin data. High client appeal.
- [ ] **AASX digital nameplate** (upstream) — Industry-4.0 asset data on click. Strong B2B story.

---

## 5. Quick wins available from upstream (`game4automation/realvirtual-WEB`)

We forked from this repo. It has self-contained features we can port without disturbing our
code (full analysis lives alongside this plan — ask Claude to re-run the upstream diff):

- **Measurement tool** — directly serves P2 above.
- **Sensor history chart** — complements the Historian.
- **Navigation sensitivity / per-model camera start** — pure UX polish, low risk.
- **AASX digital nameplate** — Industry 4.0 credibility.

> ⚠️ Do **not** attempt a wholesale merge. Upstream did a large architectural refactor and
> *removed* the Rapier physics our Physics Interaction Hub depends on. Port features one at a
> time, by file.

---

## 6. Suggested order of attack

1. **Fix the map drift** (P0) — turns the weakest part into a strength.
2. **Toolbar/entry cohesion + SIMULATED badges** (P0) — makes it read as one product.
3. **Port the Measurement tool** (P2) — a real, tactile feature clients can touch.
4. **Wire maintenance health to real Historian data** (P1) — proves it's not all smoke.
5. Everything else as time allows.

Each of these is a self-contained chunk Claude can implement and verify in the running app.

---

## 7. Target client: PLANT OPERATORS (chosen direction)

We are building toward **manufacturers who run production lines** (plant ops, production &
maintenance managers) — recurring-use, dashboard-driven. The product framing is a
**"Live Operations Cockpit"** for a factory.

### Why this platform is credible for it
The engine already has **live industrial protocol adapters** (`src/interfaces/`):
WebSocket Realtime, MQTT, and **ctrlX** (Bosch Rexroth), with proper PLC input/output
signal handling and an interface manager. It can bind a 3D twin to real hardware *today*.
The demo just hasn't surfaced this — it shows mock data instead.

### The key unlock: real data with no hardware required
The **standalone simulation already generates genuine production data** — drives expose
`isRunning` / `currentSpeed`, sinks fire a "part consumed" callback, sources count spawns.
That means we can compute **real OEE, real throughput, real run-hours from the running sim**
— no PLC needed for a demo, and it switches seamlessly to live signals when a client
connects real hardware.

### Plant-Operator feature set (what a real client uses daily)

| # | Feature | Built from | Client value |
|---|---|---|---|
| **1** | **Real OEE engine** (Availability × Performance × Quality) + KPI cards | drive `isRunning`/`currentSpeed` + sink counts (+ existing `KpiCard`) | The #1 manufacturing metric. Replaces the hardcoded 94%. |
| **2** | **Alarm & event log** — timestamped, acknowledge, history, CSV export | extends alarm-radar + Firestore (already wired) | Every plant needs this for audits & shift handover |
| **3** | **Run-hours & maintenance-due per asset** — "service in X h", work-order export | Historian's real drive data | Maintenance managers schedule from this |
| **4** | **Live Connection panel** — clear "Connect to Line" UI, status, real signal binding | existing `interface-manager` (WebSocket/MQTT/ctrlX) | Turns the twin from animation into a live tool |

### Recommended build order
1. **OEE engine + real KPI cards** ← start here. Highest value, fully real from the sim,
   no hardware, and it kills the worst mock in the demo.
2. **Alarm & event log** — build on the existing alarm radar.
3. **Run-hours / maintenance-due** — build on the Historian.
4. **Live Connection panel** — polish the existing adapters for when a client has hardware.

> Each is self-contained and verifiable in the running app. OEE first.
