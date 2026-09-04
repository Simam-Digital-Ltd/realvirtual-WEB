// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Wakefield entry hotspots — the way in.
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * The zoom LOD in `wakefield-lod.ts` opens the building when the camera gets
 * within 28 m of the site centre. That works beautifully once you know it
 * exists, and is invisible if you don't: a first-time viewer sees an aerial
 * of an industrial estate, has no reason to believe the shed opens, and
 * scroll-wheeling at a 3D scene until something happens is not a discovery
 * mechanism. The most interesting thing in the product was gated behind a
 * gesture nobody was told about.
 *
 * So the affordance is made physical: labelled markers standing on the site
 * at the places you would actually walk in, which fly you there when clicked.
 * Distance-driven LOD still works exactly as before for anyone who prefers to
 * scroll — this adds a door, it does not replace the ramp.
 *
 * DESIGN NOTES
 *   - Markers are world-space, not screen-space overlays. A DOM pin floating
 *     over a 3D scene reads as chrome; a post standing on the apron reads as
 *     part of the site and keeps its parallax when the camera orbits.
 *   - They are only shown from outside. Once the camera is close enough that
 *     the building has opened, they are noise, and worse, they occlude the
 *     line they were pointing at.
 *   - Sprites are scaled by distance so the label stays legible at 200 m
 *     without becoming a billboard at 40 m.
 *   - Every mesh is named, so the assembly stays inspectable in the
 *     hierarchy browser like the rest of the dressing.
 */

import {
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Camera,
} from 'three';

/** One place a viewer can enter the site from. */
export interface EntryHotspot {
  id: string;
  /** Short label on the marker. */
  label: string;
  /** One line of context under it. */
  sublabel: string;
  /** Where the marker stands. */
  anchor: Vector3;
  /** Where the camera ends up. */
  cameraPos: Vector3;
  /** What it looks at. */
  cameraTarget: Vector3;
  /** Accent colour for the ring and rule. */
  colour: number;
}

/** Site centre, matching HALL / SITE_Z in the interior and exterior layers. */
const SITE_Z = -1.15;

/**
 * The destinations.
 *
 * Camera positions are inside the `process` LOD band (< 24 m from centre) so
 * arriving has already opened the shell — landing outside the band would drop
 * the viewer at a closed box and read as a broken link.
 */
export const ENTRY_HOTSPOTS: readonly EntryHotspot[] = [
  {
    id: 'entry-production',
    label: 'ENTER PRODUCTION HALL',
    sublabel: 'Robot cell, packing line, palletiser',
    anchor: new Vector3(0, 0, SITE_Z + 12.5),
    cameraPos: new Vector3(2.5, 6.5, SITE_Z + 15),
    cameraTarget: new Vector3(0, 1.4, SITE_Z),
    colour: 0x2ed7c0,
  },
  {
    id: 'entry-dock',
    label: 'OUTBOUND DOCK 4',
    sublabel: 'Dispatch marshalling, trailer bays',
    anchor: new Vector3(9.5, 0, SITE_Z - 8.5),
    cameraPos: new Vector3(13, 5.5, SITE_Z - 12),
    cameraTarget: new Vector3(6.5, 1.2, SITE_Z - 3.5),
    colour: 0xffc107,
  },
  {
    id: 'entry-office',
    label: 'RECEPTION',
    sublabel: 'Site office and QA lab',
    anchor: new Vector3(-13.5, 0, SITE_Z + 6),
    cameraPos: new Vector3(-16, 4.5, SITE_Z + 10),
    cameraTarget: new Vector3(-10.2, 1.2, SITE_Z + 2.75),
    colour: 0x8f9eef,
  },
] as const;

/** Marker post height in metres. */
const POST_HEIGHT = 3.2;
/** Beyond this the label would be unreadable anyway; fade the group out. */
const MAX_VISIBLE_DISTANCE = 320;

/**
 * Draw the label to a canvas.
 *
 * Text as a texture rather than a TextGeometry: this is UI, it must stay
 * legible head-on at any distance, and an extruded 3D word would read as
 * signage inside the fiction rather than as a control.
 */
