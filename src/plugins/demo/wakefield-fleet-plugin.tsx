// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Wakefield fleet plugin — the factory-to-logistics link, on screen.
 *
 * Owns the outbound lorries: builds their meshes, ticks the departure model in
 * `wakefield-fleet.ts` against live production, renders a fleet panel, and
 * flies a chase camera when you pick a lorry to follow.
 *
 * WHY THIS IS THE CONNECTED EXPERIENCE
 * ------------------------------------
 * The trailer on Dock 4 fills from `ProductionSnapshot.casesTotal` — the real
 * count of units consumed by the model's sinks. Watch the line run and you
 * watch the load bar climb; stop the line and it stops. When it fills, the
 * lorry leaves, and the panel switches it from a production number to a fleet
 * movement with an ETA.
 *
 * That is the dock boundary this whole product is arguing for, made literal:
 * one continuous causal chain from a drive turning to a lorry on the road.
 *
 * WHAT IS STILL HONEST ABOUT IT
 * -----------------------------
 * With no sinks in the model nothing loads, and the panel says the line is not
 * producing rather than filling a trailer on a timer. The ETA is arithmetic on
 * a known route at a known speed, not a traffic prediction, and the panel says
 * "clears site" so it cannot be read as a delivery promise.
 */

import React, { useEffect, useState } from 'react';
import { Box, Button, Chip, Fade, IconButton, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import { Close, LocalShipping, Videocam, VideocamOff } from '@mui/icons-material';
import { Group, Mesh, Vector3 } from 'three';
import type { RVViewerPlugin } from '../../core/rv-plugin';
import type { RVViewer } from '../../core/rv-viewer';
import type { UISlotEntry, UISlotProps } from '../../core/rv-ui-plugin';
import type { LoadResult } from '../../core/engine/rv-scene-loader';
import { EventEmitter } from '../../core/rv-events';
import { getProductionSnapshot } from '../../core/production-metrics';
import {
  OutboundFleet,
  TRAILER_CAPACITY,
  resetFleetSequence,
  sampleRoute,
  type FleetVehicle,
} from './wakefield-fleet';
import { createHgv, makeFleetMaterials, setHgvLoad, type FleetMaterials } from './wakefield-fleet-model';

/** Chase camera offset from the lorry, in its local frame (behind and above). */
const CHASE_BACK = 26;
const CHASE_UP = 11;
/** Camera smoothing per second. Lower is looser; 3 reads as a heavy vehicle. */
const CHASE_DAMPING = 3;

interface Tracked {
  vehicle: FleetVehicle;
  group: Group;
  loadBar: Mesh;
}

// ─── Plugin ─────────────────────────────────────────────────────────────

export class WakefieldFleetPlugin extends EventEmitter implements RVViewerPlugin {
  readonly id = 'wakefield-fleet';
  readonly name = 'Wakefield Outbound Fleet';
  /** After the dressing builds the site, before the ground guard clamps. */
  readonly order = 440;

  readonly slots: UISlotEntry[] = [
    { slot: 'overlay', order: 60, component: (p: UISlotProps) => <FleetPanel {...p} /> },
  ];

  private _viewer: RVViewer | null = null;
  private _root: Group | null = null;
  private _materials: FleetMaterials | null = null;
  private _fleet: OutboundFleet | null = null;
  private _tracked = new Map<string, Tracked>();
  private _followId: string | null = null;
  private _chasePos = new Vector3();
  private _chaseTarget = new Vector3();
  private _chaseInitialised = false;

  onModelLoaded(_result: LoadResult, viewer: RVViewer): void {
    this._viewer = viewer;
    this._teardown();

    resetFleetSequence();
    const root = new Group();
    root.name = 'wpf-fleet';
    viewer.scene.add(root);
    this._root = root;
    this._materials = makeFleetMaterials();
    this._fleet = new OutboundFleet();
  }

  onModelCleared(): void {
    this._teardown();
  }

  /** Vehicles as the panel needs them. */
  get vehicles(): readonly FleetVehicle[] {
    return this._fleet?.vehicles ?? [];
  }

  get followId(): string | null {
    return this._followId;
  }

  /** Follow a lorry, or pass null to release the camera. */
  setFollow(id: string | null): void {
    this._followId = id;
    this._chaseInitialised = false;
    this.emit('fleet-changed', undefined);
  }

  onRender(dt: number): void {
    const fleet = this._fleet;
    const root = this._root;
    const materials = this._materials;
    if (!fleet || !root || !materials) return;

    const snapshot = getProductionSnapshot();
    const departed = fleet.update(dt, {
      casesTotal: snapshot.casesTotal,
      hasSinks: snapshot.hasSinks,
    });

    for (const id of departed) {
      const tracked = this._tracked.get(id);
      if (tracked) {
        root.remove(tracked.group);
        disposeGroup(tracked.group);
        this._tracked.delete(id);
      }
      // Releasing the camera matters: chasing a lorry that no longer exists
      // would freeze the view at the estate boundary with nothing in frame.
      if (this._followId === id) this.setFollow(null);
    }

    for (const vehicle of fleet.vehicles) {
      let tracked = this._tracked.get(vehicle.id);
      if (!tracked) {
        const built = createHgv(vehicle.id, materials);
        root.add(built.group);
        tracked = { vehicle, group: built.group, loadBar: built.loadBar };
        this._tracked.set(vehicle.id, tracked);
      }
      tracked.vehicle = vehicle;

      const at = sampleRoute(vehicle.progress);
      tracked.group.position.set(at.x, 0, at.z);
      tracked.group.rotation.y = at.heading;
      setHgvLoad(tracked.loadBar, vehicle.cases / vehicle.capacity);
    }

    this._updateChase(dt);
    this.emit('fleet-changed', undefined);
  }

  /**
   * Chase camera.
   *
   * Damped rather than rigid: a camera welded to the lorry makes the whole
   * estate swing when the lorry turns, which is nauseating and hides the
   * thing you are following. Lagging behind lets the world stay still and the
   * lorry move through it.
   */
  private _updateChase(dt: number): void {
    const viewer = this._viewer;
    if (!viewer || !this._followId) return;

    const tracked = this._tracked.get(this._followId);
    const camera = viewer.camera;
    if (!tracked || !camera) return;

    const heading = tracked.group.rotation.y;
    const pos = tracked.group.position;
    const desired = new Vector3(
      pos.x - Math.sin(heading) * CHASE_BACK,
      CHASE_UP,
      pos.z - Math.cos(heading) * CHASE_BACK,
    );
    const lookAt = new Vector3(pos.x, 2.2, pos.z);

    if (!this._chaseInitialised) {
      this._chasePos.copy(desired);
      this._chaseTarget.copy(lookAt);
      this._chaseInitialised = true;
    } else {
      // Frame-rate independent exponential smoothing.
      const k = 1 - Math.exp(-CHASE_DAMPING * dt);
      this._chasePos.lerp(desired, k);
      this._chaseTarget.lerp(lookAt, k);
    }

    camera.position.copy(this._chasePos);
    viewer.controls.target.copy(this._chaseTarget);
    viewer.controls.update();
  }

  private _teardown(): void {
    const root = this._root;
    if (root) {
      root.parent?.remove(root);
      disposeGroup(root);
    }
    for (const mat of Object.values(this._materials ?? {})) mat.dispose();
    this._root = null;
    this._materials = null;
    this._fleet = null;
    this._tracked.clear();
    this._followId = null;
    this._chaseInitialised = false;
  }

  dispose(): void {
    this._teardown();
    this._viewer = null;
  }
}

function disposeGroup(group: Group): void {
  group.traverse((obj) => {
    const mesh = obj as Mesh;
    mesh.geometry?.dispose();
    // Materials are shared across the fleet and disposed once in _teardown.
  });
}

// ─── UI ─────────────────────────────────────────────────────────────────

type FleetPluginLike = RVViewerPlugin & Pick<EventEmitter, 'on' | 'off'> & {
  vehicles: readonly FleetVehicle[];
  followId: string | null;
  setFollow(id: string | null): void;
};

const STATUS_COLOUR: Record<FleetVehicle['status'], string> = {
  loading: '#8f9eef',
  moving: '#5ac576',
  delayed: '#edb345',
};

const FleetPanel: React.FC<UISlotProps> = ({ viewer }) => {
  const [, force] = useState(0);
  const [open, setOpen] = useState(true);
  const plugin = viewer.getPlugin<FleetPluginLike>('wakefield-fleet');

  useEffect(() => {
    if (!plugin) return;
    const sync = () => force((n) => n + 1);
    plugin.on('fleet-changed', sync as never);
    return () => plugin.off('fleet-changed', sync as never);
  }, [plugin]);

  if (!plugin || !open) return null;

  const vehicles = plugin.vehicles;
  const snapshot = getProductionSnapshot();

  return (
    <Fade in>
      <Paper
        elevation={0}
        sx={{
          position: 'absolute', right: 24, bottom: 24, width: 330, zIndex: 1150,
          p: 2, borderRadius: 3,
          bgcolor: 'rgba(8, 12, 14, 0.94)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.09)',
          boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.10), 0 18px 48px rgba(0,0,0,0.55)',
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
          <Stack direction="row" spacing={0.75} alignItems="center">
            <LocalShipping sx={{ fontSize: 15, color: '#17d0d8' }} />
            <Typography sx={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: '#17d0d8' }}>
              OUTBOUND FLEET
            </Typography>
          </Stack>
          <IconButton size="small" onClick={() => setOpen(false)} aria-label="Close fleet panel">
            <Close sx={{ fontSize: 15 }} />
          </IconButton>
        </Stack>

        {!snapshot.hasSinks && (
          <Typography sx={{ fontSize: 11, color: '#edb345', lineHeight: 1.6, mb: 1.5 }}>
            This model has no sinks, so nothing is being packed and no trailer can load.
          </Typography>
        )}

        <Stack spacing={1.25}>
          {vehicles.map((v) => {
            const following = plugin.followId === v.id;
            const pct = Math.round((v.cases / v.capacity) * 100);
            return (
              <Box key={v.id} sx={{ p: 1.25, borderRadius: 2, border: '1px solid rgba(255,255,255,0.07)' }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#eff2f4' }}>{v.name}</Typography>
                  <Chip
                    label={v.status.toUpperCase()}
                    size="small"
                    sx={{
                      height: 17, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.06em',
                      color: STATUS_COLOUR[v.status],
                      bgcolor: `${STATUS_COLOUR[v.status]}1a`,
                      border: `1px solid ${STATUS_COLOUR[v.status]}40`,
                    }}
                  />
                </Stack>

                {v.status === 'loading' ? (
                  <>
                    <LinearProgress
                      variant="determinate"
                      value={pct}
                      sx={{ height: 4, borderRadius: 2, mb: 0.5, bgcolor: 'rgba(255,255,255,0.07)' }}
                    />
                    <Typography sx={{ fontSize: 10, color: '#7b8186', fontVariantNumeric: 'tabular-nums' }}>
                      {v.cases} / {TRAILER_CAPACITY} cases loaded — from the line
                    </Typography>
                  </>
                ) : (
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography sx={{ fontSize: 10, color: '#7b8186', fontVariantNumeric: 'tabular-nums' }}>
                      {v.cases} cases · clears site in {formatMinutes(v.etaMinutes)}
                    </Typography>
                    <Button
                      size="small"
                      onClick={() => plugin.setFollow(following ? null : v.id)}
                      startIcon={following
                        ? <VideocamOff sx={{ fontSize: 13 }} />
                        : <Videocam sx={{ fontSize: 13 }} />}
                      sx={{ fontSize: 10, fontWeight: 700, textTransform: 'none', minWidth: 0, px: 1 }}
                    >
                      {following ? 'Release' : 'Follow'}
                    </Button>
                  </Stack>
                )}
              </Box>
            );
          })}
        </Stack>
      </Paper>
    </Fade>
  );
};

function formatMinutes(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 1) return `${Math.round(minutes * 60)}s`;
  return `${minutes.toFixed(1)} min`;
}
