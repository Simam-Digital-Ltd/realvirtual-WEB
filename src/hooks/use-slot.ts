/**
 * React hook for getting UI slot entries.
 *
 * Usage:
 *   const kpiEntries = useSlot('kpi-bar');
 *   kpiEntries.map(e => <e.component key={...} viewer={viewer} />);
 */

import { useMemo } from 'react';
import { useViewer } from './use-viewer';
import type { UISlot, UISlotEntry } from '../core/rv-ui-plugin';

/** Returns all UI slot entries for the given slot name. */
export function useSlot(slot: UISlot): UISlotEntry[] {
  const viewer = useViewer();
  return useMemo(
    () => viewer.uiRegistry.getSlotComponents(slot),
    [viewer, slot],
  );
}
