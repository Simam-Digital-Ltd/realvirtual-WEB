/**
 * rv-annotation-renderer.ts — Three.js rendering for annotation markers.
 *
 * Creates pin meshes, label sprites, and connecting lines for each annotation.
 * All objects live on layer 6 (ANNOTATION) to avoid conflicts with drive/sensor
 * raycasting. Labels use CanvasTexture billboards with LOD-based scaling.
 *
 * Resources are individually tracked for proper disposal on removal or model-clear.
 */

import {
  Group,
  Mesh,
  MeshBasicMaterial,
  ConeGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  CanvasTexture,
  BufferGeometry,
  LineBasicMaterial,
  Line,
  Vector3,
  Color,
  RingGeometry,
  DoubleSide,
} from 'three';
import type { Camera, Scene } from 'three';
import type { Annotation } from '../core/types/plugin-types';

// ── Constants ──────────────────────────────────────────────────────────

/** Three.js layer index for annotations — separate from drives (1), sensors (2), MU (3). */
export const ANNOTATION_LAYER = 6;

/** Distance beyond which label text is hidden (show dot only). */
const LABEL_HIDE_DISTANCE = 20;

/** Minimum sprite scale to keep labels readable. */
const MIN_SPRITE_SCALE = 0.3;

/** Maximum sprite scale. */
const MAX_SPRITE_SCALE = 1.2;

/** Pin height in scene units. */
const PIN_HEIGHT = 0.08;

/** Pin radius. */
const PIN_RADIUS = 0.03;

/** Label offset above the pin. */
const LABEL_OFFSET_Y = 0.15;

// ── Per-annotation resource tracking ──────────────────────────────────

export interface AnnotationResources {
  pin: Mesh;
  label: Sprite;
  line: Line;
  labelTexture: CanvasTexture;
  labelMaterial: SpriteMaterial;
  pinMaterial: MeshBasicMaterial;
  lineMaterial: LineBasicMaterial;
  lineGeometry: BufferGeometry;
}

// ── Shared geometry (reused across all annotations) ──────────────────

let _sharedPinGeometry: ConeGeometry | null = null;
function getSharedPinGeometry(): ConeGeometry {
  if (!_sharedPinGeometry) {
    _sharedPinGeometry = new ConeGeometry(PIN_RADIUS, PIN_HEIGHT, 8);
    _sharedPinGeometry.translate(0, PIN_HEIGHT / 2, 0);
    _sharedPinGeometry.rotateX(Math.PI); // Point downward
  }
  return _sharedPinGeometry;
}

// ── Selection ring ───────────────────────────────────────────────────

let _selectionRingGeometry: RingGeometry | null = null;
function getSelectionRingGeometry(): RingGeometry {
  if (!_selectionRingGeometry) {
    _selectionRingGeometry = new RingGeometry(PIN_RADIUS * 1.5, PIN_RADIUS * 2.5, 16);
    _selectionRingGeometry.rotateX(-Math.PI / 2);
  }
  return _selectionRingGeometry;
}

// ── AnnotationRenderer ───────────────────────────────────────────────

export class AnnotationRenderer {
  readonly group = new Group();
  private _resources = new Map<string, AnnotationResources>();
  private _selectionRing: Mesh | null = null;
  private _selectionRingMaterial: MeshBasicMaterial | null = null;
  private _camera: Camera | null = null;

  constructor() {
    this.group.name = '__rv_annotations';
  }

  /** Attach to a scene. */
  attach(scene: Scene): void {
    scene.add(this.group);
  }

  /** Set camera for LOD calculations. */
  setCamera(camera: Camera): void {
    this._camera = camera;
  }

