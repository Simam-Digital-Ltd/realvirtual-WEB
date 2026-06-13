// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Box, 
  Slider, 
  IconButton, 
  Typography, 
  Tooltip,
  Stack,
  alpha
} from '@mui/material';
import { 
  PlayArrow, 
  Pause, 
  History as HistoryIcon, 
  FiberManualRecord as LiveIcon,
  CloudUpload,
  AccessTime
} from '@mui/icons-material';
import type { UISlotProps } from '../core/rv-ui-plugin';
import type { HistorianPlugin } from '../plugins/historian-plugin';

/**
 * TimelinePanel Component
 * "The Factory Time Machine" Controller
 */
export const TimelinePanel: React.FC<UISlotProps> = ({ viewer }) => {
  const plugin = useMemo(() => viewer.getPlugin('historian') as HistorianPlugin, [viewer]);
  
  const [isTimeTraveling, setIsTimeTraveling] = useState(plugin?.isTimeTraveling || false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Sync state with plugin loop
  useEffect(() => {
    const timer = setInterval(() => {
      if (plugin?.isTimeTraveling && plugin.playback) {
        setCurrentFrame(plugin.playback.frame);
        setTotalFrames(plugin.playback.totalFrames);
        setIsPlaying(plugin.playback.isPlaying);
      } else if (plugin?.recorder) {
        setTotalFrames(plugin.recorder.timeBuffer.count);
      }
      setIsTimeTraveling(plugin?.isTimeTraveling || false);
    }, 100); // 10Hz UI sync is enough

    return () => clearInterval(timer);
  }, [viewer, plugin]);

  const toggleMode = () => {
    if (isTimeTraveling) {
      plugin?.stopTimeTravel();
    } else {
      plugin?.startTimeTravel();
    }
  };

  const handlePlayPause = () => {
    if (!plugin?.playback) return;
    if (isPlaying) plugin.playback.pause();
    else plugin.playback.play();
  };

  const handleScrub = (_: Event, value: number | number[]) => {
    if (plugin?.playback && typeof value === 'number') {
      const pct = value / (totalFrames - 1);
      plugin.playback.seekToPercent(pct);
      setCurrentFrame(plugin.playback.frame);
    }
  };

  const handleCloudSave = async () => {
    setIsSaving(true);
    await plugin?.cloudSave();
    setIsSaving(false);
  };

  const formatTime = (frame: number) => {
    const seconds = frame * (plugin?.recorder?.toCompactRecording().fixedDeltaTime || 0.1);
    return `-${seconds.toFixed(1)}s`;
  };

  return (
    <Box sx={{ 
      width: '100vw',
      maxWidth: '800px',
      display: 'flex', 
      flexDirection: 'column',
      gap: 1,
      backdropFilter: 'blur(16px)',
      bgcolor: alpha('#0f172a', 0.8),
      px: 3,
      py: 1.5,
      borderRadius: '16px 16px 0 0',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderBottom: 'none',
      boxShadow: '0 -10px 15px -3px rgb(0 0 0 / 0.3)'
    }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Stack direction="row" alignItems="center" gap={1}>
          <Tooltip title={isTimeTraveling ? "Return to Live" : "Enter Time Machine"}>
            <IconButton 
              onClick={toggleMode} 
              sx={{ 
                color: isTimeTraveling ? '#facc15' : 'rgba(255,255,255,0.5)',
                bgcolor: isTimeTraveling ? alpha('#facc15', 0.1) : 'transparent',
                '&:hover': { bgcolor: alpha('#facc15', 0.2) }
              }}
            >
              {isTimeTraveling ? <HistoryIcon /> : <AccessTime />}
            </IconButton>
          </Tooltip>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {isTimeTraveling ? (
              <Chip 
                label="TIME TRAVELING" 
                size="small" 
                sx={{ bgcolor: '#facc15', color: '#000', fontWeight: 800, fontSize: '0.65rem' }} 
              />
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <LiveIcon sx={{ fontSize: 10, color: '#ef4444' }} className="pulse-animation" />
                <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 700, letterSpacing: 1 }}>
                  LIVE RECORDING
                </Typography>
              </Box>
            )}
          </Box>
        </Stack>

        <Stack direction="row" alignItems="center" gap={1}>
          {isTimeTraveling && (
            <IconButton onClick={handlePlayPause} sx={{ color: '#fff' }}>
              {isPlaying ? <Pause /> : <PlayArrow />}
            </IconButton>
          )}
          
          <Tooltip title="Save Snapshot to Cloud">
            <IconButton 
              onClick={handleCloudSave} 
              disabled={isSaving}
              sx={{ color: 'rgba(255,255,255,0.7)' }}
            >
              <CloudUpload />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      <Stack direction="row" alignItems="center" gap={2}>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', minWidth: 40, textAlign: 'right' }}>
           {isTimeTraveling ? formatTime(currentFrame) : `-${(totalFrames * 0.1).toFixed(1)}s`}
        </Typography>
        
        <Slider
          size="small"
          value={currentFrame}
          max={totalFrames > 0 ? totalFrames - 1 : 0}
          disabled={!isTimeTraveling}
          onChange={handleScrub}
          sx={{
            color: isTimeTraveling ? '#facc15' : 'rgba(255,255,255,0.1)',
            '& .MuiSlider-thumb': {
              display: isTimeTraveling ? 'block' : 'none',
              width: 12,
              height: 12,
              '&:before': { boxShadow: '0 2px 12px 0 rgba(0,0,0,0.4)' },
              '&:hover, &.Mui-focusVisible': { boxShadow: `0px 0px 0px 8px ${alpha('#facc15', 0.16)}` }
            },
            '& .MuiSlider-rail': { opacity: 0.3 }
          }}
        />

        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', minWidth: 40 }}>
          0.0s
        </Typography>
      </Stack>

      <style>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.3; }
          100% { opacity: 1; }
        }
        .pulse-animation {
          animation: pulse 1.5s infinite ease-in-out;
        }
      `}</style>
    </Box>
  );
};

// Helper for Chip usage if MUI version requires it
const Chip = ({ label, size, sx }: any) => (
  <Box sx={{ 
    ...sx, 
    px: 1, 
    py: 0.2, 
    borderRadius: '4px', 
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'center' 
  }}>
    <Typography sx={{ fontSize: '0.65rem', fontWeight: 800 }}>{label}</Typography>
  </Box>
);
