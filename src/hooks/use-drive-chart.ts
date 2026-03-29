/**
 * React hook for the drive chart overlay open/close state.
 */

import { useViewer } from './use-viewer';
import { useViewerEvent } from './use-viewer-event';

/** Returns whether the drive chart overlay is open. */
export function useDriveChartOpen(): boolean {
  const viewer = useViewer();
  return useViewerEvent('drive-chart-toggle', viewer.driveChartOpen, d => d.open);
}