  /** Create visual objects for an annotation. */
  addAnnotation(ann: Annotation): void {
    if (this._resources.has(ann.id)) return;

    const color = new Color(ann.color);

    // Pin mesh
    const pinMaterial = new MeshBasicMaterial({ color });
    const pin = new Mesh(getSharedPinGeometry(), pinMaterial);
    pin.position.set(ann.position[0], ann.position[1], ann.position[2]);
    pin.layers.set(ANNOTATION_LAYER);
    pin.userData.__annotationId = ann.id;
    this.group.add(pin);

    // Label sprite
    const { texture, material: labelMaterial } = this._createLabelSprite(ann.text, ann.color);
    const label = new Sprite(labelMaterial);
    label.position.set(
      ann.position[0],
      ann.position[1] + LABEL_OFFSET_Y,
      ann.position[2],
    );
    label.scale.set(MAX_SPRITE_SCALE, MAX_SPRITE_SCALE * 0.5, 1);
    label.layers.set(ANNOTATION_LAYER);
    label.userData.__annotationId = ann.id;
    this.group.add(label);

    // Connecting line
    const lineGeometry = new BufferGeometry().setFromPoints([
      new Vector3(ann.position[0], ann.position[1], ann.position[2]),
      new Vector3(ann.position[0], ann.position[1] + LABEL_OFFSET_Y, ann.position[2]),
    ]);
    const lineMaterial = new LineBasicMaterial({ color, opacity: 0.5, transparent: true });
    const line = new Line(lineGeometry, lineMaterial);
    line.layers.set(ANNOTATION_LAYER);
    this.group.add(line);

    this._resources.set(ann.id, {
      pin,
      label,
      line,
      labelTexture: texture,
      labelMaterial,
      pinMaterial,
      lineMaterial,
      lineGeometry,
    });
  }

  /** Remove an annotation's visual objects and dispose resources. */
  removeAnnotation(id: string): void {
    const res = this._resources.get(id);
    if (!res) return;

    this.group.remove(res.pin);
    this.group.remove(res.label);
    this.group.remove(res.line);

    res.labelTexture.dispose();
    res.labelMaterial.dispose();
    res.pinMaterial.dispose();
    res.lineMaterial.dispose();
    res.lineGeometry.dispose();

    this._resources.delete(id);

    // Clear selection ring if this annotation was selected
    if (this._selectionRing && this._selectionRing.userData.__annotationId === id) {
      this._clearSelectionRing();
    }
  }

  /** Update visual properties (text, color) of an annotation. */
  updateAnnotation(ann: Annotation): void {
    const res = this._resources.get(ann.id);
    if (!res) return;

    const color = new Color(ann.color);
    res.pinMaterial.color.copy(color);
    res.lineMaterial.color.copy(color);

    // Recreate label texture with new text/color
    res.labelTexture.dispose();
    res.labelMaterial.dispose();
    const { texture, material } = this._createLabelSprite(ann.text, ann.color);
    res.label.material = material;
    res.labelTexture = texture;
    res.labelMaterial = material;
  }

  /** Update annotation position (for node-attached annotations). */
  updatePosition(id: string, position: [number, number, number]): void {
    const res = this._resources.get(id);
    if (!res) return;

    res.pin.position.set(position[0], position[1], position[2]);
    res.label.position.set(position[0], position[1] + LABEL_OFFSET_Y, position[2]);

    const points = [
      new Vector3(position[0], position[1], position[2]),
      new Vector3(position[0], position[1] + LABEL_OFFSET_Y, position[2]),
    ];
    res.lineGeometry.setFromPoints(points);

    // Update selection ring position if it's on this annotation
    if (this._selectionRing && this._selectionRing.userData.__annotationId === id) {
      this._selectionRing.position.set(position[0], position[1] + 0.005, position[2]);
    }
  }

  /** Show selection ring around a specific annotation. */
  selectAnnotation(id: string | null): void {
    this._clearSelectionRing();
    if (!id) return;

    const res = this._resources.get(id);
    if (!res) return;

    if (!this._selectionRingMaterial) {
      this._selectionRingMaterial = new MeshBasicMaterial({
        color: 0xffffff,
        side: DoubleSide,
        transparent: true,
        opacity: 0.6,
      });
    }

    this._selectionRing = new Mesh(getSelectionRingGeometry(), this._selectionRingMaterial);
    this._selectionRing.position.copy(res.pin.position);
    this._selectionRing.position.y += 0.005;
    this._selectionRing.layers.set(ANNOTATION_LAYER);
    this._selectionRing.userData.__annotationId = id;
    this.group.add(this._selectionRing);
  }

  /** Per-frame update: LOD scaling based on camera distance. */
  updateLOD(): void {
    if (!this._camera) return;

    const camPos = this._camera.position;

    for (const [, res] of this._resources) {
      const dist = camPos.distanceTo(res.label.position);

      if (dist > LABEL_HIDE_DISTANCE) {
        res.label.visible = false;
        res.line.visible = false;
      } else {
        res.label.visible = true;
        res.line.visible = true;
        // Scale inversely with distance (closer = bigger, capped)
        const scale = Math.max(MIN_SPRITE_SCALE, Math.min(MAX_SPRITE_SCALE, dist * 0.04));
        res.label.scale.set(scale, scale * 0.5, 1);
      }
    }
  }

