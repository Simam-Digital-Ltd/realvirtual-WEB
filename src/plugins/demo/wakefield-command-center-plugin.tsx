// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Wakefield command centre — the spatial hotspot layer and the zone strip.
 *
 * WHAT IT DOES
 * ------------
 * Projects each hotspot anchor to screen space every frame, thins the set by
 * zoom band, and publishes the result for the React layer to draw. Owns
 * selection (shared between the hotspot cards and the zone strip so the two
 * stay in step) and the click-to-fly camera moves.
 *
 * WHY THE PROJECTION LIVES HERE AND NOT IN REACT
 * ----------------------------------------------
 * Because the camera is a three.js object and React must not be reaching into
 * it on a render pass. The plugin is already on the frame clock via
 * `onRender`, so it does the maths and pushes plain numbers out; the layer
 * subscribes and stays a pure function of those numbers.
 *
 * FRAME BUDGET
 * ------------
 * Nine `Vector3.project` calls per frame is nothing. Re-rendering nine React
 * cards at 60 Hz while the user orbits is not nothing, so the change
 * notification is gated two ways: nothing is emitted unless something moved
 * more than {@link MOVE_EPSILON_PX}, and emits are capped at
 * {@link NOTIFY_HZ}. A parked camera costs zero renders.
 *
 * COORDINATE SPACE
 * ----------------
 * Projections are published in CLIENT coordinates (viewport-relative), not
 * canvas-relative. The overlay that draws them is inset from the canvas by
 * the app chrome and may sit under a CSS `zoom`, so it subtracts its own
 * bounding rect rather than trying to reproduce the inset arithmetic here.
 * One place converts, and it is the place that knows its own geometry.
 *
 * WHAT IS NOT DONE
 * ----------------
 * No occlusion culling: an anchor inside the hall still shows through the
 * wall. That is deliberate for now — it matches how the twin is read (you
 * are meant to see into the building) and a per-frame raycast per anchor is
 * a real cost for a debatable gain. If it ever needs doing, do it at a low
 * rate, not every frame.
 */

import { EventEmitter } from '../../core/rv-events';
import type { RVViewerPlugin } from '../../core/rv-plugin';
import type { UISlotEntry, UISlotProps } from '../../core/rv-ui-plugin';
import type { RVViewer } from '../../core/rv-viewer';
import type { LoadResult } from '../../core/engine/rv-scene-loader';
import { Vector3, type Scene } from 'three';
import { getProductionSnapshot } from '../../core/production-metrics';
import type { FleetVehicle } from './wakefield-fleet';
import {
  WAKEFIELD_HOTSPOTS,
  hotspotsForBand,
  ndcToScreen,
  projectionChanged,
  readHotspots,
  zoomBand,
  type HotspotDef,
  type HotspotReading,
  type Projection,
  type ZoomBand,
} from './wakefield-hotspots';
import {
  WAKEFIELD_ZONES,
  zoneById,
  zoneForHotspot,
  type SiteZone,
} from './wakefield-zones';
import {
  captureZone,
  createCaptureRig,
  disposeCaptureRig,
  type ThumbnailCapture,
} from './wakefield-thumbnails';
import { HotspotLayer } from './HotspotLayer';
import { ZoneStrip } from './ZoneStrip';
import { WakefieldEntryScreen } from './WakefieldEntryScreen';

/** Movement below this is not worth a React render. */
const MOVE_EPSILON_PX = 0.6;
/** Cap on change notifications while the camera is moving. */
const NOTIFY_HZ = 30;
/** Camera flight time for a zone click. */
const FLIGHT_SECONDS = 0.85;
/**
 * Frames to wait after load before capturing thumbnails.
 *
 * The scene keeps arriving for a while after `onModelLoaded` — dressing
 * plugins build their geometry on later frames, shadow maps settle, materials
 * compile. Capturing immediately gives you seven pictures of a half-built
 * factory, which is worse than no pictures at all.
 */
const CAPTURE_DELAY_FRAMES = 90;

export type { Projection };

export interface HotspotView {
  def: HotspotDef;
  reading: HotspotReading;
  projection: Projection;
}

type FleetLike = RVViewerPlugin & { vehicles: readonly FleetVehicle[] };

