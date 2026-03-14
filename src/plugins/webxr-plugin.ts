/**
 * WebXRPlugin — Immersive VR and AR sessions on WebXR-capable devices.
 *
 * Features:
 * - VR mode: full immersion with teleport, locomotion, snap turn
 * - AR mode: passthrough with pinch-to-scale (place machine on table)
 * - Teleport: hold trigger → parabolic arc, release → jump
 * - Left thumbstick: head-direction locomotion
 * - Right thumbstick X: snap turn, Y (AR only): scale up/down
 * - Info panel follows user view, dismissed by trigger press
 * - Controller models rendered
 */

import {
  Group,
  Vector3,
  Quaternion,
  Box3,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  CircleGeometry,
  BufferGeometry,
  Line,
  LineBasicMaterial,
  CanvasTexture,
  PlaneGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Color,
  Scene,
} from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import type { RVViewerPlugin } from '../core/rv-plugin';
import type { RVViewer } from '../core/rv-viewer';
import type { LoadResult } from '../core/engine/rv-scene-loader';
import { RVXRManager } from '../core/engine/rv-xr-manager';

const DEAD_ZONE = 0.15;
const SNAP_DEAD_ZONE = 0.5;
const SNAP_ANGLE = Math.PI / 4;
const SNAP_COOLDOWN = 0.35;
const MOVE_SPEED = 2.5;
const MAX_TELEPORT_DIST = 20;
const ARC_VELOCITY = 6.5;
const ARC_GRAVITY = 9.8;
const ARC_DT = 0.02;
const ARC_MAX_STEPS = 120;
const ARC_LINE_SEGMENTS = ARC_MAX_STEPS;
/** AR scale speed (multiplier per second at full stick deflection). */
const AR_SCALE_SPEED = 1.5;
const AR_MIN_SCALE = 0.01;
const AR_MAX_SCALE = 5.0;

type SessionMode = 'none' | 'vr' | 'ar';

export class WebXRPlugin implements RVViewerPlugin {
  readonly id = 'webxr';

  private vrButton: HTMLElement | null = null;
  private arButton: HTMLElement | null = null;
  private viewer: RVViewer | null = null;
  private initialized = false;
  private presenting = false;
  private sessionMode: SessionMode = 'none';

  // Camera rig
  private dolly: Group | null = null;
  private modelBoundingBox: Box3 | null = null;

  // Scene container for AR scaling (contains the actual model)
  private sceneContent: Group | null = null;
  private arScale = 1.0;

  // Snap turn state
  private snapCooldown = 0;

  // Teleport visuals
  private teleportReticle: Group | null = null;
  private teleportArc: Line | null = null;
  private readonly _controllerDir = new Vector3();
  private readonly _controllerPos = new Vector3();

  // Controller references
  private rightController: Group | null = null;
  private leftController: Group | null = null;

  // Trigger state tracking
  private rightTriggerWasPressed = false;
  private leftTriggerWasPressed = false;

  // Info panel
  private infoPanel: Mesh | null = null;
  private infoPanelDismissed = false;

