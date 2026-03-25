/**
 * MachineControlPanel — Demo machine control HMI panel.
 *
 * Displays PackML-inspired machine state, mode selector, Start/Stop/Reset
 * controls, and an auto-discovered component list with 3D integration
 * (hover -> highlight, click -> fly-to).
 *
 * Managed via the LeftPanelManager for mutual exclusion with other panels.
 */

import { useRef, useEffect, useCallback, useSyncExternalStore } from 'react';
import { Box, Typography, Button, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { useViewer } from '../../hooks/use-viewer';
import { useMobileLayout } from '../../hooks/use-mobile-layout';
import { useMachineControl } from '../../hooks/use-machine-control';
import { LeftPanel } from './LeftPanel';
import { MACHINE_PANEL_WIDTH } from './layout-constants';
import type { MachineControlPlugin, MachineState, MachineMode, MachineComponent, ComponentStatus } from '../../plugins/machine-control-plugin';

// ─── ISA-101 Inspired Colors ─────────────────────────────────────────────

const MACHINE_COLORS = {
  // Component states (gray = normal, color = abnormal)
  running:  'rgba(255,255,255,0.7)',
  stopped:  'rgba(255,255,255,0.3)',
  active:   'rgba(255,255,255,0.7)',
  inactive: 'rgba(255,255,255,0.3)',
  warning:  '#ffa726',
  error:    '#ef5350',

  // Mode badges
  AUTO:        '#66bb6a',
  MANUAL:      '#42a5f5',
  MAINTENANCE: '#ffa726',

  // State badges
  RUNNING: '#66bb6a',
  STOPPED: 'rgba(255,255,255,0.4)',
  IDLE:    'rgba(255,255,255,0.6)',
  ERROR:   '#ef5350',
  HELD:    '#ffa726',
} as const;

// ─── State Badge ─────────────────────────────────────────────────────────

function StateBadge({ state }: { state: MachineState }) {
  const color = MACHINE_COLORS[state] ?? 'rgba(255,255,255,0.4)';
  return (
    <Box sx={{
      display: 'inline-flex', alignItems: 'center', gap: 0.75,
      px: 1.5, py: 0.5, borderRadius: 2,
      bgcolor: `${color}18`,
      border: `1px solid ${color}40`,
    }}>
      <Box sx={{
        width: 8, height: 8, borderRadius: '50%',
        bgcolor: color,
        boxShadow: state === 'RUNNING' ? `0 0 8px ${color}` : 'none',
      }} />
      <Typography sx={{
        fontSize: 13, fontWeight: 700, letterSpacing: 1,
        color,
        fontFamily: 'monospace',
      }}>
        {state}
      </Typography>
    </Box>
  );
}

// ─── Mode Selector ───────────────────────────────────────────────────────

function ModeSelector({ mode, onModeChange }: { mode: MachineMode; onModeChange: (m: MachineMode) => void }) {
  return (
    <ToggleButtonGroup
      value={mode}
      exclusive
      onChange={(_, val) => { if (val) onModeChange(val as MachineMode); }}
      size="small"
      fullWidth
      sx={{ '& .MuiToggleButton-root': { fontSize: 11, py: 0.5, textTransform: 'none', fontWeight: 600 } }}
    >
      <ToggleButton value="AUTO" sx={{ color: mode === 'AUTO' ? '#66bb6a' : undefined, '&.Mui-selected': { bgcolor: 'rgba(102,187,106,0.15)', color: '#66bb6a' } }}>Auto</ToggleButton>
      <ToggleButton value="MANUAL" sx={{ color: mode === 'MANUAL' ? '#42a5f5' : undefined, '&.Mui-selected': { bgcolor: 'rgba(66,165,245,0.15)', color: '#42a5f5' } }}>Manual</ToggleButton>
      <ToggleButton value="MAINTENANCE" sx={{ color: mode === 'MAINTENANCE' ? '#ffa726' : undefined, '&.Mui-selected': { bgcolor: 'rgba(255,167,38,0.15)', color: '#ffa726' } }}>Maint.</ToggleButton>
    </ToggleButtonGroup>
  );
}

// ─── Control Buttons ─────────────────────────────────────────────────────

function ControlButtons({ state, plugin }: { state: MachineState; plugin: MachineControlPlugin }) {
  const canStart = state === 'IDLE';
  const canStop = state === 'RUNNING' || state === 'HELD';
  const canReset = state === 'STOPPED' || state === 'ERROR';
  const isError = state === 'ERROR';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      <Box sx={{ display: 'flex', gap: 0.75 }}>
        <Button
          variant="contained"
          size="small"
          disabled={!canStart}
          onClick={() => plugin.start()}
          sx={{
            flex: 1, fontSize: 11, fontWeight: 700, textTransform: 'none',
            bgcolor: canStart ? '#66bb6a' : undefined,
            '&:hover': { bgcolor: canStart ? '#4caf50' : undefined },
          }}
        >
          Start
        </Button>
        <Button
          variant="contained"
          size="small"
          disabled={!canStop}
          onClick={() => plugin.stop()}
          sx={{
            flex: 1, fontSize: 11, fontWeight: 700, textTransform: 'none',
            bgcolor: canStop ? 'rgba(255,255,255,0.15)' : undefined,
          }}
        >
          Stop
        </Button>
        <Button
          variant="outlined"
          size="small"
          disabled={!canReset}
          onClick={() => isError ? plugin.clearError() : plugin.reset()}
          sx={{ flex: 1, fontSize: 11, fontWeight: 700, textTransform: 'none' }}
        >
          {isError ? 'Clear' : 'Reset'}
        </Button>
      </Box>
      <Button
        variant="contained"
        size="small"
        onClick={() => plugin.emergencyStop()}
        disabled={isError}
        sx={{
          fontSize: 11, fontWeight: 700, textTransform: 'none',
          bgcolor: '#d32f2f',
          color: '#fff',
          '&:hover': { bgcolor: '#b71c1c' },
          '&.Mui-disabled': { bgcolor: 'rgba(211,47,47,0.3)', color: 'rgba(255,255,255,0.3)' },
        }}
      >
        EMERGENCY STOP
      </Button>
    </Box>
  );
}

