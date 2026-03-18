/**
 * TooltipStore — Central state for the generic tooltip system.
 *
 * Uses the useSyncExternalStore pattern (subscribe/getSnapshot/notify)
 * so React components can subscribe efficiently without cascading re-renders.
 *
 * Key design decisions:
 * - Data-only store: holds typed data objects, not ReactNodes (avoids re-render storm)
 * - Shallow-compare guard: show() only notifies when data fields actually changed
 * - Cursor position updates are ref-based (getCursorPos), not store-based
 * - Priority resolution: highest priority wins when multiple tooltips are active
 *
 * ## How to add a Sensor tooltip
 *
 * ```ts
 * // In your SensorTooltipController component:
 * tooltipStore.show({
 *   id: 'sensor',
 *   data: { type: 'sensor', sensorName: sensor.name, occupied: sensor.occupied },
 *   mode: 'cursor',
 *   cursorPos: { x: clientX, y: clientY },
 *   priority: 10,
 * });
 *
 * // When sensor is no longer hovered:
 * tooltipStore.hide('sensor');
 *
 * // Register a content provider in your SensorTooltipContent.tsx:
 * tooltipRegistry.register({ contentType: 'sensor', component: SensorTooltipContent });
 * ```
 */

import type { Object3D } from 'three';
import type { RVViewer } from '../../rv-viewer';

// ─── Public Types ───────────────────────────────────────────────────────

/** Positioning mode for a tooltip. */
export type TooltipMode = 'cursor' | 'world' | 'fixed';

/** Content type identifier for registry lookup (e.g. 'drive', 'sensor', 'mu'). */
export type TooltipContentType = string;

/** Typed tooltip data — NOT a ReactNode. Content providers receive this as props. */
export interface TooltipData {
  /** Content type for registry lookup (e.g. 'drive', 'sensor'). */
  type: TooltipContentType;
  /** Additional typed fields for the content provider. */
  [key: string]: unknown;
}

/** Configuration for an active tooltip. */
export interface TooltipEntry {
  /** Unique ID (e.g. 'drive', 'sensor', 'custom-xyz'). */
  id: string;
  /** Typed data — avoids re-render storm from ReactNode references. */
  data: TooltipData;
  /** Positioning mode. */
  mode: TooltipMode;
  /** Cursor position for mode='cursor'. Updated via ref, not store. */
  cursorPos?: { x: number; y: number };
  /** 3D object for world-to-screen projection (mode='world'). */
  worldTarget?: Object3D;
  /** Fixed screen position (mode='fixed'). */
  fixedPos?: { x: number; y: number };
  /** Pixel offset from computed position (default: { x: 16, y: -12 }). */
  offset?: { x: number; y: number };
  /** Higher priority wins when multiple tooltips are active (default: 0). */
  priority?: number;
}

/** Snapshot for React consumers via useSyncExternalStore. */
export interface TooltipState {
  /** Currently visible tooltip (highest priority), or null. */
  active: TooltipEntry | null;
}

// ─── Store Implementation ───────────────────────────────────────────────

/**
 * TooltipStore — Singleton store managing tooltip lifecycle.
 *
 * Follows the useSyncExternalStore contract:
 * - subscribe(listener) returns an unsubscribe function
 * - getSnapshot() returns a referentially stable object
 * - notify() creates a new snapshot object and fires listeners
 */
export class TooltipStore {
  /** All registered tooltips, keyed by ID. */
  private entries = new Map<string, TooltipEntry>();

  /** Cursor positions for each tooltip (ref-based, not in snapshot). */
  private cursorPositions = new Map<string, { x: number; y: number }>();

  // ── useSyncExternalStore interface ──

  private _listeners = new Set<() => void>();

  /** Cached snapshot — MUST be a stable reference between notifications. */
  private _snapshot: TooltipState = { active: null };

  /** Subscribe for React useSyncExternalStore. */
  subscribe = (listener: () => void): (() => void) => {
    this._listeners.add(listener);
    return () => { this._listeners.delete(listener); };
  };

  /** Snapshot getter for React useSyncExternalStore. Returns stable reference. */
  getSnapshot = (): TooltipState => this._snapshot;

  private notify(): void {
    this._snapshot = { active: this.resolveActive() };
    for (const listener of this._listeners) listener();
  }

  // ── Public API ──

  /**
   * Show or update a tooltip.
   *
   * If the tooltip with this ID already exists and only cursorPos changed,
   * the position is updated via ref without triggering a React re-render.
   * A re-render is only triggered when data fields actually change.
   */
  show(entry: TooltipEntry): void {
    const existing = this.entries.get(entry.id);

    // Always update cursor position (ref-based, no re-render)
    if (entry.cursorPos) {
      this.cursorPositions.set(entry.id, entry.cursorPos);
    }

    // Shallow-compare guard: skip notify if data hasn't changed
    if (existing && this.shallowEqual(existing, entry)) {
      // Update mutable fields without notification
      existing.worldTarget = entry.worldTarget;
      existing.fixedPos = entry.fixedPos;
      existing.offset = entry.offset;
      return;
    }

    this.entries.set(entry.id, { ...entry });
    this.notify();
  }

  /** Hide (remove) a tooltip by ID. */
  hide(id: string): void {
    if (!this.entries.has(id)) return;
    this.entries.delete(id);
    this.cursorPositions.delete(id);
    this.notify();
  }

  /** Hide all tooltips (used on model-cleared to release stale Object3D refs). */
  hideAll(): void {
    if (this.entries.size === 0) return;
    this.entries.clear();
    this.cursorPositions.clear();
    this.notify();
  }

  /**
   * Register a model-cleared handler on the viewer to auto-clear all tooltips.
   * Prevents stale Object3D references after scene reload.
   */
  connectViewer(viewer: RVViewer): void {
    viewer.on('model-cleared', () => {
      this.hideAll();
    });
  }

  /**
   * Get the current cursor position for a tooltip (ref-based, no re-render).
   * Used by TooltipLayer for smooth cursor-following without React state.
   */
  getCursorPos(id: string): { x: number; y: number } | undefined {
    return this.cursorPositions.get(id);
  }

  // ── Internal ──

  /** Resolve the highest-priority active tooltip. */
  private resolveActive(): TooltipEntry | null {
    if (this.entries.size === 0) return null;
    if (this.entries.size === 1) return this.entries.values().next().value!;

    let best: TooltipEntry | null = null;
    let bestPriority = -Infinity;
    for (const entry of this.entries.values()) {
      const p = entry.priority ?? 0;
      if (p > bestPriority) {
        bestPriority = p;
        best = entry;
      }
    }
    return best;
  }

  /**
   * Shallow-compare two entries, ignoring cursorPos/fixedPos/offset/worldTarget.
   * Only compares data fields and mode to determine if a re-render is needed.
   */
  private shallowEqual(a: TooltipEntry, b: TooltipEntry): boolean {
    if (a.id !== b.id || a.mode !== b.mode) return false;
    if ((a.priority ?? 0) !== (b.priority ?? 0)) return false;

    // Compare data fields
    const aData = a.data;
    const bData = b.data;
    const aKeys = Object.keys(aData);
    const bKeys = Object.keys(bData);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (aData[key] !== bData[key]) return false;
    }
    return true;
  }
}

/** Singleton tooltip store instance. */
export const tooltipStore = new TooltipStore();
