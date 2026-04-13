// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * DriveTooltipController — Headless bridge between drive hover/focus/selection
 * events and the generic tooltip system.
 *
 * Both hover and selection use findInParent to walk up the hierarchy and find
 * the nearest Drive ancestor — so hovering a child mesh of a Drive correctly
 * shows the Drive tooltip, just like clicking does.
 *
 * Hover: cursor-following tooltip (lifecycle 'hover', priority 10).
 * Focus: world-projected tooltip (lifecycle 'hover', priority 10).
 * Selection: world-projected pinned tooltip per selected drive (lifecycle 'pinned',
 *   priority 5). Multiple selected drives produce multiple pinned tooltips.
 *
 * Renders null — purely a state bridge, no UI.
 */

import { useEffect, useRef } from 'react';
import { useHoveredObject } from '../../../hooks/use-hover';
import { useFocusedDrive } from '../../../hooks/use-drives';
import { useSelection } from '../../../hooks/use-selection';
import { useViewer } from '../../../hooks/use-viewer';
import { tooltipStore } from './tooltip-store';
import { worldToLocal } from './tooltip-utils';
import type { RVDrive } from '../../engine/rv-drive';

const HOVER_ID = 'drive-hover';
const FOCUS_ID = 'drive-focus';
const PIN_PREFIX = 'drive-pin:';

export function DriveTooltipController() {
  const viewer = useViewer();
  const hover = useHoveredObject();
  const focus = useFocusedDrive();
  const selection = useSelection();
  const prevPinnedIds = useRef<Set<string>>(new Set());

  // ── Hover tooltip — walk up from hovered node to find Drive ──
  useEffect(() => {
    if (hover) {
      const drive = viewer.registry?.findInParent<RVDrive>(hover.node, 'Drive') ?? null;
      if (drive) {
        const drivePath = viewer.registry?.getPathForNode(drive.node) ?? hover.nodePath;
        tooltipStore.show({
          id: HOVER_ID,
          lifecycle: 'hover',
          targetPath: drivePath,
          data: {
            type: 'drive',
            driveName: drive.name,
          },
          mode: 'cursor',
          cursorPos: { x: hover.pointer.x, y: hover.pointer.y },
          priority: 10,
        });
        return;
      }
    }
    tooltipStore.hide(HOVER_ID);
  }, [hover?.nodePath, hover?.pointer?.x, hover?.pointer?.y, viewer]);

  // ── Focus tooltip ──
  useEffect(() => {
    if (focus.drive && focus.node) {
      const drivePath = viewer.registry?.getPathForNode(focus.node) ?? focus.drive.name;
      tooltipStore.show({
        id: FOCUS_ID,
        lifecycle: 'hover',
        targetPath: drivePath,
        data: {
          type: 'drive',
          driveName: focus.drive.name,
        },
        mode: 'world',
        worldTarget: focus.node,
        priority: 10,
      });
    } else {
      tooltipStore.hide(FOCUS_ID);
    }
  }, [focus.drive, focus.node, viewer]);

  // ── Selection (pinned) tooltips — same findInParent resolution ──
  useEffect(() => {
    const newPinnedIds = new Set<string>();

    for (const path of selection.selectedPaths) {
      const node = viewer.registry?.getNode(path);
      const drive = node
        ? viewer.registry?.findInParent<RVDrive>(node, 'Drive') ?? null
        : viewer.registry?.getByPath<RVDrive>('Drive', path) ?? null;

      if (drive) {
        const drivePath = viewer.registry?.getPathForNode(drive.node) ?? path;
        const pinId = `${PIN_PREFIX}${drivePath}`;
        newPinnedIds.add(pinId);

        tooltipStore.show({
          id: pinId,
          lifecycle: 'pinned',
          targetPath: drivePath,
          data: {
            type: 'drive',
            driveName: drive.name,
          },
          mode: 'world',
          worldTarget: drive.node,
          worldAnchor: viewer.selectionManager.lastHitPoint
            ? worldToLocal(viewer.selectionManager.lastHitPoint, drive.node)
            : undefined,
          priority: 5,
        });
      }
    }

    for (const oldId of prevPinnedIds.current) {
      if (!newPinnedIds.has(oldId)) {
        tooltipStore.hide(oldId);
      }
    }
    prevPinnedIds.current = newPinnedIds;
  }, [selection.selectedPaths, viewer]);

  // Cleanup all pinned on unmount
  useEffect(() => {
    return () => {
      for (const id of prevPinnedIds.current) {
        tooltipStore.hide(id);
      }
    };
  }, []);

  return null; // headless — renders nothing
}