// ─── Component Status Icon ───────────────────────────────────────────────

function StatusIcon({ status }: { status: ComponentStatus }) {
  if (status === 'running' || status === 'active') {
    return <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.7)', flexShrink: 0 }} />;
  }
  if (status === 'error') {
    return <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#ef5350', flexShrink: 0, boxShadow: '0 0 6px #ef5350' }} />;
  }
  // stopped / inactive
  return <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />;
}

function statusLabel(status: ComponentStatus): string {
  switch (status) {
    case 'running': return 'RUN';
    case 'stopped': return 'OFF';
    case 'active': return 'ON';
    case 'inactive': return 'OFF';
    case 'error': return 'ERR';
    default: return '--';
  }
}

// ─── Component Row ───────────────────────────────────────────────────────

function ComponentRow({
  component,
  isHighlighted,
  onHover,
  onClick,
  onLeave,
  rowRef,
}: {
  component: MachineComponent;
  isHighlighted: boolean;
  onHover: () => void;
  onClick: () => void;
  onLeave: () => void;
  rowRef?: React.Ref<HTMLDivElement>;
}) {
  const statusColor = component.status === 'error' ? '#ef5350'
    : (component.status === 'running' || component.status === 'active') ? 'rgba(255,255,255,0.6)'
    : 'rgba(255,255,255,0.35)';

  return (
    <Box
      ref={rowRef}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onClick}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1,
        px: 1, py: 0.5, cursor: 'pointer',
        borderRadius: 1,
        bgcolor: isHighlighted ? 'rgba(79,195,247,0.1)' : 'transparent',
        '&:hover': { bgcolor: 'rgba(79,195,247,0.08)' },
        transition: 'background-color 0.15s',
      }}
    >
      <StatusIcon status={component.status} />
      <Typography sx={{
        fontSize: 12, color: 'text.primary', flex: 1, overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {component.name}
      </Typography>
      <Typography sx={{
        fontSize: 10, fontWeight: 600, fontFamily: 'monospace',
        color: statusColor, minWidth: 28, textAlign: 'right',
      }}>
        {statusLabel(component.status)}
      </Typography>
    </Box>
  );
}

// ─── Component List ──────────────────────────────────────────────────────

