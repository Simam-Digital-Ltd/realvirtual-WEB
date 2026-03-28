/**
 * FpvPlugin — First-Person View walkthrough navigation for desktop browsers.
 *
 * Uses Three.js PointerLockControls for mouse look and WASD for movement.
 * Disables OrbitControls when active (same pattern as WebXRPlugin).
 * Snaps camera Y to ground plane + eye height via downward raycast.
 *
 * Mobile FPV (nipplejs virtual joystick) is deferred to a future phase.
 */

import { useState, useCallback, useEffect } from 'react';
import { Vector3, Raycaster, Object3D } from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { DirectionsWalk } from '@mui/icons-material';
import type { RVViewerPlugin } from '../core/rv-plugin';
import type { RVViewer } from '../core/rv-viewer';
import type { LoadResult } from '../core/engine/rv-scene-loader';
import type { UISlotEntry, UISlotProps } from '../core/rv-ui-plugin';
import { NavButton } from '../core/hmi/NavButton';
import { isMobileDevice } from '../hooks/use-mobile-layout';
import { loadVisualSettings } from '../core/hmi/visual-settings-store';
import type { WebXRPlugin } from './webxr-plugin';

// ─── Constants ──────────────────────────────────────────────────────────

/** Minimum ms between pointer lock requests to avoid DOMException. */
const LOCK_COOLDOWN_MS = 300;

/** Ground snap Y interpolation factor per second (exponential lerp). */
const GROUND_SNAP_LERP = 8;

/** Maximum raycast distance downward for ground detection. */
const GROUND_RAY_MAX = 50;

/** Default FPV settings from plan. */
const DEFAULT_SPEED = 2.5;
const DEFAULT_SPRINT_SPEED = 5.0;
const DEFAULT_SENSITIVITY = 0.002;
const DEFAULT_EYE_HEIGHT = 1.7;

// ─── Key codes for WASD + arrows ────────────────────────────────────────

const FORWARD_KEYS = new Set(['KeyW', 'ArrowUp']);
const BACKWARD_KEYS = new Set(['KeyS', 'ArrowDown']);
const LEFT_KEYS = new Set(['KeyA', 'ArrowLeft']);
const RIGHT_KEYS = new Set(['KeyD', 'ArrowRight']);
const SPRINT_KEYS = new Set(['ShiftLeft', 'ShiftRight']);
const TOGGLE_KEY = 'KeyF';

// ─── Reusable vectors (pre-allocated, zero GC in update loop) ───────────

const _forward = new Vector3();
const _right = new Vector3();
const _moveDir = new Vector3();
const _rayOrigin = new Vector3();
const _downDir = new Vector3(0, -1, 0);

// ─── External subscribers for React re-render ───────────────────────────

type Listener = () => void;
let _fpvActive = false;
const _listeners = new Set<Listener>();
function notifyListeners() { _listeners.forEach((l) => l()); }

/** React hook: subscribe to FPV active state changes. */
export function useFpvActive(): boolean {
  const [active, setActive] = useState(_fpvActive);
  useEffect(() => {
    const cb = () => setActive(_fpvActive);
    _listeners.add(cb);
    return () => { _listeners.delete(cb); };
  }, []);
  return active;
}

// ─── FPV Plugin ─────────────────────────────────────────────────────────

export class FpvPlugin implements RVViewerPlugin {
  readonly id = 'fpv';
  readonly order = 5; // Before drive physics

  // ── Public state ──
  /** Whether FPV mode is currently active. */
  get isActive(): boolean { return this._active; }

  // ── Settings (loaded from visual-settings-store) ──
  speed = DEFAULT_SPEED;
  sprintSpeed = DEFAULT_SPRINT_SPEED;
  sensitivity = DEFAULT_SENSITIVITY;
  eyeHeight = DEFAULT_EYE_HEIGHT;

  // ── Plugin slots (button in left sidebar) ──
  readonly slots: UISlotEntry[] = [
    { slot: 'button-group', component: FpvButton, order: 50 },
  ];

