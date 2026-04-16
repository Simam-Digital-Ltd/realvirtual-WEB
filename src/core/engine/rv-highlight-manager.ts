// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * RVHighlightManager — Central highlight system for the WebViewer.
 *
 * Two independent highlight channels:
 *   - **Hover** (orange): Temporary overlays shown on mouse hover.
 *     Managed by RaycastManager. Call highlight()/clear().
 *   - **Selection** (cyan): Persistent overlays for selected objects.
 *     Managed by SelectionManager. Call highlightSelection()/clearSelection().
 *
 * Both channels can be active simultaneously — hovering a different object
 * while a selection is active shows both colors.
 *
 * Two tracking modes per channel:
 *   - static snapshot (fast, for brief hover)
 *   - tracked: overlays follow moving meshes each frame
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
  Box3,
  Box3Helper,
} from 'three';
import type { Scene, BufferGeometry } from 'three';
import type { InstancedMovingUnit } from './rv-mu';

// ─── Constants ────────────────────────────────────────────────────────

const HOVER_COLOR = new Color(0xffb870);
const HOVER_OPACITY = 0.10;
const HOVER_EDGE_COLOR = new Color(0xffc080);
const HOVER_EDGE_OPACITY = 0.4;

const SELECTION_COLOR = new Color(0x4fc3f7);
const SELECTION_OPACITY = 0.25;
const SELECTION_EDGE_COLOR = new Color(0x4fc3f7);
const SELECTION_EDGE_OPACITY = 0.8;

const ALARM_COLOR = new Color(0xff0000);
const ALARM_OPACITY = 0.35;
const ALARM_EDGE_COLOR = new Color(0xff3333);
const ALARM_EDGE_OPACITY = 1.0;

const EDGE_THRESHOLD_DEG = 30;

/** Max meshes for hover highlight — above this, show bounding-box wireframe instead. */
const MAX_HOVER_MESHES = 50;

// ─── Shared Materials ─────────────────────────────────────────────────

/** Hover overlay material — renders on top of everything */
const hoverOverlayMat = new MeshBasicMaterial({
  color: HOVER_COLOR,
  transparent: true,
  opacity: HOVER_OPACITY,
  depthTest: false,
  depthWrite: false,
  side: DoubleSide,
});
hoverOverlayMat.name = '_highlightOverlay';

/** Hover edge outline material */
const hoverEdgeMat = new LineBasicMaterial({
  color: HOVER_EDGE_COLOR,
  transparent: true,
  opacity: HOVER_EDGE_OPACITY,
  depthTest: false,
  depthWrite: false,
  linewidth: 1,
});

/** Selection overlay material — cyan, slightly more opaque than hover */
const selectionOverlayMat = new MeshBasicMaterial({
  color: SELECTION_COLOR,
  transparent: true,
  opacity: SELECTION_OPACITY,
  depthTest: false,
  depthWrite: false,
  side: DoubleSide,
});
selectionOverlayMat.name = '_selectionOverlay';

/** Selection edge outline material */
const selectionEdgeMat = new LineBasicMaterial({
  color: SELECTION_EDGE_COLOR,
  transparent: true,
  opacity: SELECTION_EDGE_OPACITY,
  depthTest: false,
  depthWrite: false,
  linewidth: 1,
});

/** Alarm overlay material — red, pulsing (opacity updated by AlarmRadarPlugin) */
const alarmOverlayMat = new MeshBasicMaterial({
  color: ALARM_COLOR,
  transparent: true,
  opacity: ALARM_OPACITY,
  depthTest: false,
  depthWrite: false,
  side: DoubleSide,
});
alarmOverlayMat.name = '_alarmOverlay';

