/**
 * LeftPanelManager — Centralized coordination for left-side panels.
 *
 * Manages mutual exclusion: only one left panel can be open at a time.
 * When a new panel opens, the previously open panel closes automatically
 * ("last one wins"). Provides useSyncExternalStore-compatible subscription
 * so React components can reactively read the active panel and its width.
 *
 * Lives on `viewer.leftPanelManager` — created in RVViewer constructor,
 * available to all plugins and components.
 */

// ─── Types ──────────────────────────────────────────────────────────────

export type PanelId = string; // 'hierarchy' | 'settings' | 'machine-control' | ...

export interface LeftPanelSnapshot {
  /** Currently open panel id, or null if no panel is open. */
  activePanel: PanelId | null;
  /** Width in pixels of the currently open panel (0 when closed). */
  activePanelWidth: number;
}

// ─── Manager ────────────────────────────────────────────────────────────

export class LeftPanelManager {
  private _activePanel: PanelId | null = null;
  private _activePanelWidth = 0;
  private _listeners = new Set<() => void>();
  private _snapshot: LeftPanelSnapshot = { activePanel: null, activePanelWidth: 0 };

  /** Currently open panel id, or null. */
  get activePanel(): PanelId | null { return this._activePanel; }

  /** Width of the currently open panel (for ButtonPanel offset). */
  get activePanelWidth(): number { return this._activePanelWidth; }

  /**
   * Open a panel — automatically closes any other open panel ("last one wins").
   * @param id    Panel identifier (e.g. 'hierarchy', 'settings', 'machine-control')
   * @param width Width in pixels for the panel
   */
  open(id: PanelId, width: number): void {
    if (this._activePanel === id && this._activePanelWidth === width) return;
    this._activePanel = id;
    this._activePanelWidth = width;
    this._notify();
  }

  /** Close a specific panel (no-op if not the active one). */
  close(id: PanelId): void {
    if (this._activePanel !== id) return;
    this._activePanel = null;
    this._activePanelWidth = 0;
    this._notify();
  }

  /** Toggle a panel open/closed. */
  toggle(id: PanelId, width: number): void {
    if (this._activePanel === id) {
      this.close(id);
    } else {
      this.open(id, width);
    }
  }

  /** Check if a specific panel is open. */
  isOpen(id: PanelId): boolean {
    return this._activePanel === id;
  }

  /** Subscribe for React (useSyncExternalStore compatible). Returns unsubscribe. */
  subscribe = (listener: () => void): (() => void) => {
    this._listeners.add(listener);
    return () => { this._listeners.delete(listener); };
  };

  /** Get snapshot for React (useSyncExternalStore compatible). */
  getSnapshot = (): LeftPanelSnapshot => {
    return this._snapshot;
  };

  // ─── Internal ─────────────────────────────────────────────────────

  private _notify(): void {
    // Create new snapshot object so React detects the change
    this._snapshot = {
      activePanel: this._activePanel,
      activePanelWidth: this._activePanelWidth,
    };
    for (const listener of this._listeners) {
      listener();
    }
  }
}