  // ── Private state ──
  private _viewer: RVViewer | null = null;
  private _active = false;
  private _isTransitioning = false;
  private _plControls: PointerLockControls | null = null;
  private _keys = new Set<string>();
  private _groundTargets: Object3D[] = [];
  private _groundRaycaster = new Raycaster();
  private _currentGroundY = 0;
  private _hasGroundHit = false;

  // Saved orbit state for restore on exit
  private _savedCamPos = new Vector3();
  private _savedCamTarget = new Vector3();

  // Pointer lock timing
  private _lastLockTime = 0;

  // Crosshair DOM element
  private _crosshair: HTMLDivElement | null = null;

  // Pointer lock overlay
  private _overlay: HTMLDivElement | null = null;
  private _overlayClickHandler: (() => void) | null = null;

  // Bound event handlers (for removeEventListener)
  private _onKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private _onKeyUp: ((e: KeyboardEvent) => void) | null = null;
  private _onPointerLockChange: (() => void) | null = null;
  private _onPointerLockError: (() => void) | null = null;
  private _onBlur: (() => void) | null = null;
  private _onVisibilityChange: (() => void) | null = null;

  // XR event unsubs
  private _unsubs: (() => void)[] = [];

  // ── Lifecycle ──────────────────────────────────────────────────────

  onModelLoaded(_result: LoadResult, viewer: RVViewer): void {
    this._viewer = viewer;

    // Load settings
    this._loadSettings();

    // Cache ground targets (scene fixtures that are flat meshes on XZ plane)
    this._groundTargets = [];
    for (const child of viewer.scene.children) {
      // The ground plane is a Mesh rotated -PI/2 on X (flat on XZ)
      if ((child as { isMesh?: boolean }).isMesh && Math.abs(child.rotation.x + Math.PI / 2) < 0.01) {
        this._groundTargets.push(child);
      }
    }

    // Initialize PointerLockControls (lazy — only on first model load)
    if (!this._plControls) {
      this._plControls = new PointerLockControls(viewer.camera, viewer.renderer.domElement);
      // PointerLockControls fires 'change' on mouse move — mark render dirty
      this._plControls.addEventListener('change', () => {
        if (this._active) viewer.markRenderDirty();
      });
      this._setupEventListeners(viewer);
    } else {
      // Update camera reference (new camera after model load)
      this._plControls.getObject(); // PointerLockControls holds camera ref from constructor
    }

    // Listen for XR session start to exit FPV
    const unsubXrStart = viewer.on('xr-session-start', () => {
      if (this._active) this.exit();
    });
    this._unsubs.push(unsubXrStart);
  }

  onModelCleared(viewer: RVViewer): void {
    // Exit FPV if active (scene geometry gone, ground cache stale)
    if (this._active) this._exitImmediate();
    this._groundTargets = [];
    // Clean up XR event listeners
    this._unsubs.forEach((u) => u());
    this._unsubs = [];
    this._viewer = viewer;
  }

  onFixedUpdatePre(dt: number): void {
    if (!this._active || !this._viewer) return;

    const viewer = this._viewer;
    const camera = viewer.camera;
    const speed = this._keys.has('ShiftLeft') || this._keys.has('ShiftRight')
      ? this.sprintSpeed : this.speed;

    // ── Compute movement direction on XZ plane ──
    _moveDir.set(0, 0, 0);

    // Forward vector: camera look direction projected onto XZ
    camera.getWorldDirection(_forward);
    _forward.y = 0;
    _forward.normalize();

    // Right vector: perpendicular to forward on XZ
    _right.set(_forward.z, 0, -_forward.x);

    let hasInput = false;
    for (const code of this._keys) {
      if (FORWARD_KEYS.has(code))  { _moveDir.add(_forward); hasInput = true; }
      if (BACKWARD_KEYS.has(code)) { _moveDir.sub(_forward); hasInput = true; }
      if (LEFT_KEYS.has(code))     { _moveDir.sub(_right); hasInput = true; }
      if (RIGHT_KEYS.has(code))    { _moveDir.add(_right); hasInput = true; }
    }

    if (hasInput) {
      _moveDir.normalize();
      camera.position.addScaledVector(_moveDir, speed * dt);
    }

    // ── Ground snapping ──
    this._snapToGround(camera.position, dt);

    // ── Always mark render dirty while FPV is active (continuous rendering) ──
    viewer.markRenderDirty();
  }

