// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Wakefield region layer — Google photorealistic 3D tiles.
 *
 * The outermost rung of the zoom journey (`wakefield-lod.ts`): beyond ~220 m
 * the hand-built estate gives way to Google's photogrammetry of the real
 * ground around the site, so the demo starts from somewhere that actually
 * exists and dollies in to the simulated line.
 *
 * Placement: `Ellipsoid.getObjectFrame` returns the frame at a lat/lon in
 * ECEF. Inverting it and applying that to the tileset root brings our site to
 * the world origin with +Y up, which is what lets the tiles share a
 * coordinate system with the machine line rather than sitting on a globe.
 *
 * LAZY BY DESIGN. The renderer is not constructed until the region band is
 * first entered. Tile streaming is billed per session and costs bandwidth, so
 * a user who never zooms out must never trigger a request.
 *
 * Attribution is a licence condition, not a nicety: Google requires the data
 * attributions to be visible on screen whenever tiles are displayed.
 * `getAttribution()` exposes the current string for the HMI to render.
 */

import { Matrix4, MathUtils, type Camera, type Group } from 'three';
import { TilesRenderer, WGS84_ELLIPSOID } from '3d-tiles-renderer';
import { GoogleCloudAuthPlugin } from '3d-tiles-renderer/plugins';

/** Root tileset for Google's photorealistic coverage. */
const GOOGLE_3D_TILES_ROOT = 'https://tile.googleapis.com/v1/3dtiles/root.json';

/**
 * Site centre, taken from `siteBoundary` in `osm-map-plugin.tsx` so the 3D
 * view and the map view agree on where Wakefield Precision Foods is.
 */
export const WAKEFIELD_SITE = {
  lat: 53.6931,
  lon: -1.5034,
  /**
   * Height above the WGS84 ELLIPSOID, not above sea level — the two differ by
   * the geoid separation, which is roughly +48 m in this part of the UK.
   * Ground here is about 40 m AMSL, so ~88 m ellipsoidal.
   *
   * This is a calculated estimate and has NOT been visually calibrated. If the
   * tiles sit above or below the factory slab, this is the number to adjust.
   */
  ellipsoidHeight: 88,
} as const;

export interface WakefieldTilesOptions {
  apiToken: string;
  /** Larger = fewer tiles loaded. 16 is the library default; 32 is cheaper. */
  errorTarget?: number;
}

export class WakefieldTilesLayer {
  private _tiles: TilesRenderer | null = null;
  private _opts: WakefieldTilesOptions;
  private _parent: Group;
  private _attribution = '';
  private _failed = false;
  private _visible = false;

  constructor(parent: Group, opts: WakefieldTilesOptions) {
    this._parent = parent;
    this._opts = opts;
  }

  /** True once tiles exist in the scene. */
  get ready(): boolean { return this._tiles !== null; }
  /** Non-empty only while tiles are displayed. Must be shown on screen. */
  get attribution(): string { return this._visible ? this._attribution : ''; }
  /** Set when construction threw — the caller should stop asking. */
  get failed(): boolean { return this._failed; }

  /**
   * Show or hide the layer. The first `true` constructs the renderer and
   * begins streaming; subsequent calls only toggle visibility.
   */
  setVisible(visible: boolean): void {
    this._visible = visible;
    if (visible && !this._tiles && !this._failed) this._create();
    if (this._tiles) this._tiles.group.visible = visible;
  }

  /**
   * Call once per frame while visible, with the drawing-buffer size.
   *
   * Deliberately NOT `setResolutionFromRenderer`: that overload is typed to
   * `WebGLRenderer`, and this viewer can also run a WebGPU backend. Passing
   * the size directly keeps the layer working on both.
   */
  update(camera: Camera, width: number, height: number): void {
    if (!this._tiles || !this._visible) return;
    this._tiles.setCamera(camera);
    this._tiles.setResolution(camera, width, height);
    this._tiles.update();
  }

  dispose(): void {
    if (!this._tiles) return;
    this._tiles.group.removeFromParent();
    this._tiles.dispose();
    this._tiles = null;
    this._attribution = '';
  }

  private _create(): void {
    try {
      const tiles = new TilesRenderer(GOOGLE_3D_TILES_ROOT);
      tiles.registerPlugin(new GoogleCloudAuthPlugin({
        apiToken: this._opts.apiToken,
        autoRefreshToken: true,
      }));

      // Fewer, coarser tiles: this layer is only ever seen from >220 m, so
      // full detail would be bandwidth spent on pixels nobody resolves.
      tiles.errorTarget = this._opts.errorTarget ?? 32;

      // Bring the site to the world origin, +Y up.
      const frame = WGS84_ELLIPSOID.getObjectFrame(
        MathUtils.degToRad(WAKEFIELD_SITE.lat),
        MathUtils.degToRad(WAKEFIELD_SITE.lon),
        WAKEFIELD_SITE.ellipsoidHeight,
        0, 0, 0,
        new Matrix4(),
        // `frame` omitted: getObjectFrame defaults to OBJECT_FRAME (+Y up,
        // +Z forward), which is the three.js convention we need. The constant
        // itself is not re-exported from the package root.
      );
      frame.invert();
      tiles.group.matrix.copy(frame);
      tiles.group.matrix.decompose(
        tiles.group.position, tiles.group.quaternion, tiles.group.scale,
      );
      tiles.group.updateMatrixWorld(true);

      // The tileset must never participate in picking. The viewer raycasts the
      // scene for component selection and tooltips; a few hundred thousand
      // photogrammetry triangles under the cursor would both swamp that and
      // let users "select" a building that is not a simulation component.
      tiles.group.traverse((o) => { o.raycast = () => {}; });
      tiles.group.raycast = () => {};
      tiles.group.name = 'wpf-region-google-3d-tiles';
      tiles.group.visible = this._visible;

      // Attribution has to track what is actually loaded, so refresh it as
      // tiles arrive rather than setting it once.
      tiles.addEventListener('load-tile-set', () => this._refreshAttribution());
      tiles.addEventListener('load-model', () => this._refreshAttribution());

      this._parent.add(tiles.group);
      this._tiles = tiles;
    } catch (err) {
      // A missing key, a blocked referrer or a disabled Map Tiles API all land
      // here. Fail quiet and stay on the hand-built exterior — the region band
      // is an enhancement, and losing it must not take the demo down.
      this._failed = true;
      console.warn('[wakefield-tiles] region layer unavailable:', err);
    }
  }

  private _refreshAttribution(): void {
    if (!this._tiles) return;
    try {
      const parts = this._tiles.getAttributions() ?? [];
      const text = parts.map((a) => String(a.value)).filter(Boolean).join(' · ');
      this._attribution = text ? `Google · ${text}` : 'Google';
    } catch {
      this._attribution = 'Google';
    }
  }
}
