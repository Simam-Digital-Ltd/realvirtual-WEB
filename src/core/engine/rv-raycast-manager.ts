/**
 * RaycastManager — Unified raycast system for the realvirtual Web Viewer.
 *
 * Consolidates drive hover, scene click, and XR controller raycasting
 * into a single Three.js Raycaster with layer-based filtering.
 *
 * Three.js Layers provide hardware-level bit-mask filtering (zero-cost).
 * Each node type (Drive, Sensor, MU, etc.) occupies its own layer.
 * Plugins register targets via registerTargets(), and the raycaster
 * only tests meshes on enabled layers.
 *
 * This class does NOT touch rv-sensor.ts — that remains a separate
 * O(1) physics raycast system.
 */

import {
  Raycaster,
  Vector2,
  Vector3,
  Mesh,
  InstancedMesh,
  Object3D,
  Layers,
  Matrix4,
} from 'three';
import type { Camera, PerspectiveCamera, Scene } from 'three';
import { RaycastLayers, type RaycastLayerName } from './rv-raycast-layers';
import type { NodeRegistry } from './rv-node-registry';
import type { RVHighlightManager } from './rv-highlight-manager';
import type { RVDrive } from './rv-drive';
import type { MUInstancePool, InstancedMovingUnit } from './rv-mu';

/** Data emitted with 'object-hover'. */
export interface ObjectHoverData {
  /** The hovered node (Object3D with realvirtual userData). */
  node: Object3D;
  /** Type of the node (e.g. 'Drive', 'Sensor', 'MU'). */
  nodeType: string;
  /** Hierarchy path of the node. */
  nodePath: string;
  /** Mouse/touch position in screen coordinates. */
  pointer: { x: number; y: number };
  /** The actual mesh that was hit (not the node itself). */
  mesh: Object3D;
}

/** Data emitted with 'object-unhover'. */
export interface ObjectUnhoverData {
  node: Object3D;
  nodeType: string;
}

/** Data emitted with 'object-click'. */
export interface ObjectClickData {
  node: Object3D;
  nodeType: string;
  nodePath: string;
  pointer: { x: number; y: number };
}

/** Minimal event emitter interface to avoid circular dependency with RVViewer. */
interface ViewerEmitter {
  emit(event: string, data?: unknown): void;
}


const THROTTLE_MS = 50;

/** Filter function to exclude meshes from raycasting (overlays, etc.). */
export type ExcludeFilter = (mesh: Object3D) => boolean;

/**
 * Override function for ancestor resolution.
 * Given a candidate node (found by standard walk-up), return a different
 * ancestor node to use as the resolved target, or null to skip.
 */
export type AncestorOverrideFn = (node: Object3D) => Object3D | null;

export class RaycastManager {
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private lastRaycastMs = 0;

  /** Currently hovered realvirtual node (not the mesh, but its registered ancestor). */
  private _hoveredNode: Object3D | null = null;
  /** Node type of the currently hovered node. */
  private _hoveredNodeType: string | null = null;
  /** Path of the currently hovered node. */
  private _hoveredNodePath: string | null = null;

  /** Currently hovered instanced MU (for identity comparison). */
  private _hoveredInstancedMU: InstancedMovingUnit | null = null;

  /** When false, hover raycasting is suppressed (e.g. during orbit/pinch). */
  private _enabled = true;
  /** When true, hover highlight is held (not cleared). Used while context menu is open. */
  private _holdHover = false;
  /** Last known pointer position for UI tooltip positioning. */
  pointerClientX = 0;
  pointerClientY = 0;

  /** Last XR controller ray origin (for ray visualization). */
  lastRayOrigin: Vector3 | null = null;
  /** Last XR controller ray direction (for ray visualization). */
  lastRayDirection: Vector3 | null = null;

  /** Registered targets by type. */
  private _targetsByType = new Map<RaycastLayerName, Object3D[]>();
  /** Exclude filters applied to intersections. */
  private _excludeFilters: ExcludeFilter[] = [];
  /** Which hover types are currently enabled (mapped to raycaster.layers). */
  private _enabledTypes = new Set<RaycastLayerName>();
  /** Ancestor override callbacks — first non-null result wins. */
  private _ancestorOverrides: AncestorOverrideFn[] = [];

