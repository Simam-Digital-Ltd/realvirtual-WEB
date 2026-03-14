/**
 * HierarchyBrowser — Tree view of all GLB nodes with rv extras.
 *
 * Features:
 * - Search filter (case-insensitive path substring)
 * - Type filter buttons (All, Drives, Sensors, Signals, Logic)
 * - Component type badges with live signal values
 * - LogicStep status dots with ISA-101 colors and pulse animation
 * - Container progress counters (3/7 for Serial, 2/4 done for Parallel)
 * - Click to select (updates plugin state)
 * - Resizable width (drag right edge)
 * - Node count footer
 * - Reveal-and-scroll: external code can call plugin.selectAndReveal(path)
 *   to expand ancestor tree nodes and scroll the selected node into view
 */

import { useState, useMemo, useCallback, useRef, useEffect, useSyncExternalStore, memo } from 'react';
import { useSignalTick } from '../../hooks/use-signal-tick';
import {
  Paper,
  Box,
  Typography,
  TextField,
  IconButton,
  Collapse,
  InputAdornment,
  Chip,
  useMediaQuery,
} from '@mui/material';
import {
  Close,
  Search,
  ExpandMore,
  ChevronRight,
} from '@mui/icons-material';
import type { RVViewer } from '../rv-viewer';
import { RvExtrasEditorPlugin, type EditableNodeInfo } from './rv-extras-editor';
import type { RVExtrasOverlay } from '../engine/rv-extras-overlay-store';
import type { SignalStore } from '../engine/rv-signal-store';
import type { RVLogicEngine, StepStateInfo } from '../engine/rv-logic-engine';
import { StepState } from '../engine/rv-logic-step';
import { STEP_STATE_COLORS, STEP_STATE_LABELS } from './rv-logic-step-colors';
import { MOBILE_BREAKPOINT } from '../../hooks/use-mobile-layout';
import { componentColor } from './rv-inspector-helpers';
import { useVirtualizer } from '@tanstack/react-virtual';

// ─── CSS Pulse Animation ─────────────────────────────────────────────────

const PULSE_STYLE_ID = 'rv-pulse-keyframes';

function ensurePulseAnimation(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(PULSE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PULSE_STYLE_ID;
  style.textContent = `
    @keyframes rv-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50%      { opacity: 0.4; transform: scale(0.75); }
    }
    @media (prefers-reduced-motion: reduce) {
      @keyframes rv-pulse {
        0%, 100% { opacity: 0.7; }
      }
    }
  `;
  document.head.appendChild(style);
}

// ─── Type Filter ─────────────────────────────────────────────────────────

type TypeFilter = 'all' | 'drives' | 'sensors' | 'signals' | 'logic';

const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'drives', label: 'Drives' },
  { key: 'sensors', label: 'Sensors' },
  { key: 'signals', label: 'Signals' },
  { key: 'logic', label: 'Logic' },
];

function matchesTypeFilter(types: string[], filter: TypeFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'drives') return types.some(t => t === 'Drive' || t.startsWith('Drive_'));
  if (filter === 'sensors') return types.some(t => t === 'Sensor');
  if (filter === 'signals') return types.some(t => t.startsWith('PLCInput') || t.startsWith('PLCOutput'));
  if (filter === 'logic') return types.some(t => t.startsWith('LogicStep_'));
  return true;
}

// ─── Tree Data Structure ─────────────────────────────────────────────────

interface TreeNode {
  name: string;
  path: string | null;
  types: string[];
  hasOverrides: boolean;
  children: TreeNode[];
}

function buildTree(
  nodes: EditableNodeInfo[],
  overlay: RVExtrasOverlay | null,
): TreeNode[] {
  const root: TreeNode = { name: '', path: null, types: [], hasOverrides: false, children: [] };

  for (const info of nodes) {
    const segments = info.path.split('/');
    let current = root;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const isLast = i === segments.length - 1;

      const fullPath = segments.slice(0, i + 1).join('/');
      let child = current.children.find((c) => c.name === seg);
      if (!child) {
        child = {
          name: seg,
          path: fullPath,
          types: isLast ? info.types : [],
          hasOverrides: false,
          children: [],
        };
        current.children.push(child);
      }

      if (isLast) {
        child.path = info.path;
        child.types = info.types;
        child.hasOverrides = overlay ? !!overlay.nodes[info.path] : false;
      }

      current = child;
    }
  }

  return root.children;
}

