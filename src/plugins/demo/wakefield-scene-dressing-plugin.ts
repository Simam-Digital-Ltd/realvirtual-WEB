// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  Material,
  PlaneGeometry,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import type { Object3D } from 'three';
import type { RVViewerPlugin } from '../../core/rv-plugin';
import type { RVViewer } from '../../core/rv-viewer';
import type { LoadResult } from '../../core/engine/rv-scene-loader';
import { WAKEFIELD_DEMO_PROFILE as DEMO_PROFILE } from './demo-profile';
// Physical (lit) interior layer. This file owns the SCHEMATIC layer; the
// interior module owns walls/roof/walkway/conveyors in MeshStandardMaterial.
import { createWakefieldInterior } from './wakefield-interior';
import { createWakefieldExterior } from './wakefield-exterior';
import { WakefieldLodController } from './wakefield-lod';
import { WakefieldTilesLayer } from './wakefield-tiles';

interface ZoneSpec {
  id: string;
  label: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  color: number;
}

interface SignSpec {
  text: string;
  subtext: string;
  x: number;
  y: number;
  z: number;
  color: string;
  scale: number;
}

interface BeaconSpec {
  x: number;
  z: number;
  color: number;
  phase: number;
}

interface StripSpec {
  name: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  color: number;
  opacity: number;
}

interface PalletSpec {
  name: string;
  x: number;
  z: number;
  color: number;
}

interface CellReplicaSpec {
  id: string;
  label: string;
  x: number;
  z: number;
  rotation: number;
  color: number;
  status: string;
}

interface RackSpec {
  id: string;
  x: number;
  z: number;
  rotation: number;
  bays: number;
  color: number;
}

const ZONES: ZoneSpec[] = [
  { id: 'gate', label: 'GATEHOUSE', x: -7.4, z: 4.8, width: 3.2, depth: 1.35, color: 0x4fc3f7 },
  { id: 'reception', label: 'VISITOR RECEPTION', x: -10.2, z: 2.75, width: 2.5, depth: 1.65, color: 0x7e57c2 },
  { id: 'staff', label: 'STAFF & WELFARE', x: -10.2, z: 0.65, width: 2.5, depth: 1.55, color: 0x66bb6a },
  { id: 'cell-a', label: 'ROBOT CELL A', x: 0.2, z: 0.1, width: 4.4, depth: 3.2, color: 0x20a1b1 },
  { id: 'qa-lab', label: 'QA LAB', x: -3.2, z: -6.8, width: 2.6, depth: 1.55, color: 0xef5350 },
  { id: 'plant-room', label: 'PLANT ROOM', x: 7.9, z: 4.45, width: 2.7, depth: 1.55, color: 0xb0bec5 },
  { id: 'dock-4', label: 'DOCK 4', x: 5.15, z: -1.4, width: 3.4, depth: 1.4, color: 0xffa726 },
  { id: 'cold-store', label: 'COLD STORE B', x: 5.4, z: 2.55, width: 3.4, depth: 1.55, color: 0x26c6da },
  { id: 'dispatch-marshalling', label: 'DISPATCH MARSHALLING', x: 8.5, z: -4.9, width: 4.2, depth: 2.2, color: 0xffa726 },
];

