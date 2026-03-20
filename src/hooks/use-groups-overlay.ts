/**
 * React hook for the groups overlay open/close state.
 * Follows the same pattern as use-drive-chart.ts.
 */

import { useState, useEffect } from 'react';
import { useViewer } from './use-viewer';

/** Returns whether the groups overlay is open. */
export function useGroupsOverlayOpen(): boolean {
  const viewer = useViewer();
  const [open, setOpen] = useState(viewer.groupsOverlayOpen);

  useEffect(() => {
    const off = viewer.on('groups-overlay-toggle', (data: { open: boolean }) => {
      setOpen(data.open);
    });
    return off;
  }, [viewer]);

  return open;
}