function filterTree(nodes: TreeNode[], term: string): TreeNode[] {
  if (!term) return nodes;
  const lower = term.toLowerCase();

  function filterRecursive(node: TreeNode): TreeNode | null {
    const nameMatches = node.name.toLowerCase().includes(lower);
    const pathMatches = node.path ? node.path.toLowerCase().includes(lower) : false;

    const filteredChildren: TreeNode[] = [];
    for (const child of node.children) {
      const result = filterRecursive(child);
      if (result) filteredChildren.push(result);
    }

    if (nameMatches || pathMatches || filteredChildren.length > 0) {
      return { ...node, children: filteredChildren };
    }
    return null;
  }

  const result: TreeNode[] = [];
  for (const node of nodes) {
    const filtered = filterRecursive(node);
    if (filtered) result.push(filtered);
  }
  return result;
}

function countNodes(nodes: EditableNodeInfo[], overlay: RVExtrasOverlay | null): { total: number; withOverrides: number } {
  let withOverrides = 0;
  if (overlay) {
    for (const info of nodes) {
      if (overlay.nodes[info.path]) withOverrides++;
    }
  }
  return { total: nodes.length, withOverrides };
}

// ─── Signal Helpers ──────────────────────────────────────────────────────

function isSignalType(type: string): boolean {
  return type.startsWith('PLCInput') || type.startsWith('PLCOutput');
}

function isBoolSignal(type: string): boolean {
  return type.includes('Bool');
}

/** Split types into [nonSignals, signals] so signals render last (right-most). */
function splitTypes(types: string[]): [string[], string[]] {
  const nonSignals: string[] = [];
  const signals: string[] = [];
  for (const t of types) {
    if (isSignalType(t)) signals.push(t);
    else nonSignals.push(t);
  }
  return [nonSignals, signals];
}

/** Format a signal value for badge display. */
function formatSignalValue(type: string, signalStore: SignalStore | null, path: string | null): string {
  if (!signalStore || !path) return '\u2014';
  const value = signalStore.getByPath(path);
  if (value === undefined) return '\u2014';

  if (isBoolSignal(type)) {
    return value === true ? '\u25CF' : '\u25CB'; // filled or hollow circle
  }

  if (typeof value === 'number') {
    return type.includes('Int') ? Math.trunc(value).toString() : value.toFixed(1);
  }
  return '\u2014';
}

// ─── LogicStep Helpers ───────────────────────────────────────────────────

function isLogicStepType(type: string): boolean {
  return type.startsWith('LogicStep_');
}

/** Get badge color for a component type — dynamic for LogicStep types. */
function badgeColor(type: string, stepState?: StepState): string {
  if (isLogicStepType(type) && stepState !== undefined) {
    return STEP_STATE_COLORS[stepState];
  }
  return componentColor(type);
}

/** Get step info from the logic engine for a given hierarchy path. */
function getStepInfoForPath(engine: RVLogicEngine | null, path: string | null): StepStateInfo | null {
  if (!engine || !path) return null;
  return engine.getStepInfo(path);
}

/** Format container progress text. */
function formatContainerProgress(info: StepStateInfo): string | null {
  if (info.type === 'SerialContainer' && info.currentIndex !== undefined && info.childCount !== undefined) {
    return `${info.currentIndex + 1}/${info.childCount}`;
  }
  if (info.type === 'ParallelContainer' && info.finishedCount !== undefined && info.childCount !== undefined) {
    return `${info.finishedCount}/${info.childCount} done`;
  }
  if (info.type === 'Delay' && info.elapsed !== undefined && info.duration !== undefined) {
    return `${info.elapsed.toFixed(1)}s/${info.duration.toFixed(1)}s`;
  }
  return null;
}

// ─── Badge label ─────────────────────────────────────────────────────────

function badgeLabel(type: string, stepState?: StepState): string {
  if (isLogicStepType(type)) {
    const shortType = type.replace('LogicStep_', 'LS:');
    if (stepState !== undefined) {
      return `${shortType} ${STEP_STATE_LABELS[stepState]}`;
    }
    return shortType;
  }
  if (type === 'TransportSurface') return 'TS';
  if (type === 'DrivesRecorder') return 'Rec';
  if (type === 'ReplayRecording') return 'Replay';
  if (type === 'PLCOutputBool') return 'OutBool';
  if (type === 'PLCOutputFloat') return 'OutFloat';
  if (type === 'PLCOutputInt') return 'OutInt';
  if (type === 'PLCInputBool') return 'InBool';
  if (type === 'PLCInputFloat') return 'InFloat';
  if (type === 'PLCInputInt') return 'InInt';
  if (type.startsWith('PLCOutput')) return 'Out:' + type.replace('PLCOutput', '');
  if (type.startsWith('PLCInput')) return 'In:' + type.replace('PLCInput', '');
  if (type.startsWith('Drive_')) return type.replace('Drive_', 'D:');
  return type;
}