function labelTexture(hotspot: EntryHotspot): { texture: CanvasTexture; aspect: number } {
  const scale = 2; // device-independent supersample, keeps edges crisp
  const w = 512 * scale;
  const h = 148 * scale;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable for hotspot label');

  const accent = `#${new Color(hotspot.colour).getHexString()}`;
  const r = 18 * scale;

  // Plate.
  ctx.fillStyle = 'rgba(8, 12, 14, 0.92)';
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, r);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 2 * scale;
  ctx.stroke();

  // Accent rule down the left edge — same language as the HMI panels.
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.roundRect(0, 0, 6 * scale, h, [r, 0, 0, r]);
  ctx.fill();

  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#eff2f4';
  ctx.font = `800 ${30 * scale}px Inter, system-ui, sans-serif`;
  ctx.fillText(hotspot.label, 28 * scale, 52 * scale);

  ctx.fillStyle = '#adb2b6';
  ctx.font = `500 ${22 * scale}px Inter, system-ui, sans-serif`;
  ctx.fillText(hotspot.sublabel, 28 * scale, 96 * scale);

  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return { texture, aspect: w / h };
}

/** One marker: ground ring, post, and floating label. */
function buildMarker(hotspot: EntryHotspot): Group {
  const group = new Group();
  group.name = `wpf-hotspot-${hotspot.id}`;
  group.position.copy(hotspot.anchor);
  // The whole marker is the click target; the raycast hits any child.
  group.userData.wpfHotspotId = hotspot.id;

  const accent = new MeshBasicMaterial({
    color: hotspot.colour,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });

  // Ground ring. Sits just above the apron and does NOT write depth, so it
  // cannot join the coplanar fight the ground stack already has to manage.
  const ring = new Mesh(new RingGeometry(1.15, 1.55, 40), accent);
  ring.name = `wpf-hotspot-${hotspot.id}-ring`;
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.renderOrder = 12;
  group.add(ring);

  const post = new Mesh(
    new CylinderGeometry(0.055, 0.055, POST_HEIGHT, 8),
    new MeshBasicMaterial({ color: hotspot.colour, transparent: true, opacity: 0.55 }),
  );
  post.name = `wpf-hotspot-${hotspot.id}-post`;
  post.position.y = POST_HEIGHT / 2;
  group.add(post);

  const { texture, aspect } = labelTexture(hotspot);
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.name = `wpf-hotspot-${hotspot.id}-label`;
  sprite.position.y = POST_HEIGHT + 0.75;
  sprite.scale.set(4.4, 4.4 / aspect, 1);
  // Drawn last so the label is never buried in the shed behind it.
  sprite.renderOrder = 13;
  group.add(sprite);

  return group;
}

/** Build all markers under one group. */
export function createEntryHotspots(): Group {
  const group = new Group();
  group.name = 'wpf-entry-hotspots';
  for (const hotspot of ENTRY_HOTSPOTS) group.add(buildMarker(hotspot));
  return group;
}

/**
 * Resolve a raycast hit to the hotspot it belongs to, by walking up to the
 * marker group. The hit is usually a child mesh, never the group itself.
 */
export function hotspotIdFor(object: Object3D | null | undefined): string | null {
  let node: Object3D | null = object ?? null;
  while (node) {
    const id = node.userData?.wpfHotspotId;
    if (typeof id === 'string') return id;
    node = node.parent;
  }
  return null;
}

/**
 * Per-frame visibility and scale.
 *
 * `insideBuilding` comes from the LOD band: once the shell has opened, the
 * markers have done their job and would otherwise float through the roof and
 * over the machines they were advertising.
 */
export function updateEntryHotspots(group: Group, camera: Camera, insideBuilding: boolean): void {
  const camPos = new Vector3().setFromMatrixPosition(camera.matrixWorld);

  for (const marker of group.children) {
    const distance = camPos.distanceTo(marker.position);
    const visible = !insideBuilding && distance < MAX_VISIBLE_DISTANCE;
    marker.visible = visible;
    if (!visible) continue;

    // Keep the marker a roughly constant size on screen. Without this the
    // label is a speck from the estate view and a wall from the apron.
    const scale = Math.max(1, Math.min(6, distance / 45));
    marker.scale.setScalar(scale);
  }
}