  private readonly onPointerMove: (e: PointerEvent) => void;

  // Pre-allocated vectors for XR
  private readonly _xrOrigin = new Vector3();
  private readonly _xrDir = new Vector3();

  constructor(
    private readonly renderer: { readonly domElement: HTMLCanvasElement },
    private readonly camera: Camera,
    private readonly scene: Scene,
    private readonly registry: NodeRegistry,
    private readonly highlighter: RVHighlightManager,
    private readonly emitter: ViewerEmitter,
  ) {
    // Enable firstHitOnly for BVH-accelerated raycasting (massive speedup)
    this.raycaster.firstHitOnly = true;

    this.onPointerMove = this._handlePointerMove.bind(this);
    renderer.domElement.addEventListener('pointermove', this.onPointerMove);

    // Default exclude filters (same as the old rv-drive-hover.ts)
    this._excludeFilters.push(
      (obj) => !!obj.userData?._highlightOverlay,
      (obj) => !!obj.userData?._driveHoverOverlay,
      (obj) => obj.name.endsWith('_sensorViz'),
    );

    // Default: only drives are hoverable
    this.enableHoverType('DRIVE', true);
    this._updateRaycasterLayers();
  }

  // ─── Public API ──────────────────────────────────────────────────

  /** The currently hovered realvirtual node (null if nothing hovered). */
  get hoveredNode(): Object3D | null { return this._hoveredNode; }

  /** The type of the currently hovered node (e.g. 'Drive'). */
  get hoveredNodeType(): string | null { return this._hoveredNodeType; }

  /** The hierarchy path of the currently hovered node. */
  get hoveredNodePath(): string | null { return this._hoveredNodePath; }