export class WakefieldCommandCenterPlugin extends EventEmitter implements RVViewerPlugin {
  readonly id = 'wakefield-command-center';
  /**
   * After the fleet plugin (440), so the first frame this runs the fleet
   * already has a trailer on the bay and the dock hotspot has something to
   * report instead of flashing "no trailer" for one frame.
   */
  readonly order = 450;

  private _viewer: RVViewer | null = null;
  private _band: ZoomBand = 'far';
  private _projections = new Map<string, Projection>();
  private _selectedId: string | null = null;
  private _hoveredId: string | null = null;
  private _selectedZoneId: string | null = null;
  private _thumbnails = new Map<string, string>();

  private _rig: ThumbnailCapture | null = null;
  private _captureQueue: SiteZone[] = [];
  private _framesUntilCapture = 0;

  private _notifyAccum = 0;
  private _dirty = false;

  /** Scratch vector — never allocate in a render callback. */
  private readonly _tmp = new Vector3();

  slots: UISlotEntry[] = [
    // Order 5 puts the layer beneath every docked panel, so a hotspot card
    // can never sit on top of the fleet or review panels.
    { slot: 'overlay', order: 5, component: (p: UISlotProps) => <HotspotLayer {...p} /> },
    { slot: 'overlay', order: 70, component: (p: UISlotProps) => <ZoneStrip {...p} /> },
    // The front door. Order 900 puts it above every other overlay: while it is
    // up it is the only thing the user should be able to reach.
    { slot: 'overlay', order: 900, component: (p: UISlotProps) => <WakefieldEntryScreen {...p} /> },
  ];

  /* ---- read side, for the React layer ---------------------------------- */

  get band(): ZoomBand { return this._band; }
  get selectedId(): string | null { return this._selectedId; }
  get hoveredId(): string | null { return this._hoveredId; }
  get selectedZoneId(): string | null { return this._selectedZoneId; }
  get zones(): readonly SiteZone[] { return WAKEFIELD_ZONES; }
  get thumbnails(): ReadonlyMap<string, string> { return this._thumbnails; }

  /** The canvas rect, so the overlay can convert client coords to its own. */
  get canvasRect(): DOMRect | null {
    const el = this._viewer?.renderer?.domElement;
    return el ? el.getBoundingClientRect() : null;
  }

  /**
   * Everything the layer needs to draw one frame: the hotspots visible at
   * this zoom, their live readings, and where they are on screen.
   */
  get views(): HotspotView[] {
    const viewer = this._viewer;
    if (!viewer) return [];

    const defs = hotspotsForBand(WAKEFIELD_HOTSPOTS, this._band);
    const fleet = viewer.getPlugin<FleetLike>('wakefield-fleet')?.vehicles ?? [];
    const readings = readHotspots(defs, { snapshot: getProductionSnapshot(), fleet });

    const out: HotspotView[] = [];
    for (const def of defs) {
      const projection = this._projections.get(def.id);
      const reading = readings.get(def.id);
      if (!projection || !reading) continue;
      out.push({ def, reading, projection });
    }
    return out;
  }

  /* ---- write side ------------------------------------------------------ */

  /**
   * Select a hotspot. Also selects its zone, so picking a callout lights the
   * matching card in the strip and vice versa — one selection, two views of
   * it, which is what makes the two feel like one instrument.
   */
  select(id: string | null): void {
    if (this._selectedId === id) return;
    this._selectedId = id;
    this._selectedZoneId = id ? (zoneForHotspot(id)?.id ?? null) : null;
    this.emit('selection-changed');
  }

  hover(id: string | null): void {
    if (this._hoveredId === id) return;
    this._hoveredId = id;
    this.emit('selection-changed');
  }

  /** Select a zone and fly the camera to its pose. */
  selectZone(id: string | null): void {
    this._selectedZoneId = id;
    // A zone owning exactly one hotspot selects it too; a zone with several
    // does not guess which one the user meant.
    const zone = id ? zoneById(id) : undefined;
    this._selectedId = zone && zone.hotspots.length === 1 ? zone.hotspots[0]! : null;
    this.emit('selection-changed');
    if (zone) this.flyTo(zone);
  }

  /** Fly to a zone's pose — the same pose its thumbnail was shot from. */
  flyTo(zone: SiteZone): void {
    const viewer = this._viewer;
    if (!viewer) return;
    viewer.animateCameraTo(
      new Vector3(zone.cameraPos.x, zone.cameraPos.y, zone.cameraPos.z),
      new Vector3(zone.cameraTarget.x, zone.cameraTarget.y, zone.cameraTarget.z),
      FLIGHT_SECONDS,
    );
  }

