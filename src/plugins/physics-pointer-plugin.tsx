// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import React, { useState, useEffect } from 'react';
import { IconButton, Tooltip, useTheme, Zoom } from '@mui/material';
import { Grab, Pointer, Magnet } from 'lucide-react';
import type { RVViewerPlugin } from '../core/rv-plugin';
import type { RVViewer } from '../core/rv-viewer';
import type { UISlotEntry, UISlotProps } from '../core/rv-ui-plugin';
import type { LoadResult } from '../core/engine/rv-scene-loader';
import { Vector2, Vector3, Plane, Raycaster } from 'three';

// ─── UI Component ───

const PhysicsToggle: React.FC<UISlotProps> = ({ viewer }) => {
  const [active, setActive] = useState(false);
  const theme = useTheme();

  const toggle = () => {
    const next = !active;
    setActive(next);
    const plugin = viewer.getPlugin<PhysicsPointerPlugin>('physics-pointer');
    if (plugin) plugin.enabled = next;
  };

  return (
    <Tooltip title={active ? "Disable Physics Interaction" : "Enable Physics Interaction (Grab MUs)"}>
      <IconButton 
        onClick={toggle}
        sx={{ 
          bgcolor: active ? 'rgba(32, 161, 177, 0.2)' : 'rgba(0,0,0,0.3)',
          border: `1px solid ${active ? '#3FB8C4' : 'rgba(255,255,255,0.1)'}`,
          color: active ? '#3FB8C4' : 'rgba(255,255,255,0.5)',
          '&:hover': { bgcolor: active ? 'rgba(32, 161, 177, 0.3)' : 'rgba(255,255,255,0.1)' }
        }}
      >
        <Grab size={20} />
      </IconButton>
    </Tooltip>
  );
};

// ─── Plugin Implementation ───

export class PhysicsPointerPlugin implements RVViewerPlugin {
  readonly id = 'physics-pointer';
  readonly order = 1000;

  readonly slots: UISlotEntry[] = [
    {
      slot: 'button-group',
      order: 10,
      component: PhysicsToggle,
    }
  ];

  public enabled = false;
  private _viewer: RVViewer | null = null;
  private _draggedMUId: string | null = null;
  private _dragPlane = new Plane(new Vector3(0, 1, 0), 0);
  private _intersection = new Vector3();
  private _raycaster = new Raycaster();

  onModelLoaded(_result: LoadResult, viewer: RVViewer): void {
    this._viewer = viewer;
    
    // Bind mouse events to the canvas
    const canvas = viewer.renderer.domElement;
    canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
  }

  private _onMouseDown = (e: MouseEvent) => {
    if (!this.enabled || !this._viewer) return;

    // Use viewer's raycaster to find MUs
    const mouse = new Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );

    this._raycaster.setFromCamera(mouse, this._viewer.camera);

    // Raycast against physics world
    const physicsPlugin = this._viewer.getPlugin<any>('rapier-physics');
    if (!physicsPlugin?.physicsWorld) return;

    const hit = physicsPlugin.physicsWorld.castRay(
      this._raycaster.ray.origin,
      this._raycaster.ray.direction,
      100 // 100 meters range
    );

    if (hit && hit.muId) {
      this._draggedMUId = hit.muId;
      
      // Setup drag plane at the hit position, facing the camera
      const hitPos = physicsPlugin.physicsWorld.getBodyPosition(hit.muId);
      if (hitPos) {
        this._dragPlane.setFromNormalAndCoplanarPoint(
          this._viewer.camera.getWorldDirection(new Vector3()).negate(),
          new Vector3(hitPos.x, hitPos.y, hitPos.z)
        );
      }

      // Disable orbit controls while dragging
      (this._viewer as any).controls.enabled = false;
    }
  };

  private _onMouseMove = (e: MouseEvent) => {
    if (!this._draggedMUId || !this._viewer) return;

    const mouse = new Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );

    this._raycaster.setFromCamera(mouse, this._viewer.camera);
    
    if (this._raycaster.ray.intersectPlane(this._dragPlane, this._intersection)) {
      const physicsPlugin = this._viewer.getPlugin<any>('rapier-physics');
      if (physicsPlugin?.physicsWorld) {
        // Move body to intersection point
        physicsPlugin.physicsWorld.setTranslation(this._draggedMUId, {
          x: this._intersection.x,
          y: this._intersection.y,
          z: this._intersection.z
        });
      }
    }
  };

  private _onMouseUp = () => {
    if (this._draggedMUId && this._viewer) {
      this._draggedMUId = null;
      (this._viewer as any).controls.enabled = true;
    }
  };

  dispose(): void {
    if (this._viewer) {
      const canvas = this._viewer.renderer.domElement;
      canvas.removeEventListener('mousedown', this._onMouseDown);
      window.removeEventListener('mousemove', this._onMouseMove);
      window.removeEventListener('mouseup', this._onMouseUp);
    }
  }
}
