/**
 * MultiuserPanel — Simple join/leave popup for the TopBar.
 *
 * Shows a compact dropdown with:
 *   - Display name field
 *   - Server URL field (pre-filled from settings/URL params)
 *   - Optional join code field
 *   - Join button
 *   - When connected: player list + disconnect button
 *
 * Advanced settings (role, enable/disable) are in the Multiuser settings tab.
 */

import { useState, useEffect, useCallback, useRef, memo } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  IconButton,
  Divider,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import { Close, PersonOutline, WifiOff, Wifi } from '@mui/icons-material';
import { useViewer } from '../../hooks/use-viewer';
import { useMultiuser } from '../../hooks/use-multiuser';
import { loadMultiuserSettings, saveMultiuserSettings } from './multiuser-settings-store';
import type { MultiuserPluginAPI } from '../types/plugin-types';
import type { PlayerInfo } from '../engine/rv-avatar-manager';

// ── Styling constants ─────────────────────────────────────────────────────

const PANEL_WIDTH = 260;
const BG = 'rgba(18,22,30,0.96)';
const BORDER = 'rgba(255,255,255,0.07)';
const INPUT_SX = {
  '& .MuiInputBase-input': { fontSize: 12, color: 'rgba(255,255,255,0.85)', py: 0.75 },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: BORDER },
  '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.04)' },
};

// ── Sub-components ────────────────────────────────────────────────────────

// Opt 5a: React.memo prevents re-render when player props haven't changed
const PlayerRow = memo(function PlayerRow({ player }: { player: PlayerInfo }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.3 }}>
      <Box sx={{
        width: 8, height: 8, borderRadius: '50%',
        bgcolor: player.color,
        flexShrink: 0,
        boxShadow: `0 0 4px ${player.color}`,
      }} />
      <Typography sx={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {player.name}
      </Typography>
      <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>
        {player.xrMode !== 'none' ? player.xrMode.toUpperCase() : player.role}
      </Typography>
    </Box>
  );
});

// ── Panel ─────────────────────────────────────────────────────────────────

interface MultiuserPanelProps {
  onClose: () => void;
}

