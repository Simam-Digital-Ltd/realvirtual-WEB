// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * rv-logic-step-colors.ts — Shared color and label constants for LogicStep
 * status display in hierarchy browser and property inspector.
 *
 * Colors follow ISA-101 HMI standards:
 * - Green = Active/Running
 * - Amber = Waiting/Transition
 * - Gray  = Idle/Stopped
 * - Teal  = Finished/Complete
 */

import { StepState } from '../engine/rv-logic-step';

/** ISA-101 compliant state colors for LogicStep status dots and badges. */
export const STEP_STATE_COLORS: Record<StepState, string> = {
  [StepState.Active]:   '#5FB37A',  // ISA-101 running green
  [StepState.Waiting]:  '#D9A441',  // ISA-101 transition amber
  [StepState.Idle]:     '#8A97A8',  // ISA-101 stopped gray
  [StepState.Finished]: '#3FB8C4',  // completion teal
};

/** Short labels for LogicStep states (max 4 chars). */
export const STEP_STATE_LABELS: Record<StepState, string> = {
  [StepState.Active]:   'RUN',
  [StepState.Waiting]:  'WAIT',
  [StepState.Idle]:     'IDLE',
  [StepState.Finished]: 'DONE',
};
