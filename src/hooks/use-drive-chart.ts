/**
 * React hook for the drive chart overlay open/close state.
 */

import { useState, useEffect } from 'react';
import { useViewer } from './use-viewer';

/** Returns whether the drive chart overlay is open. */
export function useDriveChartOpen(): boolean {
  const viewer = useViewer();
  const [open, setOpen] = useState(viewer.driveChartOpen);

  useEffect(() => {
    const off = viewer.on('drive-chart-toggle', (data: { open: boolean }) => {
      setOpen(data.open);
    });
    return off;
  }, [viewer]);

  return open;
}
