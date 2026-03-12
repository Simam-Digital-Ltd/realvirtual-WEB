import type { Object3D } from 'three';
import type { RVDrive } from './rv-drive';
import type { RVSensor } from './rv-sensor';

/**
 * ComponentReference from GLB extras.
 * Written by GLBComponentSerializer for Signal/Drive/Sensor references.
 */
export interface ComponentRef {
  type: string;        // "ComponentReference"
  path: string;        // Hierarchy path in GLB
  componentType: string; // e.g. "realvirtual.Drive", "realvirtual.PLCOutputBool"
}

/**
 * NodeRegistry - Centralized object discovery for the WebViewer.
 *
 * Mirrors Unity's object lookup API:
 * - Path-based primary lookup (never name-only — names can be duplicated)
 * - Type-based scene-wide queries (like FindObjectsOfType<T>)
 * - Hierarchy walk-up (like GetComponentInParent<T>)
 * - Hierarchy walk-down (like GetComponentInChildren<T> / GetComponentsInChildren<T>)
 * - ComponentReference resolution (replaces resolveComponentRef)
 *
 * Two-phase build:
 *   Phase 1 (GLB traverse): registerNode(path, node)
 *   Phase 2 (after construction): register(type, path, instance)
 */
export class NodeRegistry {
  /** path → Object3D node */
  private nodes = new Map<string, Object3D>();
  /** node → path (reverse lookup for hierarchy walk) */
  private nodePaths = new Map<Object3D, string>();
  /** path → Map<type, instance> */
  private components = new Map<string, Map<string, unknown>>();
  /** type → Set<path> (reverse index for getAll) */
  private typeIndex = new Map<string, Set<string>>();

  // ─── Path Computation ───────────────────────────────────────────

  /**
   * Compute canonical hierarchy path for a Three.js node.
   * Walks up to the scene root, joining names with '/'.
   * Replaces all duplicate getNodePath() functions.
   */
  static computeNodePath(node: Object3D): string {
    const parts: string[] = [];
    let current: Object3D | null = node;
    while (current && current.parent) {
      parts.unshift(current.name);
      current = current.parent;
      if (!current.parent) break; // Stop at scene root
    }
    return parts.join('/');
  }

  // ─── Registration ───────────────────────────────────────────────

  /** Register a raw node by its hierarchy path (Phase 1) */
  registerNode(path: string, node: Object3D): void {
    this.nodes.set(path, node);
    this.nodePaths.set(node, path);
  }

  /**
   * Register a typed component instance at a path (Phase 2).
   * A single path can have multiple component types (Drive + TransportSurface, etc.)
   */
  register(type: string, path: string, instance: unknown): void {
    let compMap = this.components.get(path);
    if (!compMap) {
      compMap = new Map<string, unknown>();
      this.components.set(path, compMap);
    }
    compMap.set(type, instance);

    // Update type reverse index
    let typeSet = this.typeIndex.get(type);
    if (!typeSet) {
      typeSet = new Set<string>();
      this.typeIndex.set(type, typeSet);
    }
    typeSet.add(path);
  }

  // ─── Lookup by Path ─────────────────────────────────────────────

  /** Get raw Object3D by full hierarchy path */
  getNode(path: string): Object3D | null {
    // Direct lookup
    const direct = this.nodes.get(path);
    if (direct) return direct;

    // Path suffix match (e.g. "DemoCell/Turbine" matches "Root/DemoCell/Turbine")
    for (const [registeredPath, node] of this.nodes) {
      if (registeredPath.endsWith('/' + path) || registeredPath === path) {
        return node;
      }
    }
    return null;
  }

  /** Get the registered path for a node */
  getPathForNode(node: Object3D): string | null {
    return this.nodePaths.get(node) ?? null;
  }

  /** Get typed instance by full path and type */
  getByPath<T = unknown>(type: string, path: string): T | null {
    const compMap = this.components.get(path);
    if (compMap) {
      const instance = compMap.get(type);
      if (instance !== undefined) return instance as T;
    }
    // Path suffix match
    for (const [registeredPath, compMap2] of this.components) {
      if (registeredPath.endsWith('/' + path) || registeredPath === path) {
        const instance = compMap2.get(type);
        if (instance !== undefined) return instance as T;
      }
    }
    return null;
  }

  // ─── Scene-Wide Type Queries ────────────────────────────────────

