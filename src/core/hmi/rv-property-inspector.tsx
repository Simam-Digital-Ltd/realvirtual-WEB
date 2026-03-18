/**
 * PropertyInspector — Editable property panel for the selected hierarchy node.
 *
 * Shows component properties grouped by type (Drive, Sensor, TransportSurface, etc.).
 * - CONSUMED fields: editable with appropriate widgets
 * - IGNORED / unknown fields: read-only, grayed out with "Not used" tooltip
 * - Override indicators: blue dot for fields that differ from GLB defaults
 * - Per-field and per-node reset to GLB defaults
 * - LogicStep runtime status section (state, progress, cycle stats)
 *
 * Positioned to the right of the hierarchy panel when a node is selected.
 *
 * Sub-modules:
 * - rv-inspector-helpers.ts  — Pure functions + constants (shared with hierarchy browser)
 * - rv-field-editors.tsx     — Inline editor widgets (Number, Boolean, Enum, etc.)
 * - rv-reference-display.tsx — ComponentReference and ScriptableObject badges
 * - rv-field-row.tsx         — Single field row component
 * - rv-component-section.tsx — Collapsible component section
 */

import { useState, useMemo, useCallback, useSyncExternalStore } from 'react';
import { useSignalTick } from '../../hooks/use-signal-tick';
import {
  Paper,
  Box,
  Typography,
  IconButton,
  Tooltip,
  Button,
  Chip,
  LinearProgress,
} from '@mui/material';
import {
  Close,
  RestartAlt,
  FilterList,
} from '@mui/icons-material';
import type { RVViewer } from '../rv-viewer';
import { RvExtrasEditorPlugin } from './rv-extras-editor';
import { getOverriddenFields } from '../engine/rv-extras-overlay-store';
import { useMobileLayout } from '../../hooks/use-mobile-layout';
import {
  isHiddenComponentType,
  isComponentRef,
  componentColor,
  pathsMatch,
  getSignalDisplayValue,
  type ReverseReference,
} from './rv-inspector-helpers';
import { navigateToRef } from './rv-reference-display';
import { ComponentSection } from './rv-component-section';
import { StepState } from '../engine/rv-logic-step';
import type { StepStateInfo } from '../engine/rv-logic-engine';
import { STEP_STATE_COLORS, STEP_STATE_LABELS } from './rv-logic-step-colors';

// Re-export isHiddenComponentType for backward compatibility
export { isHiddenComponentType } from './rv-inspector-helpers';

// ── Consumed-only filter persistence ────────────────────────────────────

const LS_KEY_CONSUMED_ONLY = 'rv-inspector-consumed-only';

function loadConsumedOnly(): boolean {
  try { return localStorage.getItem(LS_KEY_CONSUMED_ONLY) === 'true'; }
  catch { return false; }
}

// ── LogicStep Runtime Section ─────────────────────────────────────────────

interface RuntimeFieldRowProps {
  label: string;
  value: string;
  color?: string;
}

function RuntimeFieldRow({ label, value, color }: RuntimeFieldRowProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.15 }}>
      <Typography sx={{ fontSize: 10, color: 'text.disabled', width: 100, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 10, color: color ?? 'text.primary', fontWeight: 500 }}>
        {value}
      </Typography>
    </Box>
  );
}

