/**
 * InterfaceManager — Coordinates industrial interface plugins.
 *
 * Enforces the mutex constraint: only one interface may be active at a time.
 * Provides a registry of available interface implementations and handles
 * activation/deactivation with proper state transitions.
 *
 * Usage:
 *   const manager = new InterfaceManager();
 *   manager.register(new WebSocketRealtimeInterface());
 *   manager.register(new MQTTInterface());
 *   viewer.use(manager);
 *   await manager.activate('websocket-realtime', settings);
 */

import type { RVViewerPlugin } from '../core/rv-plugin';
import type { RVViewer } from '../core/rv-viewer';
import type { LoadResult } from '../core/engine/rv-scene-loader';
import type { BaseIndustrialInterface } from './base-industrial-interface';
import type { InterfaceSettings, InterfaceType } from './interface-settings-store';
import { loadInterfaceSettings } from './interface-settings-store';

export class InterfaceManager implements RVViewerPlugin {
  readonly id = 'interface-manager';
  readonly order = 5; // Run before interface plugins

  private viewer: RVViewer | null = null;
  private registry = new Map<string, BaseIndustrialInterface>();
  private _activeId: string | null = null;

  /** Register an interface implementation. Does NOT activate it. */
  register(iface: BaseIndustrialInterface): this {
    this.registry.set(iface.id, iface);
    return this;
  }

  /** Get all registered interface implementations. */
  getRegistered(): ReadonlyMap<string, BaseIndustrialInterface> {
    return this.registry;
  }

  /** Get the currently active interface (or null). */
  getActive(): BaseIndustrialInterface | null {
    return this._activeId ? (this.registry.get(this._activeId) ?? null) : null;
  }

  /** Get the active interface ID. */
  get activeId(): string | null {
    return this._activeId;
  }

  /**
   * Activate an interface by its ID.
   * Disconnects any previously active interface first (mutex).
   */
  async activate(interfaceId: string, settings: InterfaceSettings): Promise<void> {
    // Deactivate current if different
    if (this._activeId && this._activeId !== interfaceId) {
      this.deactivate();
    }

    const iface = this.registry.get(interfaceId);
    if (!iface) {
      throw new Error(`Interface '${interfaceId}' not registered`);
    }

    this._activeId = interfaceId;

    // Pass viewer reference and connect
    if (this.viewer) {
      iface.onModelLoaded?.(
        { drives: [], sensors: [], sources: [], extras: {} } as unknown as LoadResult,
        this.viewer,
      );
    }

    await iface.connect(settings);
  }

  /** Deactivate the current interface (disconnect + cleanup). */
  deactivate(): void {
    if (!this._activeId) return;

    const iface = this.registry.get(this._activeId);
    if (iface) {
      iface.disconnect();
    }

    this._activeId = null;
  }

  // ── RVViewerPlugin Lifecycle ──

  onModelLoaded(result: LoadResult, viewer: RVViewer): void {
    this.viewer = viewer;

    // Forward to active interface
    const active = this.getActive();
    if (active) {
      active.onModelLoaded?.(result, viewer);
    } else {
      // Check settings for auto-connect
      const settings = loadInterfaceSettings();
      if (settings.activeType !== 'none' && settings.autoConnect) {
        const iface = this.registry.get(settings.activeType);
        if (iface) {
          this._activeId = settings.activeType;
          iface.onModelLoaded?.(result, viewer);
        }
      }
    }
  }

  onModelCleared(): void {
    // Interface connections are independent of model — don't disconnect
  }

  onConnectionStateChanged(state: 'Connected' | 'Disconnected', viewer: RVViewer): void {
    const active = this.getActive();
    if (active && 'onConnectionStateChanged' in active) {
      (active as RVViewerPlugin).onConnectionStateChanged?.(state, viewer);
    }
  }

  onFixedUpdatePre(dt: number): void {
    const active = this.getActive();
    active?.onFixedUpdatePre?.(dt);
  }

  onFixedUpdatePost(dt: number): void {
    const active = this.getActive();
    active?.onFixedUpdatePost?.(dt);
  }

  dispose(): void {
    this.deactivate();
    this.registry.clear();
    this.viewer = null;
  }
}
