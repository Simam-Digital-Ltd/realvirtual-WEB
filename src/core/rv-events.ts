/**
 * Minimal typed event emitter for the WebViewer core.
 * No external dependencies. Used by RVViewer for 'model-loaded', 'drive-hover', etc.
 *
 * Generic TEvents map enables compile-time type checking for known events.
 * Untyped overloads allow custom plugin events without modifying ViewerEvents.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener = (...args: any[]) => void;

export class EventEmitter<
  TEvents extends { [K in keyof TEvents]: unknown } = Record<string, unknown>,
> {
  private listeners = new Map<string, Set<Listener>>();

  /** Typed subscribe for known events. Returns an unsubscribe function. */
  on<K extends string & keyof TEvents>(
    event: K,
    cb: (data: TEvents[K]) => void,
  ): () => void;
  /** Untyped subscribe for custom/plugin events. Returns an unsubscribe function. */
  on(event: string, cb: Listener): () => void;
  on(event: string, cb: Listener): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(cb);
    return () => this.off(event, cb);
  }

  /** Unsubscribe from an event. */
  off(event: string, cb: Listener): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(cb);
      if (set.size === 0) this.listeners.delete(event);
    }
  }

  /** Typed emit for known events. */
  emit<K extends string & keyof TEvents>(event: K, data: TEvents[K]): void;
  /** Untyped emit for custom/plugin events. */
  emit(event: string, data?: unknown): void;
  emit(event: string, data?: unknown): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const cb of set) cb(data);
    }
  }

  /** Remove all listeners. */
  removeAllListeners(): void {
    this.listeners.clear();
  }
}