/** Alarm edge outline material */
const alarmEdgeMat = new LineBasicMaterial({
  color: ALARM_EDGE_COLOR,
  transparent: true,
  opacity: ALARM_EDGE_OPACITY,
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
  /** Hover overlay pairs. */
  private hoverPairs: OverlayPair[] = [];
  /** Selection overlay pairs (persistent). */
  private selectionPairs: OverlayPair[] = [];
  /** Alarm overlay pairs (red, pulsing). */
  private alarmPairs: OverlayPair[] = [];
  /** When true, update() re-syncs hover overlay matrices from source meshes. */
  private hoverTracked = false;
  /** When true, update() re-syncs selection overlay matrices. */
  private selectionTracked = false;
  /** When true, update() re-syncs alarm overlay matrices. */
  private alarmTracked = false;

  constructor(private readonly scene: Scene) {}

  // ─── Private helpers ─────────────────────────────────────────────────

  /**
   * Create a fill overlay + edge outline pair for a single geometry,
   * positioned via `matrix`. Accepts materials so it can serve both
   * hover and selection channels.
   */
  private _createOverlayPair(
    geometry: BufferGeometry,
    matrix: Matrix4,
    sourceMesh: Mesh,
    namePrefix: string,
    thresholdRad: number,
    fillMat: MeshBasicMaterial,
    edgeMaterial: LineBasicMaterial,
    renderOrderBase: number,
  ): OverlayPair {
    const overlay = new Mesh(geometry, fillMat);
    overlay.name = `${namePrefix}_hlOverlay`;
    overlay.userData._highlightOverlay = true;
    overlay.renderOrder = renderOrderBase;
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
    const edgeLines = new LineSegments(edgeGeo, edgeMaterial);
    edgeLines.name = `${namePrefix}_hlEdge`;
    edgeLines.userData._highlightOverlay = true;
    edgeLines.renderOrder = renderOrderBase + 1;
    edgeLines.raycast = () => {};
    edgeLines.matrixAutoUpdate = false;
    edgeLines.matrixWorldAutoUpdate = false;
    edgeLines.matrix.copy(matrix);
    edgeLines.matrixWorld.copy(matrix);
    this.scene.add(edgeLines);

    return { source: sourceMesh, fill: overlay, edge: edgeLines };
  }

  /** Remove overlay pairs from the scene. */
  private _removePairs(pairs: OverlayPair[]): void {
    for (const { fill, edge } of pairs) {
      this.scene.remove(fill);
      this.scene.remove(edge);
    }
    pairs.length = 0;
  }

  /** Sync tracked overlay positions. */
  private _syncPairs(pairs: OverlayPair[]): void {
    for (const { source, fill, edge } of pairs) {
      source.updateWorldMatrix(true, false);
      fill.matrix.copy(source.matrixWorld);
      fill.matrixWorld.copy(source.matrixWorld);
      edge.matrix.copy(source.matrixWorld);
      edge.matrixWorld.copy(source.matrixWorld);
    }
  }

  // ─── Hover API (temporary highlights) ──────────────────────────────

  /**
   * Highlight a subtree with orange hover overlay + edge glow.
   * Replaces any previous hover highlight. Does NOT affect selection.
   */
  highlight(root: Object3D, track = false, options?: { includeSensorViz?: boolean; includeChildDrives?: boolean }): void {
    this.clear();
    this.hoverTracked = track;
    const includeSensorViz = options?.includeSensorViz ?? false;
    const includeChildDrives = options?.includeChildDrives ?? false;
    const meshes = this.collectMeshes(root, includeSensorViz, includeChildDrives);

    if (meshes.length > MAX_HOVER_MESHES) {
      this._highlightBoundingBox(root);
      return;
    }

    const thresholdRad = EDGE_THRESHOLD_DEG * (Math.PI / 180);
    for (const mesh of meshes) {
      mesh.updateWorldMatrix(true, false);
      this.hoverPairs.push(this._createOverlayPair(
        mesh.geometry, mesh.matrixWorld, mesh, mesh.name, thresholdRad,
        hoverOverlayMat, hoverEdgeMat, 1000,
      ));
    }
  }

  /**
   * Highlight an instanced MU by creating temporary hover overlay meshes.
   */
  highlightInstancedMU(mu: InstancedMovingUnit): void {
    this.clear();
    this.hoverTracked = false;

    const pool = mu.node.userData?._muPool;
    if (!pool || mu.slotIndex < 0) return;

    const geometry = mu.node.geometry;
    if (!geometry) return;

    const mat = new Matrix4();
    mu.node.getMatrixAt(mu.slotIndex, mat);

    const thresholdRad = EDGE_THRESHOLD_DEG * (Math.PI / 180);
    const pair = this._createOverlayPair(
      geometry, mat, null as unknown as Mesh, '__imu', thresholdRad,
      hoverOverlayMat, hoverEdgeMat, 1000,
    );
    pair.source = pair.fill;
    this.hoverPairs.push(pair);
  }

  /**
   * Highlight multiple subtrees at once with orange hover overlay.
   * Replaces any previous hover highlight.
   */
  highlightMultiple(roots: Object3D[], options?: { includeSensorViz?: boolean }): void {
    this.clear();
    this.hoverTracked = true;
    const includeSensorViz = options?.includeSensorViz ?? false;

    // Collect all meshes first to check total count
    const allMeshes: { root: Object3D; meshes: Mesh[] }[] = [];
    let totalMeshes = 0;
    for (const root of roots) {
      const meshes = this.collectMeshes(root, includeSensorViz);
      allMeshes.push({ root, meshes });
      totalMeshes += meshes.length;
    }

    if (totalMeshes > MAX_HOVER_MESHES) {
      for (const { root } of allMeshes) this._highlightBoundingBox(root);
      return;
    }

    const thresholdRad = EDGE_THRESHOLD_DEG * (Math.PI / 180);
    for (const { meshes } of allMeshes) {
      for (const mesh of meshes) {
        mesh.updateWorldMatrix(true, false);
        this.hoverPairs.push(this._createOverlayPair(
          mesh.geometry, mesh.matrixWorld, mesh, mesh.name, thresholdRad,
          hoverOverlayMat, hoverEdgeMat, 1000,
        ));
      }
    }
  }

  /** Remove hover highlight overlays only. Selection persists. */
  clear(): void {
    this._removePairs(this.hoverPairs);
    this.hoverTracked = false;
  }

  /** Whether any hover highlight is currently active. */
  get isActive(): boolean {
    return this.hoverPairs.length > 0;
  }

  // ─── Selection API (persistent highlights) ─────────────────────────

  /**
   * Highlight multiple subtrees with cyan selection overlay + edge glow.
   * Replaces any previous selection highlight. Does NOT affect hover.
   * Selection overlays are always tracked (follow moving meshes).
   */
  highlightSelection(roots: Object3D[], options?: { includeSensorViz?: boolean; includeChildDrives?: boolean }): void {
    this.clearSelection();
    if (roots.length === 0) return;
    this.selectionTracked = true;
    const includeSensorViz = options?.includeSensorViz ?? false;
    const includeChildDrives = options?.includeChildDrives ?? false;
    const thresholdRad = EDGE_THRESHOLD_DEG * (Math.PI / 180);

    for (const root of roots) {
      const meshes = this.collectMeshes(root, includeSensorViz, includeChildDrives);
      for (const mesh of meshes) {
        mesh.updateWorldMatrix(true, false);
        this.selectionPairs.push(this._createOverlayPair(
          mesh.geometry, mesh.matrixWorld, mesh, mesh.name + '_sel', thresholdRad,
          selectionOverlayMat, selectionEdgeMat, 900,
        ));
      }
    }
  }

  /** Remove selection highlight overlays only. Hover persists. */
  clearSelection(): void {
    this._removePairs(this.selectionPairs);
    this.selectionTracked = false;
  }

  /** Whether any selection highlight is currently active. */
  get isSelectionActive(): boolean {
    return this.selectionPairs.length > 0;
  }

  // ─── Alarm API (visual faults) ─────────────────────────────────────

  /** 
   * Highlight a subtree with red alarm overlay. 
   * Unlike hover/selection, multiple alarms can be active at once.
   */
  highlightAlarm(root: Object3D, id: string): void {
    this.alarmTracked = true;
    const thresholdRad = EDGE_THRESHOLD_DEG * (Math.PI / 180);
    const meshes = this.collectMeshes(root, false, true);
    
    for (const mesh of meshes) {
      mesh.updateWorldMatrix(true, false);
      const pair = this._createOverlayPair(
        mesh.geometry, mesh.matrixWorld, mesh, `${id}_alarm`, thresholdRad,
        alarmOverlayMat, alarmEdgeMat, 1100,
      );
      // Give the meshes a specific marker so we can clear them by ID
      pair.fill.userData.alarmId = id;
      pair.edge.userData.alarmId = id;
      this.alarmPairs.push(pair);
    }
  }

  /** Remove alarm highlight overlays for a specific ID. */
  clearAlarm(id: string): void {
    const toRemove = this.alarmPairs.filter(p => p.fill.userData.alarmId === id);
    for (const { fill, edge } of toRemove) {
      this.scene.remove(fill);
      this.scene.remove(edge);
    }
    this.alarmPairs = this.alarmPairs.filter(p => p.fill.userData.alarmId !== id);
    if (this.alarmPairs.length === 0) this.alarmTracked = false;
  }

  /** Update pulsing effect for all active alarms. */
  updateAlarmPulse(time: number): void {
    if (this.alarmPairs.length === 0) return;
    const pulse = (Math.sin(time * 6) + 1) * 0.5; // 0 to 1
    alarmOverlayMat.opacity = ALARM_OPACITY * (0.5 + 0.5 * pulse);
    alarmEdgeMat.opacity = ALARM_EDGE_OPACITY * (0.8 + 0.2 * pulse);
  }

  get isAlarmActive(): boolean {
    return this.alarmPairs.length > 0;
  }

  // ─── Common API ────────────────────────────────────────────────────

  /**
   * Re-sync overlay positions from source meshes (both channels).
   * Call once per render frame. No-op when nothing is tracked.
   */
  update(): void {
    if (this.hoverTracked && this.hoverPairs.length > 0) {
      this._syncPairs(this.hoverPairs);
    }
    if (this.selectionTracked && this.selectionPairs.length > 0) {
      this._syncPairs(this.selectionPairs);
    }
    if (this.alarmTracked && this.alarmPairs.length > 0) {
      this._syncPairs(this.alarmPairs);
    }
  }

  /** Remove all overlays (both hover and selection). */
  clearAll(): void {
    this.clear();
    this.clearSelection();
  }

  dispose(): void {
    this.clearAll();
  }

  /** Cheap bounding-box wireframe highlight for components with too many meshes. */
  private _highlightBoundingBox(root: Object3D): void {
    const box = new Box3().setFromObject(root);
    if (box.isEmpty()) return;
    const helper = new Box3Helper(box, HOVER_EDGE_COLOR);
    helper.userData._highlightOverlay = true;
    helper.renderOrder = 1000;
    helper.raycast = () => {};
    this.scene.add(helper);
    this.hoverPairs.push({ source: root as unknown as Mesh, fill: helper as unknown as Mesh, edge: helper as unknown as LineSegments });
  }

  /**
   * Collect all Meshes under root, optionally stopping at child drive boundaries.
   * Skips existing overlay meshes.
   */
  private collectMeshes(root: Object3D, includeSensorViz: boolean, includeChildDrives = false): Mesh[] {
    const meshes: Mesh[] = [];
    const visit = (node: Object3D, isRoot: boolean) => {
      if (!isRoot && !includeChildDrives) {
        const rv = node.userData?.realvirtual as Record<string, unknown> | undefined;
        if (rv?.['Drive']) return; // child drive boundary — don't highlight nested drives
      }
      // Skip hidden kinematic source meshes (originals hidden by merge).
      // Merged chunks (_rvKinGroupMerged) are kept — they're visible and
      // represent the Drive subtree for highlighting.
      if (node.userData?._rvKinGroupSource) return;
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
