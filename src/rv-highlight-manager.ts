/**
 * RVHighlightManager — Central highlight system for the WebViewer.
 *
 * Provides a single "highlight slot" that shows semi-transparent orange overlays
 * + glowing edge outlines on any Object3D subtree. Used by:
 *   - Drive hover (rv-drive-hover.ts)
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
} from 'three';
import type { Scene } from 'three';

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

// ─── Overlay Pair (fill + edge linked to source mesh) ────────────────

interface OverlayPair {
  source: Mesh;
  fill: Mesh;
  edge: LineSegments;
}

// ─── RVHighlightManager ──────────────────────────────────────────────

export class RVHighlightManager {
  private pairs: OverlayPair[] = [];
  private edgeGeometries: EdgesGeometry[] = [];
  /** When true, update() re-syncs overlay matrices from source meshes. */
  private tracked = false;

  constructor(private readonly scene: Scene) {}

  /**
   * Highlight a subtree with orange overlay + edge glow.
   * Replaces any previous highlight.
   *
   * @param root     The root Object3D to highlight.
   * @param track    If true, overlays follow mesh movement each frame (call update()).
   * @param options  Extra options (includeSensorViz: include _sensorViz meshes).
   */
  highlight(root: Object3D, track = false, options?: { includeSensorViz?: boolean }): void {
    this.clear();
    this.tracked = track;
    const includeSensorViz = options?.includeSensorViz ?? false;
    const meshes = this.collectMeshes(root, includeSensorViz);
    const thresholdRad = EDGE_THRESHOLD_DEG * (Math.PI / 180);

    for (const mesh of meshes) {
      // Semi-transparent fill overlay
      const overlay = new Mesh(mesh.geometry, overlayMat);
      overlay.name = `${mesh.name}_hlOverlay`;
      overlay.userData._highlightOverlay = true;
      overlay.renderOrder = 1000;
      overlay.raycast = () => {};
      overlay.matrixAutoUpdate = false;
      overlay.matrixWorldAutoUpdate = false;
      mesh.updateWorldMatrix(true, false);
      overlay.matrix.copy(mesh.matrixWorld);
      overlay.matrixWorld.copy(mesh.matrixWorld);
      this.scene.add(overlay);

      // Edge outline
      const edgeGeo = new EdgesGeometry(mesh.geometry, thresholdRad);
      const edgeLines = new LineSegments(edgeGeo, edgeMat);
      edgeLines.name = `${mesh.name}_hlEdge`;
      edgeLines.userData._highlightOverlay = true;
      edgeLines.renderOrder = 1001;
      edgeLines.raycast = () => {};
      edgeLines.matrixAutoUpdate = false;
      edgeLines.matrixWorldAutoUpdate = false;
      edgeLines.matrix.copy(mesh.matrixWorld);
      edgeLines.matrixWorld.copy(mesh.matrixWorld);
      this.scene.add(edgeLines);
      this.edgeGeometries.push(edgeGeo);

      this.pairs.push({ source: mesh, fill: overlay, edge: edgeLines });
    }
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
        const overlay = new Mesh(mesh.geometry, overlayMat);
        overlay.name = `${mesh.name}_hlOverlay`;
        overlay.userData._highlightOverlay = true;
        overlay.renderOrder = 1000;
        overlay.raycast = () => {};
        overlay.matrixAutoUpdate = false;
        overlay.matrixWorldAutoUpdate = false;
        mesh.updateWorldMatrix(true, false);
        overlay.matrix.copy(mesh.matrixWorld);
        overlay.matrixWorld.copy(mesh.matrixWorld);
        this.scene.add(overlay);

        const edgeGeo = new EdgesGeometry(mesh.geometry, thresholdRad);
        const edgeLines = new LineSegments(edgeGeo, edgeMat);
        edgeLines.name = `${mesh.name}_hlEdge`;
        edgeLines.userData._highlightOverlay = true;
        edgeLines.renderOrder = 1001;
        edgeLines.raycast = () => {};
        edgeLines.matrixAutoUpdate = false;
        edgeLines.matrixWorldAutoUpdate = false;
        edgeLines.matrix.copy(mesh.matrixWorld);
        edgeLines.matrixWorld.copy(mesh.matrixWorld);
        this.scene.add(edgeLines);
        this.edgeGeometries.push(edgeGeo);

        this.pairs.push({ source: mesh, fill: overlay, edge: edgeLines });
      }
    }
  }

  /** Remove all highlight overlays. */
  clear(): void {
    for (const { fill, edge } of this.pairs) {
      this.scene.remove(fill);
      this.scene.remove(edge);
    }
    for (const geo of this.edgeGeometries) {
      geo.dispose();
    }
    this.pairs.length = 0;
    this.edgeGeometries.length = 0;
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
   * Collect all Meshes under root, stopping at child drive boundaries.
   * Skips existing overlay meshes.
   *
   * @param includeSensorViz  If true, includes _sensorViz meshes (for sensor highlights).
   */
  private collectMeshes(root: Object3D, includeSensorViz: boolean): Mesh[] {
    const meshes: Mesh[] = [];
    const visit = (node: Object3D, isRoot: boolean) => {
      if (!isRoot) {
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
