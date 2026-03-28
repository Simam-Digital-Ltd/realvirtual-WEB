/**
 * useEditorPlugin — Shared hook for subscribing to rv-extras-editor plugin state.
 *
 * Replaces 4 near-identical useSyncExternalStore boilerplate blocks in:
 * - TopBar.tsx
 * - ButtonPanel.tsx
 * - rv-hierarchy-browser.tsx
 * - rv-property-inspector.tsx
 */

import { useSyncExternalStore } from 'react';
import { useViewer } from './use-viewer';
import type { RvExtrasEditorPlugin } from '../core/hmi/rv-extras-editor';
import { HIERARCHY_DEFAULT_WIDTH } from '../core/hmi/rv-extras-editor';

const NOOP_UNSUB = () => () => {};
const EMPTY_SNAPSHOT = {
  panelOpen: false as boolean,
  panelWidth: HIERARCHY_DEFAULT_WIDTH,
  overlay: null,
  editableNodes: [] as never[],
  selectedNodePath: null as string | null,
  revealPath: null as string | null,
  showInspector: false as boolean,
  settingsOpen: false as boolean,
};

export function useEditorPlugin() {
  const viewer = useViewer();
  const plugin = viewer.getPlugin<RvExtrasEditorPlugin>('rv-extras-editor');
  const state = useSyncExternalStore(
    plugin?.subscribe ?? NOOP_UNSUB,
    plugin?.getSnapshot ?? (() => EMPTY_SNAPSHOT),
  );
  return { plugin, state };
}
