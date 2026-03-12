/**
 * UI Slot types for the HMI layout.
 *
 * Plugins register React components into named layout slots
 * (kpi-bar, button-group, search-bar, messages, views, settings-tab)
 * via the `slots` property on RVViewerPlugin.
 *
 * The HMI shell renders all registered components per slot.
 */

import type { ComponentType } from 'react';
import type { RVViewer } from './rv-viewer';

/** Available slots in the HMI layout. */
export type UISlot =
  | 'kpi-bar'        // Top: KPI cards horizontal
  | 'button-group'   // Left: Navigation buttons vertical
  | 'search-bar'     // Bottom center: Search field
  | 'messages'       // Right: Notification/status tiles vertical
  | 'views'          // Bottom right: Expandable panels (charts, tables)
  | 'settings-tab';  // Settings dialog: Tab registration

/** Props passed to every UI slot component. */
export interface UISlotProps {
  viewer: RVViewer;
}

export interface UISlotEntry {
  /** Which slot this component belongs to. */
  slot: UISlot;
  /** React component rendered into the slot. */
  component: ComponentType<UISlotProps>;
  /** Sort order within the slot (lower = further left/top). Default: 100. */
  order?: number;
  /** For settings-tab: tab label text. */
  label?: string;
}
