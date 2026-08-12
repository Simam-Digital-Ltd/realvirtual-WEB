// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import React, { useState, useEffect } from 'react';
import {
  Box, Tooltip, Typography, List, ListItemButton,
  ListItemText, Popover, IconButton, Badge
} from '@mui/material';
import { ShieldAlert, AlertCircle, MapPin, Zap } from 'lucide-react';
import type { RVViewerPlugin } from '../core/rv-plugin';
import type { RVViewer } from '../core/rv-viewer';
import type { UISlotEntry, UISlotProps } from '../core/rv-ui-plugin';
import type { LoadResult } from '../core/engine/rv-scene-loader';
import type { Object3D } from 'three';

// ─── Types ───

interface Alarm {
  id: string;
  name: string;
  timestamp: number;
  node: Object3D | null;
  path: string;
}

// ─── UI Component ───

const AlarmStatusPill: React.FC<UISlotProps> = ({ viewer }) => {
  const [activeAlarms, setActiveAlarms] = useState<Alarm[]>([]);
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  useEffect(() => {
    // Subscribe to custom event from plugin instance
    const plugin = viewer.getPlugin<AlarmRadarPlugin>('alarm-radar');
    if (!plugin) return;

    const handleUpdate = (alarms: unknown) => {
      setActiveAlarms([...(alarms as Alarm[])]);
    };

    plugin.on('alarms-changed', handleUpdate);
    // Initial sync
    setActiveAlarms([...plugin.activeAlarms]);

    return () => {
      plugin.off('alarms-changed', handleUpdate);
    };
  }, [viewer]);

  const handleOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleFlyTo = (alarm: Alarm) => {
    if (alarm.node) {
      viewer.fitToNodes([alarm.node]);
      viewer.highlighter.highlight(alarm.node, true);
    }
    handleClose();
  };

  if (activeAlarms.length === 0) return null;

  return (
    <>
      <Tooltip title={`${activeAlarms.length} Active Alarms`}>
        <IconButton
          onClick={handleOpen}
          sx={{
            bgcolor: 'rgba(211, 47, 47, 0.1)',
            border: '1px solid rgba(211, 47, 47, 0.3)',
            animation: 'pulse-red 2s infinite',
            '@keyframes pulse-red': {
              '0%': { boxShadow: '0 0 0 0 rgba(211, 47, 47, 0.4)' },
              '70%': { boxShadow: '0 0 0 10px rgba(211, 47, 47, 0)' },
              '100%': { boxShadow: '0 0 0 0 rgba(211, 47, 47, 0)' },
            }
          }}
        >
          <Badge badgeContent={activeAlarms.length} color="error">
            <ShieldAlert color="#D9534F" size={20} />
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{
          className: 'glass',
          sx: { width: 300, mt: 1, p: 0 }
        }}
      >
        <Box sx={{ p: 2, bgcolor: 'rgba(211, 47, 47, 0.1)', borderBottom: '1px solid rgba(211, 47, 47, 0.2)' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#D9534F', display: 'flex', alignItems: 'center', gap: 1 }}>
            <AlertCircle size={16} /> Active Faults
          </Typography>
        </Box>
        <List sx={{ maxHeight: 300, overflow: 'auto', p: 0 }}>
          {activeAlarms.map((alarm) => (
            <ListItemButton
              key={alarm.id}
              onClick={() => handleFlyTo(alarm)}
              sx={{
                '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' },
                borderBottom: '1px solid rgba(255,255,255,0.05)'
              }}
            >
              <ListItemText
                primary={alarm.name}
                secondary={new Date(alarm.timestamp).toLocaleTimeString()}
                primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: 600 }}
                secondaryTypographyProps={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}
              />
              <MapPin size={14} color="#3FB8C4" />
            </ListItemButton>
          ))}
        </List>
      </Popover>
    </>
  );
};

// ─── Plugin Implementation ───

import { EventEmitter } from '../core/rv-events';

export class AlarmRadarPlugin extends EventEmitter implements RVViewerPlugin {
  readonly id = 'alarm-radar';
  readonly order = 400; // Run before highlight updates
  
  readonly slots: UISlotEntry[] = [
    {
      slot: 'messages',
      order: 100,
      component: AlarmStatusPill,
    }
  ];

  private _viewer: RVViewer | null = null;
  private _activeAlarms = new Map<string, Alarm>();
  private _unsubs: (() => void)[] = [];

  get activeAlarms(): Alarm[] {
    return Array.from(this._activeAlarms.values());
  }

  onModelLoaded(_result: LoadResult, viewer: RVViewer): void {
    this._viewer = viewer;
    this._scanSignals();
  }

  onModelCleared(): void {
    this._cleanup();
    this._activeAlarms.clear();
    this.emit('alarms-changed', []);
  }

  onFixedUpdatePost(): void {
    if (this._viewer?.highlighter) {
      this._viewer.highlighter.updateAlarmPulse(performance.now() / 1000);
    }
  }

  private _scanSignals(): void {
    if (!this._viewer?.signalStore) return;

    this._cleanup();

    const signals = this._viewer.signalStore.getAll();
    for (const [name, value] of signals) {
      if (this._isAlarmSignal(name)) {
        this._setupAlarmListener(name, value);
      }
    }
  }

  private _isAlarmSignal(name: string): boolean {
    const n = name.toLowerCase();
    return n.includes('alarm') || n.includes('fault') || n.includes('error');
  }

  private _setupAlarmListener(name: string, initial: boolean | number): void {
    if (!this._viewer?.signalStore) return;

    const handler = (val: boolean | number) => {
      const isActive = val === true || (typeof val === 'number' && val > 0);
      this._updateAlarmState(name, isActive);
    };

    const unsub = this._viewer.signalStore.subscribe(name, handler);
    this._unsubs.push(unsub);

    // Initial check
    handler(initial);
  }

  private _updateAlarmState(name: string, isActive: boolean): void {
    if (isActive) {
      if (this._activeAlarms.has(name)) return;

      // Find node by mapping signal name to hierarchy
      // In realvirtual, signal names often mirror node names or paths
      const node = this._viewer?.registry?.getNode(name) || null;
      const path = node ? this._viewer?.registry?.getPathForNode(node) || name : name;

      const alarm: Alarm = {
        id: name,
        name: name.split('/').pop() || name,
        timestamp: Date.now(),
        node,
        path
      };

      this._activeAlarms.set(name, alarm);
      
      // Visual highlight
      if (node && this._viewer?.highlighter) {
        this._viewer.highlighter.highlightAlarm(node, name);
      }

      this.emit('alarms-changed', this.activeAlarms);
      
      // Auto-focus if it's the first alarm (optional behavior)
      // if (this._activeAlarms.size === 1 && node) this._viewer.cameraManager.flyTo(node);

    } else {
      if (!this._activeAlarms.has(name)) return;

      this._activeAlarms.delete(name);
      
      // Clear highlight
      if (this._viewer?.highlighter) {
        this._viewer.highlighter.clearAlarm(name);
      }

      this.emit('alarms-changed', this.activeAlarms);
    }
  }

  private _cleanup(): void {
    this._unsubs.forEach(u => u());
    this._unsubs = [];
  }

  dispose(): void {
    this._cleanup();
    this.removeAllListeners();
  }
}
