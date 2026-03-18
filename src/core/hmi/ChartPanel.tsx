/**
 * ChartPanel — Reusable draggable, resizable floating panel for ECharts.
 *
 * Extracted from DriveChartOverlay to provide a consistent base for all
 * chart overlays (drive monitor, OEE, Parts/H, Cycle Time).
 *
 * Features: drag via title bar, resize via corner handle, ESC to close,
 * expand/collapse toggle, MUI Paper glassmorphism styling.
 */

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { Box, IconButton, Typography, Paper } from '@mui/material';
import { Close, UnfoldMore, UnfoldLess, DragIndicator } from '@mui/icons-material';
import { BOTTOM_BAR_HEIGHT } from './BottomBar';
import { useMobileLayout } from '../../hooks/use-mobile-layout';

// ─── Constants ──────────────────────────────────────────────────────────

const MIN_W_DESKTOP = 400;
const MIN_W_MOBILE = 280;
const MIN_H = 200;
const BOTTOM_MARGIN = BOTTOM_BAR_HEIGHT + 12;

/** Tags that should NOT trigger drag when clicked. */
const INTERACTIVE_TAGS = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SVG', 'PATH']);

export function isInteractive(el: HTMLElement): boolean {
  let cur: HTMLElement | null = el;
  while (cur) {
    if (INTERACTIVE_TAGS.has(cur.tagName)) return true;
    if (cur.getAttribute('role') === 'button') return true;
    if (cur.classList?.contains('MuiToggleButton-root')) return true;
    if (cur.classList?.contains('MuiIconButton-root')) return true;
    if (cur.classList?.contains('MuiChip-root')) return true;
    if (cur.dataset?.dragHandle === 'true') break;
    cur = cur.parentElement;
  }
  return false;
}

// ─── Drag hook ──────────────────────────────────────────────────────────

export function useDrag(
  ref: React.RefObject<HTMLDivElement | null>,
  pos: { x: number; y: number },
  setPos: (p: { x: number; y: number }) => void,
  active = true,
) {
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const posRef = useRef(pos);
  posRef.current = pos;

  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      if (isInteractive(e.target as HTMLElement)) return;
      dragging.current = true;
      offset.current = { x: e.clientX - posRef.current.x, y: e.clientY - posRef.current.y };
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      setPos({ x: e.clientX - offset.current.x, y: e.clientY - offset.current.y });
    };
    const onUp = () => {
      dragging.current = false;
    };

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, setPos, active]);
}

// ─── Resize hook ────────────────────────────────────────────────────────

export function useResize(
  ref: React.RefObject<HTMLDivElement | null>,
  size: { w: number; h: number },
  setSize: (s: { w: number; h: number }) => void,
  minW = MIN_W_DESKTOP,
  minH = MIN_H,
  active = true,
) {
  const resizing = useRef(false);
  const start = useRef({ mx: 0, my: 0, w: 0, h: 0 });
  const sizeRef = useRef(size);
  sizeRef.current = size;

  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      resizing.current = true;
      start.current = { mx: e.clientX, my: e.clientY, w: sizeRef.current.w, h: sizeRef.current.h };
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    };
    const onMove = (e: PointerEvent) => {
      if (!resizing.current) return;
      const dw = e.clientX - start.current.mx;
      const dh = e.clientY - start.current.my;
      setSize({
        w: Math.max(minW, start.current.w + dw),
        h: Math.max(minH, start.current.h + dh),
      });
    };
    const onUp = () => {
      resizing.current = false;
    };

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, setSize, minW, minH, active]);
}

// ─── ChartPanel Component ───────────────────────────────────────────────

export interface ChartPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  titleColor?: string;
  subtitle?: string;
  defaultWidth?: number;
  defaultHeight?: number;
  defaultPosition?: { x: number; y: number };
  zIndex?: number;
  /** Toolbar content rendered between title and expand/close buttons */
  toolbar?: ReactNode;
  children: ReactNode;
}

