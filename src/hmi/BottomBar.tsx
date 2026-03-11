import { useState, useCallback } from 'react';
import { TextField, InputAdornment, Box, Paper, IconButton } from '@mui/material';
import { Search, Clear } from '@mui/icons-material';
import { CameraBar } from './CameraBar';
import { useDriveFilter } from '../hooks/use-drive-filter';

/** Height of the bottom bar area (search + padding) for layout calculations. */
export const BOTTOM_BAR_HEIGHT = 52;

export function BottomBar() {
  const { filter, setFilter } = useDriveFilter();
  const [inputValue, setInputValue] = useState('');

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setInputValue(val);
      setFilter(val);
    },
    [setFilter],
  );

  const handleClear = useCallback(() => {
    setInputValue('');
    setFilter('');
  }, [setFilter]);

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 8,
        left: 0,
        right: 0,
        zIndex: 1200,
        pointerEvents: 'none',
      }}
    >
      {/* Centered search bar */}
      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        <Paper
          elevation={4}
          sx={{
            px: 1.5,
            py: 0.5,
            borderRadius: 2,
            pointerEvents: 'auto',
            width: 420,
          }}
        >
          <TextField
            placeholder="Search drives, sensors, signals..."
            size="small"
            fullWidth
            variant="standard"
            value={inputValue}
            onChange={handleChange}
            slotProps={{
              input: {
                disableUnderline: true,
                startAdornment: (
                  <InputAdornment position="start">
                    <Search sx={{ color: filter ? 'primary.main' : 'text.secondary' }} />
                  </InputAdornment>
                ),
                endAdornment: filter ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={handleClear} sx={{ p: 0.25 }}>
                      <Clear sx={{ fontSize: 16, color: 'text.secondary' }} />
                    </IconButton>
                  </InputAdornment>
                ) : undefined,
              },
            }}
          />
        </Paper>
      </Box>

      {/* Camera presets + HMI toggle — bottom right */}
      <Paper
        elevation={4}
        sx={{
          position: 'absolute',
          bottom: 0,
          right: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.5,
          borderRadius: 2,
          pointerEvents: 'auto',
        }}
      >
        <CameraBar />
      </Paper>
    </Box>
  );
}
