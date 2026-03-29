/**
 * DriveTooltipController — Headless bridge between drive hover/focus/selection
 * events and the generic tooltip system.
 *
 * Priority order (highest wins):
 *   1. Hover (cursor-following, priority 10)
 *   2. Focus (world-projected, priority 10)
 *   3. Selection (world-projected, priority 5) — stays pinned until deselected
 *
 * Renders null — purely a state bridge, no UI.
 */

import { useEffect } from 'react';
import { useHoveredDrive, useFocusedDrive } from '../../../hooks/use-drives';
import { useSelection } from '../../../hooks/use-selection';
import { useViewer } from '../../../hooks/use-viewer';
import { tooltipStore } from './tooltip-store';
import type { RVDrive } from '../../engine/rv-drive';

export function DriveTooltipController() {
  const viewer = useViewer();
  const hover = useHoveredDrive();
  const focus = useFocusedDrive();
  const selection = useSelection();

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
    } else if (selection.primaryPath) {
      // Check if the selected object is (or is under) a drive — pin tooltip
      const node = viewer.registry?.getNode(selection.primaryPath);
      const drive = node
        ? viewer.registry?.findInParent<RVDrive>(node, 'Drive') ?? null
        : viewer.registry?.getByPath<RVDrive>('Drive', selection.primaryPath) ?? null;

      if (drive) {
        tooltipStore.show({
          id: 'drive',
          data: {
            type: 'drive',
            driveName: drive.name,
          },
          mode: 'world',
          worldTarget: drive.node, // use drive's own node for accurate positioning
          priority: 5, // lower than hover/focus so they can override
        });
      } else {
        tooltipStore.hide('drive');
      }
    } else {
      // Nothing active — hide
      tooltipStore.hide('drive');
    }
  }, [
    hover.drive, hover.clientX, hover.clientY,
    focus.drive, focus.node,
    selection.primaryPath, viewer,
  ]);

  return null; // headless — renders nothing
}