// ─── Badge Chip ─────────────────────────────────────────────────────────

function BadgeChip({ color, label }: { color: string; label: string }) {
  return (
    <Chip
      label={label}
      size="small"
      sx={{
        height: 14,
        fontSize: 8,
        fontWeight: 600,
        letterSpacing: 0.3,
        bgcolor: color + '22',
        color: color,
        border: `1px solid ${color}44`,
        '& .MuiChip-label': { px: 0.4, py: 0 },
      }}
    />
  );
}

// ─── Step Status Dot ─────────────────────────────────────────────────────

function StepStateDot({ stepState }: { stepState: StepState }) {
  return (
    <Box
      sx={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        bgcolor: STEP_STATE_COLORS[stepState],
        flexShrink: 0,
        mr: 0.5,
        animation: stepState === StepState.Active
          ? 'rv-pulse 1.5s ease-in-out infinite' : 'none',
      }}
    />
  );
}

// ─── Container Progress Badge ─────────────────────────────────────────────

function ContainerProgressBadge({ text }: { text: string }) {
  return (
    <Typography
      component="span"
      sx={{
        fontSize: 8,
        fontFamily: 'monospace',
        color: 'text.secondary',
        ml: 0.25,
        flexShrink: 0,
      }}
    >
      {text}
    </Typography>
  );
}

// ─── Badges Row ─────────────────────────────────────────────────────────

/** Renders component badges + signal badges (signals always right-most with live values). */
function NodeBadges({
  types,
  signalStore,
  path,
  stepInfo,
}: {
  types: string[];
  signalStore: SignalStore | null;
  path: string | null;
  stepInfo?: StepStateInfo | null;
}) {
  const [nonSignalTypes, signalTypes] = useMemo(() => splitTypes(types), [types]);

  if (nonSignalTypes.length === 0 && signalTypes.length === 0) return null;

  const stepState = stepInfo?.state;
  const progressText = stepInfo ? formatContainerProgress(stepInfo) : null;

  return (
    <Box sx={{ display: 'flex', gap: 0.25, flexShrink: 0, ml: 'auto', alignItems: 'center' }}>
      {nonSignalTypes.map((type) => (
        <BadgeChip
          key={type}
          color={badgeColor(type, isLogicStepType(type) ? stepState : undefined)}
          label={badgeLabel(type, isLogicStepType(type) ? stepState : undefined)}
        />
      ))}
      {progressText && <ContainerProgressBadge text={progressText} />}
      {signalTypes.length > 0 && nonSignalTypes.length > 0 && (
        <Box sx={{ width: 2, flexShrink: 0 }} />
      )}
      {signalTypes.map((type) => (
        <BadgeChip
          key={type}
          color={componentColor(type)}
          label={`${badgeLabel(type)} ${formatSignalValue(type, signalStore, path)}`}
        />
      ))}
    </Box>
  );
}

// ─── Hierarchy expand state persistence ──────────────────────────────────

const LS_KEY_TREE_EXPANDED = 'rv-hierarchy-expanded';

function loadTreeExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY_TREE_EXPANDED);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}

/** Debounce timer for batching LS writes of expanded state. */
let expandPersistTimer: ReturnType<typeof setTimeout> | null = null;

function persistTreeExpandedSet(expanded: Set<string>): void {
  if (expandPersistTimer) clearTimeout(expandPersistTimer);
  expandPersistTimer = setTimeout(() => {
    localStorage.setItem(LS_KEY_TREE_EXPANDED, JSON.stringify([...expanded]));
  }, 300);
}

// ─── Ancestor path computation ──────────────────────────────────────────

/** Compute all ancestor path segments for a given path.
 *  E.g. "A/B/C/D" -> ["A", "A/B", "A/B/C"] */