  dispose(): void {
    if (this._active) this._exitImmediate();
    this._removeEventListeners();
    if (this._plControls) {
      this._plControls.dispose();
      this._plControls = null;
    }
    this._removeCrosshair();
    this._removeOverlay();
    this._unsubs.forEach((u) => u());
    this._unsubs = [];
  }

  // ── Public API ─────────────────────────────────────────────────────

  /** Enter FPV mode. Called from button click or F key. */
  enter(): void {
    if (this._active || this._isTransitioning || !this._viewer || !this._plControls) return;

    // XR conflict guard
    const xrPlugin = this._viewer.getPlugin<WebXRPlugin>('webxr');
    if (xrPlugin?.isPresenting) return;

    // Show pointer lock overlay (user must click to acquire lock)
    this._showOverlay();
  }

  /** Exit FPV mode. Called from ESC, button click, or pointer lock loss. */
  exit(): void {
    if (!this._active || this._isTransitioning || !this._viewer) return;

    this._isTransitioning = true;

    // Unlock pointer
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }

    // Restore orbit state
    const viewer = this._viewer;
    viewer.camera.position.copy(this._savedCamPos);
    viewer.controls.target.copy(this._savedCamTarget);
    viewer.controls.enabled = true;
    viewer.controls.update();

    // Re-enable raycast manager
    if (viewer.raycastManager) viewer.raycastManager.setEnabled(true);

    // Clean up UI
    this._removeCrosshair();
    this._removeOverlay();

    // Update state
    this._active = false;
    _fpvActive = false;
    notifyListeners();
    this._keys.clear();
    this._isTransitioning = false;