  /** Dispose ALL resources (model-clear). */
  disposeAll(): void {
    for (const [id] of this._resources) {
      this.removeAnnotation(id);
    }
    this._clearSelectionRing();
    if (this._selectionRingMaterial) {
      this._selectionRingMaterial.dispose();
      this._selectionRingMaterial = null;
    }
  }

  /** Check if any resources exist. */
  get hasAnnotations(): boolean {
    return this._resources.size > 0;
  }

  /** Get the annotation ID at the given pin/label mesh (used by input handler). */
  getAnnotationIdFromObject(obj: { userData?: Record<string, unknown> }): string | null {
    return (obj?.userData?.['__annotationId'] as string) ?? null;
  }

  /** Get all annotation pin and label objects for raycasting. */
  getInteractiveObjects(): (Mesh | Sprite)[] {
    const objects: (Mesh | Sprite)[] = [];
    for (const res of this._resources.values()) {
      objects.push(res.pin, res.label);
    }
    return objects;
  }

  // ── Drawing support ──────────────────────────────────────────────────

  /** Add a drawing polyline for a drawing annotation. */
  addDrawing(ann: Annotation): void {
    if (!ann.points || ann.points.length < 2) return;
    if (this._resources.has(ann.id)) return;

    const color = new Color(ann.lineColor ?? ann.color);
    const lineMaterial = new LineBasicMaterial({
      color,
      linewidth: ann.lineWidth ?? 2,
    });
    const points = ann.points.map(p => new Vector3(p[0], p[1], p[2]));
    const lineGeometry = new BufferGeometry().setFromPoints(points);
    const line = new Line(lineGeometry, lineMaterial);
    line.layers.set(ANNOTATION_LAYER);
    line.userData.__annotationId = ann.id;
    this.group.add(line);

    // Create a dummy pin/label for consistent resource tracking
    const pinMaterial = new MeshBasicMaterial({ color, visible: false });
    const pin = new Mesh(getSharedPinGeometry(), pinMaterial);
    pin.visible = false;
    pin.layers.set(ANNOTATION_LAYER);

    const { texture, material: labelMaterial } = this._createLabelSprite('', ann.color);
    const label = new Sprite(labelMaterial);
    label.visible = false;
    label.layers.set(ANNOTATION_LAYER);

    const dummyLineGeom = new BufferGeometry();
    const dummyLineMat = new LineBasicMaterial({ visible: false });
    const dummyLine = new Line(dummyLineGeom, dummyLineMat);

    this._resources.set(ann.id, {
      pin,
      label,
      line,
      labelTexture: texture,
      labelMaterial,
      pinMaterial,
      lineMaterial,
      lineGeometry,
    });
  }

  // ── Internal helpers ─────────────────────────────────────────────────

  private _createLabelSprite(text: string, hexColor: string): { texture: CanvasTexture; material: SpriteMaterial } {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // Background with rounded rect
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    const radius = 8;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(canvas.width - radius, 0);
    ctx.quadraticCurveTo(canvas.width, 0, canvas.width, radius);
    ctx.lineTo(canvas.width, canvas.height - radius);
    ctx.quadraticCurveTo(canvas.width, canvas.height, canvas.width - radius, canvas.height);
    ctx.lineTo(radius, canvas.height);
    ctx.quadraticCurveTo(0, canvas.height, 0, canvas.height - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fill();

    // Color indicator dot
    ctx.fillStyle = hexColor;
    ctx.beginPath();
    ctx.arc(20, canvas.height / 2, 8, 0, Math.PI * 2);
    ctx.fill();

    // Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const truncated = text.length > 30 ? text.substring(0, 27) + '...' : text;
    ctx.fillText(truncated, 36, canvas.height / 2);

    const texture = new CanvasTexture(canvas);
    const material = new SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });

    return { texture, material };
  }

  private _clearSelectionRing(): void {
    if (this._selectionRing) {
      this.group.remove(this._selectionRing);
      this._selectionRing = null;
    }
  }
}