function ComponentList({
  components,
  plugin,
  highlightedPath,
}: {
  components: MachineComponent[];
  plugin: MachineControlPlugin;
  highlightedPath: string | null;
}) {
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Scroll to highlighted row when 3D click changes it
  useEffect(() => {
    if (highlightedPath) {
      const el = rowRefs.current.get(highlightedPath);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [highlightedPath]);

  if (components.length === 0) {
    return (
      <Box sx={{ px: 1.5, py: 2, textAlign: 'center' }}>
        <Typography sx={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>
          No components found in model
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
      {components.map((comp, _i) => (
        <ComponentRow
          key={comp.path || comp.name}
          component={comp}
          isHighlighted={highlightedPath === comp.path}
          onHover={() => plugin.hoverComponent(comp.path)}
          onClick={() => plugin.clickComponent(comp.path)}
          onLeave={() => plugin.leaveComponent()}
          rowRef={(el: HTMLDivElement | null) => {
            if (el) rowRefs.current.set(comp.path, el);
            else rowRefs.current.delete(comp.path);
          }}
        />
      ))}
    </Box>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────────

export function MachineControlPanel() {
  const viewer = useViewer();
  const isMobile = useMobileLayout();
  const controlState = useMachineControl();
  const plugin = viewer.getPlugin<MachineControlPlugin>('machine-control');
  const lpm = viewer.leftPanelManager;

  // Subscribe to leftPanelManager to know if we're open
  const panelSnapshot = useSyncExternalStore(lpm.subscribe, lpm.getSnapshot);
  const isOpen = panelSnapshot.activePanel === 'machine-control';

  // Track 3D-clicked component path for highlighting in the panel
  const highlightedPathRef = useRef<string | null>(null);
  const forceUpdate = useCallback(() => {
    // Force re-render by toggling ref value (simple approach)
    highlightedPathRef.current = highlightedPathRef.current;
  }, []);

  // Listen for 3D object clicks to highlight corresponding component row
  useEffect(() => {
    if (!isOpen) return;
    const off = viewer.on('object-clicked', ({ path }: { path: string }) => {
      // Check if the clicked object matches any component
      const match = controlState.components.find(c => c.path === path || path.startsWith(c.path + '/'));
      highlightedPathRef.current = match?.path ?? null;
      forceUpdate();
    });
    return off;
  }, [viewer, isOpen, controlState.components, forceUpdate]);

  const handleClose = useCallback(() => {
    lpm.close('machine-control');
  }, [lpm]);

  const handleModeChange = useCallback((mode: MachineMode) => {
    plugin?.setMode(mode);
  }, [plugin]);

  if (!isOpen || !plugin) return null;

  return (
    <LeftPanel
      title={
        <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
          Machine Control
        </Typography>
      }
      onClose={handleClose}
      width={MACHINE_PANEL_WIDTH}
      mobile={isMobile ? 'full-screen' : undefined}
      headerSx={{ px: 1.5, py: 0.75 }}
    >
      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
        {/* State + Mode Section */}
        <Box sx={{ px: 1.5, py: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1, fontSize: 10 }}>
              State
            </Typography>
            <Box sx={{ mt: 0.5 }}>
              <StateBadge state={controlState.state} />
            </Box>
          </Box>

          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1, fontSize: 10 }}>
              Mode
            </Typography>
            <Box sx={{ mt: 0.5 }}>
              <ModeSelector mode={controlState.mode} onModeChange={handleModeChange} />
            </Box>
          </Box>
        </Box>

        {/* Controls Section */}
        <Box sx={{ px: 1.5, py: 1, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1, fontSize: 10 }}>
            Controls
          </Typography>
          <Box sx={{ mt: 0.75 }}>
            <ControlButtons state={controlState.state} plugin={plugin} />
          </Box>
        </Box>

        {/* Components Section */}
        <Box sx={{ px: 0.5, py: 1, borderTop: '1px solid rgba(255,255,255,0.06)', flex: 1, minHeight: 0, overflow: 'auto' }}>
          <Box sx={{ px: 1, mb: 0.5 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1, fontSize: 10 }}>
              Components ({controlState.components.length})
            </Typography>
          </Box>
          <ComponentList
            components={controlState.components}
            plugin={plugin}
            highlightedPath={highlightedPathRef.current}
          />
        </Box>
      </Box>
    </LeftPanel>
  );
}
