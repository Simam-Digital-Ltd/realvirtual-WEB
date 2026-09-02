// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Wakefield entry plugin — makes the way into the factory clickable.
 *
 * Owns the world-space markers built by `wakefield-entry-hotspots.ts`: adds
 * them on model load, keeps them sized and hidden at the right times, and
 * flies the camera in when one is clicked.
 *
 * WHY A SEPARATE PLUGIN FROM THE DRESSING
 * ---------------------------------------
 * The dressing plugin builds scenery. This one owns an INPUT SURFACE — it
 * binds a pointer listener, hit-tests, and moves the camera. Those have
 * different failure modes and very different disposal requirements (a leaked
 * mesh is a few KB; a leaked pointer listener that moves the camera is a
 * haunting), so they get separate lifecycles.
 *
 * CLICK HANDLING NOTES
 *   - Bound on the canvas, not on window, so it cannot fire while the user is
 *     interacting with HMI panels layered above the scene.
 *   - A drag is not a click. Orbiting the camera almost always ends with the
 *     pointer over something, and treating that as a click would teleport the
 *     viewer mid-gesture. Movement beyond a few pixels disqualifies it.
 *   - Only our own marker group is raycast, so this can never swallow a click
 *     meant for a machine, and costs nothing on a 20k-node scene.
 */

import { Group, Raycaster, Vector2, Vector3 } from 'three';
import type { RVViewerPlugin } from '../../core/rv-plugin';
import type { RVViewer } from '../../core/rv-viewer';
import type { LoadResult } from '../../core/engine/rv-scene-loader';
import {
  ENTRY_HOTSPOTS,
  createEntryHotspots,
  hotspotIdFor,
  updateEntryHotspots,
} from './wakefield-entry-hotspots';

/** Flight time into the building. Long enough to read as travel, short
 *  enough that a demo audience does not wait on it. */
const FLIGHT_SECONDS = 1.6;
/** Pointer travel (px) beyond which the gesture was a drag, not a click. */
const DRAG_SLOP_PX = 5;
/** Camera distance from site centre under which the shell is already open.
 *  Mirrors BANDS.buildingExit in wakefield-lod.ts. */
const INSIDE_DISTANCE = 24;

const SITE_CENTRE = new Vector3(0, 0, -1.15);

export class WakefieldEntryPlugin implements RVViewerPlugin {
  readonly id = 'wakefield-entry';
  readonly name = 'Wakefield Entry Hotspots';
  /** After the dressing (which builds the site) and before the ground guard. */
  readonly order = 430;

  private _viewer: RVViewer | null = null;
  private _group: Group | null = null;
  private _raycaster = new Raycaster();
  private _pointer = new Vector2();
  private _downAt: { x: number; y: number } | null = null;
  private _onPointerDown: ((e: PointerEvent) => void) | null = null;
  private _onPointerUp: ((e: PointerEvent) => void) | null = null;
  private _tmp = new Vector3();

  onModelLoaded(_result: LoadResult, viewer: RVViewer): void {
    this._viewer = viewer;
    this._teardown();

    const group = createEntryHotspots();
    viewer.scene.add(group);
    this._group = group;

    const canvas = viewer.renderer.domElement;
    this._onPointerDown = (e) => { this._downAt = { x: e.clientX, y: e.clientY }; };
    this._onPointerUp = (e) => this._handleClick(e);
    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointerup', this._onPointerUp);
  }

  onModelCleared(): void {
    this._teardown();
  }

  onRender(): void {
    const viewer = this._viewer;
    const group = this._group;
    if (!viewer || !group) return;

    const camera = viewer.camera;
    if (!camera) return;

    const distance = this._tmp.setFromMatrixPosition(camera.matrixWorld).distanceTo(SITE_CENTRE);
    updateEntryHotspots(group, camera, distance < INSIDE_DISTANCE);
  }

  /** Fly to a hotspot by id. Public so the guided review or a deep link can
   *  reuse the same journey rather than reimplementing the camera move. */
  enter(hotspotId: string): boolean {
    const viewer = this._viewer;
    const hotspot = ENTRY_HOTSPOTS.find((h) => h.id === hotspotId);
    if (!viewer || !hotspot) return false;
    viewer.animateCameraTo(hotspot.cameraPos.clone(), hotspot.cameraTarget.clone(), FLIGHT_SECONDS);
    return true;
  }

  private _handleClick(event: PointerEvent): void {
    const viewer = this._viewer;
    const group = this._group;
    const down = this._downAt;
    this._downAt = null;
    if (!viewer || !group || !down) return;

    // Orbiting ends with the pointer over something. Only a near-stationary
    // press counts, or every camera drag would teleport the viewer.
    if (Math.abs(event.clientX - down.x) > DRAG_SLOP_PX) return;
    if (Math.abs(event.clientY - down.y) > DRAG_SLOP_PX) return;

    const camera = viewer.camera;
    if (!camera) return;

    const canvas = viewer.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    this._pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this._raycaster.setFromCamera(this._pointer, camera);
    // Only our markers — cheap, and it cannot steal a click from the model.
    const hits = this._raycaster.intersectObject(group, true);
    if (hits.length === 0) return;

    const id = hotspotIdFor(hits[0]?.object);
    if (id) this.enter(id);
  }

  private _teardown(): void {
    const viewer = this._viewer;
    if (viewer) {
      const canvas = viewer.renderer.domElement;
      if (this._onPointerDown) canvas.removeEventListener('pointerdown', this._onPointerDown);
      if (this._onPointerUp) canvas.removeEventListener('pointerup', this._onPointerUp);
    }
    this._onPointerDown = null;
    this._onPointerUp = null;
    this._downAt = null;

    const group = this._group;
    if (group) {
      group.parent?.remove(group);
      group.traverse((obj) => {
        const anyObj = obj as { geometry?: { dispose(): void }; material?: { map?: { dispose(): void }; dispose(): void } };
        anyObj.geometry?.dispose();
        anyObj.material?.map?.dispose();
        anyObj.material?.dispose();
      });
    }
    this._group = null;
  }

  dispose(): void {
    this._teardown();
    this._viewer = null;
  }
}