    viewer.emit('fpv-exit', undefined as never);
    viewer.markRenderDirty();
  }

  /** Toggle FPV mode. */
  toggle(): void {
    if (this._active) {
      this.exit();
    } else {
      this.enter();
    }
  }

  /** Reload settings from visual-settings-store. */
  reloadSettings(): void {
    this._loadSettings();
  }

  // ── Private: Enter flow ────────────────────────────────────────────

  /** Actually activate FPV after pointer lock is acquired. */
  private _activateFpv(): void {
    const viewer = this._viewer;
    if (!viewer || !this._plControls) return;

    this._isTransitioning = true;

    // Cancel any in-progress camera animation
    viewer.cancelCameraAnimation();

    // Save orbit state (position + controls.target) for restore on exit
    this._savedCamPos.copy(viewer.camera.position);
    this._savedCamTarget.copy(viewer.controls.target);

    // Disable orbit controls
    viewer.controls.enabled = false;

    // Disable raycast manager (left click is used for pointer lock, not selection)
    if (viewer.raycastManager) viewer.raycastManager.setEnabled(false);

    // Position camera at current orbit position but at eye height
    const camPos = viewer.camera.position;
    this._currentGroundY = 0;
    this._hasGroundHit = false;

    // Do an initial ground snap to find current ground level
    try {
      if (this._groundTargets.length > 0) {
        _rayOrigin.set(camPos.x, camPos.y + 10, camPos.z);
        this._groundRaycaster.set(_rayOrigin, _downDir);
        this._groundRaycaster.far = GROUND_RAY_MAX;
        const hits = this._groundRaycaster.intersectObjects(this._groundTargets, false);
        if (hits.length > 0) {
          this._currentGroundY = hits[0].point.y;
          this._hasGroundHit = true;
        }
      }
    } catch { /* raycast can fail in test environments with mock objects */ }
    camPos.y = this._currentGroundY + this.eyeHeight;

    // Show crosshair
    this._showCrosshair();

    // Update state
    this._active = true;
    _fpvActive = true;
    notifyListeners();
    this._isTransitioning = false;

    // Set PointerLockControls sensitivity
    this._plControls.pointerSpeed = this.sensitivity / 0.002; // normalize to default

    viewer.emit('fpv-enter', undefined as never);
    viewer.markRenderDirty();
  }

  /** Exit FPV immediately without animation (used for model clear, dispose). */
  private _exitImmediate(): void {
    if (!this._viewer) return;

    if (document.pointerLockElement) {
      document.exitPointerLock();
    }

    const viewer = this._viewer;
    viewer.controls.enabled = true;
    if (viewer.raycastManager) viewer.raycastManager.setEnabled(true);

    this._removeCrosshair();
    this._removeOverlay();

    this._active = false;
    _fpvActive = false;
    notifyListeners();
    this._keys.clear();
    this._isTransitioning = false;
  }

  // ── Private: Ground snapping ───────────────────────────────────────

  private _snapToGround(camPos: Vector3, dt: number): void {
    if (this._groundTargets.length === 0) {
      // No ground: keep at eye height above Y=0
      const targetY = this.eyeHeight;
      camPos.y += (targetY - camPos.y) * Math.min(1, GROUND_SNAP_LERP * dt);
      return;
    }

    // Cast ray downward from above camera position
    try {
      _rayOrigin.set(camPos.x, camPos.y + 10, camPos.z);
      this._groundRaycaster.set(_rayOrigin, _downDir);
      this._groundRaycaster.far = GROUND_RAY_MAX;

      const hits = this._groundRaycaster.intersectObjects(this._groundTargets, false);
      if (hits.length > 0) {
        this._currentGroundY = hits[0].point.y;
        this._hasGroundHit = true;
      }
    } catch { /* raycast can fail with non-standard geometry objects */ }
    // If no hit, keep last known ground Y

    if (this._hasGroundHit) {
      const targetY = this._currentGroundY + this.eyeHeight;
      // Smooth lerp to avoid jitter
      camPos.y += (targetY - camPos.y) * Math.min(1, GROUND_SNAP_LERP * dt);
    }
  }

  // ── Private: Settings ──────────────────────────────────────────────

  private _loadSettings(): void {
    const s = loadVisualSettings();
    this.speed = s.fpvSpeed ?? DEFAULT_SPEED;
    this.sprintSpeed = s.fpvSprintSpeed ?? DEFAULT_SPRINT_SPEED;
    this.sensitivity = s.fpvSensitivity ?? DEFAULT_SENSITIVITY;
    this.eyeHeight = s.fpvEyeHeight ?? DEFAULT_EYE_HEIGHT;
  }

  // ── Private: Event listeners ───────────────────────────────────────

  private _setupEventListeners(viewer: RVViewer): void {
    // Keyboard
    this._onKeyDown = (e: KeyboardEvent) => {
      // Input focus guard: skip WASD when typing in input/textarea
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (!this._active) {
        // F key toggle (only when not in input)
        if (e.code === TOGGLE_KEY && !isMobileDevice()) {
          e.preventDefault();
          this.toggle();
        }
        return;
      }

      this._keys.add(e.code);
    };

    this._onKeyUp = (e: KeyboardEvent) => {
      this._keys.delete(e.code);
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);

    // Pointer lock change
    this._onPointerLockChange = () => {
      if (document.pointerLockElement === viewer.renderer.domElement) {
        // Lock acquired — activate FPV
        this._removeOverlay();
        if (!this._active) this._activateFpv();
      } else {
        // Lock lost — exit FPV
        if (this._active) this.exit();
      }
    };
    document.addEventListener('pointerlockchange', this._onPointerLockChange);

    // Pointer lock error
    this._onPointerLockError = () => {
      console.warn('[FPV] Pointer lock request denied');
      this._removeOverlay();
      // Re-enable orbit controls if they were disabled
      if (!this._active && viewer.controls) {
        viewer.controls.enabled = true;
      }
      this._isTransitioning = false;
    };
    document.addEventListener('pointerlockerror', this._onPointerLockError);

    // Sticky keys guard: clear keys on window blur / visibility change
    this._onBlur = () => { this._keys.clear(); };
    window.addEventListener('blur', this._onBlur);

    this._onVisibilityChange = () => {
      if (document.hidden) this._keys.clear();
    };
    document.addEventListener('visibilitychange', this._onVisibilityChange);
  }

  private _removeEventListeners(): void {
    if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown);
    if (this._onKeyUp) window.removeEventListener('keyup', this._onKeyUp);
    if (this._onPointerLockChange) document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    if (this._onPointerLockError) document.removeEventListener('pointerlockerror', this._onPointerLockError);
    if (this._onBlur) window.removeEventListener('blur', this._onBlur);
    if (this._onVisibilityChange) document.removeEventListener('visibilitychange', this._onVisibilityChange);
  }

  // ── Private: Crosshair ─────────────────────────────────────────────

  private _showCrosshair(): void {
    if (this._crosshair) return;
    this._crosshair = document.createElement('div');
    this._crosshair.style.cssText = [
      'position: fixed',
      'top: 50%',
      'left: 50%',
      'transform: translate(-50%, -50%)',
      'width: 6px',
      'height: 6px',
      'border-radius: 50%',
      'background: rgba(255, 255, 255, 0.6)',
      'border: 1px solid rgba(0, 0, 0, 0.3)',
      'pointer-events: none',
      'z-index: 10000',
    ].join('; ');
    document.body.appendChild(this._crosshair);
  }

  private _removeCrosshair(): void {
    if (this._crosshair) {
      this._crosshair.remove();
      this._crosshair = null;
    }
  }

  // ── Private: Pointer Lock Overlay ──────────────────────────────────

  private _showOverlay(): void {
    if (this._overlay) return;

    this._overlay = document.createElement('div');
    this._overlay.style.cssText = [
      'position: fixed',
      'inset: 0',
      'display: flex',
      'flex-direction: column',
      'align-items: center',
      'justify-content: center',
      'background: rgba(0, 0, 0, 0.7)',
      'z-index: 10001',
      'cursor: pointer',
      'color: white',
      'font-family: sans-serif',
    ].join('; ');

    this._overlay.innerHTML = `
      <div style="text-align: center; max-width: 400px;">
        <div style="font-size: 36px; margin-bottom: 16px;">&#127918;</div>
        <div style="font-size: 20px; font-weight: 600; margin-bottom: 8px;">Click to Enter</div>
        <div style="font-size: 16px; margin-bottom: 24px;">First-Person View</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; font-size: 14px; color: rgba(255,255,255,0.8);">
          <div><b>WASD</b> &mdash; Move</div>
          <div><b>Mouse</b> &mdash; Look</div>
          <div><b>Shift</b> &mdash; Sprint</div>
          <div><b>ESC</b> &mdash; Exit</div>
        </div>
        <div style="margin-top: 24px; font-size: 13px; color: rgba(255,255,255,0.5);">Click anywhere to start</div>
      </div>
    `;

    this._overlayClickHandler = () => {
      const now = performance.now();
      if (now - this._lastLockTime < LOCK_COOLDOWN_MS) return;
      this._lastLockTime = now;

      try {
        this._viewer?.renderer.domElement.requestPointerLock();
      } catch (err) {
        console.warn('[FPV] requestPointerLock failed:', err);
        this._removeOverlay();
        this._isTransitioning = false;
      }
    };
    this._overlay.addEventListener('click', this._overlayClickHandler);

    document.body.appendChild(this._overlay);
  }

  private _removeOverlay(): void {
    if (this._overlay) {
      if (this._overlayClickHandler) {
        this._overlay.removeEventListener('click', this._overlayClickHandler);
        this._overlayClickHandler = null;
      }
      this._overlay.remove();
      this._overlay = null;
    }
  }
}

// ─── FPV Button (React, registered via plugin slots) ────────────────────

function FpvButton({ viewer }: UISlotProps) {
  const active = useFpvActive();
  const isMobile = isMobileDevice();

  const handleClick = useCallback(() => {
    const plugin = viewer.getPlugin<FpvPlugin>('fpv');
    plugin?.toggle();
  }, [viewer]);

  // Hide on mobile (no pointer lock support)
  if (isMobile) return null;

  return <NavButton icon={<DirectionsWalk />} label="First-Person View (F)" active={active} onClick={handleClick} />;
}
