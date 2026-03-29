/**
 * React hook for the groups overlay open/close state.
 */

import { useViewer } from './use-viewer';
import { useViewerEvent } from './use-viewer-event';

/** Returns whether the groups overlay is open. */
export function useGroupsOverlayOpen(): boolean {
  const viewer = useViewer();
  return useViewerEvent('groups-overlay-toggle', viewer.groupsOverlayOpen, d => d.open);
}
