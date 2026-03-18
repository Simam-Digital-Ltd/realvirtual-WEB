/**
 * RaycastLayers — Three.js layer constants for selective raycasting.
 *
 * Each object type gets its own layer bit so the Raycaster can filter
 * by bit-mask (zero-cost, no array iteration). Layer 0 is the Three.js
 * default rendering layer and remains untouched.
 *
 * Usage:
 *   mesh.layers.enable(RaycastLayers.DRIVE);       // mark mesh as drive target
 *   raycaster.layers.enable(RaycastLayers.DRIVE);   // let raycaster hit drives
 */

export const RaycastLayers = {
  DEFAULT: 0,
  DRIVE: 1,
  SENSOR: 2,
  MU: 3,
  METADATA: 4,
  SCENE_CLICK: 5,
} as const;

export type RaycastLayerName = keyof typeof RaycastLayers;