const SIGNS: SignSpec[] = [
  { text: DEMO_PROFILE.client.name, subtext: `${DEMO_PROFILE.client.siteCode} | ${DEMO_PROFILE.brand.product}`, x: 0, y: 3.55, z: -2.7, color: '#3FB8C4', scale: 2.5 },
  { text: 'Visitor Entrance', subtext: 'reception | induction | PPE point', x: -10.2, y: 1.9, z: 3.75, color: '#8B7BC7', scale: 1.45 },
  { text: 'Staff Welfare', subtext: 'shift office | lockers | briefing area', x: -10.2, y: 1.75, z: 1.3, color: '#5FB37A', scale: 1.45 },
  { text: DEMO_PROFILE.assets.robotCell, subtext: 'Tray forming and case pack', x: -1.9, y: 2.2, z: 1.8, color: '#5FB37A', scale: 1.55 },
  { text: `${DEMO_PROFILE.assets.dock} Queue`, subtext: `${DEMO_PROFILE.assets.inboundVehicle} | ${DEMO_PROFILE.assets.yardTug} | live simulated ETA`, x: 4.9, y: 1.8, z: -2.4, color: '#D9A441', scale: 1.55 },
  { text: 'Cold Chain Zone', subtext: `${DEMO_PROFILE.kpis.coldChain} ${DEMO_PROFILE.kpis.coldChainUnit} stable | Zone B watch`, x: 4.6, y: 1.8, z: 1.2, color: '#3FB8C4', scale: 1.55 },
];

const BEACONS: BeaconSpec[] = [
  { x: -2.1, z: -1.1, color: 0xffa726, phase: 0 },
  { x: 2.6, z: -1.1, color: 0xef5350, phase: 1.7 },
  { x: 4.3, z: 1.3, color: 0x26c6da, phase: 3.1 },
];

const STRIPS: StripSpec[] = [
  { name: 'pedestrian-safe-route', x: -3.4, z: 3.55, width: 13.2, depth: 0.14, color: 0x81c784, opacity: 0.72 },
  { name: 'visitor-route', x: -9.1, z: 2.0, width: 0.14, depth: 4.6, color: 0x7e57c2, opacity: 0.66 },
  { name: 'forklift-lane-a', x: 1.4, z: -2.65, width: 11.8, depth: 0.16, color: 0xffc107, opacity: 0.68 },
  { name: 'forklift-cross-aisle', x: 8.2, z: -1.3, width: 0.16, depth: 7.4, color: 0xffc107, opacity: 0.58 },
  { name: 'dock-staging-line', x: 4.88, z: -0.45, width: 2.8, depth: 0.12, color: 0xffa726, opacity: 0.76 },
  { name: 'cold-chain-boundary', x: 4.6, z: 3.16, width: 2.7, depth: 0.1, color: 0x26c6da, opacity: 0.84 },
];

const PALLETS: PalletSpec[] = [
  { name: 'dispatch-pallet-1', x: 3.8, z: -2.15, color: 0xffa726 },
  { name: 'dispatch-pallet-2', x: 4.35, z: -2.15, color: 0xffa726 },
  { name: 'dispatch-pallet-3', x: 4.9, z: -2.15, color: 0xffa726 },
  { name: 'cold-store-crate-1', x: 3.8, z: 2.7, color: 0x26c6da },
  { name: 'cold-store-crate-2', x: 4.35, z: 2.7, color: 0x26c6da },
  { name: 'ambient-pick-1', x: -7.1, z: 2.1, color: 0x90a4ae },
  { name: 'ambient-pick-2', x: -6.55, z: 2.1, color: 0x90a4ae },
  { name: 'qc-hold-1', x: -2.6, z: -3.9, color: 0xef5350 },
  { name: 'palletiser-buffer-1', x: 1.8, z: -4.25, color: 0xffa726 },
  { name: 'palletiser-buffer-2', x: 2.35, z: -4.25, color: 0xffa726 },
  { name: 'dispatch-pallet-4', x: 8.1, z: -5.15, color: 0xffa726 },
  { name: 'dispatch-pallet-5', x: 8.75, z: -5.15, color: 0xffa726 },
  { name: 'dispatch-pallet-6', x: 9.4, z: -5.15, color: 0xffa726 },
  { name: 'qa-sample-1', x: -3.75, z: -6.65, color: 0xef5350 },
  { name: 'qa-sample-2', x: -2.95, z: -6.65, color: 0xef5350 },
  { name: 'staff-kit-1', x: -10.8, z: 0.2, color: 0x66bb6a },
];

