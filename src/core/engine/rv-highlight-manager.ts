/**
 * RVHighlightManager — Central highlight system for the WebViewer.
 *
 * Provides a single "highlight slot" that shows semi-transparent orange overlays
 * + glowing edge outlines on any Object3D subtree. Used by:
 *   - RaycastManager hover (rv-raycast-manager.ts)
 *   - Notification card hover/click
 *   - Any future selection or inspection feature
 *
 * Only one highlight can be active at a time. Calling highlight() replaces
 * the previous one. Call clear() to remove all overlays.
 *
 * Two modes:
 *   - highlight(root)        — static snapshot (fast, for brief scene hover)
 *   - highlight(root, true)  — tracked: overlays follow moving meshes each frame
 */

import {
  Mesh,
  Color,
  MeshBasicMaterial,
  LineBasicMaterial,
  EdgesGeometry,
  LineSegments,
  Object3D,
  DoubleSide,
  Matrix4,
} from 'three';
import type { Scene, BufferGeometry } from 'three';
import type { InstancedMovingUnit } from './rv-mu';

// ─── Constants ────────────────────────────────────────────────────────

const HOVER_COLOR = new Color(0xffa040);
const HOVER_OPACITY = 0.18;
const EDGE_COLOR = new Color(0xffb060);
const EDGE_OPACITY = 0.7;
const EDGE_THRESHOLD_DEG = 30;

/** Shared overlay material — renders on top of everything */
const overlayMat = new MeshBasicMaterial({
  color: HOVER_COLOR,
  transparent: true,
  opacity: HOVER_OPACITY,
  depthTest: false,
  depthWrite: false,
  side: DoubleSide,
});
overlayMat.name = '_highlightOverlay';

/** Shared edge outline material */
const edgeMat = new LineBasicMaterial({
  color: EDGE_COLOR,
  transparent: true,
  opacity: EDGE_OPACITY,
  depthTest: false,
  depthWrite: false,
  linewidth: 1,
});

/** WeakMap cache for EdgesGeometry — avoids recomputing edges for the same BufferGeometry */
const edgeGeometryCache = new WeakMap<BufferGeometry, EdgesGeometry>();

// ─── Overlay Pair (fill + edge linked to source mesh) ────────────────

interface OverlayPair {
  source: Mesh;
  fill: Mesh;
  edge: LineSegments;
}

// ─── RVHighlightManager ──────────────────────────────────────────────

export class RVHighlightManager {
  private pairs: OverlayPair[] = [];
  /** When true, update() re-syncs overlay matrices from source meshes. */
  private tracked = false;

  constructor(private readonly scene: Scene) {}

  // ─── Private helpers ─────────────────────────────────────────────────

  /**
   * Create a fill overlay + edge outline pair for a single geometry,
   * positioned via `matrix`. Used by highlight(), highlightMultiple(),
   * and highlightInstancedMU() to avoid triplicating overlay creation.
   */
  private _createOverlayPair(
    geometry: BufferGeometry,
    matrix: Matrix4,
    sourceMesh: Mesh,
    namePrefix: string,
    thresholdRad: number,
  ): OverlayPair {
    const overlay = new Mesh(geometry, overlayMat);
    overlay.name = `${namePrefix}_hlOverlay`;
    overlay.userData._highlightOverlay = true;
    overlay.renderOrder = 1000;
    overlay.raycast = () => {};
    overlay.matrixAutoUpdate = false;
    overlay.matrixWorldAutoUpdate = false;
    overlay.matrix.copy(matrix);
    overlay.matrixWorld.copy(matrix);
    this.scene.add(overlay);

    let edgeGeo = edgeGeometryCache.get(geometry);
    if (!edgeGeo) {
      edgeGeo = new EdgesGeometry(geometry, thresholdRad);
      edgeGeometryCache.set(geometry, edgeGeo);
    }
    const edgeLines = new LineSegments(edgeGeo, edgeMat);
    edgeLines.name = `${namePrefix}_hlEdge`;
    edgeLines.userData._highlightOverlay = true;
    edgeLines.renderOrder = 1001;
    edgeLines.raycast = () => {};
    edgeLines.matrixAutoUpdate = false;
    edgeLines.matrixWorldAutoUpdate = false;
    edgeLines.matrix.copy(matrix);
    edgeLines.matrixWorld.copy(matrix);
    this.scene.add(edgeLines);

    return { source: sourceMesh, fill: overlay, edge: edgeLines };
  }

  // ─── Public API ──────────────────────────────────────────────────────

