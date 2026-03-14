import { useState, useEffect, useRef } from 'react';
import { Vector3, type Object3D } from 'three';
import { Box, Typography } from '@mui/material';
import { useHoveredDrive, useFocusedDrive } from '../../hooks/use-drives';
import { useViewer } from '../../hooks/use-viewer';
import type { RVDrive } from '../engine/rv-drive';

const OFFSET_X = 16;
const OFFSET_Y = -12;
const REFRESH_MS = 100; // 10 fps — safe for Quest browser

const SMOOTH_FACTOR = 0.15; // Exponential moving average weight (lower = smoother)

/**
 * Compute effective speed from refs (no React state, called from interval).
 */
function calcEffectiveSpeed(
  drive: RVDrive,
  prevPos: { current: number },
  prevTime: { current: number },
  smoothSpeed: { current: number },
): number {
  const now = performance.now();
  const dt = (now - prevTime.current) / 1000;
  const posDelta = Math.abs(drive.currentPosition - prevPos.current);

  if (dt > 0.01 && dt < 0.5) {
    const rawSpeed = drive.currentSpeed > 0.1 ? drive.currentSpeed : posDelta / dt;
    smoothSpeed.current += SMOOTH_FACTOR * (rawSpeed - smoothSpeed.current);
  }

  prevPos.current = drive.currentPosition;
  prevTime.current = now;
  return smoothSpeed.current;
}

/** Project a 3D world position to screen coordinates (pure function, no React state). */
function projectToScreen(
  node: Object3D,
  camera: { projectionMatrix: unknown; matrixWorldInverse: unknown },
  out: Vector3,
): { x: number; y: number } {
  node.updateWorldMatrix(true, false);
  node.getWorldPosition(out);
  out.project(camera as import('three').Camera);
  return {
    x: (out.x * 0.5 + 0.5) * window.innerWidth,
    y: (-out.y * 0.5 + 0.5) * window.innerHeight,
  };
}

interface TooltipData {
  drive: RVDrive;
  x: number;
  y: number;
  speed: number;
}

/**
 * Floating tooltip that shows drive info.
 * Uses a single setInterval for all updates to avoid cascading React state updates
 * that cause "Maximum update depth exceeded" on low-end browsers (Quest).
 */
export function DriveTooltip() {
  const viewer = useViewer();
  const hover = useHoveredDrive();
  const focus = useFocusedDrive();

  // All mutable data lives in refs — single setState per interval tick
  const [data, setData] = useState<TooltipData | null>(null);
  const prevPosRef = useRef(0);
  const prevTimeRef = useRef(0);
  const smoothSpeedRef = useRef(0);
  const projVec = useRef(new Vector3());

  // Resolve: hover takes priority over focus
  const drive = hover.drive ?? focus.drive;
  const isHoverMode = !!hover.drive;
  const focusNode = isHoverMode ? null : focus.node;

  // Reset speed tracking when drive changes
  const prevDriveRef = useRef<RVDrive | null>(null);
  if (drive !== prevDriveRef.current) {
    prevDriveRef.current = drive;
    prevPosRef.current = 0;
    prevTimeRef.current = 0;
    smoothSpeedRef.current = 0;
  }

  useEffect(() => {
    if (!drive) {
      setData(null);
      return;
    }

    // Compute tooltip state in one batch
    const tick = () => {
      const speed = calcEffectiveSpeed(drive, prevPosRef, prevTimeRef, smoothSpeedRef);

      let x: number;
      let y: number;
      if (isHoverMode) {
        x = hover.clientX + OFFSET_X;
        y = hover.clientY + OFFSET_Y;
      } else if (focusNode) {
        const screen = projectToScreen(focusNode, viewer.camera, projVec.current);
        x = screen.x + OFFSET_X;
        y = screen.y + OFFSET_Y;
      } else {
        setData(null);
        return;
      }

      // Clamp to viewport so tooltip doesn't overflow on small screens
      const maxX = window.innerWidth - 180;
      const clampedX = Math.min(x, maxX);
      const clampedY = Math.max(y, 10);

      setData({ drive, x: clampedX, y: clampedY, speed });
    };

    tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => clearInterval(id);
  }, [drive, isHoverMode, hover.clientX, hover.clientY, focusNode, viewer]);

  if (!data) return null;

  const { config } = data.drive;
  const unit = data.drive.isRotary ? '°' : 'mm';

  return (
    <Box
      sx={{
        position: 'fixed',
        left: data.x,
        top: data.y,
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
        {data.drive.name}
      </Typography>

      {/* Direction */}
      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block', mb: 0.5 }}>
        {config.direction}{config.reverseDirection ? ' (rev)' : ''}
      </Typography>

      {/* Position & Speed */}
      <Row label="Position" value={`${data.drive.currentPosition.toFixed(1)}${unit}`} />
      <Row label="Speed" value={`${data.speed.toFixed(1)} ${unit}/s`} />

      {/* Target (if running) */}
      {data.drive.isRunning && (
        <Row label="Target" value={`${data.drive.targetPosition.toFixed(1)}${unit}`} />
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
