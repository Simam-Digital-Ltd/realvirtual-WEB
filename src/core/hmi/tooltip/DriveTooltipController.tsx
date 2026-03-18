/**
 * DriveTooltipController — Headless bridge between drive hover/focus events
 * and the generic tooltip system.
 *
 * Consumes useHoveredDrive() and useFocusedDrive() (unchanged hooks) and
 * translates drive state into tooltipStore.show()/hide() calls.
 *
 * Renders null — purely a state bridge, no UI.
 */

import { useEffect } from 'react';
import { useHoveredDrive, useFocusedDrive } from '../../../hooks/use-drives';
import { tooltipStore } from './tooltip-store';

export function DriveTooltipController() {
  const hover = useHoveredDrive();
  const focus = useFocusedDrive();

  useEffect(() => {
    if (hover.drive) {
      // Hover takes priority — show cursor-following tooltip
      tooltipStore.show({
        id: 'drive',
        data: {
          type: 'drive',
          driveName: hover.drive.name,
        },
        mode: 'cursor',
        cursorPos: { x: hover.clientX, y: hover.clientY },
        priority: 10,
      });
    } else if (focus.drive && focus.node) {
      // Focus mode — show world-projected tooltip
      tooltipStore.show({
        id: 'drive',
        data: {
          type: 'drive',
          driveName: focus.drive.name,
        },
        mode: 'world',
        worldTarget: focus.node,
        priority: 10,
      });
    } else {
      // Neither hover nor focus — hide
      tooltipStore.hide('drive');
    }
  }, [hover.drive, hover.clientX, hover.clientY, focus.drive, focus.node]);

  return null; // headless — renders nothing
}
