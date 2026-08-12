// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * ConnectionStatusPlugin — an always-visible indicator of where the data is coming from.
 *
 * The viewer can run standalone (browser-side physics) or driven live by a real
 * PLC through one of the industrial interfaces. That distinction is the whole
 * point of the platform, but it was previously only discoverable by opening
 * Settings and finding the Interfaces tab.
 *
 * This pill surfaces the current data source in the toolbar and opens the
 * settings panel on click, so connecting a real PLC is one click away.
 */

import React, { useEffect, useState } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import type { RVViewerPlugin } from '../core/rv-plugin';
import type { UISlotEntry, UISlotProps } from '../core/rv-ui-plugin';
import type { InterfaceManager } from '../interfaces/interface-manager';
import { SETTINGS_PANEL_WIDTH } from '../core/hmi/layout-constants';

interface Status {
  state: 'disconnected' | 'connecting' | 'connected' | 'error';
  signals: number;
  protocol: string;
}

const ConnectionStatusPill: React.FC<UISlotProps> = ({ viewer }) => {
  const [status, setStatus] = useState<Status>({ state: 'disconnected', signals: 0, protocol: '' });

  useEffect(() => {
    const read = () => {
      const manager = viewer.getPlugin<InterfaceManager>('interface-manager');
      const active = manager?.getActive();
      const next: Status = {
        state: active?.connectionState ?? 'disconnected',
        signals: active?.discoveredSignals.length ?? 0,
        protocol: active?.protocolName ?? '',
      };
      setStatus((prev) =>
        prev.state === next.state && prev.signals === next.signals && prev.protocol === next.protocol
          ? prev
          : next,
      );
    };
    read();
    const interval = setInterval(read, 500);
    return () => clearInterval(interval);
  }, [viewer]);

  const openSettings = () => {
    const editor = viewer.getPlugin<RVViewerPlugin & { setSettingsOpen(open: boolean): void }>('rv-extras-editor');
    editor?.setSettingsOpen(true);
    viewer.leftPanelManager?.open('settings', SETTINGS_PANEL_WIDTH);
  };

  const connected = status.state === 'connected';
  const connecting = status.state === 'connecting';
  const errored = status.state === 'error';

  const color = connected ? '#5FB37A' : connecting ? '#D9A441' : errored ? '#D9534F' : '#D9A441';
  const label = connected
    ? `LIVE · ${status.signals} signals`
    : connecting
      ? 'CONNECTING…'
      : errored
        ? 'LINK ERROR'
        : 'STANDALONE SIM';

  const tip = connected
    ? `Live process data via ${status.protocol || 'industrial interface'} — ${status.signals} signals bound`
    : errored
      ? 'Interface reported an error. Open Settings › Interfaces for details.'
      : 'Running browser-side simulation. Click to connect a real PLC (WebSocket / ctrlX).';

  return (
    <Tooltip title={tip}>
      <Box
        onClick={openSettings}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.7,
          px: 1.1,
          py: 0.5,
          mr: 0.5,
          borderRadius: '999px',
          cursor: 'pointer',
          border: `1px solid ${color}66`,
          bgcolor: `${color}1f`,
          pointerEvents: 'auto',
          transition: 'background-color 0.2s ease',
          '&:hover': { bgcolor: `${color}33` },
        }}
      >
        <Box
          sx={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            bgcolor: color,
            flexShrink: 0,
            animation: connected || connecting ? 'rv-pulse 1.6s ease-in-out infinite' : 'none',
            '@keyframes rv-pulse': {
              '0%, 100%': { opacity: 1 },
              '50%': { opacity: 0.25 },
            },
          }}
        />
        <Typography sx={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.5, color, whiteSpace: 'nowrap' }}>
          {label}
        </Typography>
      </Box>
    </Tooltip>
  );
};

export class ConnectionStatusPlugin implements RVViewerPlugin {
  readonly id = 'connection-status';
  readonly order = 50;
  readonly slots: UISlotEntry[] = [
    { slot: 'toolbar-button', order: 1, component: ConnectionStatusPill },
  ];
}