export function computeAncestors(path: string): string[] {
  const segments = path.split('/');
  const ancestors: string[] = [];
  for (let i = 0; i < segments.length - 1; i++) {
    ancestors.push(segments.slice(0, i + 1).join('/'));
  }
  return ancestors;
}

// ─── Tree Node Renderer (lifted expand state) ───────────────────────────

interface TreeNodeRowProps {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  expanded: Set<string>;
  onToggleExpand: (key: string) => void;
  onSelect: (path: string) => void;
  onDoubleClick: (path: string) => void;
  onHover: (path: string | null) => void;
  signalStore: SignalStore | null;
  logicEngine: RVLogicEngine | null;
}

const TreeNodeRow = memo(function TreeNodeRow({
  node,
  depth,
  selectedPath,
  expanded,
  onToggleExpand,
  onSelect,
  onDoubleClick,
  onHover,
  signalStore,
  logicEngine,
}: TreeNodeRowProps) {
  const expandKey = node.path ?? node.name;
  const isExpanded = expanded.has(expandKey);
  const hasChildren = node.children.length > 0;
  const hasComponents = node.types.length > 0;
  const isSelected = hasComponents && node.path === selectedPath;

  // Check if this node has a LogicStep component
  const hasLogicStep = node.types.some(isLogicStepType);
  const stepInfo = hasLogicStep ? getStepInfoForPath(logicEngine, node.path) : null;

  const handleClick = useCallback(() => {
    if (hasComponents && node.path) {
      onSelect(node.path);
    } else {
      onToggleExpand(expandKey);
    }
  }, [hasComponents, node.path, onSelect, onToggleExpand, expandKey]);

  const handleDblClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.path) onDoubleClick(node.path);
  }, [node.path, onDoubleClick]);

  const handleExpandClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpand(expandKey);
  }, [onToggleExpand, expandKey]);

  const handleMouseEnter = useCallback(() => {
    if (node.path) onHover(node.path);
  }, [node.path, onHover]);

  const handleMouseLeave = useCallback(() => {
    onHover(null);
  }, [onHover]);

  return (
    <>
      <Box
        data-path={node.path ?? undefined}
        onClick={handleClick}
        onDoubleClick={handleDblClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        sx={{
          display: 'flex',
          alignItems: 'center',
          pl: depth * 1 + 0.5,
          pr: 0.5,
          py: 0,
          cursor: 'pointer',
          borderRadius: 0.5,
          bgcolor: isSelected ? 'rgba(79, 195, 247, 0.15)' : 'transparent',
          '&:hover': {
            bgcolor: isSelected ? 'rgba(79, 195, 247, 0.2)' : 'rgba(255, 255, 255, 0.04)',
          },
          minHeight: 20,
        }}
      >
        {hasChildren ? (
          <IconButton size="small" onClick={handleExpandClick} sx={{ p: 0, mr: 0.25, color: 'text.secondary' }}>
            {isExpanded ? <ExpandMore sx={{ fontSize: 14 }} /> : <ChevronRight sx={{ fontSize: 14 }} />}
          </IconButton>
        ) : (
          <Box sx={{ width: 16, flexShrink: 0 }} />
        )}

        {/* Status dot for LogicStep nodes */}
        {stepInfo && <StepStateDot stepState={stepInfo.state} />}

        <Typography
          sx={{
            fontSize: 12,
            lineHeight: 1.3,
            fontWeight: hasComponents ? 400 : 500,
            color: isSelected ? 'primary.main' : hasComponents ? 'text.primary' : 'text.secondary',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            mr: 0.25,
          }}
        >
          {node.name}
        </Typography>

        {hasComponents && (
          <NodeBadges types={node.types} signalStore={signalStore} path={node.path} stepInfo={stepInfo} />
        )}
      </Box>

      {hasChildren && (
        <Collapse in={isExpanded} timeout={100} unmountOnExit>
          {node.children.map((child, i) => (
            <TreeNodeRow
              key={child.name + '-' + i}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              onDoubleClick={onDoubleClick}
              onHover={onHover}
              signalStore={signalStore}
              logicEngine={logicEngine}
            />
          ))}
        </Collapse>
      )}
    </>
  );
});

// ─── Flat Node Row (type-filtered view) ──────────────────────────────────

const FLAT_ROW_HEIGHT = 20;

interface FlatNodeRowProps {
  info: EditableNodeInfo;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onDoubleClick: (path: string) => void;
  onHover: (path: string | null) => void;
  signalStore: SignalStore | null;
  logicEngine: RVLogicEngine | null;
  /** Absolute positioning style from virtualizer (when virtualized). */
  virtualStyle?: React.CSSProperties;
}

