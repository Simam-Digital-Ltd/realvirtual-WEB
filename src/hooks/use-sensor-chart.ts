/**
 * React hook for the sensor chart overlay open/close state.
 */

import { useViewer } from './use-viewer';
import { useViewerEvent } from './use-viewer-event';

/** Returns whether the sensor chart overlay is open. */
export function useSensorChartOpen(): boolean {
  const viewer = useViewer();
  return useViewerEvent('sensor-chart-toggle', viewer.sensorChartOpen, d => d.open);
}
