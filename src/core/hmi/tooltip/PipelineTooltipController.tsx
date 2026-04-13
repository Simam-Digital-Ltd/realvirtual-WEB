// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * PipelineTooltipController — Headless bridge between pipeline hover/selection
 * events and the generic tooltip system.
 *
 * Both hover and selection walk up the hierarchy to find the nearest pipeline
 * ancestor (Pipe/Tank/Pump/ProcessingUnit) — so hovering a child mesh of a
 * pipeline node correctly shows its tooltip, just like clicking does.
 *
 * Hover: cursor-following tooltip for pipeline nodes.
 * Selection: world-projected pinned tooltip per selected pipeline node.
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

/** Map _rvType to tooltip content type. */
const TYPE_MAP: Record<string, string> = {
  Pipe: 'pipe',
  Tank: 'tank',
  Pump: 'pump',
  ProcessingUnit: 'processing-unit',
};

const PIPELINE_TYPES = new Set(['Pipe', 'Tank', 'Pump', 'ProcessingUnit']);

const HOVER_ID = 'pipeline-hover';
const PIN_PREFIX = 'pipeline-pin:';

/** Walk up from node to find the nearest ancestor with a pipeline _rvType. */
function findPipelineAncestor(node: Object3D): { node: Object3D; rvType: string } | null {
  let current: Object3D | null = node;
  while (current) {
    const rvType = current.userData?._rvType as string | undefined;
    if (rvType && PIPELINE_TYPES.has(rvType)) {
      return { node: current, rvType };
    }
    current = current.parent;
  }
  return null;
}

export function PipelineTooltipController() {
  const viewer = useViewer();
  const hover = useHoveredObject();
  const selection = useSelection();
  const prevPinnedIds = useRef<Set<string>>(new Set());

  // ── Hover tooltip — walk up from hovered node to find pipeline ancestor ──
  useEffect(() => {
    if (hover) {
      const pipeline = findPipelineAncestor(hover.node);
      if (pipeline) {
        const contentType = TYPE_MAP[pipeline.rvType];
        const path = viewer.registry?.getPathForNode(pipeline.node) ?? hover.nodePath;
        if (contentType) {
          tooltipStore.show({
            id: HOVER_ID,
            lifecycle: 'hover',
            targetPath: path,
            data: {
              type: contentType,
              nodePath: path,
            },
            mode: 'cursor',
            cursorPos: { x: hover.pointer.x, y: hover.pointer.y },
            priority: 10,
          });
          return;
        }
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

      const pipeline = findPipelineAncestor(node);
      if (!pipeline) continue;

      const contentType = TYPE_MAP[pipeline.rvType];
      if (!contentType) continue;

      const resolvedPath = viewer.registry?.getPathForNode(pipeline.node) ?? path;
      const pinId = `${PIN_PREFIX}${resolvedPath}`;
      newPinnedIds.add(pinId);

      tooltipStore.show({
        id: pinId,
        lifecycle: 'pinned',
        targetPath: resolvedPath,
        data: {
          type: contentType,
          nodePath: resolvedPath,
        },
        mode: 'world',
        worldTarget: pipeline.node,
        worldAnchor: viewer.selectionManager.lastHitPoint
          ? worldToLocal(viewer.selectionManager.lastHitPoint, pipeline.node)
          : undefined,
        priority: 5,
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

  return null; // headless — renders nothing
}