  /** Get all instances of a given type across the scene (like FindObjectsOfType) */
  getAll<T = unknown>(type: string): { path: string; instance: T }[] {
    const typeSet = this.typeIndex.get(type);
    if (!typeSet) return [];

    const results: { path: string; instance: T }[] = [];
    for (const path of typeSet) {
      const compMap = this.components.get(path);
      if (compMap) {
        const instance = compMap.get(type);
        if (instance !== undefined) {
          results.push({ path, instance: instance as T });
        }
      }
    }
    return results;
  }

  // ─── Hierarchy Traversal ────────────────────────────────────────

  /**
   * Walk UP hierarchy from node, find first ancestor with given component type.
   * Like Unity's GetComponentInParent<T>().
   * Checks the node itself first, then walks up.
   */
  findInParent<T = unknown>(node: Object3D, type: string): T | null {
    let current: Object3D | null = node;
    while (current) {
      const path = this.nodePaths.get(current);
      if (path) {
        const compMap = this.components.get(path);
        if (compMap) {
          const instance = compMap.get(type);
          if (instance !== undefined) return instance as T;
        }
      }
      current = current.parent;
    }
    return null;
  }

  /**
   * Walk DOWN hierarchy from node, find first descendant with given component type.
   * Like Unity's GetComponentInChildren<T>().
   * Checks the node itself first, then recurses children (breadth-first).
   */
  findInChildren<T = unknown>(node: Object3D, type: string): T | null {
    // Check self
    const selfPath = this.nodePaths.get(node);
    if (selfPath) {
      const compMap = this.components.get(selfPath);
      if (compMap) {
        const instance = compMap.get(type);
        if (instance !== undefined) return instance as T;
      }
    }

    // BFS through children
    const queue: Object3D[] = [...node.children];
    while (queue.length > 0) {
      const child = queue.shift()!;
      const childPath = this.nodePaths.get(child);
      if (childPath) {
        const compMap = this.components.get(childPath);
        if (compMap) {
          const instance = compMap.get(type);
          if (instance !== undefined) return instance as T;
        }
      }
      for (const grandchild of child.children) {
        queue.push(grandchild);
      }
    }
    return null;
  }

  /**
   * Walk DOWN hierarchy, collect ALL descendants with given component type.
   * Like Unity's GetComponentsInChildren<T>().
   * Includes the node itself if it has the component.
   */
  findAllInChildren<T = unknown>(node: Object3D, type: string): { path: string; instance: T }[] {
    const results: { path: string; instance: T }[] = [];

    const visit = (n: Object3D) => {
      const path = this.nodePaths.get(n);
      if (path) {
        const compMap = this.components.get(path);
        if (compMap) {
          const instance = compMap.get(type);
          if (instance !== undefined) {
            results.push({ path, instance: instance as T });
          }
        }
      }
      for (const child of n.children) {
        visit(child);
      }
    };

    visit(node);
    return results;
  }

  // ─── ComponentReference Resolution ──────────────────────────────

  /**
   * Resolve a ComponentReference from GLB extras to typed instances.
   * Replaces the standalone resolveComponentRef() function.
   */
  resolve(ref: ComponentRef | undefined | null): {
    drive?: RVDrive | null;
    sensor?: RVSensor | null;
    signalAddress?: string | null;
  } {
    if (!ref || ref.type !== 'ComponentReference' || !ref.path) {
      return {};
    }

    const ct = ref.componentType ?? '';

    // Drive reference
    if (ct.includes('Drive')) {
      const drive = this.getByPath<RVDrive>('Drive', ref.path);
      if (!drive) console.warn(`[NodeRegistry] Drive not found: "${ref.path}"`);
      return { drive };
    }

    // Sensor reference
    if (ct.includes('Sensor')) {
      const sensor = this.getByPath<RVSensor>('Sensor', ref.path);
      if (!sensor) console.warn(`[NodeRegistry] Sensor not found: "${ref.path}"`);
      return { sensor };
    }

    // Signal reference (PLCOutputBool, PLCInputBool, etc.)
    if (ct.includes('Signal') || ct.includes('PLC')) {
      return { signalAddress: ref.path };
    }

    console.warn(`[NodeRegistry] Unknown componentType: "${ref.componentType}" at "${ref.path}"`);
    return {};
  }

  // ─── Utility ────────────────────────────────────────────────────

  /** Clear all registrations (for scene reload) */
  clear(): void {
    this.nodes.clear();
    this.nodePaths.clear();
    this.components.clear();
    this.typeIndex.clear();
  }

  /** Get registry stats */
  get size(): { nodes: number; components: number; types: string[] } {
    let componentCount = 0;
    for (const compMap of this.components.values()) {
      componentCount += compMap.size;
    }
    return {
      nodes: this.nodes.size,
      components: componentCount,
      types: [...this.typeIndex.keys()],
    };
  }
}
