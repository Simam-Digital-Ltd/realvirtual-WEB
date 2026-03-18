/**
 * Generic Tooltip System — Barrel export.
 *
 * Re-exports the complete tooltip public API for convenient imports:
 *
 * ```ts
 * import { tooltipStore, tooltipRegistry, TooltipLayer } from './core/hmi/tooltip';
 * ```
 */

// Store
export {
  TooltipStore,
  tooltipStore,
  type TooltipMode,
  type TooltipContentType,
  type TooltipData,
  type TooltipEntry,
  type TooltipState,
} from './tooltip-store';

// Registry
export {
  TooltipContentRegistry,
  tooltipRegistry,
  type TooltipContentProps,
  type TooltipProviderEntry,
} from './tooltip-registry';

// Utilities
export {
  projectToScreen,
  clampToViewport,
  type ScreenProjection,
} from './tooltip-utils';

// React components
export { TooltipLayer } from './TooltipLayer';
export { DriveTooltipController } from './DriveTooltipController';
export { DriveTooltipContent, type DriveTooltipData } from './DriveTooltipContent';
