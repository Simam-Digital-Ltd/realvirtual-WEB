/**
 * LayoutPlannerPlugin — Factory layout planning tool for the realvirtual WebViewer.
 *
 * Users browse GLB component libraries (multi-tab catalog system), drag components
 * into the 3D scene, and reposition/rotate them using TransformControls.
 * Layouts persist as lightweight JSON files.
 *
 * Architecture:
 *   - Own GLTFLoader + DRACOLoader instances (not the rv-scene-loader singleton)
 *   - _layoutRoot THREE.Group registered in viewer.sceneFixtures (survives clearModel)
 *   - ModelCache for fast cloning of loaded GLBs
 *   - LayoutStore (useSyncExternalStore) for React-compatible state
 *   - TransformControls for interactive gizmo
 *   - ExcludeFilter on viewer.raycastManager for layout objects
 */

import {
  Group,
  Mesh,
  PlaneGeometry,
  MeshBasicMaterial,
  BoxGeometry,
  DoubleSide,
  Raycaster,
  Vector2,
  GridHelper,
  MathUtils,
} from 'three';
import type { Object3D, Scene } from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

import type { RVViewerPlugin } from '../core/rv-plugin';
import type { LoadResult } from '../core/engine/rv-scene-loader';
import type { RVViewer } from '../core/rv-viewer';
import {
  LayoutStore,
  alignToFloor,
  snapToGrid,
  serializeLayout,
  deserializeLayout,
  type PlacedComponent,
  type LayoutFile,
  type LibraryCatalog,
  type LibraryCatalogEntry,
} from './rv-layout-store';

// ─── Pre-allocated vectors (no GC in hot paths) ────────────────────────

const _raycaster = new Raycaster();
const _mouse = new Vector2();

// ─── Model Cache ────────────────────────────────────────────────────────

export class ModelCache {
  private _cache = new Map<string, Group>();
  private _loader: GLTFLoader;

  constructor(loader: GLTFLoader) {
    this._loader = loader;
  }

  /** Get a clone of the cached model, loading it first if needed. */
  async getOrLoad(url: string): Promise<Group> {
    const cached = this._cache.get(url);
    if (cached) return cached.clone();

    const gltf = await this._loader.loadAsync(url);
    const source = gltf.scene as Group;
    this._cache.set(url, source);
    return source.clone();
  }

  get size(): number { return this._cache.size; }

  dispose(): void {
    for (const [, model] of this._cache) {
      model.traverse((node) => {
        const m = node as Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) {
          if (Array.isArray(m.material)) m.material.forEach(mat => mat.dispose());
          else m.material.dispose();
        }
      });
    }
    this._cache.clear();
  }
}

// Re-export types and helpers for tests
export {
  LayoutStore,
  alignToFloor,
  snapToGrid,
  serializeLayout,
  deserializeLayout,
};
export type {
  PlacedComponent,
  LayoutFile,
  LibraryCatalog,
  LibraryCatalogEntry,
};

// ─── Plugin ─────────────────────────────────────────────────────────────

export interface LayoutPlannerOptions {
  catalogUrls?: string[];
}

export class LayoutPlannerPlugin implements RVViewerPlugin {
  readonly id = 'layout-planner';
  readonly order = 250;

  private _viewer: RVViewer | null = null;
  private _layoutRoot: Group;
  private _floorPlane: Mesh;
  private _gridHelper: GridHelper | null = null;
  private _transformControls: TransformControls | null = null;
  private _gltfLoader: GLTFLoader;
  private _dracoLoader: DRACOLoader;
  private _modelCache: ModelCache;
  private _objectMap = new Map<string, Object3D>();
  private _ghostPreview: Mesh | null = null;
  private _unsubs: (() => void)[] = [];
  private _options: LayoutPlannerOptions;
  private _active = false;

  /** The layout store — public so tests and UI can access it. */
  readonly store: LayoutStore;

