import { Typography, Box, Button, Select, MenuItem } from '@mui/material';
import { RestartAlt } from '@mui/icons-material';
import { useViewer } from '../../../hooks/use-viewer';
import { ALL_RV_STORAGE_KEYS } from '../rv-storage-keys';
import { isSettingsLocked } from '../../rv-app-config';

export function ModelTab() {
  const viewer = useViewer();
  const models = viewer.availableModels;
  const currentUrl = viewer.currentModelUrl;
  const currentRenderer = viewer.isWebGPU ? 'webgpu' : 'webgl';
  // Clamp to known options so MUI Select doesn't warn about out-of-range values (e.g. blob: URLs)
  const modelValue = models.some((m) => m.url === currentUrl) ? currentUrl! : '';

  const handleRendererChange = (value: string) => {
    localStorage.setItem('rv-webviewer-renderer', value);
    window.location.reload();
  };

  const handleModelChange = (url: string) => {
    if (url) viewer.loadModel(url);
  };

  const handleResetAll = () => {
    ALL_RV_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    window.location.reload();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
          Renderer
        </Typography>
        <Select
          size="small"
          fullWidth
          value={currentRenderer}
          onChange={(e) => handleRendererChange(e.target.value as string)}
          sx={{ mt: 0.5, fontSize: 13, '& .MuiSelect-select': { py: 0.75 } }}
        >
          <MenuItem value="webgl" sx={{ fontSize: 13 }}>WebGL</MenuItem>
          <MenuItem value="webgpu" disabled={!navigator.gpu} sx={{ fontSize: 13 }}>
            WebGPU (experimental)
            {!navigator.gpu && (
              <Typography component="span" sx={{ ml: 1, fontSize: 10, color: 'text.disabled' }}>not available</Typography>
            )}
          </MenuItem>
        </Select>
      </Box>
      <Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1 }}>
          Model
        </Typography>
        <Select
          size="small"
          fullWidth
          value={modelValue}
          onChange={(e) => handleModelChange(e.target.value as string)}
          displayEmpty
          sx={{ mt: 0.5, fontSize: 13, '& .MuiSelect-select': { py: 0.75 } }}
        >
          <MenuItem value="" sx={{ fontSize: 13, color: 'text.secondary' }}>-- Select Model --</MenuItem>
          {models.map((m) => (
            <MenuItem key={m.url} value={m.url} sx={{ fontSize: 13 }}>{m.label}</MenuItem>
          ))}
        </Select>
      </Box>

      {/* Reset all settings (hidden when locked) */}
      {!isSettingsLocked() && (
        <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.08)', pt: 2 }}>
          <Button
            variant="outlined"
            size="small"
            color="warning"
            startIcon={<RestartAlt sx={{ fontSize: 14 }} />}
            onClick={handleResetAll}
            sx={{ fontSize: 11, textTransform: 'none' }}
          >
            Reset All Settings to Defaults
          </Button>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, fontSize: 10 }}>
            Clears all saved browser settings and reloads the page.
          </Typography>
        </Box>
      )}
    </Box>
  );
}
