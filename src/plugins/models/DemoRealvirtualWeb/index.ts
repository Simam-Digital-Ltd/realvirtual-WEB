// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Model plugins for the DemoRealvirtualWeb demo scene.
 *
 * Registers all demo-specific HMI plugins (KPIs, messages, controls)
 * and optional feature plugins (WebXR, Multiuser, FPV, Annotations).
 * These are only active when DemoRealvirtualWeb.glb or RealvirtualWebTest.glb is loaded.
 */

import type { RVViewer } from '../../../core/rv-viewer';
import type { ModelPluginModule } from '../../../core/rv-model-plugin-manager';
import { ModelOptionPlugin, remapAasLink } from '../model-option-plugin';
import { OperatorHmiControlsPlugin } from './operator-hmi-controls';
import { RobotFollowPositionPlugin } from './robot-follow-position';
// Per-model override of the instruction-highlight palette (info/maintenance/
// warning/error/success) lives in rv-custom-runtime-instruction:
//   import { setInstructionTypeColors, resetInstructionTypeColors }
//     from '../../../core/engine/rv-custom-runtime-instruction';
// A customer loader can recolor any subset — see the commented example in
// registerModelPlugins / unregisterModelPlugins below.

// Demo HMI plugins
import { KpiDemoPlugin } from '../../demo/kpi-demo-plugin';
import { DemoHMIPlugin } from '../../demo/demo-hmi-plugin';
import { TestAxesPlugin } from '../../demo/test-axes-plugin';
import { MachineControlPlugin } from '../../demo/machine-control-plugin';
import { MaintenancePlugin } from '../../demo/maintenance-plugin';
// Wakefield set dressing — floor, envelope, racks, zones, signage, pallets,
// dock doors, flow arrows, beacons. Lost when the upstream rebase replaced
// this file; without it the scene renders as the stock demo.
import { WakefieldSceneDressingPlugin } from '../../demo/wakefield-scene-dressing-plugin';
// Clickable way in. The zoom LOD already opened the building at < 28 m, but
// only for someone who knew to keep scrolling.
import { WakefieldEntryPlugin } from '../../demo/wakefield-entry-plugin';
// The dock boundary as a mechanism: trailers fill from the line's real case
// count, depart when full, and become fleet movements you can follow.
import { WakefieldFleetPlugin } from '../../demo/wakefield-fleet-plugin';
// The command centre: spatial hotspot callouts over the twin, and the zone
// strip that flies the camera to the exact pose each thumbnail was shot from.
import { WakefieldCommandCenterPlugin } from '../../demo/wakefield-command-center-plugin';
// Shift change: the AM crew arriving, badging in and taking their stations,
// plus the film director for the social clip. After the command centre.
import { WakefieldShiftPlugin } from '../../demo/wakefield-shift-plugin';
import {
  setInstructionTypeColors,
  resetInstructionTypeColors,
} from '../../../core/engine/rv-custom-runtime-instruction';

// Optional feature plugins
import { WebXRPlugin } from '../../webxr-plugin';
import { MultiuserPlugin } from '../../multiuser-plugin';
import { FpvPlugin } from '../../fpv-plugin';
import { AnnotationPlugin } from '../../annotation-plugin';
import { AasLinkPlugin } from '../../aas-link-plugin';
import { OrderManagerPlugin } from '../../order-manager-plugin';

// Kiosk Mode — disabled for now, re-enable when tour content is ready
// import type { KioskPlugin } from '../../kiosk-plugin';
// import { demoKioskTour } from './demo-kiosk-tour';

// Side-effect import: triggers tooltipRegistry self-registration for 'aas' content type
import '../../aas-link-plugin';

// Side-effect import: opt this demo into the live drive HUD tooltip. The
// core HMI no longer side-effect-imports DriveTooltipContent — it's
// optional, per-deployment. Model-plugin packs that want the floating
// "Position / Speed / Target" hover card import it here.
import '../../../core/hmi/tooltip/DriveTooltipContent';

/** The Festo EMME-AS-40 servo motor AAS that ships in the base GLB. */
const FESTO_MOTOR_AAS = 'http://smart.festo.com/aas/99920200617190044000012858';

/** Supplier variants of the servo motor. `aas` is the id; `desc` the AAS panel label. */
const MOTOR_SUPPLIERS: Record<string, { aas: string; desc: string }> = {
  bosch: {
    aas: 'https://aas.boschrexroth.com/ctrlxdrive/R911410072-MS2N-Demo-0001',
    desc: 'Bosch Rexroth ctrlX DRIVE - MS2N Servomotor',
  },
  sew: {
    aas: 'https://demo.realvirtual.io/aas/sew/KA47-DRN90M4-Demo-0001',
    desc: 'SEW KA47-DRN90M4 Gearmotor',
  },
};

