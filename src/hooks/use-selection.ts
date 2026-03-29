/**
 * useSelection — React hook for subscribing to SelectionManager state.
 *
 * Returns the current SelectionSnapshot (selectedPaths, primaryPath).
 * Re-renders only when selection actually changes.
 */

import { useSyncExternalStore } from 'react';
import { useViewer } from './use-viewer';
import type { SelectionSnapshot } from '../core/engine/rv-selection-manager';

const EMPTY: SelectionSnapshot = { selectedPaths: [], primaryPath: null };
const NOOP_UNSUB = () => () => {};

export function useSelection(): SelectionSnapshot {
  const viewer = useViewer();
  return useSyncExternalStore(
    viewer.selectionManager.subscribe,
    viewer.selectionManager.getSnapshot ?? (() => EMPTY),
  );
}
