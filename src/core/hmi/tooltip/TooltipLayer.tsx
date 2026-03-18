/**
 * TooltipLayer — Renders the active tooltip with positioning, clamping, and styling.
 *
 * Consumes the TooltipStore via useTooltipState() and renders the appropriate
 * content provider from the TooltipContentRegistry.
 *
 * Positioning modes:
 * - cursor: follows mouse pointer (ref-based updates via getCursorPos, polled at 100ms)
 * - world: projects a 3D Object3D to screen coordinates (polled at 100ms)
 * - fixed: uses a fixed screen position directly
 *
 * Renders with glassmorphism styling, pointerEvents: 'none', zIndex: 1100.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Box } from '@mui/material';
import { useTooltipState } from '../../../hooks/use-tooltip';
import { tooltipStore } from './tooltip-store';
import { tooltipRegistry } from './tooltip-registry';
import { projectToScreen, clampToViewport } from './tooltip-utils';
import { useViewer } from '../../../hooks/use-viewer';

const DEFAULT_OFFSET_X = 16;
const DEFAULT_OFFSET_Y = -12;
const REFRESH_MS = 100;
const TOOLTIP_MIN_WIDTH = 160;
const TOOLTIP_EST_HEIGHT = 120;
const VIEWPORT_MARGIN = 10;

export function TooltipLayer() {
  const viewer = useViewer();
  const { active } = useTooltipState();
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Memoize position update to avoid recreating in interval
  const updatePosition = useCallback(() => {
    if (!active) {
      setVisible(false);
      return;
    }

    const offsetX = active.offset?.x ?? DEFAULT_OFFSET_X;
    const offsetY = active.offset?.y ?? DEFAULT_OFFSET_Y;

    let rawX = 0;
    let rawY = 0;
    let isVisible = true;

    if (active.mode === 'cursor') {
      const cursorPos = tooltipStore.getCursorPos(active.id);
      if (!cursorPos) { setVisible(false); return; }
      rawX = cursorPos.x + offsetX;
      rawY = cursorPos.y + offsetY;
    } else if (active.mode === 'world') {
      if (!active.worldTarget) { setVisible(false); return; }
      const screen = projectToScreen(active.worldTarget, viewer.camera, viewer.renderer);
      if (!screen.visible) { setVisible(false); return; }
      rawX = screen.x + offsetX;
      rawY = screen.y + offsetY;
    } else if (active.mode === 'fixed') {
      if (!active.fixedPos) { setVisible(false); return; }
      rawX = active.fixedPos.x + offsetX;
      rawY = active.fixedPos.y + offsetY;
    }

    // Get actual tooltip dimensions if available
    const tooltipWidth = tooltipRef.current?.offsetWidth ?? TOOLTIP_MIN_WIDTH;
    const tooltipHeight = tooltipRef.current?.offsetHeight ?? TOOLTIP_EST_HEIGHT;

    const clamped = clampToViewport(
      rawX, rawY,
      tooltipWidth, tooltipHeight,
      VIEWPORT_MARGIN,
      window.innerWidth, window.innerHeight,
    );

    setPos(clamped);
    setVisible(isVisible);
  }, [active, viewer]);

  // Periodic position update (covers cursor movement, world projection, etc.)
  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }

    // Initial tick
    updatePosition();
    const id = setInterval(updatePosition, REFRESH_MS);
    return () => clearInterval(id);
  }, [active, updatePosition]);

  if (!active || !visible) return null;

  // Look up content provider from registry
  const Provider = tooltipRegistry.getProvider(active.data.type);
  if (!Provider) return null;

  return (
    <Box
      ref={tooltipRef}
      sx={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        transform: 'translateY(-100%)',
        pointerEvents: 'none !important',
        zIndex: 1100,
        bgcolor: 'rgba(18, 18, 18, 0.88)',
        backdropFilter: 'blur(12px)',
        borderRadius: 1,
        px: 1.5,
        py: 1,
        minWidth: TOOLTIP_MIN_WIDTH,
        maxWidth: 280,
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        willChange: 'transform',
      }}
    >
      <Provider data={active.data} viewer={viewer} />
    </Box>
  );
}
