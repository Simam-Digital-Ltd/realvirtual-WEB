/**
 * Shared signal polling hook — consolidates duplicate setInterval(500ms)
 * patterns used by HierarchyBrowser and PropertyInspector for live
 * signal value display in badges and headers.
 *
 * Returns an incrementing tick number that triggers re-renders on the
 * specified interval. Cleans up the interval on unmount.
 *
 * Usage:
 *   const tick = useSignalTick(viewer.signalStore);
 *   // tick increments every 500ms, triggering re-render for live values
 */

import { useState, useEffect } from 'react';
import type { SignalStore } from '../core/engine/rv-signal-store';

/**
 * Poll signal store at a fixed interval to trigger re-renders for
 * live signal value display. Returns an incrementing tick counter.
 *
 * @param store  The signal store to monitor (null = no polling).
 * @param intervalMs  Polling interval in milliseconds (default 500).
 * @returns  Incrementing tick number (for triggering re-renders).
 */
export function useSignalTick(store: SignalStore | null, intervalMs = 500): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!store) return;
    const id = setInterval(() => setTick(t => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [store, intervalMs]);

  return tick;
}
