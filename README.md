# Simam Digital: Industrial Intelligence Suite

**Advanced Web-Based Digital Twin Infrastructure for Modern Manufacturing**

[![Simam Digital](https://img.shields.io/badge/Simam-Digital_Twin-20a1b1.svg)](https://www.simamdigital.com)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Technology](https://img.shields.io/badge/Stack-React_19_|_MUI_7_|_Three.js-7b52ee.svg)](https://simamdigital.com)
[![Live Demo](https://img.shields.io/badge/Live_Demo-virtualfactory.simamdigital.com-20a1b1.svg)](https://virtualfactory.simamdigital.com/)

### ▶ [Try it live — virtualfactory.simamdigital.com](https://virtualfactory.simamdigital.com/)

A running Wakefield production line: real geographic context, a walkable factory
interior, and KPIs computed from the simulation itself. No install, no signup.

**Simam Digital Intelligence Suite** is a high-performance, browser-based ecosystem for specialized industrial visualization. Built upon the robust realvirtual WEB engine, we have extended the platform with spatial intelligence, AI-driven automation, and advanced interactive physics to bridge the gap between simulation and shop-floor operations.

---

## ✨ Simam Intelligence Suite Features

### 🚨 Spatial Alarm Radar
Experience true spatial awareness. Our alarm radar scans live PLC signals for faults and provides instant visual feedback directly on the 3D assets.
- **Pulsing Diagnostics**: Faulty machines pulse in high-visibility red, eliminating the search time in massive facilities.
- **Direct Navigation**: A centralized alarm hub allowing operators to "Fly-To" the physical location of any active fault with one click.

### 🤖 Simam AI HMI (Command Center)
Interact with your data through natural language. Our glassmorphic AI interface provides a direct link between the operator and the digital twin.
- **Conversational Control**: Ask for machine status, part counts, or to locate specific components.
- **Automated Insights**: The AI assistant identifies trends and highlights anomalies in real-time drive and sensor data.

### 🏗️ Physics Interaction Hub
Conduct virtual stress tests and logic validation with our real-time physics pointer.
- **MU Manipulation**: Grab and move parts directly on the production line to test sensor logic and mechanical interlocks.
- **Chaos Engineering**: Simulate mechanical jams or unexpected component placement to verify PLC program robustness.

### 🔭 Continuous Zoom — Region to Machine
One camera move takes you from orbit to the shop floor, with each band showing the
representation that suits the distance.
- **Region** (>220 m): Google photorealistic 3D tiles of the real site.
- **Site** (55–220 m): the modelled estate — shed, yard, trailers, dock doors.
- **Building** (28–55 m): the shell cross-fades away and the hall opens up.
- **Process** (<28 m): the interior and the live simulated line.

### 📈 KPIs Measured, Not Mocked
The headline numbers are derived from the running simulation rather than hardcoded.
- **Real availability and throughput**: accumulated from fixed-timestep simulated time,
  so they freeze correctly on pause instead of drifting with wall-clock.
- **Honest provenance**: a card shows a live indicator only when the model actually has
  the drives or sinks to support it, and falls back to demo values otherwise.

### 🔌 Live PLC Connectivity
WebSocket, MQTT, ctrlX and TwinCAT adapters, surfaced rather than hidden — a persistent
status pill reports `STANDALONE SIM` or `LIVE · N signals`, with a live signal monitor.

### 🗺️ Geographic Factory Mapping
Overlay your facility onto a high-fidelity 3D geographic map using OSM integration, providing global context for multi-site operations.

---

## 🛠️ Performance & Compliance

| Core Feature | Simam Implementation |
| :--- | :--- |
| **HMI Framework** | Professional React 19 + MUI 7 Architecture |
| **Industrial logic** | 60Hz Fixed-Timestep Physics & Simulation |
| **3D Rendering** | Support for WebGL, WebGPU, and WebXR (Vision Pro / Quest) |
| **AI Integration** | Native MCP Bridge for Autonomous Inspection |

---

## 🚀 Quick Start for Engineers

```bash
# Clone the Simam Digital repository
git clone https://github.com/Simam-Digital-Ltd/realvirtual-WEB.git
cd realvirtual-WEB

# Install dependencies
npm install

# Launch developer workbench
npm run dev
```

---

## ⚖️ Technical Credits & Licensing

Simam Digital believes in the power of open-source industrial automation. This platform is a specialized fork of the excellent **[realvirtual WEB](https://github.com/game4automation/realvirtual-WEB)** engine developed by **[realvirtual.io](https://realvirtual.io)**.

We pay homage to the original creators and maintain full compliance with the **AGPL-3.0** license. All core engine modifications and UI extensions remain open-source to support the global digital twin community.

---

**[Simam Digital](https://www.simamdigital.com)** | [Original Engine](https://realvirtual.io/en/) | [Industrial Digital Twins](https://simamdigital.com)
