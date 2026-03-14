import { useMediaQuery } from '@mui/material';

/** Mobile breakpoint (px). Below this, use mobile layout (bottom tab bar, bottom sheets). */
export const MOBILE_BREAKPOINT = 768;

/** Returns true when viewport width is below the mobile breakpoint. */
export function useMobileLayout(): boolean {
  return useMediaQuery(`(max-width:${MOBILE_BREAKPOINT - 1}px)`);
}

/** Returns true when the primary input is touch (coarse pointer, no hover). */
export function useTouchDevice(): boolean {
  return useMediaQuery('(hover: none) and (pointer: coarse)');
}