  /**
   * Highlight a subtree with orange overlay + edge glow.
   * Replaces any previous highlight.
   *
   * @param root     The root Object3D to highlight.
   * @param track    If true, overlays follow mesh movement each frame (call update()).
   * @param options  Extra options.
   */
  highlight(root: Object3D, track = false, options?: { includeSensorViz?: boolean; includeChildDrives?: boolean }): void {
    this.clear();
    this.tracked = track;
    const includeSensorViz = options?.includeSensorViz ?? false;
    const includeChildDrives = options?.includeChildDrives ?? false;
    const meshes = this.collectMeshes(root, includeSensorViz, includeChildDrives);
    const thresholdRad = EDGE_THRESHOLD_DEG * (Math.PI / 180);

    for (const mesh of meshes) {
      mesh.updateWorldMatrix(true, false);
      this.pairs.push(this._createOverlayPair(mesh.geometry, mesh.matrixWorld, mesh, mesh.name, thresholdRad));
    }
  }

  /**
   * Highlight an instanced MU by creating temporary overlay meshes
   * positioned at the instance's world-space matrix.
   *
   * Since InstancedMesh has no per-instance Object3D, we create a
   * temporary overlay using the pool's shared geometry and the instance's
   * matrix from the pool.
   */
  highlightInstancedMU(mu: InstancedMovingUnit): void {
    this.clear();
    this.tracked = false;

    const pool = mu.node.userData?._muPool;
    if (!pool || mu.slotIndex < 0) return;

    const geometry = mu.node.geometry;
    if (!geometry) return;

    // Get the instance's world matrix from the pool
    const mat = new Matrix4();
    mu.node.getMatrixAt(mu.slotIndex, mat);

    const thresholdRad = EDGE_THRESHOLD_DEG * (Math.PI / 180);
    // Create pair with a dummy source, then fix source to overlay (self-referential).
    // Instanced MU has no per-instance Object3D, so use overlay itself.
    // Since tracked=false, update() won't be called and the self-referential source is harmless.
    const pair = this._createOverlayPair(geometry, mat, null as unknown as Mesh, '__imu', thresholdRad);
    pair.source = pair.fill;
    this.pairs.push(pair);
  }

  /**
   * Re-sync overlay positions from source meshes.
   * Call once per render frame. No-op when not in tracked mode or no overlays.
   */
  update(): void {
    if (!this.tracked || this.pairs.length === 0) return;
    for (const { source, fill, edge } of this.pairs) {
      source.updateWorldMatrix(true, false);
      fill.matrix.copy(source.matrixWorld);
      fill.matrixWorld.copy(source.matrixWorld);
      edge.matrix.copy(source.matrixWorld);
      edge.matrixWorld.copy(source.matrixWorld);
    }
  }

  /**
   * Highlight multiple subtrees at once with orange overlay + edge glow.
   * Replaces any previous highlight. All roots are tracked.
   */
  highlightMultiple(roots: Object3D[], options?: { includeSensorViz?: boolean }): void {
    this.clear();
    this.tracked = true;
    const includeSensorViz = options?.includeSensorViz ?? false;
    const thresholdRad = EDGE_THRESHOLD_DEG * (Math.PI / 180);

    for (const root of roots) {
      const meshes = this.collectMeshes(root, includeSensorViz);
      for (const mesh of meshes) {
        mesh.updateWorldMatrix(true, false);
        this.pairs.push(this._createOverlayPair(mesh.geometry, mesh.matrixWorld, mesh, mesh.name, thresholdRad));
      }
    }
  }

  /** Remove all highlight overlays. */
  clear(): void {
    for (const { fill, edge } of this.pairs) {
      this.scene.remove(fill);
      this.scene.remove(edge);
    }
    // Note: EdgesGeometry is cached in the module-level WeakMap and NOT
    // disposed here — it will be garbage-collected when the source
    // BufferGeometry is disposed (WeakMap key collected).
    this.pairs.length = 0;
    this.tracked = false;
  }

  /** Whether any highlight is currently active */
  get isActive(): boolean {
    return this.pairs.length > 0;
  }

  dispose(): void {
    this.clear();
  }

  /**
   * Collect all Meshes under root, optionally stopping at child drive boundaries.
   * Skips existing overlay meshes.
   *
   * @param includeSensorViz    If true, includes _sensorViz meshes (for sensor highlights).
   * @param includeChildDrives  If true, doesn't stop at child drive boundaries (highlight entire subtree).
   */
  private collectMeshes(root: Object3D, includeSensorViz: boolean, includeChildDrives = false): Mesh[] {
    const meshes: Mesh[] = [];
    const visit = (node: Object3D, isRoot: boolean) => {
      if (!isRoot && !includeChildDrives) {
        const rv = node.userData?.realvirtual as Record<string, unknown> | undefined;
        if (rv?.['Drive']) return; // child drive boundary — don't highlight nested drives
      }
      if (
        (node as Mesh).isMesh &&
        !node.userData?._highlightOverlay &&
        !node.userData?._driveHoverOverlay
      ) {
        const isSensorViz = node.name.endsWith('_sensorViz');
        if (!isSensorViz || includeSensorViz) {
          meshes.push(node as Mesh);
        }
      }
      for (const child of node.children) visit(child, false);
    };
    visit(root, true);
    return meshes;
  }
}
