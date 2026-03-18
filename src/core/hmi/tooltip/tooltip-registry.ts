/**
 * TooltipContentRegistry — Maps content types to React content provider components.
 *
 * Plugins register their tooltip content providers here. When the TooltipLayer
 * needs to render a tooltip, it looks up the appropriate provider by content type.
 *
 * Follows the same register/lookup pattern as UIPluginRegistry.
 */

import type { ComponentType } from 'react';
import type { RVViewer } from '../../rv-viewer';
import type { TooltipData } from './tooltip-store';

/** Props passed to tooltip content provider components. */
export interface TooltipContentProps<T extends TooltipData = TooltipData> {
  /** The typed data from TooltipEntry.data. */
  data: T;
  /** Viewer instance for accessing scene/drives/events. */
  viewer: RVViewer;
}

/** Registration entry for a tooltip content provider. */
export interface TooltipProviderEntry {
  /** Content type to match (e.g. 'drive', 'sensor', 'mu'). */
  contentType: string;
  /** React component that renders the tooltip content. */
  component: ComponentType<TooltipContentProps>;
  /** Lower number = higher priority when multiple providers for same type. Default: 100. */
  priority?: number;
}

/**
 * TooltipContentRegistry — Singleton registry for tooltip content providers.
 *
 * Content providers self-register at module load time:
 * ```ts
 * tooltipRegistry.register({ contentType: 'drive', component: DriveTooltipContent });
 * ```
 */
export class TooltipContentRegistry {
  private providers = new Map<string, TooltipProviderEntry[]>();

  /** Register a content provider for a content type. */
  register(entry: TooltipProviderEntry): void {
    const existing = this.providers.get(entry.contentType) ?? [];
    existing.push(entry);
    // Sort by priority (lower = higher priority)
    existing.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
    this.providers.set(entry.contentType, existing);
  }

  /** Get the highest-priority content provider for a content type, or null. */
  getProvider(contentType: string): ComponentType<TooltipContentProps> | null {
    const entries = this.providers.get(contentType);
    if (!entries || entries.length === 0) return null;
    return entries[0].component;
  }
}

/** Singleton tooltip content registry instance. */
export const tooltipRegistry = new TooltipContentRegistry();