const REPLICA_CELLS: CellReplicaSpec[] = [
  { id: 'case-pack-b', label: 'CASE PACK B', x: -5.7, z: -2.2, rotation: 0.06, color: 0x7e8aa2, status: 'secondary pack line' },
  { id: 'vision-qc', label: 'VISION QC', x: -2.7, z: -5.1, rotation: -0.04, color: 0x5b6678, status: 'camera reject watch' },
  { id: 'palletiser-c', label: 'PALLETISER C', x: 2.2, z: -5.4, rotation: 0.03, color: 0x67727f, status: 'staging to dock' },
  { id: 'label-check-d', label: 'LABEL CHECK D', x: 6.9, z: -6.6, rotation: -0.02, color: 0x5b6678, status: 'barcode and expiry check' },
];

const RACKS: RackSpec[] = [
  { id: 'ambient-a', x: -7.2, z: 1.1, rotation: 0, bays: 4, color: 0x90a4ae },
  { id: 'ambient-b', x: -7.2, z: -0.7, rotation: 0, bays: 4, color: 0x90a4ae },
  { id: 'ambient-c', x: -7.2, z: -2.5, rotation: 0, bays: 4, color: 0x90a4ae },
  { id: 'packaging-consumables', x: -10.4, z: -2.4, rotation: Math.PI / 2, bays: 3, color: 0x7e8aa2 },
  { id: 'chilled-a', x: 7.3, z: 1.8, rotation: 0, bays: 3, color: 0x26c6da },
  { id: 'dispatch-a', x: 7.1, z: -3.2, rotation: Math.PI / 2, bays: 4, color: 0xffa726 },
  { id: 'dispatch-b', x: 10.4, z: -3.2, rotation: Math.PI / 2, bays: 4, color: 0xffa726 },
  { id: 'chilled-b', x: 10.2, z: 1.8, rotation: 0, bays: 3, color: 0x26c6da },
];

export class WakefieldSceneDressingPlugin implements RVViewerPlugin {
  readonly id = 'wakefield-scene-dressing';
  readonly order = 260;

  private _viewer: RVViewer | null = null;
  private _group: Group | null = null;
  private _beacons: Mesh[] = [];
  private _lod: WakefieldLodController | null = null;
  private _tiles: WakefieldTilesLayer | null = null;
  private _time = 0;

  /**
   * Fill light that exists only until the HDR environment finishes loading.
   *
   * The scene ships ONE DirectionalLight and no ambient term at all — every
   * bit of fill comes from `scene.environment`, which is fetched and PMREM'd
   * asynchronously (see rv-visual-settings-manager). Between first paint and
   * that promise resolving there is no ambient light in the scene, so every
   * surface facing away from the sun renders pure black. On a cold cache that
   * window is seconds long, and it is what users report as "the app loads
   * black".
   *
   * This is a floor, not a look: it is removed the moment the real
   * environment arrives, so it can never double up with the HDR.
   */
  private _bootstrapLight: HemisphereLight | null = null;

