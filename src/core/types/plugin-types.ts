// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * plugin-types.ts — Shared type definitions for the contract between core HMI
 * panels and their companion plugins.
 *
 * The actual plugin implementations live in src/plugins/ (public) or in the
 * private repo. Core HMI code imports ONLY from this file, never from plugins
 * directly. This inverts the dependency correctly:
 *   plugins depend on core types, core depends on core types.
 */

// ─── Machine Control Types ──────────────────────────────────────────────

export type MachineState = 'STOPPED' | 'IDLE' | 'RUNNING' | 'HELD' | 'ERROR';
export type MachineMode = 'AUTO' | 'MANUAL' | 'MAINTENANCE';

export type ComponentType = 'drive' | 'sensor';
export type ComponentStatus = 'running' | 'stopped' | 'active' | 'inactive' | 'error';

export interface MachineComponent {
  name: string;
  path: string;
  type: ComponentType;
  status: ComponentStatus;
}

export interface MachineControlState {
  state: MachineState;
  mode: MachineMode;
  components: MachineComponent[];
  /** Index into components[] of the component in error state (E-Stop demo). -1 = none. */
  errorComponentIdx: number;
}

/**
 * Public API surface of MachineControlPlugin consumed by core HMI panels.
 * The actual class implements RVViewerPlugin + this interface.
 */
export interface MachineControlPluginAPI {
  readonly id: string;
  readonly machineState: MachineState;
  readonly machineMode: MachineMode;
  readonly components: MachineComponent[];
  readonly errorComponentIdx: number;
  getState(): MachineControlState;
  start(): void;
  stop(): void;
  hold(): void;
  resume(): void;
  reset(): void;
  emergencyStop(): void;
  clearError(): void;
  setMode(mode: MachineMode): void;
  hoverComponent(path: string): void;
  clickComponent(path: string): void;
  leaveComponent(): void;
}

// ─── Maintenance Types ──────────────────────────────────────────────────

import type { MaintenanceProcedure, MaintenanceStep } from '../maintenance-parser';
export type { MaintenanceProcedure, MaintenanceStep };

export type MaintenanceMode = 'idle' | 'dialog' | 'flythrough' | 'stepbystep' | 'completed';
export type StepResult = 'pass' | 'fail' | 'skipped' | null;

export interface MaintenanceState {
  mode: MaintenanceMode;
  procedure: MaintenanceProcedure | null;
  currentStep: number;
  stepResults: StepResult[];
  /** Whether a camera animation is currently in progress. */
  isCameraAnimating: boolean;
}

/**
 * Public API surface of MaintenancePlugin consumed by core HMI panels.
 * The actual class implements RVViewerPlugin + this interface.
 */
export interface MaintenancePluginAPI {
  readonly id: string;
  getState(): MaintenanceState;
  getProcedures(): MaintenanceProcedure[];
  enterMaintenance(): void;
  exitMaintenance(): void;
  startScenario(procedure: MaintenanceProcedure | null, mode: 'flythrough' | 'stepbystep'): void;
  goToStep(stepIndex: number): void;
  nextStep(): void;
  prevStep(): void;
  completeStep(stepIndex: number, result?: 'pass' | 'fail'): void;
  restoreProgress(stepResults: StepResult[]): void;
}

// ─── WebXR Types ────────────────────────────────────────────────────────

/**
 * Public API surface of WebXRPlugin consumed by core HMI panels.
 */
export interface WebXRPluginAPI {
  readonly id: string;
  /** True when AR sessions are supported by the browser. */
  arSupported: boolean;
  /** True when VR sessions are supported by the browser. */
  vrSupported: boolean;
  /** Start an AR session. */
  startAR(): Promise<void>;
}

// ─── FPV Types ──────────────────────────────────────────────────────────

/**
 * Public API surface of FpvPlugin consumed by core HMI panels.
 */
export interface FpvPluginAPI {
  readonly id: string;
  toggle(): void;
}

// ─── MCP Bridge Types ───────────────────────────────────────────────────

/**
 * Public API surface of McpBridgePlugin consumed by core HMI panels.
 */
export interface McpBridgePluginAPI {
  readonly id: string;
  reconnect(port?: string): void;
  setEnabled(enabled: boolean): void;
}

// ─── Multiuser Types ────────────────────────────────────────────────────

/**
 * Public API surface of MultiuserPlugin consumed by core HMI panels.
 */
export interface MultiuserPluginAPI {
  readonly id: string;
  /** Current server URL (set via joinSession or URL params). */
  readonly serverUrl: string;
  /** Current local display name. */
  readonly localName: string;
  /** Current join code (empty string if none). */
  readonly joinCode: string;
  /** Current local role ('observer' | 'operator'). */
  readonly localRole: string;
  joinSession(serverUrl: string, name: string, color?: string, role?: string, joinCode?: string): void;
  leaveSession(): void;
}
