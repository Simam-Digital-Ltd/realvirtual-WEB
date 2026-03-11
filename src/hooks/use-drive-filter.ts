/**
 * React hook for drive filtering state.
 * Subscribes to viewer 'drive-filter' events and returns current filter + filtered drives.
 */

import { useState, useEffect, useCallback } from 'react';
import { useViewer } from './use-viewer';
import type { RVDrive } from '../rv-drive';

export interface DriveFilterState {
  filter: string;
  filteredDrives: RVDrive[];
}

/** Returns the current drive filter state and a setter. */
export function useDriveFilter(): DriveFilterState & { setFilter: (term: string) => void } {
  const viewer = useViewer();
  const [state, setState] = useState<DriveFilterState>({
    filter: viewer.driveFilter,
    filteredDrives: viewer.filteredDrives,
  });

  useEffect(() => {
    const off = viewer.on('drive-filter', (data: DriveFilterState) => {
      setState(data);
    });
    return off;
  }, [viewer]);

  const setFilter = useCallback(
    (term: string) => viewer.filterDrives(term),
    [viewer],
  );

  return { ...state, setFilter };
}
