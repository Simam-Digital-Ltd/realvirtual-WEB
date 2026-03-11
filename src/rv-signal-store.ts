/**
 * SignalStore - Central signal store for PLC signal communication.
 *
 * Framework-agnostic pub/sub store for boolean, integer, and float signals.
 * Signals are addressed by hierarchy path (e.g. "DemoCell/Signals/ConveyorStart").
 * Listeners are only notified on actual value changes (equality check).
 *
 * Foundation for future React HMI binding (useSignal hook).
 */
export class SignalStore {
  private values = new Map<string, boolean | number>();
  private listeners = new Map<string, Set<(value: boolean | number) => void>>();

  /** Get raw value (undefined if not registered) */
  get(addr: string): boolean | number | undefined {
    return this.values.get(addr);
  }

  /** Get as boolean (false if not set) */
  getBool(addr: string): boolean {
    const v = this.values.get(addr);
    return typeof v === 'boolean' ? v : false;
  }

  /** Get as float (0 if not set) */
  getFloat(addr: string): number {
    const v = this.values.get(addr);
    return typeof v === 'number' ? v : 0;
  }

  /** Get as int (0 if not set, truncated) */
  getInt(addr: string): number {
    const v = this.values.get(addr);
    return typeof v === 'number' ? Math.trunc(v) : 0;
  }

  /** Set value — only notifies listeners if value actually changes */
  set(addr: string, value: boolean | number): void {
    const old = this.values.get(addr);
    if (old === value) return;
    this.values.set(addr, value);
    const subs = this.listeners.get(addr);
    if (subs) {
      for (const cb of subs) {
        cb(value);
      }
    }
  }

  /** Bulk set — each key notifies independently on change */
  setMany(updates: Record<string, boolean | number>): void {
    for (const addr in updates) {
      this.set(addr, updates[addr]);
    }
  }

  /** Subscribe to value changes. Returns unsubscribe function. */
  subscribe(addr: string, cb: (value: boolean | number) => void): () => void {
    let subs = this.listeners.get(addr);
    if (!subs) {
      subs = new Set();
      this.listeners.set(addr, subs);
    }
    subs.add(cb);
    return () => {
      subs!.delete(cb);
      if (subs!.size === 0) {
        this.listeners.delete(addr);
      }
    };
  }

  /** Register a signal with initial value (does not trigger listeners) */
  register(addr: string, initialValue: boolean | number): void {
    if (!this.values.has(addr)) {
      this.values.set(addr, initialValue);
    }
  }

  /** Get all values (for debugging/sync) */
  getAll(): Map<string, boolean | number> {
    return new Map(this.values);
  }

  /** Get number of registered signals */
  get size(): number {
    return this.values.size;
  }

  /** Clear all signals and listeners */
  clear(): void {
    this.values.clear();
    this.listeners.clear();
  }
}