  /* ---- lifecycle ------------------------------------------------------- */

  init(viewer: RVViewer): void {
    this._viewer = viewer;
  }

  onModelLoaded(_result: LoadResult, viewer: RVViewer): void {
    this._viewer = viewer;
    this._selectedId = null;
    this._selectedZoneId = null;
    this._thumbnails.clear();
    this._captureQueue = [...WAKEFIELD_ZONES];
    this._framesUntilCapture = CAPTURE_DELAY_FRAMES;
    this.emit('selection-changed');
  }

  onModelCleared(): void {
    this._captureQueue = [];
    this._thumbnails.clear();
    this._projections.clear();
    this._selectedId = null;
    this._selectedZoneId = null;
    this.emit('selection-changed');
  }

  onRender(dt: number): void {
    const viewer = this._viewer;
    if (!viewer) return;

    this._project(viewer);
    this._pumpCaptures(viewer);

    // Rate-limit the React notification. `dt` can be large after a tab
    // regains focus, so this must not assume a 60 Hz frame.
    this._notifyAccum += dt;
    if (this._dirty && this._notifyAccum >= 1 / NOTIFY_HZ) {
      this._notifyAccum = 0;
      this._dirty = false;
      this.emit('hotspots-changed');
    }
  }

  dispose(): void {
    if (this._rig) {
      disposeCaptureRig(this._rig);
      this._rig = null;
    }
    this._captureQueue = [];
    this._projections.clear();
    this._thumbnails.clear();
    this.removeAllListeners();
    this._viewer = null;
  }

  /* ---- internals ------------------------------------------------------- */

  private _project(viewer: RVViewer): void {
    const camera = viewer.camera;
    const canvas = viewer.renderer?.domElement;
    if (!canvas) return;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;

    const rect = canvas.getBoundingClientRect();

    // Band comes from how far the camera is from the site, not from a zoom
    // slider — orbiting closer should reveal detail even though no control
    // was touched.
    const distance = camera.position.distanceTo(this._tmp.set(0, 0, -1.15));
    const band = zoomBand(distance);
    if (band !== this._band) {
      this._band = band;
      this._dirty = true;
    }

    const screen = { left: rect.left, top: rect.top, width: w, height: h };

    for (const def of WAKEFIELD_HOTSPOTS) {
      this._tmp.set(def.anchor.x, def.anchor.y, def.anchor.z).project(camera);

      // `ndcToScreen` owns the behind-camera and non-finite cases. Doing that
      // guarding here instead would put it outside the reach of the tests.
      const next = ndcToScreen(this._tmp.x, this._tmp.y, this._tmp.z, screen);

      if (projectionChanged(this._projections.get(def.id), next, MOVE_EPSILON_PX)) {
        this._projections.set(def.id, next);
        this._dirty = true;
      }
    }
  }

  /**
   * Capture at most ONE thumbnail per frame.
   *
   * `readRenderTargetPixels` stalls the GPU pipeline; seven of those in a row
   * is a visible hitch on first load. One per frame spreads the cost over a
   * tenth of a second nobody notices.
   */
  private _pumpCaptures(viewer: RVViewer): void {
    if (this._captureQueue.length === 0) return;

    // Never shoot before the HDR environment exists. Until it does the scene
    // has a single directional light and no ambient term, so a capture comes
    // back a black rectangle — and unlike the live view, which fixes itself a
    // moment later, a thumbnail is captured once and kept. This is why the
    // strip could come up as seven black cards on a cold cache.
    if (!(viewer.scene as Scene).environment) return;

    if (this._framesUntilCapture > 0) {
      this._framesUntilCapture--;
      return;
    }

    const zone = this._captureQueue.shift();
    if (!zone) return;

    if (!this._rig) this._rig = createCaptureRig();

    const url = captureZone(
      viewer.renderer,
      viewer.scene as Scene,
      zone,
      this._rig,
    );

    if (url) {
      this._thumbnails.set(zone.id, url);
      this.emit('thumbs-changed');
    }

    // Queue drained: the rig is a render target and a canvas, and neither is
    // needed again until the next model load.
    if (this._captureQueue.length === 0 && this._rig) {
      disposeCaptureRig(this._rig);
      this._rig = null;
    }
  }
}