/**
 * Every servo-motor supplier AAS an option may need to replace. The Festo motor AAS is
 * the GLB default, but some motor nodes ship hard-wired to a non-default supplier (e.g.
 * SEW) directly in the GLB. Remapping ALL of these makes the swap idempotent and catches
 * those motors too — otherwise selecting Bosch would leave the SEW-wired motors on SEW.
 */
const MOTOR_SUPPLIER_AAS = [
  FESTO_MOTOR_AAS,
  ...Object.values(MOTOR_SUPPLIERS).map((s) => s.aas),
];

/**
 * Apply the active supplier option (`?option=`) by issuing rv_extras commands.
 * Re-points every servo motor's AAS to the chosen supplier — the Festo pneumatic
 * cylinder (a separate AAS) is left untouched. Add more commands per option here
 * (e.g. setComponentField) to manipulate any rv_extras property.
 */
function applyModelOption(viewer: RVViewer, option: string | null): void {
  // No option (or an unknown one) means the FESTO STANDARD: motors hard-wired to
  // another supplier in the exported GLB are normalized back to the Festo motor AAS,
  // so the base demo is single-supplier and SEW/Bosch appear only via `?option=`.
  const target = (option && MOTOR_SUPPLIERS[option])
    || { aas: FESTO_MOTOR_AAS, desc: 'Festo EMME-AS-40 Servo Motor' };
  // Map from any known motor-supplier AAS (Festo default, SEW, Bosch) to the target,
  // so motors hard-wired to another supplier in the GLB are switched over as well.
  for (const from of MOTOR_SUPPLIER_AAS) {
    if (from !== target.aas) remapAasLink(viewer, from, target.aas, target.desc);
  }
}

/** Model filenames (without .glb) that this module handles. */
export const models = ['DemoRealvirtualWeb', 'RealvirtualWebTest'];

/** Track registered plugin IDs for clean unregister. */
const registeredIds: string[] = [];

export function registerModelPlugins(viewer: RVViewer): void {
  // Optional: recolor the 3D instruction highlights for this model. Pass only
  // the types you want to change (0xRRGGBB); the rest keep the product defaults.
  // Must be paired with resetInstructionTypeColors() in unregisterModelPlugins.
  //
  // WHY WE OVERRIDE `warning`: instruction highlights render as a
  // `mesh-glow-hull` — an opaque glowing shell wrapped around the whole
  // component. The product default for `warning` is 0xffb300, a saturated
  // orange-yellow, and on a large light-coloured asset like the FANUC cobot
  // that shell reads as the machine being ON FIRE rather than as an advisory.
  // Every other highlight channel in the app is comparatively cool (hover and
  // selection blue, planner green), so the orange also sat outside the
  // palette. 0xd4a03c is the same amber hue held at lower chroma: still
  // unmistakably "warning", no longer incandescent.
  //
  // Done here, through upstream's own per-model hook, rather than by editing
  // the core palette — the fork keeps ZERO upstream core modifications.
  setInstructionTypeColors({ warning: 0xd4a03c });

  const instances = [
    // Model options (AAS supplier swap) — MUST be first so the remap runs
    // before AasLinkPlugin pre-parses the AASX for the swapped ids.
    new ModelOptionPlugin(applyModelOption),
    // Hide engineering sim controls (Play/Pause/Reset + Realtime/DES) in HMI mode.
    new OperatorHmiControlsPlugin(),
    new RobotFollowPositionPlugin(),
    // Demo HMI
    new KpiDemoPlugin(),
    new DemoHMIPlugin(),
    new TestAxesPlugin(),
    new MachineControlPlugin(),
    new MaintenancePlugin(),
    new WakefieldSceneDressingPlugin(),
    new WakefieldEntryPlugin(),
    new WakefieldFleetPlugin(),
    new WakefieldCommandCenterPlugin(),
    new WakefieldShiftPlugin(),
    // Optional features
    new WebXRPlugin(),
    new MultiuserPlugin(),
    new FpvPlugin(),
    new AnnotationPlugin(),
    new AasLinkPlugin(),
    new OrderManagerPlugin(),
  ];
  for (const p of instances) {
    viewer.use(p);
    registeredIds.push(p.id);
  }

  // Kiosk tours — disabled for now, re-enable when tour content is ready
  // const kiosk = viewer.getPlugin<KioskPlugin>('kiosk');
  // if (kiosk) {
  //   for (const modelName of models) {
  //     kiosk.registerTour(modelName, demoKioskTour);
  //   }
  // }
}

export function unregisterModelPlugins(viewer: RVViewer): void {
  // Restore the default palette so our `warning` override cannot leak into
  // whatever model is loaded next.
  resetInstructionTypeColors();

  for (const id of registeredIds) {
    viewer.removePlugin(id);
  }
  registeredIds.length = 0;

  // const kiosk = viewer.getPlugin<KioskPlugin>('kiosk');
  // if (kiosk) {
  //   for (const modelName of models) {
  //     kiosk.unregisterTour(modelName);
  //   }
  // }
}

export default { models, registerModelPlugins, unregisterModelPlugins } satisfies ModelPluginModule;