  onModelLoaded(_result: LoadResult, viewer: RVViewer): void {
    this._viewer = viewer;
    this._clear();

    const group = new Group();
    group.name = 'simam-wakefield-scene-dressing';
    this._group = group;

    group.add(this._createWarehouseFloor());
    group.add(this._createWarehouseEnvelope());
    // Physical layers. Interior and exterior are siblings so the LOD
    // controller can cross-fade the shell independently of the schematic.
    const interior = createWakefieldInterior();
    const exterior = createWakefieldExterior();
    group.add(exterior);
    group.add(interior);
    this._lod = new WakefieldLodController(interior, exterior, new Vector3(0, 0, -1.15));

    // Region band: Google photorealistic 3D tiles of the real site. Optional —
    // without a key the band just shows the hand-built estate, which is why
    // this is a soft attach rather than a hard dependency.
    const tilesKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
    if (tilesKey) {
      this._tiles = new WakefieldTilesLayer(group, { apiToken: tilesKey });
      this._lod.setTilesLayer(this._tiles);
    }
    group.add(this._createBuildingBlock('wpf-reception-block', -10.2, 0.45, 2.75, 2.35, 0.82, 1.45, 0x2d3440, 0x7e57c2));
    group.add(this._createBuildingBlock('wpf-staff-block', -10.2, 0.42, 0.65, 2.35, 0.78, 1.35, 0x26362d, 0x66bb6a));
    group.add(this._createBuildingBlock('wpf-qa-lab-block', -3.2, 0.38, -6.8, 2.3, 0.72, 1.3, 0x3a2529, 0xef5350));
    group.add(this._createBuildingBlock('wpf-plant-room-block', 7.9, 0.45, 4.45, 2.4, 0.88, 1.32, 0x2f363b, 0xb0bec5));

    for (const zone of ZONES) {
      group.add(this._createZone(zone));
      group.add(this._createFloorLabel(zone));
    }

    for (const rack of RACKS) {
      group.add(this._createRack(rack));
    }

    for (const replica of REPLICA_CELLS) {
      group.add(this._createReplicaCell(replica));
    }

    for (const strip of STRIPS) {
      group.add(this._createStrip(strip));
    }

    for (const pallet of PALLETS) {
      group.add(this._createPallet(pallet));
    }

    group.add(this._createDockDoorFrame());
    group.add(this._createFlowArrow(-0.8, -2.65, 0xffc107, 'flow-factory-to-dock'));
    group.add(this._createFlowArrow(3.2, -2.65, 0xffc107, 'flow-dock-outbound'));
    group.add(this._createFlowArrow(4.65, 2.95, 0x26c6da, 'flow-cold-chain'));
    group.add(this._createFlowArrow(-5.4, -3.35, 0x81c784, 'flow-ambient-pick'));
    group.add(this._createFlowArrow(-1.0, -4.7, 0xef5350, 'flow-qc-hold'));
    group.add(this._createFlowArrow(2.75, -4.65, 0xffa726, 'flow-palletiser-dispatch'));

    group.add(this._createSign({ text: 'Warehouse Pick Face', subtext: 'ambient racks | batch-ready stock', x: -7.2, y: 1.75, z: 2.55, color: '#8A97A8', scale: 1.45 }));
    group.add(this._createSign({ text: 'Quality Hold', subtext: 'vision reject lane | supervisor review', x: -2.65, y: 1.55, z: -3.8, color: '#D9534F', scale: 1.45 }));
    group.add(this._createSign({ text: 'Dispatch Buffer', subtext: 'palletiser C | dock wave 14:20', x: 2.3, y: 1.55, z: -4.0, color: '#D9A441', scale: 1.45 }));
    group.add(this._createSign({ text: 'Plant Room', subtext: 'compressor | utilities | energy metering', x: 7.9, y: 1.8, z: 5.35, color: '#8A97A8', scale: 1.4 }));
    group.add(this._createSign({ text: 'Dispatch Marshalling', subtext: 'staged pallets | release by dock wave', x: 8.75, y: 1.7, z: -6.25, color: '#D9A441', scale: 1.45 }));

    for (const sign of SIGNS) {
      group.add(this._createSign(sign));
    }

    for (const beacon of BEACONS) {
      const mesh = this._createBeacon(beacon);
      this._beacons.push(mesh);
      group.add(mesh);
    }

    viewer.scene.add(group);

    // Sky/ground fill so the very first frames are lit. Intensity is low on
    // purpose: enough to read shape and depth, not enough to flatten the
    // scene if the HDR were ever to arrive late rather than never.
    if (!this._bootstrapLight) {
      const fill = new HemisphereLight(0xbfd4e6, 0x4a4a48, 1.15);
      fill.name = 'wpf-bootstrap-fill';
      this._bootstrapLight = fill;
      viewer.scene.add(fill);
    }
  }

