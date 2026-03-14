import {
  Raycaster,
  Vector2,
  Vector3,
  Mesh,
  Object3D,
} from 'three';
import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { NodeRegistry } from './rv-node-registry';
import type { RVDrive } from './rv-drive';
import type { RVHighlightManager } from './rv-highlight-manager';

const THROTTLE_MS = 50;

export class RVDriveHover {
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private lastRaycastMs = 0;

  hoveredDrive: RVDrive | null = null;
  /** Last known pointer position (for UI tooltip positioning) */
  pointerClientX = 0;
  pointerClientY = 0;

  /** Last XR controller ray origin (for ray visualization). */
  lastRayOrigin: Vector3 | null = null;
  /** Last XR controller ray direction (for ray visualization). */
  lastRayDirection: Vector3 | null = null;

  /** Pre-filtered meshes that belong to drives — avoids full scene raycast. */
  private driveTargets: Object3D[] = [];

  private readonly onPointerMove: (e: PointerEvent) => void;

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly camera: PerspectiveCamera,
    private readonly scene: Scene,
    private readonly registry: NodeRegistry,
    private readonly highlighter: RVHighlightManager,
  ) {
    this.onPointerMove = this.handlePointerMove.bind(this);
    renderer.domElement.addEventListener('pointermove', this.onPointerMove);
  }

  /**
   * Build the filtered raycast target list from all registered drives.
   * Call after model is loaded (from setupDriveHover or viewer.loadModel).
   */
  setDriveTargets(drives: RVDrive[]): void {
    this.driveTargets = [];
    for (const drive of drives) {
      drive.node.traverse((child) => {
        if ((child as Mesh).isMesh && !child.userData?._highlightOverlay && !child.userData?._driveHoverOverlay) {
          this.driveTargets.push(child);
        }
      });
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    // Always track pointer position (for external tooltip positioning)
    this.pointerClientX = e.clientX;
    this.pointerClientY = e.clientY;

    const now = performance.now();
    if (now - this.lastRaycastMs < THROTTLE_MS) return;
    this.lastRaycastMs = now;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);

    // Use pre-filtered drive targets when available (no recursive scene traversal)
    const targets = this.driveTargets.length > 0 ? this.driveTargets : this.scene.children;
    const recursive = this.driveTargets.length === 0;
    const hits = this.raycaster.intersectObjects(targets, recursive);

    const hit = hits.find(
      (h) => (h.object as Mesh).isMesh
        && !h.object.name.endsWith('_sensorViz')
        && !h.object.userData?._highlightOverlay
        && !h.object.userData?._driveHoverOverlay,
    );

    if (!hit) {
      this.clearHover();
      return;
    }

    const drive = this.registry.findInParent<RVDrive>(hit.object, 'Drive');
    if (!drive) {
      this.clearHover();
      return;
    }

    if (drive === this.hoveredDrive) return;

    this.clearHover();
    this.hoveredDrive = drive;
    this.highlighter.highlight(drive.node);
    this.renderer.domElement.style.cursor = 'pointer';
  }

  private clearHover(): void {
    if (this.hoveredDrive) {
      this.highlighter.clear();
      this.hoveredDrive = null;
      this.renderer.domElement.style.cursor = '';
    }
  }

  /**
   * Perform drive-hover raycast using an XR controller ray instead of mouse NDC.
   * Call this each frame from the XR render loop for each active controller.
   */
  updateFromXRController(origin: Vector3, direction: Vector3): void {
    this.lastRayOrigin = origin.clone();
    this.lastRayDirection = direction.clone();

    this.raycaster.set(origin, direction);
    const targets = this.driveTargets.length > 0 ? this.driveTargets : this.scene.children;
    const recursive = this.driveTargets.length === 0;
    const hits = this.raycaster.intersectObjects(targets, recursive);

    const hit = hits.find(
      (h) => (h.object as Mesh).isMesh
        && !h.object.name.endsWith('_sensorViz')
        && !h.object.userData?._highlightOverlay
        && !h.object.userData?._driveHoverOverlay,
    );

    if (!hit) {
      this.clearHover();
      return;
    }

    const drive = this.registry.findInParent<RVDrive>(hit.object, 'Drive');
    if (!drive) {
      this.clearHover();
      return;
    }

    if (drive === this.hoveredDrive) return;

    this.clearHover();
    this.hoveredDrive = drive;
    this.highlighter.highlight(drive.node);
  }

  dispose(): void {
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.clearHover();
  }
}

export function setupDriveHover(
  renderer: WebGLRenderer,
  camera: PerspectiveCamera,
  scene: Scene,
  registry: NodeRegistry,
  highlighter: RVHighlightManager,
): RVDriveHover {
  return new RVDriveHover(renderer, camera, scene, registry, highlighter);
}