export function ChartPanel({
  open,
  onClose,
  title,
  titleColor = '#4fc3f7',
  subtitle,
  defaultWidth = 700,
  defaultHeight = 340,
  defaultPosition,
  zIndex = 1500,
  toolbar,
  children,
}: ChartPanelProps) {
  const isMobile = useMobileLayout();
  const minW = isMobile ? MIN_W_MOBILE : MIN_W_DESKTOP;
  const expandedH = Math.round(window.innerHeight * 0.55);

  const mobileWidth = Math.min(defaultWidth, window.innerWidth - 16);

  const [expanded, setExpanded] = useState(false);
  const [pos, setPos] = useState(
    defaultPosition ?? {
      x: isMobile ? 8 : 64,
      y: window.innerHeight - defaultHeight - BOTTOM_MARGIN,
    },
  );
  const [size, setSize] = useState({ w: isMobile ? mobileWidth : defaultWidth, h: defaultHeight });

  const dragRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);

  useDrag(dragRef, pos, setPos, open);
  useResize(resizeRef, size, setSize, minW, MIN_H, open);

  // Snap to bottom-full-width when expanding
  useEffect(() => {
    if (expanded) {
      const expandX = isMobile ? 0 : 64;
      const expandW = isMobile ? window.innerWidth : window.innerWidth - 80;
      setPos({ x: expandX, y: window.innerHeight - expandedH - BOTTOM_MARGIN });
      setSize({ w: expandW, h: expandedH });
    } else {
      const resetW = isMobile ? mobileWidth : defaultWidth;
      setSize({ w: resetW, h: defaultHeight });
      setPos(
        defaultPosition ?? {
          x: isMobile ? 8 : 64,
          y: window.innerHeight - defaultHeight - BOTTOM_MARGIN,
        },
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  // ESC key to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <Paper
      elevation={8}
      data-ui-panel
      sx={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
        zIndex,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 2,
        border: '1px solid rgba(255,255,255,0.08)',
        overflow: 'hidden',
        pointerEvents: 'auto',
        transition: expanded ? 'all 0.25s ease' : undefined,
      }}
    >
      {/* ── Draggable title bar ── */}
      <Box
        ref={dragRef}
        data-drag-handle="true"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1,
          py: 0.25,
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          flexShrink: 0,
          minHeight: 30,
          cursor: 'grab',
          userSelect: 'none',
          '&:active': { cursor: 'grabbing' },
        }}
      >
        <DragIndicator sx={{ fontSize: 14, color: 'rgba(255,255,255,0.2)' }} />
        <Typography sx={{ fontSize: 11, fontWeight: 600, color: titleColor, letterSpacing: 0.3 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
            {subtitle}
          </Typography>
        )}

        {toolbar}

        <Box sx={{ ml: 'auto' }} />

        <IconButton
          size="small"
          onClick={() => setExpanded((e) => !e)}
          sx={{ color: 'rgba(255,255,255,0.35)', p: 0.3, '&:hover': { color: '#fff' } }}
        >
          {expanded ? <UnfoldLess sx={{ fontSize: 16 }} /> : <UnfoldMore sx={{ fontSize: 16 }} />}
        </IconButton>

        <IconButton
          size="small"
          onClick={onClose}
          sx={{ color: 'rgba(255,255,255,0.35)', p: 0.3, '&:hover': { color: '#fff' } }}
        >
          <Close sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>

      {/* ── Content area ── */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {children}
      </Box>

      {/* ── Resize handle (bottom-right corner) ── */}
      <Box
        ref={resizeRef}
        sx={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 16,
          height: 16,
          cursor: 'nwse-resize',
          '&::after': {
            content: '""',
            position: 'absolute',
            right: 3,
            bottom: 3,
            width: 8,
            height: 8,
            borderRight: '2px solid rgba(255,255,255,0.15)',
            borderBottom: '2px solid rgba(255,255,255,0.15)',
            borderRadius: '0 0 2px 0',
          },
        }}
      />
    </Paper>
  );
}