  /**
   * Drop the bootstrap fill once the real environment map is in place.
   *
   * Checked per frame rather than hooked to a load event because the env map
   * is owned by the core visual-settings manager, and this fork does not
   * modify core. A property read per frame is cheaper than the alternative.
   */
  private _retireBootstrapLight(): void {
    const light = this._bootstrapLight;
    if (!light) return;
    const scene = this._viewer?.scene;
    if (!scene || !scene.environment) return;
    light.removeFromParent();
    light.dispose();
    this._bootstrapLight = null;
  }

  onRender(dt: number): void {
    this._time += dt;
    this._retireBootstrapLight();
    for (let i = 0; i < this._beacons.length; i++) {
      const beacon = this._beacons[i];
      const phase = typeof beacon.userData.pulsePhase === 'number' ? beacon.userData.pulsePhase : i * 0.9;
      const pulse = 0.65 + Math.sin(this._time * 3 + phase) * 0.25;
      const material = beacon.material as MeshBasicMaterial;
      material.opacity = pulse;
      beacon.scale.setScalar(1 + pulse * 0.18);
    }
    // Zoom LOD: estate -> site -> building opens -> process floor.
    // Driven from the render camera, so it tracks free orbit as well as
    // scripted camera moves.
    if (this._lod && this._viewer) {
      const canvas = this._viewer.renderer?.domElement;
      const viewport = canvas
        ? { width: canvas.width, height: canvas.height }
        : undefined;
      this._lod.update(this._viewer.camera, dt, viewport);
    }
  }

  onModelCleared(_viewer: RVViewer): void {
    if (this._bootstrapLight) {
      this._bootstrapLight.removeFromParent();
      this._bootstrapLight.dispose();
      this._bootstrapLight = null;
    }
    this._clear();
  }

  dispose(): void {
    this._clear();
  }