export function MultiuserPanel({ onClose }: MultiuserPanelProps) {
  const viewer = useViewer();
  const mu = useMultiuser();

  // Pre-fill from persisted settings, then override with URL params/plugin state
  const [connectionMode, setConnectionMode] = useState<'local' | 'relay'>(() => {
    const s = loadMultiuserSettings();
    return s.connectionMode || 'local';
  });
  const [serverUrl, setServerUrl] = useState(() => {
    const s = loadMultiuserSettings();
    return s.serverUrl || '';
  });
  const [relayUrl, setRelayUrl] = useState(() => {
    const s = loadMultiuserSettings();
    return s.relayUrl || 'wss://download.realvirtual.io/relay';
  });
  const [localName, setLocalName] = useState(() => {
    const s = loadMultiuserSettings();
    return s.displayName || 'Browser';
  });
  const [joinCode, setJoinCode] = useState(() => {
    const s = loadMultiuserSettings();
    return s.joinCode || '';
  });

  // Sync from plugin/URL on mount
  const serverUrlRef = useRef(serverUrl);
  serverUrlRef.current = serverUrl;
  useEffect(() => {
    const plugin = viewer.getPlugin<MultiuserPluginAPI>('multiuser');
    if (plugin) {
      if (plugin.serverUrl && !serverUrlRef.current) setServerUrl(plugin.serverUrl);
      if (plugin.localName) setLocalName(plugin.localName);
      if (plugin.joinCode) setJoinCode(plugin.joinCode);
    }
    const params = new URLSearchParams(window.location.search);
    const urlServer = params.get('server') ?? params.get('multiuserServer');
    const urlName = params.get('name') ?? params.get('multiuserName');
    const urlCode = params.get('joinCode') ?? params.get('code');
    if (urlServer && !serverUrlRef.current) setServerUrl(urlServer);
    if (urlName) setLocalName(urlName);
    if (urlCode) setJoinCode(urlCode);
  }, [viewer]);

  // Keep in sync when connected
  useEffect(() => {
    if (mu.connected && mu.localName) setLocalName(mu.localName);
    if (mu.connected && mu.serverUrl) setServerUrl(mu.serverUrl);
  }, [mu.connected, mu.localName, mu.serverUrl]);

  const handleJoin = useCallback(() => {
    const plugin = viewer.getPlugin<MultiuserPluginAPI>('multiuser');
    if (!plugin) {
      console.warn('[MultiuserPanel] MultiuserPluginAPI not found.');
      return;
    }
    // Persist current values
    const settings = loadMultiuserSettings();
    settings.connectionMode = connectionMode;
    settings.serverUrl = serverUrl;
    settings.relayUrl = relayUrl;
    settings.displayName = localName;
    settings.joinCode = joinCode;
    saveMultiuserSettings(settings);

    const url = connectionMode === 'relay' ? relayUrl : serverUrl;
    const role = plugin.localRole || 'observer';
    plugin.joinSession(url, localName, undefined, role, joinCode || undefined);
  }, [viewer, connectionMode, serverUrl, relayUrl, localName, joinCode]);

  const handleDisconnect = useCallback(() => {
    const plugin = viewer.getPlugin<MultiuserPluginAPI>('multiuser');
    plugin?.leaveSession();
  }, [viewer]);

  const isConnected = mu.connected;
  const players: PlayerInfo[] = mu.players;

  return (
    <Box data-ui-panel sx={{
      position: 'fixed',
      top: 44,
      right: 8,
      width: PANEL_WIDTH,
      bgcolor: BG,
      border: `1px solid ${BORDER}`,
      borderRadius: 1,
      p: 1.25,
      zIndex: 9000,
      boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
      backdropFilter: 'blur(8px)',
      pointerEvents: 'auto',
    }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.75 }}>
        {isConnected
          ? <Wifi sx={{ fontSize: 14, color: '#66bb6a', mr: 0.5 }} />
          : <WifiOff sx={{ fontSize: 14, color: 'rgba(255,255,255,0.35)', mr: 0.5 }} />}
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.9)', flexGrow: 1 }}>
          Multiuser
        </Typography>
        <IconButton size="small" onClick={onClose} sx={{ color: 'rgba(255,255,255,0.4)', p: 0.25 }}>
          <Close sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>

      <Divider sx={{ borderColor: BORDER, mb: 1 }} />

      {/* Join form */}
      {!isConnected && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {/* Connection Mode Toggle */}
          <ToggleButtonGroup
            value={connectionMode}
            exclusive
            onChange={(_e, val) => { if (val) setConnectionMode(val); }}
            size="small"
            fullWidth
            sx={{
              '& .MuiToggleButton-root': {
                fontSize: 11, textTransform: 'none', py: 0.4,
                color: 'rgba(255,255,255,0.5)', borderColor: BORDER,
                '&.Mui-selected': { color: '#fff', bgcolor: 'rgba(21,101,192,0.5)', borderColor: '#1565c0' },
              },
            }}
          >
            <ToggleButton value="local">Local</ToggleButton>
            <ToggleButton value="relay">Relay</ToggleButton>
          </ToggleButtonGroup>

          <TextField
            fullWidth size="small"
            placeholder="Your Name"
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleJoin(); }}
            sx={INPUT_SX}
          />

          {/* Local mode: direct server URL */}
          {connectionMode === 'local' && (
            <TextField
              fullWidth size="small"
              placeholder="ws://192.168.1.5:7000"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleJoin(); }}
              sx={INPUT_SX}
            />
          )}

          {/* Relay mode: relay URL */}
          {connectionMode === 'relay' && (
            <TextField
              fullWidth size="small"
              placeholder="wss://download.realvirtual.io/relay"
              value={relayUrl}
              onChange={(e) => setRelayUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleJoin(); }}
              sx={INPUT_SX}
            />
          )}

          <TextField
            fullWidth size="small"
            placeholder={connectionMode === 'relay' ? 'Join Code (required)' : 'Join Code (optional)'}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleJoin(); }}
            sx={{ ...INPUT_SX, '& .MuiInputBase-input': { ...INPUT_SX['& .MuiInputBase-input'], textTransform: 'uppercase', fontFamily: 'monospace' } }}
          />
          <Button
            fullWidth variant="contained" size="small"
            onClick={handleJoin}
            disabled={
              mu.status === 'connecting' ||
              (connectionMode === 'local' && !serverUrl.trim()) ||
              (connectionMode === 'relay' && (!relayUrl.trim() || !joinCode.trim()))
            }
            sx={{ fontSize: 11, textTransform: 'none', mt: 0.25, bgcolor: '#1565c0', '&:hover': { bgcolor: '#1976d2' } }}
          >
            {mu.status === 'connecting' ? 'Connecting…' : 'Join'}
          </Button>
          {mu.statusMessage && (
            <Typography sx={{
              fontSize: 10, mt: 0.5, textAlign: 'center',
              color: mu.status === 'error' ? '#ef5350' : 'rgba(255,255,255,0.45)',
            }}>
              {mu.statusMessage}
            </Typography>
          )}
        </Box>
      )}

      {/* Connected state */}
      {isConnected && (
        <Box>
          {/* Server URL */}
          <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', mb: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {mu.serverUrl}
          </Typography>

          {/* Local player */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.3 }}>
            <PersonOutline sx={{ fontSize: 12, color: '#2196F3' }} />
            <Typography sx={{ fontSize: 11, color: '#2196F3', flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {mu.localName} (You)
            </Typography>
            <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>
              {mu.localRole}
            </Typography>
          </Box>

          {/* Remote players */}
          {players.map((p) => (
            <PlayerRow key={p.id} player={p} />
          ))}

          {players.length === 0 && (
            <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', py: 0.5, textAlign: 'center' }}>
              No other players connected
            </Typography>
          )}

          <Divider sx={{ borderColor: BORDER, my: 0.75 }} />

          <Button
            fullWidth variant="outlined" size="small"
            onClick={handleDisconnect}
            sx={{
              fontSize: 11, textTransform: 'none',
              borderColor: 'rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.65)',
              '&:hover': { borderColor: '#ef5350', color: '#ef5350', bgcolor: 'rgba(239,83,80,0.06)' },
            }}
          >
            Disconnect
          </Button>
        </Box>
      )}
    </Box>
  );
}
