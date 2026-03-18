import { useMediaQuery } from '@mui/material';

/** Mobile breakpoint (px). Below this, use mobile layout (bottom tab bar, bottom sheets). */
export const MOBILE_BREAKPOINT = 768;

/**
 * Returns true when the device should use mobile layout.
 * Triggers on narrow viewports OR touch-only devices (phones in landscape,
 * high-res phones, "Request Desktop Site" etc.).
 */
export function useMobileLayout(): boolean {
  const narrow = useMediaQuery(`(max-width:${MOBILE_BREAKPOINT - 1}px)`);
  const touch = useMediaQuery('(hover: none) and (pointer: coarse)');
  return narrow || touch;
}

/** Returns true when the primary input is touch (coarse pointer, no hover). */
export function useTouchDevice(): boolean {
  return useMediaQuery('(hover: none) and (pointer: coarse)');
}