  private _createWarehouseFloor(): Group {
    const group = new Group();
    group.name = 'wpf-expanded-warehouse-floor';

    const slab = new Mesh(
      new PlaneGeometry(24, 16),
      new MeshBasicMaterial({ color: 0x1f2529, transparent: true, opacity: 0.045, side: DoubleSide, depthWrite: false }),
    );
    slab.rotation.x = -Math.PI / 2;
    slab.position.set(0, 0.012, -1.15);
    slab.renderOrder = 8;
    group.add(slab);

    const lineMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.13, depthWrite: false });
    for (let x = -12; x <= 12; x += 1) {
      const line = new Mesh(new PlaneGeometry(0.018, 16), lineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, 0.018, -1.15);
      line.renderOrder = 9;
      group.add(line);
    }
    for (let z = -9; z <= 7; z += 1) {
      const line = new Mesh(new PlaneGeometry(24, 0.018), lineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(0, 0.019, z - 1.15);
      line.renderOrder = 9;
      group.add(line);
    }

    return group;
  }

  private _createWarehouseEnvelope(): Group {
    const group = new Group();
    group.name = 'wpf-warehouse-envelope';
    const material = new MeshBasicMaterial({ color: 0x20a1b1, transparent: true, opacity: 0.22 });
    const specs = [
      { x: 0, z: -9.15, w: 24, d: 0.04 },
      { x: 0, z: 6.85, w: 24, d: 0.04 },
      { x: -12.02, z: -1.15, w: 0.04, d: 16 },
      { x: 12.02, z: -1.15, w: 0.04, d: 16 },
    ];
    for (const spec of specs) {
      const rail = new Mesh(new BoxGeometry(spec.w, 0.08, spec.d), material);
      rail.position.set(spec.x, 0.08, spec.z);
      group.add(rail);
    }
    return group;
  }


  private _createBuildingBlock(name: string, x: number, y: number, z: number, width: number, height: number, depth: number, color: number, accent: number): Group {
    const group = new Group();
    group.name = name;
    group.position.set(x, 0, z);

    const body = new Mesh(
      new BoxGeometry(width, height, depth),
      new MeshBasicMaterial({ color, transparent: true, opacity: 0.68 }),
    );
    body.position.y = y;
    group.add(body);

    const roof = new Mesh(
      new BoxGeometry(width + 0.12, 0.06, depth + 0.12),
      new MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.55 }),
    );
    roof.position.y = y + height / 2 + 0.04;
    group.add(roof);

    const door = new Mesh(
      new BoxGeometry(0.5, 0.42, 0.035),
      new MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.7 }),
    );
    door.position.set(0, 0.24, depth / 2 + 0.02);
    group.add(door);

    return group;
  }

  private _createReplicaCell(spec: CellReplicaSpec): Group {
    const group = new Group();
    group.name = 'wpf-replica-cell-' + spec.id;
    group.position.set(spec.x, 0, spec.z);
    group.rotation.y = spec.rotation;

    const baseMat = new MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0.64 });
    const glassMat = new MeshBasicMaterial({ color: 0x20a1b1, transparent: true, opacity: 0.16, side: DoubleSide, depthWrite: false });
    const accentMat = new MeshBasicMaterial({ color: 0x20a1b1, transparent: true, opacity: 0.78 });
    const darkMat = new MeshBasicMaterial({ color: 0x171a1f, transparent: true, opacity: 0.82 });

    const platform = new Mesh(new BoxGeometry(2.25, 0.08, 1.55), glassMat);
    platform.position.y = 0.06;
    group.add(platform);

    const cabinet = new Mesh(new BoxGeometry(0.96, 0.92, 0.78), baseMat);
    cabinet.position.set(-0.18, 0.54, 0);
    group.add(cabinet);

    const conveyor = new Mesh(new BoxGeometry(2.3, 0.14, 0.26), darkMat);
    conveyor.position.set(0.08, 0.22, -0.66);
    group.add(conveyor);

    for (const x of [-1.12, 1.12]) {
      const rail = new Mesh(new BoxGeometry(0.08, 0.9, 1.55), accentMat);
      rail.position.set(x, 0.55, 0);
      group.add(rail);
    }

    const marker = new Mesh(new RingGeometry(0.18, 0.32, 24), new MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0.7, side: DoubleSide, depthWrite: false, blending: AdditiveBlending }));
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(0.92, 0.1, 0.52);
    marker.renderOrder = 30;
    marker.userData.pulsePhase = spec.x * 0.37 + spec.z * 0.19;
    group.add(marker);
    this._beacons.push(marker);

    const label = this._createLabelSprite(spec.label, '#ffffff', '#111318', new Color(spec.color).getStyle(), 360, 112, spec.status);
    label.position.set(0, 1.5, 0.9);
    label.scale.set(1.2, 0.36, 1);
    group.add(label);

    return group;
  }

  private _createRack(spec: RackSpec): Group {
    const group = new Group();
    group.name = 'wpf-rack-' + spec.id;
    group.position.set(spec.x, 0, spec.z);
    group.rotation.y = spec.rotation;

    const frameMat = new MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0.74 });
    const shelfMat = new MeshBasicMaterial({ color: 0x22272d, transparent: true, opacity: 0.72 });
    const loadMat = new MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0.38 });
    const totalWidth = spec.bays * 0.72;

    for (let bay = 0; bay <= spec.bays; bay++) {
      const upright = new Mesh(new BoxGeometry(0.045, 1.15, 0.08), frameMat);
      upright.position.set(bay * 0.72 - totalWidth / 2, 0.58, 0);
      group.add(upright);
    }
    for (const y of [0.28, 0.68, 1.08]) {
      const shelf = new Mesh(new BoxGeometry(totalWidth + 0.08, 0.05, 0.54), shelfMat);
      shelf.position.y = y;
      group.add(shelf);
    }
    for (let bay = 0; bay < spec.bays; bay++) {
      for (const y of [0.48, 0.88]) {
        const load = new Mesh(new BoxGeometry(0.46, 0.22, 0.38), loadMat);
        load.position.set(bay * 0.72 - totalWidth / 2 + 0.36, y, 0);
        group.add(load);
      }
    }

    return group;
  }
  private _createZone(zone: ZoneSpec): Mesh {
    const geometry = new PlaneGeometry(zone.width, zone.depth);
    const material = new MeshBasicMaterial({
      color: zone.color,
      transparent: true,
      opacity: 0.18,
      side: DoubleSide,
      depthWrite: false,
    });
    const mesh = new Mesh(geometry, material);
    mesh.name = `wpf-zone-${zone.id}`;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(zone.x, 0.035, zone.z);
    mesh.renderOrder = 20;
    return mesh;
  }

  private _createFloorLabel(zone: ZoneSpec): Sprite {
    const sprite = this._createLabelSprite(zone.label, '#ffffff', '#111318', new Color(zone.color).getStyle(), 240, 62);
    sprite.name = `wpf-zone-label-${zone.id}`;
    sprite.position.set(zone.x, 0.08, zone.z);
    sprite.scale.set(1.35, 0.34, 1);
    return sprite;
  }

  private _createSign(sign: SignSpec): Sprite {
    const sprite = this._createLabelSprite(sign.text, '#ffffff', '#101319', sign.color, 560, 188, sign.subtext);
    sprite.name = `wpf-sign-${sign.text.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    sprite.position.set(sign.x, sign.y, sign.z);
    sprite.scale.set(sign.scale * 0.78, sign.scale * 0.26, 1);
    return sprite;
  }

  private _createStrip(strip: StripSpec): Mesh {
    const geometry = new PlaneGeometry(strip.width, strip.depth);
    const material = new MeshBasicMaterial({
      color: strip.color,
      transparent: true,
      opacity: strip.opacity,
      side: DoubleSide,
      depthWrite: false,
    });
    const mesh = new Mesh(geometry, material);
    mesh.name = `wpf-strip-${strip.name}`;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(strip.x, 0.06, strip.z);
    mesh.renderOrder = 25;
    return mesh;
  }

  private _createPallet(pallet: PalletSpec): Group {
    const group = new Group();
    group.name = `wpf-asset-${pallet.name}`;
    group.position.set(pallet.x, 0.1, pallet.z);

    const palletMat = new MeshBasicMaterial({ color: 0x8d6e63, transparent: true, opacity: 0.9 });
    const loadMat = new MeshBasicMaterial({ color: pallet.color, transparent: true, opacity: 0.78 });
    const base = new Mesh(new BoxGeometry(0.46, 0.1, 0.34), palletMat);
    const load = new Mesh(new BoxGeometry(0.38, 0.38, 0.28), loadMat);
    load.position.y = 0.25;
    group.add(base, load);
    return group;
  }

  private _createDockDoorFrame(): Group {
    const group = new Group();
    group.name = 'wpf-dock-4-door-frame';
    group.position.set(5.95, 0.75, -1.35);
    const material = new MeshBasicMaterial({ color: 0xffa726, transparent: true, opacity: 0.82 });
    const left = new Mesh(new BoxGeometry(0.08, 1.45, 0.08), material);
    const right = new Mesh(new BoxGeometry(0.08, 1.45, 0.08), material);
    const top = new Mesh(new BoxGeometry(1.35, 0.08, 0.08), material);
    left.position.x = -0.68;
    right.position.x = 0.68;
    top.position.y = 0.68;
    group.add(left, right, top);
    return group;
  }

  private _createFlowArrow(x: number, z: number, color: number, name: string): Group {
    const group = new Group();
    group.name = `wpf-${name}`;
    group.position.set(x, 0.075, z);

    const material = new MeshBasicMaterial({ color, transparent: true, opacity: 0.68, side: DoubleSide, depthWrite: false });
    const shaft = new Mesh(new PlaneGeometry(0.7, 0.08), material);
    shaft.rotation.x = -Math.PI / 2;
    const head = new Mesh(new CylinderGeometry(0, 0.18, 0.32, 3), material);
    head.rotation.x = -Math.PI / 2;
    head.rotation.z = -Math.PI / 2;
    head.position.x = 0.46;
    group.add(shaft, head);
    return group;
  }

  private _createBeacon(spec: BeaconSpec): Mesh {
    const geometry = new RingGeometry(0.16, 0.38, 32);
    const material = new MeshBasicMaterial({
      color: spec.color,
      transparent: true,
      opacity: 0.75,
      side: DoubleSide,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const mesh = new Mesh(geometry, material);
    mesh.name = 'wpf-status-beacon';
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(spec.x, 0.09, spec.z);
    mesh.renderOrder = 30;
    mesh.userData.pulsePhase = spec.phase;
    return mesh;
  }

  private _createLabelSprite(
    title: string,
    foreground: string,
    background: string,
    accent: string,
    width: number,
    height: number,
    subtitle?: string,
  ): Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create label canvas');

    const radius = 18;
    ctx.fillStyle = background;
    this._roundedRect(ctx, 0, 0, width, height, radius);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    this._roundedRect(ctx, 2, 2, width - 4, height - 4, radius);
    ctx.stroke();

    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, 10, height);

    ctx.fillStyle = foreground;
    ctx.font = subtitle ? '800 31px Arial' : '900 27px Arial';
    ctx.textBaseline = 'top';
    ctx.fillText(title, 26, subtitle ? 28 : 21);

    if (subtitle) {
      ctx.fillStyle = 'rgba(255,255,255,0.68)';
      ctx.font = '700 19px Arial';
      ctx.fillText(subtitle, 26, 82);
    }

    const texture = new CanvasTexture(canvas);
    const material = new SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new Sprite(material);
    sprite.renderOrder = 999;
    return sprite;
  }

  private _roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  /**
   * NOTE ON THE GROUND STACK (kept here because the fix lives elsewhere)
   *
   * The viewer draws its own 200x200 ground plane at y = 0 with a reflector
   * 2 mm under it, and our estate stack runs from y = -0.06 (fields) to
   * y = +0.01 (bay markings). That is four large near-coplanar surfaces in a
   * 7 cm band, viewed from 150-250 m where the depth buffer resolves ~134 mm
   * (near 0.01 / far 1000). Which surface won was decided per pixel by
   * rounding — the shimmer across the whole apron.
   *
   * The fix is `groundLayer()` in wakefield-exterior.ts: polygonOffset biases
   * each layer by a fixed number of depth-buffer units, which is
   * distance-independent and also wins against the stock plane, since ours
   * are all pulled towards the viewer and it is not.
   *
   * An earlier attempt turned the stock ground OFF from here instead. It did
   * not hold: `applyVisualSettings` re-applies `groundEnabled` from the
   * settings store after model plugins run and on every later settings
   * change, so the suppression was silently reverted (measured: the setter
   * worked, the value was true again once the scene settled). Latching it on
   * the first frame would have won that race and then fought the user's own
   * Settings toggle. Biasing our own geometry is the layer that actually
   * owns the problem.
   */
  private _clear(): void {
    if (!this._group) return;
    this._group.parent?.remove(this._group);
    this._group.traverse((obj: Object3D) => {
      const mesh = obj as Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const materials = mesh.material as Material | Material[] | undefined;
      const materialList = Array.isArray(materials) ? materials : materials ? [materials] : [];
      for (const material of materialList) {
        const maybeMap = (material as SpriteMaterial).map;
        maybeMap?.dispose();
        material.dispose();
      }
    });
    this._lod?.dispose();
    this._lod = null;
    this._tiles?.dispose();
    this._tiles = null;
    this._group = null;
    this._beacons = [];
  }
}
