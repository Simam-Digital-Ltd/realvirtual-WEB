// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Avatar,
  Box,
  Chip,
  CircularProgress,
  Divider,
  Fade,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Assessment,
  Close,
  Insights,
  LocalShipping,
  Map as MapIcon,
  PlayArrow,
  Psychology,
  Send,
  Warning,
} from '@mui/icons-material';
import type { RVViewerPlugin } from '../core/rv-plugin';
import type { RVViewer } from '../core/rv-viewer';
import type { UISlotEntry, UISlotProps } from '../core/rv-ui-plugin';
import type { LoadResult } from '../core/engine/rv-scene-loader';
import { WAKEFIELD_DEMO_PROFILE as DEMO_PROFILE } from './demo/demo-profile';

type Sender = 'user' | 'copilot' | 'tool';
type ScenarioId = 'normal' | 'dock4-blocked';

interface ChatMessage {
  id: string;
  sender: Sender;
  text: string;
  timestamp: Date;
}

interface OpsSnapshot {
  drives: number;
  surfaces: number;
  sensors: number;
  signals: number;
  nodes: number;
  availability: number;
  casesPacked: string;
  dockTurnaround: number;
  coldChain: string;
  scenario: ScenarioId;
}

function getOpsSnapshot(viewer: RVViewer, scenario: ScenarioId): OpsSnapshot {
  const result = (viewer as unknown as { lastLoadResult?: LoadResult; _lastLoadResult?: LoadResult }).lastLoadResult
    ?? (viewer as unknown as { _lastLoadResult?: LoadResult })._lastLoadResult;
  const registry = viewer.registry as unknown as { size?: number; nodes?: unknown[] } | undefined;
  return {
    drives: result?.drives?.length ?? 0,
    surfaces: result?.surfaces?.length ?? 0,
    sensors: result?.sensors?.length ?? 0,
    signals: result?.signals?.length ?? 0,
    nodes: registry?.size ?? registry?.nodes?.length ?? 0,
    availability: scenario === 'dock4-blocked' ? 82 : Number(DEMO_PROFILE.kpis.availability),
    casesPacked: scenario === 'dock4-blocked' ? '1,112' : DEMO_PROFILE.kpis.casesPacked,
    dockTurnaround: scenario === 'dock4-blocked' ? 31 : Number(DEMO_PROFILE.kpis.dockTurnaround),
    coldChain: DEMO_PROFILE.kpis.coldChain,
    scenario,
  };
}

function summariseBottlenecks(snapshot: OpsSnapshot): string {
  const dockState = snapshot.scenario === 'dock4-blocked'
    ? 'blocked bay scenario active, dispatch ETA pushed out'
    : 'two vehicles waiting but recoverable';
  return `Current read: ${snapshot.drives} drives, ${snapshot.surfaces} transport surfaces, ${snapshot.sensors} sensors, ${snapshot.signals} signals and ${snapshot.nodes} scene nodes loaded. Availability is ${snapshot.availability}%, dock turnaround is ${snapshot.dockTurnaround} min. Bottlenecks: ${DEMO_PROFILE.assets.robotCell} tray former load is the main factory constraint; ${DEMO_PROFILE.assets.dock} has ${dockState}; ${DEMO_PROFILE.assets.coldStore} is ${snapshot.coldChain}C and stable.`;
}

function getAlertSummary(snapshot: OpsSnapshot): string {
  if (snapshot.scenario === 'dock4-blocked') {
    return 'Active alerts: Dock 4 blocked by delayed trailer, outbound queue now 4 vehicles, tray former load remains high, cold chain stable. Recommended action: hold HGV-14 at gate, route YT-02 to temporary bay, prioritise Robot Cell A service check.';
  }
  return 'Active alerts: Tray former jam risk at Robot Cell A, Dock 4 queue forming with 2 vehicles, gripper service due, cold chain stable. Recommended action: keep dispatch moving while maintenance checks Robot Cell A.';
}