function LogicStepRuntimeSection({ info }: { info: StepStateInfo }) {
  const stateColor = STEP_STATE_COLORS[info.state];
  const stateLabel = STEP_STATE_LABELS[info.state];

  return (
    <Box sx={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
      {/* Section header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 1,
          py: 0.5,
          bgcolor: stateColor + '18',
          borderBottom: `2px solid ${stateColor}44`,
        }}
      >
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: stateColor,
            mr: 0.75,
            flexShrink: 0,
          }}
        />
        <Typography sx={{ fontSize: 10, fontWeight: 700, color: stateColor, textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 }}>
          Runtime Status
        </Typography>
        <Typography sx={{ fontSize: 9, color: stateColor, fontWeight: 600 }}>
          {stateLabel}
        </Typography>
      </Box>

      {/* Runtime fields */}
      <Box sx={{ py: 0.5 }}>
        <RuntimeFieldRow label="State" value={info.state} color={stateColor} />
        <RuntimeFieldRow label="Type" value={info.type} />

        {/* Progress bar */}
        <Box sx={{ px: 1, py: 0.25 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: 10, color: 'text.disabled', width: 100, flexShrink: 0 }}>
              Progress
            </Typography>
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <LinearProgress
                variant="determinate"
                value={Math.min(100, info.progress)}
                sx={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  bgcolor: 'rgba(255,255,255,0.06)',
                  '& .MuiLinearProgress-bar': { bgcolor: stateColor, borderRadius: 2 },
                }}
              />
              <Typography sx={{ fontSize: 9, color: 'text.secondary', minWidth: 28, textAlign: 'right' }}>
                {info.progress.toFixed(0)}%
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* SerialContainer-specific fields */}
        {info.type === 'SerialContainer' && (
          <>
            {info.currentIndex !== undefined && info.childCount !== undefined && (
              <RuntimeFieldRow label="Current Step" value={`${info.currentIndex + 1} / ${info.childCount}`} />
            )}
            {info.completedCycles !== undefined && (
              <RuntimeFieldRow label="Completed Cycles" value={info.completedCycles.toString()} />
            )}
            {info.minCycleTime !== undefined && info.minCycleTime > 0 && (
              <RuntimeFieldRow label="Min Cycle Time" value={`${info.minCycleTime.toFixed(3)}s`} />
            )}
            {info.maxCycleTime !== undefined && info.maxCycleTime > 0 && (
              <RuntimeFieldRow label="Max Cycle Time" value={`${info.maxCycleTime.toFixed(3)}s`} />
            )}
            {info.medianCycleTime !== undefined && info.medianCycleTime > 0 && (
              <RuntimeFieldRow label="Median Cycle Time" value={`${info.medianCycleTime.toFixed(3)}s`} />
            )}
          </>
        )}

        {/* ParallelContainer-specific fields */}
        {info.type === 'ParallelContainer' && info.finishedCount !== undefined && info.childCount !== undefined && (
          <RuntimeFieldRow label="Finished" value={`${info.finishedCount} / ${info.childCount}`} />
        )}

        {/* Delay-specific fields */}
        {info.type === 'Delay' && info.elapsed !== undefined && info.duration !== undefined && (
          <RuntimeFieldRow label="Elapsed" value={`${info.elapsed.toFixed(2)}s / ${info.duration.toFixed(2)}s`} />
        )}
      </Box>
    </Box>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

export interface PropertyInspectorProps {
  viewer: RVViewer;
}

export function PropertyInspector({ viewer }: PropertyInspectorProps) {
  const plugin = viewer.getPlugin<RvExtrasEditorPlugin>('rv-extras-editor');
  if (!plugin) return null;

  const state = useSyncExternalStore(plugin.subscribe, plugin.getSnapshot);
  const selectedPath = state.selectedNodePath;

  // Find the selected node in the scene and read its userData
  const nodeData = useMemo(() => {
    if (!selectedPath || !viewer.registry) return null;

    const node = viewer.registry.getNode(selectedPath);
    if (!node) return null;

    const rv = node.userData?.realvirtual as Record<string, Record<string, unknown>> | undefined;
    if (!rv) return null;

    // Collect component types and their data (skip hidden types)
    const components: Array<{ type: string; data: Record<string, unknown> }> = [];
    for (const [key, value] of Object.entries(rv)) {
      if (isHiddenComponentType(key)) continue;
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        components.push({ type: key, data: value as Record<string, unknown> });
      }
    }

    return { components };
  }, [selectedPath, viewer.registry, state.overlay]);

  // Check if the selected node has a LogicStep component
  const hasLogicStep = nodeData?.components.some(c => c.type.startsWith('LogicStep_')) ?? false;

  // Get logic step runtime info
  const logicEngine = viewer.logicEngine;
  const stepInfo = hasLogicStep && logicEngine && selectedPath
    ? logicEngine.getStepInfo(selectedPath)
    : null;

  // Find reverse references: who points to this node via ComponentReference?
  const referencedBy = useMemo<ReverseReference[]>(() => {
    if (!selectedPath || !viewer.registry) return [];
    const results: ReverseReference[] = [];
    viewer.registry.forEachNode((path, node) => {
      if (path === selectedPath) return; // Skip self
      const rv = node.userData?.realvirtual as Record<string, Record<string, unknown>> | undefined;
      if (!rv) return;
      for (const [compType, compData] of Object.entries(rv)) {
        if (typeof compData !== 'object' || compData === null) continue;
        for (const [fieldName, value] of Object.entries(compData as Record<string, unknown>)) {
          if (isComponentRef(value) && pathsMatch(value.path, selectedPath)) {
            results.push({ sourcePath: path, fieldName, componentType: compType });
          }
        }
      }
    });
    return results;
  }, [selectedPath, viewer.registry]);

  // Count total overrides for this node
  const totalOverrides = useMemo(() => {
    if (!selectedPath || !state.overlay) return 0;
    const nodeOverrides = state.overlay.nodes[selectedPath];
    if (!nodeOverrides) return 0;
    let count = 0;
    for (const comp of Object.values(nodeOverrides)) {
      count += Object.keys(comp).length;
    }
    return count;
  }, [selectedPath, state.overlay]);

  const handleFieldEdit = useCallback(
    (componentType: string, fieldName: string, value: unknown) => {
      if (!selectedPath) return;
      plugin.updateOverlayField(selectedPath, componentType, fieldName, value);
    },
    [plugin, selectedPath],
  );

  const handleFieldReset = useCallback(
    (componentType: string, fieldName: string) => {
      if (!selectedPath) return;
      plugin.resetField(selectedPath, componentType, fieldName);
    },
    [plugin, selectedPath],
  );

  const handleComponentReset = useCallback(
    (componentType: string) => {
      if (!selectedPath) return;
      plugin.resetComponent(selectedPath, componentType);
    },
    [plugin, selectedPath],
  );

  const handleResetAll = useCallback(() => {
    if (!selectedPath) return;
    plugin.resetNode(selectedPath);
  }, [plugin, selectedPath]);

  const handleClose = useCallback(() => {
    plugin.clearSelection();
  }, [plugin]);

  const isMobile = useMobileLayout();

  // Consumed-only filter: hide non-consumed (grayed-out) fields
  const [consumedOnly, setConsumedOnly] = useState(loadConsumedOnly);
  const toggleConsumedOnly = useCallback(() => {
    setConsumedOnly(prev => {
      const next = !prev;
      try { localStorage.setItem(LS_KEY_CONSUMED_ONLY, String(next)); } catch { /* */ }
      return next;
    });
  }, []);

  // Shared signal polling for live display in signal reference badges (consolidated via hook)
  const signalStore = viewer.signalStore;
  useSignalTick(signalStore, 200);

  if (!selectedPath || !nodeData) return null;

  const nodeName = selectedPath.split('/').pop() ?? selectedPath;

  // Show runtime section only when step is not Idle (matching C# ShowIf pattern)
  const showRuntimeSection = stepInfo && stepInfo.state !== StepState.Idle;

  return (
    <Paper
      elevation={4}
      sx={{
        position: 'fixed',
        left: isMobile ? 0 : state.panelWidth + 16,
        top: isMobile ? 44 : 44,
        bottom: isMobile ? 0 : 8,
        right: isMobile ? 0 : 'auto',
        width: isMobile ? '100%' : 320,
        zIndex: 1200,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        pointerEvents: 'auto',
        borderRadius: isMobile ? 0 : 2,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 1,
          py: 0.25,
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {nodeName}
          </Typography>
          <Typography sx={{ fontSize: 9, color: 'text.disabled', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selectedPath}
          </Typography>
        </Box>
        <Tooltip title={consumedOnly ? 'Showing active fields only \u2014 click to show all' : 'Click to show only active fields'}>
          <IconButton size="small" onClick={toggleConsumedOnly} sx={{ color: consumedOnly ? '#66bb6a' : 'text.secondary', p: 0.25 }}>
            <FilterList sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
        <IconButton size="small" onClick={handleClose} sx={{ color: 'text.secondary', p: 0.25 }}>
          <Close sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>

      {/* Scrollable content */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.1)', borderRadius: 3 },
        }}
      >
        {/* LogicStep Runtime Status (above component sections, hidden when Idle) */}
        {showRuntimeSection && <LogicStepRuntimeSection info={stepInfo} />}

        {nodeData.components.length === 0 ? (
          <Typography sx={{ fontSize: 12, color: 'text.disabled', textAlign: 'center', py: 4 }}>
            No component data
          </Typography>
        ) : (
          nodeData.components.map(({ type, data }) => {
            const overriddenFields = new Set(
              state.overlay ? getOverriddenFields(selectedPath, type, state.overlay) : [],
            );
            return (
              <ComponentSection
                key={type}
                nodePath={selectedPath}
                componentType={type}
                data={data}
                overriddenFields={overriddenFields}
                consumedOnly={consumedOnly}
                signalValue={getSignalDisplayValue(signalStore, selectedPath, type, data)}
                onFieldEdit={(fieldName, value) => handleFieldEdit(type, fieldName, value)}
                onFieldReset={(fieldName) => handleFieldReset(type, fieldName)}
                onResetComponent={() => handleComponentReset(type)}
                viewer={viewer}
                signalStore={signalStore}
              />
            );
          })
        )}
      </Box>

      {/* Referenced by section */}
      {referencedBy.length > 0 && (
        <Box sx={{ px: 1, py: 0.75, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <Typography sx={{ fontSize: 9, color: 'text.disabled', mb: 0.5, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
            Referenced by
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {referencedBy.map((ref, i) => {
              const sourceName = ref.sourcePath.split('/').pop() ?? ref.sourcePath;
              const color = componentColor(ref.componentType);
              return (
                <Tooltip key={i} title={`${ref.sourcePath} \u2192 ${ref.fieldName}\nClick to navigate`} placement="top">
                  <Chip
                    label={`${sourceName}.${ref.fieldName}`}
                    size="small"
                    onClick={() => navigateToRef(viewer, ref.sourcePath)}
                    sx={{
                      height: 16,
                      fontSize: 9,
                      fontWeight: 500,
                      cursor: 'pointer',
                      bgcolor: color + '18',
                      color: color,
                      border: `1px solid ${color}44`,
                      '& .MuiChip-label': { px: 0.5 },
                      '&:hover': { bgcolor: color + '28' },
                    }}
                  />
                </Tooltip>
              );
            })}
          </Box>
        </Box>
      )}

      {/* Footer */}
      <Box
        sx={{
          px: 1,
          py: 0.5,
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Typography sx={{ fontSize: 10, color: 'text.disabled', flex: 1 }}>
          {totalOverrides > 0
            ? `${totalOverrides} override${totalOverrides !== 1 ? 's' : ''}`
            : 'No overrides'}
        </Typography>
        {totalOverrides > 0 && (
          <Button
            size="small"
            variant="text"
            startIcon={<RestartAlt sx={{ fontSize: 12 }} />}
            onClick={handleResetAll}
            sx={{
              fontSize: 10,
              textTransform: 'none',
              color: '#ffa726',
              py: 0,
              px: 0.5,
              minWidth: 0,
              '&:hover': { bgcolor: 'rgba(255,167,38,0.1)' },
            }}
          >
            Reset All
          </Button>
        )}
      </Box>
    </Paper>
  );
}
