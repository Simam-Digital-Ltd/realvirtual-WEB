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
  Object3D,
  Layers,
} from 'three';
import type { Camera, PerspectiveCamera, Scene } from 'three';
import { RaycastLayers, type RaycastLayerName } from './rv-raycast-layers';
import type { NodeRegistry } from './rv-node-registry';
import type { RVHighlightManager } from './rv-highlight-manager';
import type { RVDrive } from './rv-drive';

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

  /** When false, hover raycasting is suppressed (e.g. during orbit/pinch). */
  private _enabled = true;
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
   */
  raycastForRVNode(e: MouseEvent): string | null {
    if (!this.registry) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    // Use a fresh raycaster config for click (all scene click layers)
    const savedMask = this.raycaster.layers.mask;
    this.raycaster.layers.enableAll();
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    this.raycaster.layers.mask = savedMask;

    for (const hit of hits) {
      if (this._isExcluded(hit.object)) continue;
      // Walk up from hit mesh to find nearest node with realvirtual data
      let current: Object3D | null = hit.object;
      while (current) {
        const rv = current.userData?.realvirtual;
        if (rv && typeof rv === 'object') {
          const path = this.registry.getPathForNode(current);
          if (path) return path;
        }
        current = current.parent;
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

  /** Core raycast logic shared between pointer and XR. */
  private _doRaycast(): void {
    const hits = this.raycaster.intersectObjects(this.scene.children, true);

    let hitNode: Object3D | null = null;
    let hitType: string | null = null;
    let hitPath: string | null = null;

    for (const hit of hits) {
      if (!(hit.object as Mesh).isMesh) continue;
      if (this._isExcluded(hit.object)) continue;

      const result = this._findRVAncestor(hit.object);
      if (result) {
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

    if (hitNode === this._hoveredNode) return;

    this._clearHover();
    this._hoveredNode = hitNode;
    this._hoveredNodeType = hitType;
    this._hoveredNodePath = hitPath;
    this.highlighter.highlight(hitNode);
    this.renderer.domElement.style.cursor = 'pointer';
  }

  /** Walk up from a mesh to find the nearest ancestor with realvirtual userData.
   *  Returns the node, its type, and path. */
  private _findRVAncestor(mesh: Object3D): {
    node: Object3D; nodeType: string; nodePath: string;
  } | null {
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
    if (this._hoveredNode) {
      const prevNode = this._hoveredNode;
      const prevType = this._hoveredNodeType ?? 'Unknown';
      this.highlighter.clear();
      this._hoveredNode = null;
      this._hoveredNodeType = null;
      this._hoveredNodePath = null;
      this.renderer.domElement.style.cursor = '';

      this.emitter.emit('object-unhover', { node: prevNode, nodeType: prevType });
    }
  }
}
