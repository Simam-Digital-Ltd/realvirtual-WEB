// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * MetadataTooltipController — Headless bridge between RuntimeMetadata content
 * and the generic tooltip system.
 *
 * RuntimeMetadata can coexist with any component type (Drive, Pipe, Tank, etc.).
 * Both hover and selection walk up the hierarchy from the target node to find
 * the nearest ancestor with _rvMetadata — so hovering a child mesh of a node
 * with RuntimeMetadata correctly shows its tooltip, just like clicking does.
 *
 * Hover: cursor-following tooltip for any node that has _rvMetadata.
 * Selection: world-projected pinned tooltip per selected node with _rvMetadata.
 *
 * Renders null — purely a state bridge, no UI.
 */

import { useEffect, useRef } from 'react';
import type { Object3D } from 'three';
import { useHoveredObject } from '../../../hooks/use-hover';
import { useSelection } from '../../../hooks/use-selection';
import { useViewer } from '../../../hooks/use-viewer';
import { tooltipStore } from './tooltip-store';
import { worldToLocal } from './tooltip-utils';

const HOVER_ID = 'metadata-hover';
const PIN_PREFIX = 'metadata-pin:';

/** Walk up from node to find the nearest ancestor with _rvMetadata content. */
function findMetadataAncestor(node: Object3D): { node: Object3D; content: string } | null {
  let current: Object3D | null = node;
  while (current) {
    const content = (current.userData?._rvMetadata?.content as string) ?? '';
    if (content) {
      return { node: current, content };
    }
    current = current.parent;
  }
  return null;
}

export function MetadataTooltipController() {
  const viewer = useViewer();
  const hover = useHoveredObject();
  const selection = useSelection();
  const prevPinnedIds = useRef<Set<string>>(new Set());

  // ── Hover tooltip — walk up from hovered node to find _rvMetadata ──
  useEffect(() => {
    if (hover) {
      const meta = findMetadataAncestor(hover.node);
      if (meta) {
        const path = viewer.registry?.getPathForNode(meta.node) ?? hover.nodePath;
        tooltipStore.show({
          id: HOVER_ID,
          lifecycle: 'hover',
          targetPath: path,
          data: {
            type: 'metadata',
            nodePath: path,
            content: meta.content,
          },
          mode: 'cursor',
          cursorPos: { x: hover.pointer.x, y: hover.pointer.y },
          priority: 8,
        });
        return;
      }
    }
    tooltipStore.hide(HOVER_ID);
  }, [hover?.nodePath, hover?.pointer?.x, hover?.pointer?.y, viewer]);

  // ── Selection (pinned) tooltips — same parent-walking resolution ──
  useEffect(() => {
    const newPinnedIds = new Set<string>();

    for (const path of selection.selectedPaths) {
      const node = viewer.registry?.getNode(path);
      if (!node) continue;

      const meta = findMetadataAncestor(node);
      if (!meta) continue;

      const resolvedPath = viewer.registry?.getPathForNode(meta.node) ?? path;
      const pinId = `${PIN_PREFIX}${resolvedPath}`;
      newPinnedIds.add(pinId);

      tooltipStore.show({
        id: pinId,
        lifecycle: 'pinned',
        targetPath: resolvedPath,
        data: {
          type: 'metadata',
          nodePath: resolvedPath,
          content: meta.content,
        },
        mode: 'world',
        worldTarget: meta.node,
        worldAnchor: viewer.selectionManager.lastHitPoint
          ? worldToLocal(viewer.selectionManager.lastHitPoint, meta.node)
          : undefined,
        priority: 3,
      });
    }

    for (const oldId of prevPinnedIds.current) {
      if (!newPinnedIds.has(oldId)) {
        tooltipStore.hide(oldId);
      }
    }
    prevPinnedIds.current = newPinnedIds;
  }, [selection.selectedPaths, viewer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const id of prevPinnedIds.current) {
        tooltipStore.hide(id);
      }
    };
  }, []);

  return null;
}