  constructor(options?: LayoutPlannerOptions) {
    this._options = options ?? {};
    this.store = new LayoutStore();

    // Create layout root
    this._layoutRoot = new Group();
    this._layoutRoot.name = '_layoutRoot';
    this._layoutRoot.userData._isLayoutRoot = true;

    // Invisible floor plane for raycast (100x100 meters)
    const floorGeo = new PlaneGeometry(100, 100);
    const floorMat = new MeshBasicMaterial({ visible: false, side: DoubleSide });
    this._floorPlane = new Mesh(floorGeo, floorMat);
    this._floorPlane.rotation.x = -Math.PI / 2;
    this._floorPlane.userData._layoutFloor = true;
    this._layoutRoot.add(this._floorPlane);

    // Own GLTFLoader + DRACOLoader
    this._dracoLoader = new DRACOLoader();
    this._dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    this._gltfLoader = new GLTFLoader();
    this._gltfLoader.setDRACOLoader(this._dracoLoader);

    this._modelCache = new ModelCache(this._gltfLoader);
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────

  onModelLoaded(result: LoadResult, viewer: RVViewer): void {
    this._viewer = viewer;

    // Double-add guard: only add to scene once
    if (!this._layoutRoot.parent) {
      viewer.scene.add(this._layoutRoot);
      (viewer as unknown as { sceneFixtures: Set<Object3D> }).sceneFixtures.add(this._layoutRoot);
    }

    // Register exclude filter on raycast manager
    if (viewer.raycastManager) {
      viewer.raycastManager.addExcludeFilter(
        (node: Object3D) => !!node.userData._layoutObject || !!node.userData._layoutFloor,
      );
    }

    // Initialize TransformControls
    if (!this._transformControls) {
      this._transformControls = new TransformControls(viewer.camera, viewer.renderer.domElement);
      this._transformControls.setSize(0.75);
      // TransformControls extends Object3D but userData may not be initialized in all environments
      const tcUserData = (this._transformControls as unknown as { userData?: Record<string, unknown> }).userData;
      if (tcUserData) tcUserData._layoutObject = true;
      viewer.scene.add(this._transformControls.getHelper());

      // Wire TransformControls <-> OrbitControls
      this._transformControls.addEventListener('dragging-changed', (event) => {
        if (this._viewer) {
          this._viewer.controls.enabled = !(event as unknown as { value: boolean }).value;
        }
      });

      // Update store and trigger render on transform change
      this._transformControls.addEventListener('change', () => {
        if (!this._viewer) return;
        this._viewer.markRenderDirty();

        // Update placed component position/rotation in store
        const selectedId = this.store.getSnapshot().selectedId;
        if (selectedId) {
          const obj = this._objectMap.get(selectedId);
          if (obj) {
            this.store.updateTransform(
              selectedId,
              [obj.position.x, obj.position.y, obj.position.z],
              [
                MathUtils.radToDeg(obj.rotation.x),
                MathUtils.radToDeg(obj.rotation.y),
                MathUtils.radToDeg(obj.rotation.z),
              ],
            );
          }
        }
      });
    }

    // Wire canvas events
    this._wireCanvasEvents(viewer);

    // Load catalogs from options, query params, and localStorage
    this._loadCatalogs();
  }

  onModelCleared(_viewer: RVViewer): void {
    // Layout state survives model clear — _layoutRoot is in sceneFixtures
    // No need to remove anything
  }

  dispose(): void {
    // Detach TransformControls
    if (this._transformControls) {
      this._transformControls.detach();
      this._transformControls.dispose();
      this._transformControls = null;
    }

    // Remove layout root from scene
    if (this._layoutRoot.parent) {
      this._layoutRoot.parent.remove(this._layoutRoot);
    }
    if (this._viewer) {
      (this._viewer as unknown as { sceneFixtures: Set<Object3D> }).sceneFixtures.delete(this._layoutRoot);
    }

    // Clean up event listeners
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];

    // Dispose resources
    this._modelCache.dispose();
    this._dracoLoader.dispose();

    // Dispose ghost preview
    if (this._ghostPreview) {
      this._ghostPreview.geometry.dispose();
      (this._ghostPreview.material as MeshBasicMaterial).dispose();
      this._ghostPreview = null;
    }

    // Dispose grid helper
    if (this._gridHelper) {
      this._gridHelper.geometry.dispose();
      if (Array.isArray(this._gridHelper.material)) {
        this._gridHelper.material.forEach(m => m.dispose());
      } else {
        this._gridHelper.material.dispose();
      }
      this._gridHelper = null;
    }

    // Dispose placed objects
    for (const [, obj] of this._objectMap) {
      obj.traverse((node) => {
        const m = node as Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) {
          if (Array.isArray(m.material)) m.material.forEach(mat => mat.dispose());
          else m.material.dispose();
        }
      });
    }
    this._objectMap.clear();

