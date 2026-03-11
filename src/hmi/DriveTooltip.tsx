import { useState, useEffect, useRef } from 'react';
import { Vector3, type Object3D } from 'three';
import { Box, Typography } from '@mui/material';
import { useHoveredDrive, useFocusedDrive } from '../hooks/use-drives';
import { useViewer } from '../hooks/use-viewer';
import type { RVDrive } from '../rv-drive';

const OFFSET_X = 16;
const OFFSET_Y = -12;
const REFRESH_MS = 50; // 20 fps for live values

const SMOOTH_FACTOR = 0.15; // Exponential moving average weight (lower = smoother)

/**
 * Compute effective speed: use drive.currentSpeed when available,
 * otherwise derive from position delta (for drive recordings where
 * positionOverwrite is true and currentSpeed stays 0).
 * Applies exponential smoothing to avoid jitter.
 */
function useEffectiveSpeed(drive: RVDrive | null): number {
  const prevPosRef = useRef(0);
  const prevTimeRef = useRef(0);
  const smoothSpeedRef = useRef(0);

  if (!drive) return 0;

  const now = performance.now();
  const dt = (now - prevTimeRef.current) / 1000; // seconds
  const posDelta = Math.abs(drive.currentPosition - prevPosRef.current);

  // Only compute derived speed with reasonable dt (avoid spikes on first frame or pause)
  if (dt > 0.01 && dt < 0.5) {
    const rawSpeed = drive.currentSpeed > 0.1 ? drive.currentSpeed : posDelta / dt;
    // Exponential moving average for smooth display
    smoothSpeedRef.current += SMOOTH_FACTOR * (rawSpeed - smoothSpeedRef.current);
  }

  prevPosRef.current = drive.currentPosition;
  prevTimeRef.current = now;

  return smoothSpeedRef.current;
}

/** Project a 3D world position to screen coordinates. */
function useProjectedPosition(node: Object3D | null): { x: number; y: number } | null {
  const viewer = useViewer();
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!node) { setPos(null); return; }
    const v = new Vector3();
    const update = () => {
      node.updateWorldMatrix(true, false);
      node.getWorldPosition(v);
      v.project(viewer.camera);
      setPos({
        x: (v.x * 0.5 + 0.5) * window.innerWidth,
        y: (-v.y * 0.5 + 0.5) * window.innerHeight,
      });
    };
    update();
    const id = setInterval(update, REFRESH_MS);
    return () => clearInterval(id);
  }, [node, viewer]);

  return pos;
}

/**
 * Floating tooltip that shows drive info.
 * Appears when:
 *   - Hovering a drive in the 3D scene (follows cursor)
 *   - Clicking a notification card that references a drive (anchored to component screen pos)
 */
export function DriveTooltip() {
  const hover = useHoveredDrive();
  const focus = useFocusedDrive();
  const [tick, setTick] = useState(0);

  // Resolve: hover takes priority over focus
  const drive = hover.drive ?? focus.drive;
  const isHoverMode = !!hover.drive;

  // Projected screen position for focused drive (when not hovering)
  const projectedPos = useProjectedPosition(isHoverMode ? null : focus.node);

  // Periodic re-render while a drive is active (reads mutable drive fields)
  useEffect(() => {
    if (!drive) return;
    const id = setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    return () => clearInterval(id);
  }, [drive]);

  const effectiveSpeed = useEffectiveSpeed(drive);

  if (!drive) return null;

  // Compute tooltip position
  let tooltipX: number;
  let tooltipY: number;
  if (isHoverMode) {
    tooltipX = hover.clientX + OFFSET_X;
    tooltipY = hover.clientY + OFFSET_Y;
  } else if (projectedPos) {
    tooltipX = projectedPos.x + OFFSET_X;
    tooltipY = projectedPos.y + OFFSET_Y;
  } else {
    return null;
  }

  // Read mutable drive state (force read on every tick)
  void tick;
  const { config } = drive;
  const unit = drive.isRotary ? '°' : 'mm';

  return (
    <Box
      sx={{
        position: 'fixed',
        left: tooltipX,
        top: tooltipY,
        transform: 'translateY(-100%)',
        pointerEvents: 'none',
        zIndex: 2000,
        bgcolor: 'rgba(18, 18, 18, 0.88)',
        backdropFilter: 'blur(12px)',
        borderRadius: 1,
        px: 1.5,
        py: 1,
        minWidth: 160,
        maxWidth: 280,
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      }}
    >
      {/* Drive name */}
      <Typography
        variant="subtitle2"
        sx={{ color: '#ffa040', fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}
      >
        {drive.name}
      </Typography>

      {/* Direction */}
      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block', mb: 0.5 }}>
        {config.direction}{config.reverseDirection ? ' (rev)' : ''}
      </Typography>

      {/* Position & Speed */}
      <Row label="Position" value={`${drive.currentPosition.toFixed(1)}${unit}`} />
      <Row label="Speed" value={`${effectiveSpeed.toFixed(1)} ${unit}/s`} />

      {/* Target (if running) */}
      {drive.isRunning && (
        <Row label="Target" value={`${drive.targetPosition.toFixed(1)}${unit}`} />
      )}

      {/* Limits (if enabled) */}
      {config.useLimits && (
        <Row
          label="Limits"
          value={`${config.lowerLimit.toFixed(0)} … ${config.upperLimit.toFixed(0)}${unit}`}
        />
      )}
    </Box>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
        {label}
      </Typography>
      <Typography variant="caption" sx={{ color: '#fff', fontSize: 11, fontFamily: 'monospace' }}>
        {value}
      </Typography>
    </Box>
  );
}