  /** Enable/disable all hover detection (e.g. during orbit gestures). */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    if (!enabled) this._clearHover();
  }

  /** Whether hover detection is currently enabled. */
  get enabled(): boolean { return this._enabled; }

  /** Hold the current hover highlight (prevents clearing). Used while context menu is open. */
  set holdHover(hold: boolean) { this._holdHover = hold; }
  get holdHover(): boolean { return this._holdHover; }

  /**
   * Register targets for a node type. Sets the corresponding layer
   * on all child meshes of each target.
   */
  registerTargets(nodeType: RaycastLayerName, targets: Object3D[]): void {
    const layer = RaycastLayers[nodeType];
    this._targetsByType.set(nodeType, targets);

    for (const target of targets) {
      target.traverse((child) => {
        if ((child as Mesh).isMesh
          && !child.userData?._highlightOverlay
          && !child.userData?._driveHoverOverlay) {
          child.layers.enable(layer);
        }
      });
    }
  }

  /**
   * Update targets for a type: removes old layer bits, registers new targets.
   */
  updateTargets(nodeType: RaycastLayerName, targets: Object3D[]): void {
    // Remove old layers
    const oldTargets = this._targetsByType.get(nodeType);
    if (oldTargets) {
      const layer = RaycastLayers[nodeType];
      for (const target of oldTargets) {
        target.traverse((child) => {
          if ((child as Mesh).isMesh) {
            child.layers.disable(layer);
          }
        });
      }
    }
    // Register new
    this.registerTargets(nodeType, targets);
  }

  /** Clear all targets: reset layers and internal maps. */
  clearTargets(): void {
    for (const [typeName, targets] of this._targetsByType) {
      const layer = RaycastLayers[typeName];
      for (const target of targets) {
        target.traverse((child) => {
          if ((child as Mesh).isMesh) {
            child.layers.disable(layer);
          }
        });
      }
    }
    this._targetsByType.clear();
    this._clearHover();
  }

  /** Enable or disable hover detection for a given node type. */
  enableHoverType(nodeType: RaycastLayerName, enabled: boolean): void {
    if (enabled) {
      this._enabledTypes.add(nodeType);
    } else {
      this._enabledTypes.delete(nodeType);
    }
    this._updateRaycasterLayers();
  }

  /** Returns the currently enabled hover types. */
  getEnabledHoverTypes(): RaycastLayerName[] {
    return [...this._enabledTypes];
  }

  /** Add an exclude filter for mesh intersection results. */
  addExcludeFilter(filter: ExcludeFilter): void {
    this._excludeFilters.push(filter);
  }

  /**
   * Add an ancestor override function.
   * When resolving a raycast hit, overrides are checked first. If any override
   * returns a non-null Object3D, that node is used instead of the standard
   * walk-up-to-realvirtual-ancestor resolution.
   */
  addAncestorOverride(fn: AncestorOverrideFn): void {
    this._ancestorOverrides.push(fn);
  }

  /** Remove a previously added ancestor override. */
  removeAncestorOverride(fn: AncestorOverrideFn): void {
    const idx = this._ancestorOverrides.indexOf(fn);
    if (idx >= 0) this._ancestorOverrides.splice(idx, 1);
  }

  /**
   * Perform hover raycast using an XR controller ray.
   * Call each frame from the XR render loop for each active controller.
   */
  updateFromXRController(origin: Vector3, direction: Vector3): void {
    this._xrOrigin.copy(origin);
    this._xrDir.copy(direction);
    this.lastRayOrigin = this._xrOrigin.clone();
    this.lastRayDirection = this._xrDir.clone();

    this.raycaster.set(this._xrOrigin, this._xrDir);
    this._doRaycast();
  }

  /**
   * Perform a click/select raycast from a mouse/pointer event.
   * Returns the hovered node path, or null.
   * Does NOT alter hover state — this is for click handlers only.
   * Respects the current layer mask (exclusive hover mode).
   */
  raycastForRVNode(e: MouseEvent): string | null {
    const result = this.raycastForRVNodeDetailed(e);
    return result?.path ?? null;
  }

  /**
   * Raycast for RV node with detailed hit info (point, normal).
   * Used by context menu to pass hit coordinates to actions like Annotate.
   */
  raycastForRVNodeDetailed(e: MouseEvent | { clientX: number; clientY: number }): {
    path: string;
    hitPoint: [number, number, number];
    hitNormal: [number, number, number];
  } | null {
    if (!this.registry) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    // Use enableAll for the raycast (layers are shared with rendering, so we
    // can't use them for filtering). Instead we filter the resolved node type.
    const savedMask = this.raycaster.layers.mask;
    this.raycaster.layers.enableAll();
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    this.raycaster.layers.mask = savedMask;

    for (const hit of hits) {
      if (this._isExcluded(hit.object)) continue;
      const result = this._findRVAncestor(hit.object);
      if (result) {
        // Enforce exclusive hover mode for clicks too
        if (!this._isTypeEnabled(result.nodeType)) continue;
        const normal = hit.face?.normal?.clone().transformDirection(hit.object.matrixWorld);
        return {
          path: result.nodePath,
          hitPoint: [hit.point.x, hit.point.y, hit.point.z],
          hitNormal: normal ? [normal.x, normal.y, normal.z] : [0, 1, 0],
        };
      }
    }
    return null;
  }

  /**
   * Perform AR tap selection with 9-point sampling for touch tolerance.
   * Returns { node, nodeType, nodePath } of the best hit, or null.
   */
  arTapRaycast(clientX: number, clientY: number, xrCamera?: PerspectiveCamera): {
    node: Object3D; nodeType: string; nodePath: string;
  } | null {
    const cam = xrCamera ?? this.camera;
    const w = window.innerWidth;
    const h = window.innerHeight;

    const TAP_RADIUS = 20;
    const offsets = [
      [0, 0], [-TAP_RADIUS, 0], [TAP_RADIUS, 0], [0, -TAP_RADIUS], [0, TAP_RADIUS],
      [-TAP_RADIUS * 0.7, -TAP_RADIUS * 0.7], [TAP_RADIUS * 0.7, -TAP_RADIUS * 0.7],
      [-TAP_RADIUS * 0.7, TAP_RADIUS * 0.7], [TAP_RADIUS * 0.7, TAP_RADIUS * 0.7],
    ];

    let bestNode: Object3D | null = null;
    let bestType: string | null = null;
    let bestPath: string | null = null;
    let bestDist = Infinity;

    // Save and set raycaster layers for all enabled types
    const savedMask = this.raycaster.layers.mask;
    // For AR tap, use whatever is currently enabled
    this._updateRaycasterLayers();

    for (const [ox, oy] of offsets) {
      this.pointer.x = ((clientX + ox) / w) * 2 - 1;
      this.pointer.y = -((clientY + oy) / h) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, cam);

      const hits = this.raycaster.intersectObjects(this.scene.children, true);
      for (const hit of hits) {
        if (this._isExcluded(hit.object)) continue;
        if (!(hit.object as Mesh).isMesh) continue;

        const result = this._findRVAncestor(hit.object);
        if (result && hit.distance < bestDist) {
          bestDist = hit.distance;
          bestNode = result.node;
          bestType = result.nodeType;
          bestPath = result.nodePath;
        }
        break; // Only check first non-excluded hit per sample
      }
    }

    this.raycaster.layers.mask = savedMask;

    if (bestNode && bestType && bestPath) {
      return { node: bestNode, nodeType: bestType, nodePath: bestPath };
    }
    return null;
  }

  dispose(): void {
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
    this._clearHover();
  }

  // ─── Private ──────────────────────────────────────────────────────

  private _handlePointerMove(e: PointerEvent): void {
    // Always track pointer position (for external tooltip positioning)
    this.pointerClientX = e.clientX;
    this.pointerClientY = e.clientY;

    if (!this._enabled) {
      this._clearHover();
      return;
    }

    const now = performance.now();
    if (now - this.lastRaycastMs < THROTTLE_MS) return;
    this.lastRaycastMs = now;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    this._doRaycast();
  }

  /** Map node type string (e.g. "Drive") to RaycastLayerName (e.g. "DRIVE"). */
  private _nodeTypeToLayer(nodeType: string): RaycastLayerName | null {
    const map: Record<string, RaycastLayerName> = { Drive: 'DRIVE', Sensor: 'SENSOR', MU: 'MU' };
    return map[nodeType] ?? null;
  }

  /** Check if a node type is allowed by the current enabled hover types. */
  private _isTypeEnabled(nodeType: string): boolean {
    // If all standard types are enabled, allow everything (no filtering)
    if (this._enabledTypes.has('DRIVE') && this._enabledTypes.has('SENSOR') && this._enabledTypes.has('MU')) {
      return true;
    }
    const layer = this._nodeTypeToLayer(nodeType);
    // Untyped nodes (no matching layer) are allowed when no exclusive mode is active
    if (!layer) return true;
    return this._enabledTypes.has(layer);
  }

  /** Core raycast logic shared between pointer and XR. */
  private _doRaycast(): void {
    const hits = this.raycaster.intersectObjects(this.scene.children, true);

    let hitNode: Object3D | null = null;
    let hitType: string | null = null;
    let hitPath: string | null = null;
    let hitInstancedMU: InstancedMovingUnit | null = null;

    for (const hit of hits) {
      if (!(hit.object as Mesh).isMesh) continue;
      if (this._isExcluded(hit.object)) continue;

      // Check for InstancedMesh MU pool hit
      const pool = hit.object.userData?._muPool as MUInstancePool | undefined;
      if (pool && hit.instanceId !== undefined && hit.instanceId >= 0) {
        if (!this._enabledTypes.has('MU')) continue;
        const mu = pool.getMUAtSlot(hit.instanceId);
        if (mu) {
          hitNode = hit.object;
          hitType = 'MU';
          hitPath = mu.getName();
          hitInstancedMU = mu;
          break;
        }
        continue;
      }

      const result = this._findRVAncestor(hit.object);
      if (result) {
        // Enforce exclusive hover mode: skip nodes whose type is not enabled
        if (!this._isTypeEnabled(result.nodeType)) continue;
        hitNode = result.node;
        hitType = result.nodeType;
        hitPath = result.nodePath;
        break;
      }
    }

    if (!hitNode) {
      this._clearHover();
      return;
    }

    if (hitNode === this._hoveredNode && !hitInstancedMU) return;
    // For instanced MUs, check if same MU is still highlighted
    if (hitInstancedMU && this._hoveredInstancedMU === hitInstancedMU) return;

    this._clearHover();
    this._hoveredNode = hitNode;
    this._hoveredNodeType = hitType;
    this._hoveredNodePath = hitPath;
    this._hoveredInstancedMU = hitInstancedMU;

    if (hitInstancedMU) {
      this.highlighter.highlightInstancedMU(hitInstancedMU);
    } else {
      // LayoutObject nodes need includeChildDrives to highlight the full subtree
      const isLayout = !!(hitNode.userData?.realvirtual as Record<string, unknown> | undefined)?.LayoutObject;
      this.highlighter.highlight(hitNode, false, { includeChildDrives: isLayout });
    }
    this.renderer.domElement.style.cursor = 'pointer';
  }

  /** Walk up from a mesh to find the nearest ancestor with realvirtual userData.
   *  Checks ancestor overrides first — if any override returns a node, use that.
   *  Returns the node, its type, and path. */
  private _findRVAncestor(mesh: Object3D): {
    node: Object3D; nodeType: string; nodePath: string;
  } | null {
    // Check ancestor overrides first (e.g. layout planner full-object selection)
    for (const override of this._ancestorOverrides) {
      const overrideNode = override(mesh);
      if (overrideNode) {
        const path = this.registry.getPathForNode(overrideNode);
        if (path) {
          const nodeType = this._determineNodeType(overrideNode, path);
          return { node: overrideNode, nodeType, nodePath: path };
        }
      }
    }

    let current: Object3D | null = mesh;
    while (current) {
      const rv = current.userData?.realvirtual;
      if (rv && typeof rv === 'object') {
        const path = this.registry.getPathForNode(current);
        if (path) {
          // Determine node type from registered components
          const nodeType = this._determineNodeType(current, path);
          return { node: current, nodeType, nodePath: path };
        }
      }
      current = current.parent;
    }
    return null;
  }

  /** Determine the primary node type from the registry. */
  private _determineNodeType(node: Object3D, path: string): string {
    // Fast path: check cached type from scene loader (avoids parent chain walk)
    const cachedType = node.userData?._rvType as string | undefined;
    if (cachedType) return cachedType;

    // Check standard types in priority order
    const typeChecks: Array<{ type: string; layerName: RaycastLayerName }> = [
      { type: 'Drive', layerName: 'DRIVE' },
      { type: 'Sensor', layerName: 'SENSOR' },
      { type: 'MU', layerName: 'MU' },
    ];

    for (const { type } of typeChecks) {
      const instance = this.registry.findInParent(node, type);
      if (instance) return type;
    }

    // Fallback: check realvirtual userData keys
    const rv = node.userData?.realvirtual;
    if (rv && typeof rv === 'object') {
      const keys = Object.keys(rv as Record<string, unknown>);
      if (keys.length > 0) return keys[0];
    }

    return 'Unknown';
  }

  /** Check if a mesh should be excluded from raycast results. */
  private _isExcluded(mesh: Object3D): boolean {
    for (const filter of this._excludeFilters) {
      if (filter(mesh)) return true;
    }
    return false;
  }

  /** Update the raycaster's layer mask from enabled types. */
  private _updateRaycasterLayers(): void {
    // Start with no layers
    this.raycaster.layers.mask = 0;
    // Enable each active type's layer
    for (const typeName of this._enabledTypes) {
      this.raycaster.layers.enable(RaycastLayers[typeName]);
    }
    // Always also enable the default layer (layer 0) so standard meshes are testable
    this.raycaster.layers.enable(RaycastLayers.DEFAULT);
  }

  /** Clear hover state and restore cursor. */
  private _clearHover(): void {
    if (this._holdHover) return; // Keep highlight while context menu is open
    if (this._hoveredNode) {
      const prevNode = this._hoveredNode;
      const prevType = this._hoveredNodeType ?? 'Unknown';
      this.highlighter.clear();
      this._hoveredNode = null;
      this._hoveredNodeType = null;
      this._hoveredNodePath = null;
      this._hoveredInstancedMU = null;
      this.renderer.domElement.style.cursor = '';

      this.emitter.emit('object-unhover', { node: prevNode, nodeType: prevType });
    }
  }
}