    this._viewer = null;
  }

  // ─── Public API ───────────────────────────────────────────────────

  get active(): boolean { return this._active; }

  setActive(active: boolean): void {
    this._active = active;
    if (this._gridHelper) {
      this._gridHelper.visible = active && this.store.gridEnabled;
    }
    if (!active && this._transformControls) {
      this._transformControls.detach();
      this.store.selectComponent(null);
    }
    if (this._viewer) this._viewer.markRenderDirty();
  }

  /** Place a component in the scene from a catalog entry. */
  async placeComponent(
    entry: LibraryCatalogEntry,
    position: [number, number, number],
  ): Promise<string> {
    if (!this._viewer) throw new Error('Viewer not initialized');

    const clone = await this._modelCache.getOrLoad(entry.glbUrl);
    const id = crypto.randomUUID();

    clone.userData._layoutObject = true;
    clone.userData._layoutId = id;
    clone.traverse((child) => { child.userData._layoutObject = true; });

    // Disable shadows on placed layout objects for performance
    clone.traverse((child) => {
      if ((child as Mesh).isMesh) {
        child.castShadow = false;
        child.receiveShadow = false;
      }
    });

    // Align bottom to floor
    alignToFloor(clone);

    // Apply position
    clone.position.x = position[0];
    clone.position.z = position[2];

    this._layoutRoot.add(clone);
    this._objectMap.set(id, clone);

    const comp: PlacedComponent = {
      id,
      catalogId: entry.id,
      glbUrl: entry.glbUrl,
      label: entry.name,
      position: [clone.position.x, clone.position.y, clone.position.z],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    };
    this.store.addComponent(comp);
    this.store.autoSave();

    this._viewer.markRenderDirty();
    return id;
  }

  /** Remove a placed component by ID. */
  removeSelected(): void {
    const id = this.store.selectedId;
    if (!id) return;

    const obj = this._objectMap.get(id);
    if (obj) {
      if (this._transformControls) this._transformControls.detach();
      this._layoutRoot.remove(obj);
      obj.traverse((node) => {
        const m = node as Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) {
          if (Array.isArray(m.material)) m.material.forEach(mat => mat.dispose());
          else m.material.dispose();
        }
      });
      this._objectMap.delete(id);
    }

    this.store.removeComponent(id);
    this.store.autoSave();
    if (this._viewer) this._viewer.markRenderDirty();
  }

  /** Duplicate the currently selected component. */
  async duplicateSelected(): Promise<string | null> {
    const snapshot = this.store.getSnapshot();
    const id = snapshot.selectedId;
    if (!id) return null;

    const comp = snapshot.placed.find(c => c.id === id);
    if (!comp) return null;

    // Find the catalog entry to get the GLB URL
    const clone = await this._modelCache.getOrLoad(comp.glbUrl);
    const newId = crypto.randomUUID();

    clone.userData._layoutObject = true;
    clone.userData._layoutId = newId;
    clone.traverse((child) => { child.userData._layoutObject = true; });
    clone.traverse((child) => {
      if ((child as Mesh).isMesh) {
        child.castShadow = false;
        child.receiveShadow = false;
      }
    });

    alignToFloor(clone);
    // Offset slightly from original
    clone.position.set(comp.position[0] + 200, clone.position.y, comp.position[2] + 200);
    clone.rotation.set(
      MathUtils.degToRad(comp.rotation[0]),
      MathUtils.degToRad(comp.rotation[1]),
      MathUtils.degToRad(comp.rotation[2]),
    );

    this._layoutRoot.add(clone);
    this._objectMap.set(newId, clone);

    const newComp: PlacedComponent = {
      id: newId,
      catalogId: comp.catalogId,
      glbUrl: comp.glbUrl,
      label: comp.label + ' (copy)',
      position: [clone.position.x, clone.position.y, clone.position.z],
      rotation: [...comp.rotation],
      scale: [...comp.scale],
    };
    this.store.addComponent(newComp);
    this.store.autoSave();

    // Select the new duplicate
    this._selectObject(newId);

    if (this._viewer) this._viewer.markRenderDirty();
    return newId;
  }

  /** Select a placed object by ID. */
  selectById(id: string | null): void {
    this._selectObject(id);
  }

  /** Save layout to a downloadable JSON file. */
  downloadLayout(name: string): void {
    const snapshot = this.store.getSnapshot();
    const layout = serializeLayout(name, snapshot.placed, snapshot.catalogUrls, snapshot.gridSizeMm);
    const json = JSON.stringify(layout, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Load a layout from a JSON string. Re-places all components. */
  async loadLayout(json: string): Promise<void> {
    const layout = deserializeLayout(json);

    // Clear existing placed objects
    this._clearPlaced();

    // Re-place each component
    for (const comp of layout.components) {
      try {
        const clone = await this._modelCache.getOrLoad(comp.glbUrl);
        clone.userData._layoutObject = true;
        clone.userData._layoutId = comp.id;
        clone.traverse((child) => { child.userData._layoutObject = true; });
        clone.traverse((child) => {
          if ((child as Mesh).isMesh) {
            child.castShadow = false;
            child.receiveShadow = false;
          }
        });

        alignToFloor(clone);
        clone.position.set(comp.position[0], clone.position.y, comp.position[2]);
        clone.rotation.set(
          MathUtils.degToRad(comp.rotation[0]),
          MathUtils.degToRad(comp.rotation[1]),
          MathUtils.degToRad(comp.rotation[2]),
        );

        this._layoutRoot.add(clone);
        this._objectMap.set(comp.id, clone);
      } catch (e) {
        console.warn(`[LayoutPlanner] Failed to load GLB for ${comp.label}: ${e}`);
      }
    }

    this.store.setComponents(layout.components);
    if (layout.gridSizeMm > 0) this.store.setGridSize(layout.gridSizeMm);

    // Add catalog URLs that aren't already loaded
    for (const url of layout.catalogUrls) {
      if (!this.store.getSnapshot().catalogUrls.includes(url)) {
        this.store.addCatalog(url).catch(() => {});
      }
    }

    this.store.autoSave();
    if (this._viewer) this._viewer.markRenderDirty();
  }

  /** Toggle grid overlay visibility. */
  toggleGrid(): void {
    const next = !this.store.gridEnabled;
    this.store.setGridEnabled(next);

    if (!this._gridHelper && next && this._viewer) {
      this._createGridHelper();
    }
    if (this._gridHelper) {
      this._gridHelper.visible = next && this._active;
    }
    if (this._viewer) this._viewer.markRenderDirty();
  }

  /** Fit camera to show all placed objects. */
  fitToLayout(): void {
    if (!this._viewer || this._objectMap.size === 0) return;

    const nodes = [...this._objectMap.values()];
    this._viewer.fitToNodes(nodes);
  }

  // ─── Internal ─────────────────────────────────────────────────────

  private _selectObject(id: string | null): void {
    this.store.selectComponent(id);

    if (!id || !this._transformControls || !this._viewer) {
      if (this._transformControls) this._transformControls.detach();
      this._viewer?.highlighter.clear();
      this._viewer?.markRenderDirty();
      return;
    }

    const obj = this._objectMap.get(id);
    if (!obj) return;

    this._transformControls.attach(obj);

    // Set mode
    const mode = this.store.getSnapshot().mode;
    if (mode === 'translate') this._transformControls.setMode('translate');
    else if (mode === 'rotate') this._transformControls.setMode('rotate');
    else this._transformControls.setMode('translate');

    // Apply grid snapping
    if (this.store.gridEnabled) {
      this._transformControls.setTranslationSnap(this.store.gridSizeMm);
      this._transformControls.setRotationSnap(MathUtils.degToRad(15));
    } else {
      this._transformControls.setTranslationSnap(null);
      this._transformControls.setRotationSnap(null);
    }

    this._viewer.markRenderDirty();
  }

  private _clearPlaced(): void {
    if (this._transformControls) this._transformControls.detach();

    for (const [, obj] of this._objectMap) {
      this._layoutRoot.remove(obj);
      obj.traverse((node) => {
        const m = node as Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) {
          if (Array.isArray(m.material)) m.material.forEach(mat => mat.dispose());
          else m.material.dispose();
        }
      });
    }
    this._objectMap.clear();
  }

  private _createGridHelper(): void {
    const size = 50; // 50m
    const divisions = Math.round((size * 1000) / this.store.gridSizeMm);
    this._gridHelper = new GridHelper(size, divisions, 0x444444, 0x333333);
    this._gridHelper.position.y = 0.001; // Slight offset above floor
    this._gridHelper.userData._layoutObject = true;
    this._layoutRoot.add(this._gridHelper);
  }

  private _wireCanvasEvents(viewer: RVViewer): void {
    const canvas = viewer.renderer.domElement;

    // ── Pointer click for selection ──
    const onPointerUp = (e: PointerEvent) => {
      if (!this._active) return;
      if (e.button !== 0) return; // Left click only

      const rect = canvas.getBoundingClientRect();
      _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      _raycaster.setFromCamera(_mouse, viewer.camera);

      // Raycast against layout objects only (skip floor plane)
      const targets = this._layoutRoot.children.filter(
        c => c !== this._floorPlane && c !== this._gridHelper && c.userData._layoutObject,
      );
      const hits = _raycaster.intersectObjects(targets, true);

      if (hits.length > 0) {
        // Walk up to find the direct child of _layoutRoot
        let hit = hits[0].object;
        while (hit.parent && hit.parent !== this._layoutRoot) {
          hit = hit.parent;
        }
        const id = hit.userData._layoutId as string | undefined;
        if (id) {
          this._selectObject(id);
          return;
        }
      }

      // Click on empty: deselect
      this._selectObject(null);
    };

    canvas.addEventListener('pointerup', onPointerUp);
    this._unsubs.push(() => canvas.removeEventListener('pointerup', onPointerUp));

    // ── Keyboard shortcuts ──
    const onKeyDown = (e: KeyboardEvent) => {
      if (!this._active) return;
      // Guard: skip if focus is on input/textarea
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      switch (e.key) {
        case 'g':
        case 'G':
          this.store.setMode('translate');
          if (this._transformControls && this.store.selectedId) {
            this._transformControls.setMode('translate');
          }
          break;
        case 'r':
        case 'R':
          this.store.setMode('rotate');
          if (this._transformControls && this.store.selectedId) {
            this._transformControls.setMode('rotate');
          }
          break;
        case 'Delete':
        case 'Backspace':
          this.removeSelected();
          break;
        case 'Escape':
          this._selectObject(null);
          this.store.setPlacementMode(null);
          break;
        case 'd':
        case 'D':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this.duplicateSelected();
          }
          break;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    this._unsubs.push(() => document.removeEventListener('keydown', onKeyDown));

    // ── HTML5 Drag & Drop ──
    const onDragOver = (e: DragEvent) => {
      if (!this._active) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';

      // Show ghost preview at floor hit point
      const rect = canvas.getBoundingClientRect();
      _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      _raycaster.setFromCamera(_mouse, viewer.camera);
      const hits = _raycaster.intersectObject(this._floorPlane);

      if (hits.length > 0) {
        let pos = { x: hits[0].point.x, y: 0, z: hits[0].point.z };
        if (this.store.gridEnabled) {
          pos = snapToGrid(pos, this.store.gridSizeMm);
        }

        if (!this._ghostPreview) {
          const geo = new BoxGeometry(0.5, 0.5, 0.5);
          const mat = new MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.3,
            wireframe: true,
          });
          this._ghostPreview = new Mesh(geo, mat);
          this._ghostPreview.userData._layoutObject = true;
          this._layoutRoot.add(this._ghostPreview);
        }
        this._ghostPreview.position.set(pos.x, 0.25, pos.z);
        this._ghostPreview.visible = true;

        // Read footprint from dataTransfer
        try {
          const fpStr = e.dataTransfer?.types.find(t => t.startsWith('x-footprint/'));
          if (fpStr) {
            const [, w, d] = fpStr.split('/');
            const fw = Number(w) / 1000; // mm to m
            const fd = Number(d) / 1000;
            this._ghostPreview.scale.set(fw || 0.5, 0.5, fd || 0.5);
          }
        } catch { /* ignore */ }

        viewer.markRenderDirty();
      }
    };

    const onDragLeave = () => {
      if (this._ghostPreview) {
        this._ghostPreview.visible = false;
        if (this._viewer) this._viewer.markRenderDirty();
      }
    };

    const onDrop = async (e: DragEvent) => {
      if (!this._active) return;
      e.preventDefault();

      // Hide ghost
      if (this._ghostPreview) this._ghostPreview.visible = false;

      // Read data from drag transfer
      const catalogId = e.dataTransfer?.getData('text/x-layout-catalog-id');
      const glbUrl = e.dataTransfer?.getData('text/x-layout-glb-url');
      const entryName = e.dataTransfer?.getData('text/x-layout-entry-name');
      const categoryStr = e.dataTransfer?.getData('text/x-layout-category');

      if (!catalogId || !glbUrl) return;

      // Raycast for floor position
      const rect = canvas.getBoundingClientRect();
      _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_mouse, viewer.camera);
      const hits = _raycaster.intersectObject(this._floorPlane);

      let pos: [number, number, number] = [0, 0, 0];
      if (hits.length > 0) {
        let snapped = { x: hits[0].point.x, y: 0, z: hits[0].point.z };
        if (this.store.gridEnabled) {
          snapped = snapToGrid(snapped, this.store.gridSizeMm);
        }
        pos = [snapped.x, 0, snapped.z];
      }

      // Create entry-like object for placeComponent
      const entry: LibraryCatalogEntry = {
        id: catalogId,
        name: entryName || catalogId,
        category: (categoryStr as LibraryCatalogEntry['category']) || 'custom',
        glbUrl,
        thumbnailUrl: '',
      };

      try {
        await this.placeComponent(entry, pos);
      } catch (err) {
        console.error('[LayoutPlanner] Failed to place component:', err);
      }
    };

    canvas.addEventListener('dragover', onDragOver);
    canvas.addEventListener('dragleave', onDragLeave);
    canvas.addEventListener('drop', onDrop);
    this._unsubs.push(() => canvas.removeEventListener('dragover', onDragOver));
    this._unsubs.push(() => canvas.removeEventListener('dragleave', onDragLeave));
    this._unsubs.push(() => canvas.removeEventListener('drop', onDrop));

    // ── Blur/visibility handlers to restore controls ──
    const onBlur = () => {
      if (this._viewer) this._viewer.controls.enabled = true;
    };
    const onVisChange = () => {
      if (document.hidden && this._viewer) {
        this._viewer.controls.enabled = true;
      }
    };

    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisChange);
    this._unsubs.push(() => window.removeEventListener('blur', onBlur));
    this._unsubs.push(() => document.removeEventListener('visibilitychange', onVisChange));
  }

  private async _loadCatalogs(): Promise<void> {
    // 1. Constructor catalogUrls
    const constructorUrls = this._options.catalogUrls ?? [];

    // 2. URL params: ?library=url1&library=url2
    const params = new URLSearchParams(window.location.search);
    const paramUrls = params.getAll('library');

    // 3. Combine all, deduplicate
    const allUrls = [...new Set([...constructorUrls, ...paramUrls])];

    // Load each
    for (const url of allUrls) {
      await this.store.addCatalog(url).catch(() => {});
    }

    // 4. Restore from localStorage (adds any saved URLs not already loaded)
    await this.store.restoreFromStorage();

    // 5. Load auto-saved layout
    this.store.loadAutoSave();

    // Re-place auto-saved components
    const saved = this.store.getSnapshot().placed;
    if (saved.length > 0 && this._viewer) {
      for (const comp of saved) {
        try {
          const clone = await this._modelCache.getOrLoad(comp.glbUrl);
          clone.userData._layoutObject = true;
          clone.userData._layoutId = comp.id;
          clone.traverse((child) => { child.userData._layoutObject = true; });
          clone.traverse((child) => {
            if ((child as Mesh).isMesh) {
              child.castShadow = false;
              child.receiveShadow = false;
            }
          });
          alignToFloor(clone);
          clone.position.set(comp.position[0], clone.position.y, comp.position[2]);
          clone.rotation.set(
            MathUtils.degToRad(comp.rotation[0]),
            MathUtils.degToRad(comp.rotation[1]),
            MathUtils.degToRad(comp.rotation[2]),
          );
          this._layoutRoot.add(clone);
          this._objectMap.set(comp.id, clone);
        } catch { /* skip failed loads */ }
      }
      this._viewer.markRenderDirty();
    }
  }
}