function makeShiftBrief(snapshot: OpsSnapshot): string {
  const now = new Date();
  const scenarioText = snapshot.scenario === 'dock4-blocked'
    ? 'Dock 4 blocked scenario is active. The recovery plan is to hold inbound HGV-14, move YT-02 to the temporary bay, and protect cold-chain dispatch windows.'
    : 'Normal demo scenario is active. Dock queue is visible but still recoverable inside the AM shift target.';
  return [
    `Wakefield Precision Foods ${DEMO_PROFILE.client.siteCode} - Shift Brief`,
    `Generated ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    '',
    `Line availability: ${snapshot.availability}% (${DEMO_PROFILE.kpis.availabilityTarget})`,
    `Cases packed: ${snapshot.casesPacked}/h (${DEMO_PROFILE.kpis.shiftTotal})`,
    `Dock turnaround: ${snapshot.dockTurnaround} min`,
    `Cold chain: ${snapshot.coldChain}C, ${DEMO_PROFILE.kpis.coldChainStatus}`,
    '',
    `Operational readout: ${summariseBottlenecks(snapshot)}`,
    '',
    `Decision: ${scenarioText}`,
    '',
    'Client-facing takeaway: the cockpit links the robot cell, dock queue, simulated GPS yard assets and shift KPIs into one practical operating story.',
  ].join('\n');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char] || char);
}

function downloadShiftBrief(text: string): void {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>WPF-41 Shift Brief</title><style>body{font-family:Segoe UI,Arial,sans-serif;margin:40px;color:#172026}h1{font-size:24px}pre{white-space:pre-wrap;font:14px/1.55 Segoe UI,Arial,sans-serif}.brand{color:#20a1b1;font-weight:700}</style></head><body><h1>WPF-41 Shift Brief</h1><div class="brand">Simam Digital Twin - built with realvirtual WEB</div><pre>${escapeHtml(text)}</pre><script>window.print()</script></body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wpf-41-shift-brief-${Date.now()}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function focusAsset(viewer: RVViewer, id: string): string {
  const normalized = id.toLowerCase();
  const path = normalized.includes('dock') ? 'ConveyorEntry2' : normalized.includes('grip') ? 'A4' : 'A3';
  viewer.focusByPath(path);
  viewer.highlightByPath(path, true);
  viewer.emit('wpf-asset-selected' as string, { assetId: normalized.includes('dock') ? 'dock-4' : 'robot-cell-a' } as any);
  return `Focused ${normalized.includes('dock') ? DEMO_PROFILE.assets.dock : DEMO_PROFILE.assets.robotCell} and opened the operational detail card.`;
}

function showMap(viewer: RVViewer): string {
  const mapPlugin = viewer.getPlugin('osm-map') as { active?: boolean; toggle?: () => void; jumpTo?: (lat: number, lng: number, zoom?: number) => void } | undefined;
  if (mapPlugin && !mapPlugin.active) mapPlugin.toggle?.();
  mapPlugin?.jumpTo?.(DEMO_PROFILE.site.mapLatitude, DEMO_PROFILE.site.mapLongitude, DEMO_PROFILE.site.mapZoom);
  return `Opened the Wakefield yard map and centred ${DEMO_PROFILE.client.siteCode}.`;
}

function jumpToDock(viewer: RVViewer): string {
  viewer.focusByPath('ConveyorEntry2');
  viewer.highlightByPath('ConveyorEntry2', true);
  viewer.emit('wpf-asset-selected' as string, { assetId: 'dock-4' } as any);
  return `Jumped to ${DEMO_PROFILE.assets.dock} and highlighted the dispatch queue area.`;
}

function startDemo(viewer: RVViewer): string {
  viewer.emit('wpf-start-demo' as string, undefined);
  return 'Started the guided 2-3 minute factory-to-yard demo narrator.';
}

function applyScenario(viewer: RVViewer, scenario: ScenarioId): string {
  viewer.emit('wpf-scenario' as string, { scenario } as any);
  if (scenario === 'dock4-blocked') {
    showMap(viewer);
    jumpToDock(viewer);
    return 'Scenario applied: Dock 4 blocked. Yard queue, dispatch risk and recovery recommendations are now reflected in the copilot and intelligence alerts.';
  }
  return 'Scenario reset: normal AM packing shift, Dock 4 queue recoverable.';
}

const AIAssistantUI: React.FC<UISlotProps> = ({ viewer }) => {
  const [open, setOpen] = useState(false);
  const [scenario, setScenario] = useState<ScenarioId>('normal');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'hello',
      sender: 'copilot',
      text: `Ops Copilot online for ${DEMO_PROFILE.client.siteCode}. I can explain bottlenecks, start the demo, open the map, jump to Dock 4, generate a shift brief, or run a Dock 4 blocked scenario.`,
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const snapshot = useMemo(() => getOpsSnapshot(viewer, scenario), [viewer, scenario, messages.length]);

  useEffect(() => {
    const handler = (payload?: { scenario?: ScenarioId }) => {
      if (payload?.scenario) setScenario(payload.scenario);
    };
    viewer.on('wpf-scenario' as string, handler as any);
    return () => viewer.off('wpf-scenario' as string, handler as any);
  }, [viewer]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isTyping]);

  const addMessage = (sender: Sender, text: string) => {
    setMessages(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, sender, text, timestamp: new Date() }]);
  };

  const runTool = (label: string, action: () => string) => {
    const result = action();
    addMessage('tool', `${label}: ${result}`);
  };

  const processCommand = (text: string) => {
    const input = text.toLowerCase();
    let response = summariseBottlenecks(snapshot);

    if (input.includes('start') && input.includes('demo')) response = startDemo(viewer);
    else if (input.includes('map') || input.includes('yard')) response = showMap(viewer);
    else if (input.includes('dock')) response = jumpToDock(viewer);
    else if (input.includes('focus') || input.includes('robot') || input.includes('cell')) response = focusAsset(viewer, input);
    else if (input.includes('alert')) response = getAlertSummary(snapshot);
    else if (input.includes('report') || input.includes('brief') || input.includes('pdf')) {
      response = makeShiftBrief(snapshot);
      downloadShiftBrief(response);
    } else if (input.includes('blocked') || input.includes('scenario') || input.includes('what if')) {
      const nextScenario: ScenarioId = input.includes('reset') || input.includes('normal') ? 'normal' : 'dock4-blocked';
      setScenario(nextScenario);
      response = applyScenario(viewer, nextScenario);
    }

    setIsTyping(false);
    addMessage('copilot', response);
  };

  const handleSend = () => {
    const text = inputValue.trim();
    if (!text) return;
    addMessage('user', text);
    setInputValue('');
    setIsTyping(true);
    window.setTimeout(() => processCommand(text), 450);
  };

  if (!open) {
    return (
      <Tooltip title="Ops Copilot" placement="bottom">
        <IconButton
          onClick={() => setOpen(true)}
          sx={{ bgcolor: '#20a1b1', color: '#071013', boxShadow: '0 4px 18px rgba(32,161,177,0.35)', '&:hover': { bgcolor: '#2db8ca' } }}
        >
          <Psychology fontSize="small" />
        </IconButton>
      </Tooltip>
    );
  }

  return (
    <Fade in={open}>
      <Paper
        sx={{
          width: 410,
          height: 560,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 2,
          bgcolor: 'rgba(12,15,19,0.92)',
          color: '#fff',
          border: '1px solid rgba(32,161,177,0.28)',
          boxShadow: '0 18px 60px rgba(0,0,0,0.55)',
          overflow: 'hidden',
          pointerEvents: 'auto',
        }}
      >
        <Box sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'rgba(32,161,177,0.1)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Avatar sx={{ width: 32, height: 32, bgcolor: '#20a1b1', color: '#071013' }}><Psychology fontSize="small" /></Avatar>
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 900, lineHeight: 1 }}>Ops Copilot</Typography>
              <Typography sx={{ color: '#81c784', fontSize: 10, fontWeight: 700 }}>live demo agent - {scenario === 'dock4-blocked' ? 'Dock 4 blocked' : 'normal shift'}</Typography>
            </Box>
          </Box>
          <IconButton size="small" onClick={() => setOpen(false)} sx={{ color: 'rgba(255,255,255,0.62)' }}><Close fontSize="small" /></IconButton>
        </Box>

        <Box sx={{ px: 1.5, py: 1, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 0.75, bgcolor: 'rgba(255,255,255,0.03)' }}>
          {[
            ['Avail', `${snapshot.availability}%`],
            ['Cases', snapshot.casesPacked],
            ['Dock', `${snapshot.dockTurnaround}m`],
            ['Signals', `${snapshot.signals}`],
          ].map(([label, value]) => (
            <Box key={label} sx={{ p: 0.75, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.24)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <Typography sx={{ color: 'rgba(255,255,255,0.45)', fontSize: 8, fontWeight: 900 }}>{label}</Typography>
              <Typography sx={{ color: '#fff', fontSize: 13, fontWeight: 900 }}>{value}</Typography>
            </Box>
          ))}
        </Box>

        <Box ref={scrollRef} sx={{ flex: 1, overflowY: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          {messages.map(msg => (
            <Box key={msg.id} sx={{ alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
              <Paper sx={{ p: 1.2, borderRadius: msg.sender === 'user' ? '14px 14px 4px 14px' : '4px 14px 14px 14px', bgcolor: msg.sender === 'user' ? '#20a1b1' : msg.sender === 'tool' ? 'rgba(255,167,38,0.14)' : 'rgba(255,255,255,0.06)', color: msg.sender === 'user' ? '#071013' : '#fff', border: msg.sender === 'tool' ? '1px solid rgba(255,167,38,0.28)' : '1px solid rgba(255,255,255,0.07)' }}>
                <Typography sx={{ fontSize: 12, lineHeight: 1.42, whiteSpace: 'pre-wrap', fontWeight: msg.sender === 'user' ? 800 : 600 }}>{msg.text}</Typography>
              </Paper>
              <Typography sx={{ mt: 0.35, px: 0.5, color: 'rgba(255,255,255,0.32)', fontSize: 9 }}>{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Typography>
            </Box>
          ))}
          {isTyping && <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}><CircularProgress size={13} sx={{ color: '#20a1b1' }} /><Typography sx={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>Reading scene state...</Typography></Box>}
        </Box>

        <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
        <Box sx={{ p: 1.5 }}>
          <Stack direction="row" spacing={0.75} sx={{ mb: 1, flexWrap: 'wrap', rowGap: 0.75 }}>
            <Chip icon={<Insights />} label="Explain" size="small" onClick={() => runTool('summariseAlerts', () => summariseBottlenecks(snapshot))} />
            <Chip icon={<PlayArrow />} label="Start demo" size="small" onClick={() => runTool('startDemo', () => startDemo(viewer))} />
            <Chip icon={<MapIcon />} label="Show map" size="small" onClick={() => runTool('showMap', () => showMap(viewer))} />
            <Chip icon={<LocalShipping />} label="Dock 4" size="small" onClick={() => runTool('jumpToDock', () => jumpToDock(viewer))} />
            <Chip icon={<Warning />} label="What if blocked?" size="small" onClick={() => { setScenario('dock4-blocked'); runTool('scenarioPlanner', () => applyScenario(viewer, 'dock4-blocked')); }} />
            <Chip icon={<Assessment />} label="Shift brief" size="small" onClick={() => runTool('shiftReport', () => { const brief = makeShiftBrief(snapshot); downloadShiftBrief(brief); return 'Downloaded a client-friendly HTML brief that can be printed to PDF.'; })} />
          </Stack>
          <Stack direction="row" spacing={1}>
            <TextField
              fullWidth
              size="small"
              placeholder="Ask: what is the bottleneck, start demo, Dock 4 blocked..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
              autoComplete="off"
              sx={{ '& .MuiOutlinedInput-root': { height: 36, color: '#fff', bgcolor: 'rgba(0,0,0,0.24)', fontSize: 12 } }}
            />
            <IconButton onClick={handleSend} disabled={!inputValue.trim()} sx={{ bgcolor: '#20a1b1', color: '#071013', '&:hover': { bgcolor: '#2db8ca' }, '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.1)' } }}><Send fontSize="small" /></IconButton>
          </Stack>
        </Box>
      </Paper>
    </Fade>
  );
};

export class AIAssistantPlugin implements RVViewerPlugin {
  readonly id = 'ai-assistant';
  readonly order = 1000;

  readonly slots: UISlotEntry[] = [
    { slot: 'toolbar-button', order: 10, component: AIAssistantUI },
  ];

  onModelLoaded(_result: LoadResult, _viewer: RVViewer): void {}
}