function FlatNodeRow({ info, selectedPath, onSelect, onDoubleClick, onHover, signalStore, logicEngine, virtualStyle }: FlatNodeRowProps) {
  const name = info.path.split('/').pop() ?? info.path;
  const isSelected = info.path === selectedPath;

  const hasLogicStep = info.types.some(isLogicStepType);
  const stepInfo = hasLogicStep ? getStepInfoForPath(logicEngine, info.path) : null;

  const handleDblClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDoubleClick(info.path);
  }, [info.path, onDoubleClick]);

  return (
    <Box
      data-path={info.path}
      onClick={() => onSelect(info.path)}
      onDoubleClick={handleDblClick}
      onMouseEnter={() => onHover(info.path)}
      onMouseLeave={() => onHover(null)}
      style={virtualStyle}
      sx={{
        display: 'flex',
        alignItems: 'center',
        pl: 1,
        pr: 0.5,
        py: 0,
        cursor: 'pointer',
        borderRadius: 0.5,
        bgcolor: isSelected ? 'rgba(79, 195, 247, 0.15)' : 'transparent',
        '&:hover': {
          bgcolor: isSelected ? 'rgba(79, 195, 247, 0.2)' : 'rgba(255, 255, 255, 0.04)',
        },
        height: FLAT_ROW_HEIGHT,
      }}
    >
      {/* Status dot for LogicStep nodes */}
      {stepInfo && <StepStateDot stepState={stepInfo.state} />}

      <Typography
        sx={{
          fontSize: 12,
          lineHeight: 1.3,
          color: isSelected ? 'primary.main' : 'text.primary',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          mr: 0.25,
        }}
      >
        {name}
      </Typography>

      <NodeBadges types={info.types} signalStore={signalStore} path={info.path} stepInfo={stepInfo} />
    </Box>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────

export interface HierarchyBrowserProps {
  viewer: RVViewer;
}

export function HierarchyBrowser({ viewer }: HierarchyBrowserProps) {
  const plugin = viewer.getPlugin<RvExtrasEditorPlugin>('rv-extras-editor');
  if (!plugin) return null;

  // Ensure pulse animation CSS is injected
  useEffect(() => { ensurePulseAnimation(); }, []);

  const state = useSyncExternalStore(plugin.subscribe, plugin.getSnapshot);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [dragging, setDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const signalStore = viewer.signalStore;
  const logicEngine = viewer.logicEngine;

  // Consolidated live data polling at 200ms (for both signals and step states)
  useSignalTick(signalStore, 200);

  // ── Lifted expand state (shared across all TreeNodeRows) ──
  const [expanded, setExpanded] = useState<Set<string>>(() => loadTreeExpanded());

  const onToggleExpand = useCallback((key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      persistTreeExpandedSet(next);
      return next;
    });
  }, []);

  // Flat list when type filter is active (bypasses tree hierarchy)
  const flatFiltered = useMemo(() => {
    if (typeFilter === 'all') return null;
    let nodes = state.editableNodes.filter(n => matchesTypeFilter(n.types, typeFilter));
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      nodes = nodes.filter(n => n.path.toLowerCase().includes(lower));
    }
    return nodes;
  }, [state.editableNodes, typeFilter, searchTerm]);

  // Flat list virtualizer (only active when typeFilter !== 'all')
  const flatRowVirtualizer = useVirtualizer({
    count: flatFiltered?.length ?? 0,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => FLAT_ROW_HEIGHT,
    overscan: 10,
  });

  // ── Consume revealPath: expand ancestors and scroll to selected ──
  useEffect(() => {
    const revealPath = state.revealPath;
    if (!revealPath) return;

    // Expand all ancestor tree nodes
    const ancestors = computeAncestors(revealPath);
    if (ancestors.length > 0) {
      setExpanded(prev => {
        const next = new Set(prev);
        let changed = false;
        for (const a of ancestors) {
          if (!next.has(a)) { next.add(a); changed = true; }
        }
        if (changed) persistTreeExpandedSet(next);
        return changed ? next : prev;
      });
    }

    // Clear the reveal request after consuming
    plugin.clearReveal();

    // Scroll the selected node into view
    // Flat mode: use virtualizer scrollToIndex; Tree mode: use DOM scrollIntoView
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (flatFiltered) {
          // Flat virtualized list — find index and scroll via virtualizer
          const idx = flatFiltered.findIndex(n => n.path === revealPath);
          if (idx >= 0) flatRowVirtualizer.scrollToIndex(idx, { align: 'auto' });
        } else {
          // Tree mode — use DOM query
          const container = scrollContainerRef.current;
          if (!container) return;
          const el = container.querySelector(`[data-path="${CSS.escape(revealPath)}"]`);
          if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 150);
    });
  }, [state.revealPath, plugin, flatFiltered, flatRowVirtualizer]);

  // Tree view (only when typeFilter === 'all')
  const tree = useMemo(
    () => typeFilter === 'all' ? buildTree(state.editableNodes, state.overlay) : [],
    [state.editableNodes, state.overlay, typeFilter],
  );

  const filteredTree = useMemo(
    () => typeFilter === 'all' ? filterTree(tree, searchTerm) : [],
    [tree, searchTerm, typeFilter],
  );

  const counts = useMemo(
    () => countNodes(state.editableNodes, state.overlay),
    [state.editableNodes, state.overlay],
  );

  const displayCount = flatFiltered !== null ? flatFiltered.length : counts.total;

  // ── Highlight: hover + persistent selection ──
  const hoveredRef = useRef<string | null>(null);

  const highlightNode = useCallback((path: string | null) => {
    if (!path || !viewer.registry) {
      viewer.highlighter.clear();
      return;
    }
    const node = viewer.registry.getNode(path);
    if (node) {
      viewer.highlighter.highlight(node, true, { includeChildDrives: true });
    } else {
      viewer.highlighter.clear();
    }
  }, [viewer]);

  const handleHover = useCallback((path: string | null) => {
    hoveredRef.current = path;
    // Hover highlight takes priority; when mouse leaves, restore selection highlight
    if (path) {
      highlightNode(path);
    } else {
      // Restore selection highlight
      highlightNode(state.selectedNodePath);
    }
  }, [highlightNode, state.selectedNodePath]);

  const handleSelect = useCallback(
    (path: string) => {
      plugin.selectNode(path);
      highlightNode(path);
    },
    [plugin, highlightNode],
  );

  const handleDoubleClick = useCallback(
    (path: string) => {
      if (!viewer.registry) return;
      const node = viewer.registry.getNode(path);
      if (node) {
        // Compute viewport offset: hierarchy panel + inspector (if node selected)
        const leftPx = state.panelWidth + (state.selectedNodePath ? 320 : 0);
        viewer.fitToNodes([node], leftPx > 0 ? { left: leftPx } : undefined);
      }
    },
    [viewer, state.panelWidth, state.selectedNodePath],
  );

  // Keep selection highlight in sync when selectedNodePath changes externally
  useEffect(() => {
    // Only apply persistent highlight if not currently hovering something different
    if (!hoveredRef.current) {
      highlightNode(state.selectedNodePath);
    }
  }, [state.selectedNodePath, highlightNode]);

  // Clear highlight when panel closes
  useEffect(() => {
    return () => { viewer.highlighter.clear(); };
  }, [viewer]);

  const handleClose = useCallback(() => {
    viewer.highlighter.clear();
    plugin.togglePanel();
  }, [plugin, viewer]);

  // ── Resize handle ──
  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    dragStartX.current = e.clientX;
    dragStartWidth.current = state.panelWidth;

    const onMove = (ev: PointerEvent) => {
      const delta = ev.clientX - dragStartX.current;
      plugin.setPanelWidth(dragStartWidth.current + delta);
    };
    const onUp = () => {
      setDragging(false);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [plugin, state.panelWidth]);

  const isMobile = useMediaQuery(`(max-width:${MOBILE_BREAKPOINT - 1}px)`);
  const isFlat = flatFiltered !== null;

  return (
    <Paper
      elevation={4}
      sx={{
        position: 'fixed',
        left: isMobile ? 0 : 8,
        top: isMobile ? 44 : 44,
        bottom: isMobile ? 0 : 8,
        right: isMobile ? 0 : 'auto',
        width: isMobile ? '100%' : state.panelWidth,
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
        <Typography sx={{ fontSize: 11, fontWeight: 600, flex: 1, color: 'text.primary' }}>
          Hierarchy
        </Typography>
        <IconButton size="small" onClick={handleClose} sx={{ color: 'text.secondary', p: 0.25 }}>
          <Close sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>

      {/* Search */}
      <Box sx={{ px: 0.75, py: 0.5, borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Search nodes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search sx={{ fontSize: 16, color: 'text.disabled' }} />
                </InputAdornment>
              ),
              sx: { fontSize: 12, height: 26 },
            },
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              bgcolor: 'rgba(255, 255, 255, 0.04)',
              '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.08)' },
              '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.15)' },
              '&.Mui-focused fieldset': { borderColor: 'primary.main' },
            },
          }}
        />
      </Box>

      {/* Type filter buttons */}
      <Box sx={{ display: 'flex', gap: 0.25, px: 0.75, py: 0.5, borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
        {TYPE_FILTERS.map(({ key, label }) => (
          <Chip
            key={key}
            label={label}
            size="small"
            onClick={() => setTypeFilter(key)}
            sx={{
              height: 18,
              fontSize: 9,
              fontWeight: typeFilter === key ? 700 : 400,
              bgcolor: typeFilter === key ? 'rgba(79, 195, 247, 0.2)' : 'transparent',
              color: typeFilter === key ? 'primary.main' : 'text.secondary',
              border: `1px solid ${typeFilter === key ? 'rgba(79, 195, 247, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
              '& .MuiChip-label': { px: 0.5 },
              cursor: 'pointer',
              '&:hover': {
                bgcolor: typeFilter === key ? 'rgba(79, 195, 247, 0.25)' : 'rgba(255, 255, 255, 0.06)',
              },
            }}
          />
        ))}
      </Box>

      {/* Tree / Flat list */}
      <Box
        ref={scrollContainerRef}
        sx={{
          flex: 1,
          overflow: 'auto',
          py: 0.5,
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255, 255, 255, 0.1)', borderRadius: 3 },
        }}
      >
        {isFlat ? (
          // Virtualized flat list (type filter active — no tree hierarchy)
          flatFiltered.length > 0 ? (
            <div style={{ height: flatRowVirtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
              {flatRowVirtualizer.getVirtualItems().map((virtualRow) => {
                const info = flatFiltered[virtualRow.index];
                return (
                  <FlatNodeRow
                    key={info.path}
                    info={info}
                    selectedPath={state.selectedNodePath}
                    onSelect={handleSelect}
                    onDoubleClick={handleDoubleClick}
                    onHover={handleHover}
                    signalStore={signalStore}
                    logicEngine={logicEngine}
                    virtualStyle={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  />
                );
              })}
            </div>
          ) : (
            <Typography sx={{ fontSize: 12, color: 'text.disabled', textAlign: 'center', py: 4 }}>
              No matching nodes
            </Typography>
          )
        ) : (
          // Tree view (All filter)
          filteredTree.length > 0 ? (
            filteredTree.map((node, i) => (
              <TreeNodeRow
                key={node.name + '-' + i}
                node={node}
                depth={0}
                selectedPath={state.selectedNodePath}
                expanded={expanded}
                onToggleExpand={onToggleExpand}
                onSelect={handleSelect}
                onDoubleClick={handleDoubleClick}
                onHover={handleHover}
                signalStore={signalStore}
                logicEngine={logicEngine}
              />
            ))
          ) : (
            <Typography sx={{ fontSize: 12, color: 'text.disabled', textAlign: 'center', py: 4 }}>
              {state.editableNodes.length === 0 ? 'No model loaded' : 'No matching nodes'}
            </Typography>
          )
        )}
      </Box>

      {/* Footer */}
      <Box
        sx={{
          px: 1,
          py: 0.25,
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>
          {isFlat
            ? `${displayCount} of ${counts.total} node${counts.total !== 1 ? 's' : ''}`
            : `${counts.total} node${counts.total !== 1 ? 's' : ''}`}
          {counts.withOverrides > 0 && (
            <> &middot; {counts.withOverrides} with override{counts.withOverrides !== 1 ? 's' : ''}</>
          )}
        </Typography>
      </Box>

      {/* Resize handle — right edge */}
      <Box
        onPointerDown={handleResizeStart}
        sx={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 5,
          cursor: 'col-resize',
          bgcolor: dragging ? 'rgba(79, 195, 247, 0.3)' : 'transparent',
          '&:hover': { bgcolor: 'rgba(79, 195, 247, 0.2)' },
          transition: 'background-color 0.15s',
          zIndex: 1,
        }}
      />
    </Paper>
  );
}