  // Reusable vectors
  private readonly _headDir = new Vector3();
  private readonly _flipY = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);

  // Saved scene state for AR
  private savedBackground: Color | null | undefined = undefined;

  onModelLoaded(result: LoadResult, viewer: RVViewer): void {
    this.viewer = viewer;
    this.modelBoundingBox = result.boundingBox;
    if (!this.initialized) {
      this.initialized = true;
      this.initXR(viewer);
    }
  }

  onRender(frameDt: number): void {
    if (!this.viewer || !this.dolly || !this.presenting) return;
    this.updateInfoPanel();
    this.updateTeleport();
    this.updateThumbstickLocomotion(frameDt);
    this.updateSnapTurn(frameDt);
    if (this.sessionMode === 'ar') this.updateARScale(frameDt);
  }

  /** Detect if running on a VR headset browser (Quest, Pico, etc.) vs mobile/desktop. */
  private static isHeadsetBrowser(): boolean {
    const ua = navigator.userAgent.toLowerCase();
    return ua.includes('oculus') || ua.includes('quest')
        || ua.includes('pico') || ua.includes('vive')
        || ua.includes('wolvic');
  }

  private async initXR(viewer: RVViewer): Promise<void> {
    const support = await RVXRManager.checkSupport();

    if (!RVXRManager.isXRCapable(viewer.renderer)) {
      console.warn('[WebXR] Renderer does not support WebXR');
      return;
    }

    // Create camera rig (dolly group for locomotion)
    this.dolly = new Group();
    this.dolly.name = 'VRCameraRig';
    viewer.scene.add(this.dolly);
    this.dolly.add(viewer.camera);

    // Setup controllers inside the dolly
    const factory = new XRControllerModelFactory();
    for (let i = 0; i < 2; i++) {
      const controller = viewer.renderer.xr.getController(i);
      this.dolly.add(controller);
      const grip = viewer.renderer.xr.getControllerGrip(i);
      grip.add(factory.createControllerModel(grip));
      this.dolly.add(grip);

      if (i === 0) this.leftController = controller;
      if (i === 1) this.rightController = controller;
    }

    this.createTeleportVisuals(viewer);

    viewer.renderer.xr.addEventListener('sessionstart', () => this.onSessionStart());
    viewer.renderer.xr.addEventListener('sessionend', () => this.onSessionEnd());

    // Only show overlay VR/AR buttons on actual headset browsers (Quest, Pico, etc.)
    // On mobile/desktop, entry is handled through the app menu instead.
    if (!WebXRPlugin.isHeadsetBrowser()) return;

    const buttonStyle = {
      position: 'fixed',
      bottom: '20px',
      padding: '12px 32px',
      border: 'none',
      borderRadius: '8px',
      fontSize: '16px',
      fontWeight: '700',
      fontFamily: 'system-ui, sans-serif',
      cursor: 'pointer',
      zIndex: '10000',
      letterSpacing: '0.5px',
    };

    // VR button
    if (support.vr) {
      const button = VRButton.createButton(viewer.renderer);
      Object.assign(button.style, {
        ...buttonStyle,
        left: support.ar ? 'calc(50% - 90px)' : '50%',
        transform: support.ar ? 'none' : 'translateX(-50%)',
        background: 'rgba(79, 195, 247, 0.9)',
        color: '#000',
        boxShadow: '0 4px 20px rgba(79, 195, 247, 0.3)',
      });
      this.vrButton = button;
      document.body.appendChild(button);
    }

    // AR button (headset only — e.g. Quest passthrough)
    if (support.ar) {
      const arBtn = document.createElement('button');
      arBtn.textContent = 'ENTER AR';
      Object.assign(arBtn.style, {
        ...buttonStyle,
        left: support.vr ? 'calc(50% + 90px)' : '50%',
        transform: support.vr ? 'none' : 'translateX(-50%)',
        background: 'rgba(129, 199, 132, 0.9)',
        color: '#000',
        boxShadow: '0 4px 20px rgba(129, 199, 132, 0.3)',
      });
      arBtn.addEventListener('click', () => this.startAR());
      this.arButton = arBtn;
      document.body.appendChild(arBtn);
    }
  }

  /** Start an AR passthrough session. */
  private async startAR(): Promise<void> {
    if (!this.viewer) return;
    const renderer = this.viewer.renderer;

    try {
      const session = await navigator.xr!.requestSession('immersive-ar', {
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['hand-tracking'],
      });

      this.sessionMode = 'ar';
      renderer.xr.setReferenceSpaceType('local-floor');
      await renderer.xr.setSession(session);
    } catch (e) {
      console.warn('[WebXR] AR session failed:', e);
    }
  }

  /** Create teleport reticle and arc line. */
  private createTeleportVisuals(viewer: RVViewer): void {
    this.teleportReticle = new Group();
    this.teleportReticle.visible = false;

    const ringGeo = new RingGeometry(0.22, 0.28, 32).rotateX(-Math.PI / 2);
    const ringMat = new MeshBasicMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.85 });
    this.teleportReticle.add(new Mesh(ringGeo, ringMat));

    const discGeo = new CircleGeometry(0.18, 32).rotateX(-Math.PI / 2);
    const discMat = new MeshBasicMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.25 });
    this.teleportReticle.add(new Mesh(discGeo, discMat));

    viewer.scene.add(this.teleportReticle);

    const positions = new Float32Array((ARC_LINE_SEGMENTS + 1) * 3);
    const arcGeo = new BufferGeometry();
    arcGeo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    arcGeo.setDrawRange(0, 0);
    const arcMat = new LineBasicMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.6 });
    this.teleportArc = new Line(arcGeo, arcMat);
    this.teleportArc.visible = false;
    this.teleportArc.frustumCulled = false;
    viewer.scene.add(this.teleportArc);
  }

  /** Create info panel with mode-specific instructions. */
  private createInfoPanel(mode: SessionMode): Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 380;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = 'rgba(18, 18, 18, 0.92)';
    roundRect(ctx, 0, 0, 512, 380, 16);
    ctx.fill();

    ctx.strokeStyle = mode === 'ar' ? 'rgba(129, 199, 132, 0.4)' : 'rgba(79, 195, 247, 0.4)';
    ctx.lineWidth = 2;
    roundRect(ctx, 1, 1, 510, 378, 16);
    ctx.stroke();

    const accent = mode === 'ar' ? '#81c784' : '#4fc3f7';

    ctx.fillStyle = accent;
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(mode === 'ar' ? 'AR Navigation' : 'VR Navigation', 256, 48);

    ctx.textAlign = 'left';
    const lines: [string, string][] = mode === 'ar' ? [
      ['L stick', 'Walk (follows head direction)'],
      ['R stick X', 'Turn left / right'],
      ['R stick Y', 'Scale model up / down'],
      ['Trigger', 'Hold to aim, release to teleport'],
    ] : [
      ['L stick', 'Walk (follows head direction)'],
      ['R stick', 'Turn left / right'],
      ['Trigger', 'Hold to aim arc, release to jump'],
      ['', ''],
    ];

    let y = 95;
    for (const [label, text] of lines) {
      if (!label && !text) { y += 42; continue; }
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.fillStyle = accent;
      ctx.fillText(label, 36, y);
      ctx.font = '17px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(text, 170, y);
      y += 42;
    }

    ctx.fillStyle = accent;
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Press any trigger to start', 256, 345);

    const texture = new CanvasTexture(canvas);
    const geo = new PlaneGeometry(0.8, 0.6);
    const mat = new MeshBasicMaterial({ map: texture, transparent: true, side: DoubleSide, depthTest: false });
    const mesh = new Mesh(geo, mat);
    mesh.renderOrder = 9999;
    return mesh;
  }

  /** Called when any XR session starts (VR or AR). */
  private onSessionStart(): void {
    this.presenting = true;
    if (!this.dolly || !this.modelBoundingBox || !this.viewer) return;

    // Detect session mode if not already set (VRButton sets it automatically)
    if (this.sessionMode === 'none') {
      this.sessionMode = 'vr';
    }

    const center = new Vector3();
    const size = new Vector3();
    this.modelBoundingBox.getCenter(center);
    this.modelBoundingBox.getSize(size);

    if (this.sessionMode === 'ar') {
      // AR mode: make background transparent for passthrough
      this.savedBackground = this.viewer.scene.background as Color | null;
      this.viewer.scene.background = null;

      // Wrap scene content in a group for scaling
      this.sceneContent = new Group();
      this.sceneContent.name = 'ARSceneContent';

      // Move all scene children (except dolly, teleport visuals) into sceneContent
      const children = [...this.viewer.scene.children];
      for (const child of children) {
        if (child === this.dolly || child === this.teleportReticle || child === this.teleportArc) continue;
        this.sceneContent.add(child);
      }
      this.viewer.scene.add(this.sceneContent);

      // Start at table scale: shrink to ~30cm, place 0.8m in front at table height
      const maxDim = Math.max(size.x, size.y, size.z, 0.1);
      this.arScale = 0.3 / maxDim;
      this.sceneContent.scale.setScalar(this.arScale);

      // Position: model center at roughly table height, in front of user
      this.sceneContent.position.set(
        -center.x * this.arScale,
        0.7 - center.y * this.arScale,
        -1.0 - center.z * this.arScale,
      );

      // Dolly at origin for AR (user stands where they are)
      this.dolly.position.set(0, 0, 0);
      this.dolly.rotation.set(0, 0, 0);
    } else {
      // VR mode: position outside the machine
      const maxHoriz = Math.max(size.x, size.z, 0.5);
      const standDist = maxHoriz * 1.2;

      this.dolly.position.set(
        center.x + standDist * 0.7,
        0,
        center.z + standDist * 0.7,
      );

      const lookTarget = new Vector3(center.x, 0, center.z);
      const dollyPos = this.dolly.position.clone();
      const dir = lookTarget.sub(dollyPos).normalize();
      const angle = Math.atan2(dir.x, dir.z);
      this.dolly.rotation.set(0, angle, 0);
    }

    this.snapCooldown = 0;
    this.rightTriggerWasPressed = false;
    this.leftTriggerWasPressed = false;

    // Show info panel
    this.infoPanelDismissed = false;
    this.infoPanel = this.createInfoPanel(this.sessionMode);
    this.dolly.add(this.infoPanel);
    this.infoPanel.position.set(0, 1.5, -1.2);
  }

  /** Reset when leaving XR. */
  private onSessionEnd(): void {
    this.presenting = false;
    if (!this.dolly || !this.viewer) return;

    // Restore scene content from AR wrapper
    if (this.sceneContent) {
      this.sceneContent.scale.setScalar(1);
      this.sceneContent.position.set(0, 0, 0);
      const children = [...this.sceneContent.children];
      for (const child of children) {
        this.viewer.scene.add(child);
      }
      this.viewer.scene.remove(this.sceneContent);
      this.sceneContent = null;
    }

    // Restore background
    if (this.savedBackground !== undefined) {
      this.viewer.scene.background = this.savedBackground;
      this.savedBackground = undefined;
    }

    this.viewer.scene.add(this.viewer.camera);
    this.dolly.position.set(0, 0, 0);
    this.dolly.rotation.set(0, 0, 0);

    if (this.teleportReticle) this.teleportReticle.visible = false;
    if (this.teleportArc) this.teleportArc.visible = false;

    this.removeInfoPanel();
    this.sessionMode = 'none';
    this.arScale = 1.0;
  }

  /** Keep info panel in front of user, dismiss on trigger. */
  private updateInfoPanel(): void {
    if (!this.infoPanel || this.infoPanelDismissed || !this.viewer) return;

    const xrCamera = this.viewer.renderer.xr.getCamera();
    const camDir = new Vector3();
    xrCamera.getWorldDirection(camDir);
    const camPos = new Vector3();
    xrCamera.getWorldPosition(camPos);

    const worldTarget = camPos.clone().add(camDir.multiplyScalar(1.2));
    if (this.dolly) this.dolly.worldToLocal(worldTarget);
    this.infoPanel.position.copy(worldTarget);

    const localCamPos = camPos.clone();
    if (this.dolly) this.dolly.worldToLocal(localCamPos);
    this.infoPanel.lookAt(localCamPos);
    this.infoPanel.quaternion.multiply(this._flipY);

    const session = this.viewer.renderer.xr.getSession();
    if (!session) return;

    for (const source of session.inputSources) {
      if (!source.gamepad) continue;
      const trigger = source.gamepad.buttons[0];
      if (trigger && trigger.pressed) {
        this.infoPanelDismissed = true;
        this.removeInfoPanel();
        this.rightTriggerWasPressed = true;
        this.leftTriggerWasPressed = true;
        return;
      }
    }
  }

  /** Parabolic arc from controller to ground. */
  private computeArc(origin: Vector3, direction: Vector3): { points: Vector3[]; landing: Vector3 } | null {
    const points: Vector3[] = [];
    const vel = direction.clone().multiplyScalar(ARC_VELOCITY);
    const pos = origin.clone();
    points.push(pos.clone());

    for (let i = 0; i < ARC_MAX_STEPS; i++) {
      const prevY = pos.y;
      vel.y -= ARC_GRAVITY * ARC_DT;
      pos.x += vel.x * ARC_DT;
      pos.y += vel.y * ARC_DT;
      pos.z += vel.z * ARC_DT;
      points.push(pos.clone());

      if (pos.y <= 0 && prevY > 0) {
        const t = prevY / (prevY - pos.y);
        const landing = new Vector3(
          points[points.length - 2].x + (pos.x - points[points.length - 2].x) * t,
          0,
          points[points.length - 2].z + (pos.z - points[points.length - 2].z) * t,
        );
        points[points.length - 1] = landing;
        if (origin.distanceTo(landing) > MAX_TELEPORT_DIST) return null;
        return { points, landing };
      }

      if (pos.y < -5) return null;
    }
    return null;
  }

  /** Hold trigger → show arc + reticle. Release → teleport. */
  private updateTeleport(): void {
    if (!this.viewer || !this.dolly) return;
    if (this.infoPanel && !this.infoPanelDismissed) return;

    const session = this.viewer.renderer.xr.getSession();
    if (!session) return;

    const prevRight = this.rightTriggerWasPressed;
    const prevLeft = this.leftTriggerWasPressed;
    const rightHeld = this.isTriggerPressed(session, 'right');
    const leftHeld = this.isTriggerPressed(session, 'left');
    this.rightTriggerWasPressed = rightHeld;
    this.leftTriggerWasPressed = leftHeld;

    // Teleport on trigger release
    if (!rightHeld && prevRight && this.teleportReticle?.visible) {
      this.dolly.position.x = this.teleportReticle.position.x;
      this.dolly.position.z = this.teleportReticle.position.z;
      this.dolly.position.y = 0;
    } else if (!leftHeld && prevLeft && this.teleportReticle?.visible) {
      this.dolly.position.x = this.teleportReticle.position.x;
      this.dolly.position.z = this.teleportReticle.position.z;
      this.dolly.position.y = 0;
    }

    if (!rightHeld && !leftHeld) {
      if (this.teleportReticle) this.teleportReticle.visible = false;
      if (this.teleportArc) this.teleportArc.visible = false;
      return;
    }

    const ctrl = rightHeld ? this.rightController : this.leftController;
    if (!ctrl) return;

    ctrl.getWorldPosition(this._controllerPos);
    ctrl.getWorldDirection(this._controllerDir);
    // Negate: getWorldDirection returns -Z but Quest controllers point along +Z
    this._controllerDir.negate();

    const arc = this.computeArc(this._controllerPos, this._controllerDir);
    if (!arc) {
      if (this.teleportReticle) this.teleportReticle.visible = false;
      if (this.teleportArc) this.teleportArc.visible = false;
      return;
    }

    if (this.teleportReticle) {
      this.teleportReticle.position.copy(arc.landing);
      this.teleportReticle.position.y = 0.02;
      this.teleportReticle.visible = true;
    }

    if (this.teleportArc) {
      const posAttr = this.teleportArc.geometry.attributes.position as Float32BufferAttribute;
      const maxPts = ARC_LINE_SEGMENTS + 1;
      const numPts = Math.min(arc.points.length, maxPts);
      for (let i = 0; i < numPts; i++) {
        posAttr.setXYZ(i, arc.points[i].x, arc.points[i].y, arc.points[i].z);
      }
      posAttr.needsUpdate = true;
      this.teleportArc.geometry.setDrawRange(0, numPts);
      this.teleportArc.visible = true;
    }
  }

  private isTriggerPressed(session: XRSession, hand: 'left' | 'right'): boolean {
    for (const source of session.inputSources) {
      if (source.handedness === hand && source.gamepad) {
        return (source.gamepad.buttons[0]?.pressed ?? false)
            || (source.gamepad.buttons[1]?.pressed ?? false);
      }
    }
    return false;
  }

  /** Left thumbstick: walk in head direction. */
  private updateThumbstickLocomotion(dt: number): void {
    if (!this.viewer || !this.dolly) return;
    if (this.infoPanel && !this.infoPanelDismissed) return;

    const session = this.viewer.renderer.xr.getSession();
    if (!session) return;

    for (const source of session.inputSources) {
      if (!source.gamepad || source.handedness !== 'left') continue;
      const axes = source.gamepad.axes;

      const axX = axes.length > 2 ? axes[2] : axes[0];
      const axY = axes.length > 3 ? axes[3] : axes[1];
      const moveX = Math.abs(axX) > DEAD_ZONE ? axX : 0;
      const moveZ = Math.abs(axY) > DEAD_ZONE ? axY : 0;
      if (moveX === 0 && moveZ === 0) continue;

      const xrCamera = this.viewer.renderer.xr.getCamera();
      xrCamera.getWorldDirection(this._headDir);
      this._headDir.y = 0;
      this._headDir.normalize();

      const fwdX = this._headDir.x;
      const fwdZ = this._headDir.z;
      const rightX = -this._headDir.z;
      const rightZ = this._headDir.x;

      const speed = MOVE_SPEED * dt;
      this.dolly.position.x += (fwdX * -moveZ + rightX * moveX) * speed;
      this.dolly.position.z += (fwdZ * -moveZ + rightZ * moveX) * speed;
      this.dolly.position.y = 0;
    }
  }

  /** Right thumbstick X: snap turn. */
  private updateSnapTurn(dt: number): void {
    if (!this.viewer || !this.dolly) return;
    if (this.infoPanel && !this.infoPanelDismissed) return;

    const session = this.viewer.renderer.xr.getSession();
    if (!session) return;

    if (this.snapCooldown > 0) this.snapCooldown -= dt;

    for (const source of session.inputSources) {
      if (!source.gamepad || source.handedness !== 'right') continue;
      const axes = source.gamepad.axes;

      const axX = axes.length > 2 ? axes[2] : axes[0];
      const turnX = Math.abs(axX) > SNAP_DEAD_ZONE ? axX : 0;

      if (turnX !== 0 && this.snapCooldown <= 0) {
        const snapDir = turnX > 0 ? -1 : 1;
        this.dolly.rotation.y += SNAP_ANGLE * snapDir;
        this.snapCooldown = SNAP_COOLDOWN;
      }
    }
  }

  /** Right thumbstick Y in AR mode: scale the model up/down. */
  private updateARScale(dt: number): void {
    if (!this.sceneContent || !this.viewer) return;
    if (this.infoPanel && !this.infoPanelDismissed) return;

    const session = this.viewer.renderer.xr.getSession();
    if (!session) return;

    for (const source of session.inputSources) {
      if (!source.gamepad || source.handedness !== 'right') continue;
      const axes = source.gamepad.axes;

      const axY = axes.length > 3 ? axes[3] : axes[1];
      const scaleInput = Math.abs(axY) > DEAD_ZONE ? axY : 0;
      if (scaleInput === 0) continue;

      // Stick up (negative Y) = scale up, stick down = scale down
      const factor = Math.pow(AR_SCALE_SPEED, -scaleInput * dt);
      this.arScale = Math.max(AR_MIN_SCALE, Math.min(AR_MAX_SCALE, this.arScale * factor));
      this.sceneContent.scale.setScalar(this.arScale);
    }
  }

  private removeInfoPanel(): void {
    if (!this.infoPanel) return;
    this.infoPanel.removeFromParent();
    const mat = this.infoPanel.material as MeshBasicMaterial;
    mat.map?.dispose();
    mat.dispose();
    this.infoPanel.geometry.dispose();
    this.infoPanel = null;
  }

  dispose(): void {
    if (this.vrButton) { this.vrButton.remove(); this.vrButton = null; }
    if (this.arButton) { this.arButton.remove(); this.arButton = null; }
    if (this.teleportReticle) {
      this.teleportReticle.removeFromParent();
      this.teleportReticle.traverse((child) => {
        if (child instanceof Mesh) {
          child.geometry.dispose();
          (child.material as MeshBasicMaterial).dispose();
        }
      });
      this.teleportReticle = null;
    }
    if (this.teleportArc) {
      this.teleportArc.removeFromParent();
      this.teleportArc.geometry.dispose();
      (this.teleportArc.material as LineBasicMaterial).dispose();
      this.teleportArc = null;
    }
    this.removeInfoPanel();
    if (this.dolly && this.viewer) {
      this.viewer.scene.add(this.viewer.camera);
      this.viewer.scene.remove(this.dolly);
    }
    this.dolly = null;
    this.rightController = null;
    this.leftController = null;
    this.presenting = false;
    this.sessionMode = 'none';
    this.viewer = null;
    this.initialized = false;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
