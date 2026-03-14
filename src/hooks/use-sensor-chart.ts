/**
 * React hook for the sensor chart overlay open/close state.
 */

import { useState, useEffect } from 'react';
import { useViewer } from './use-viewer';

/** Returns whether the sensor chart overlay is open. */
export function useSensorChartOpen(): boolean {
  const viewer = useViewer();
  const [open, setOpen] = useState(viewer.sensorChartOpen);

  useEffect(() => {
    const off = viewer.on('sensor-chart-toggle', (data: { open: boolean }) => {
      setOpen(data.open);
    });
    return off;
  }, [viewer]);

  return open;
}
