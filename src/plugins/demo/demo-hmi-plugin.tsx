// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * DemoHMIPlugin - Registers demo HMI content into the slot system.
 *
 * Each element self-registers with a slot and order. To customize:
 * create your own RVViewerPlugin with a `slots` array.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Speed, Sensors, Warning, Build, PrecisionManufacturing, LocalShipping, Inventory2, AcUnit, Route, PlayArrow, Pause, SkipNext, RestartAlt, ExpandLess, ExpandMore, Close } from '@mui/icons-material';
import { Box, Button, Chip, IconButton, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import type { RVViewerPlugin } from '../../core/rv-plugin';
import type { UISlotEntry, UISlotProps } from '../../core/rv-ui-plugin';

// Core reusable components
import { KpiCard } from '../../core/hmi/KpiCard';
import { TileCard } from '../../core/hmi/TileCard';
import { NavButton } from '../../core/hmi/NavButton';

// Demo charts (co-located in plugins/demo/)
import { OeeChart } from './OeeChart';
import { PartsChart } from './PartsChart';
import { CycleTimeChart } from './CycleTimeChart';
import { EnergyChart } from './EnergyChart';

// Demo chart overlays (co-located in plugins/demo/)
import { SensorChartOverlay } from './SensorChartOverlay';
import { DriveChartOverlay } from './DriveChartOverlay';
import { DocViewerOverlay } from '../../core/hmi/DocViewerOverlay';

// Hooks
import { useDriveChartOpen } from '../../hooks/use-drive-chart';
import { useSensorChartOpen } from '../../hooks/use-sensor-chart';
import { useMaintenanceMode } from '../../hooks/use-maintenance-mode';

// Layout constants
import { MACHINE_PANEL_WIDTH } from '../../core/hmi/layout-constants';
import { WAKEFIELD_DEMO_PROFILE as DEMO_PROFILE } from './demo-profile';

// --- KPI Bar Entries ----------------------------------------------------

function OeeKpi(_props: UISlotProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <KpiCard label="Line Availability" value={DEMO_PROFILE.kpis.availability} unit="%" color="#66bb6a" secondary={DEMO_PROFILE.kpis.availabilityTarget} onClick={() => setOpen((o) => !o)} />
      <OeeChart open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function PartsKpi(_props: UISlotProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <KpiCard label="Cases Packed" value={DEMO_PROFILE.kpis.casesPacked} unit="/h" color="#4fc3f7" secondary={DEMO_PROFILE.kpis.shiftTotal} onClick={() => setOpen((o) => !o)} />
      <PartsChart open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function CycleTimeKpi(_props: UISlotProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <KpiCard label="Dock Turnaround" value={DEMO_PROFILE.kpis.dockTurnaround} unit="min" color="#ffa726" secondary="Avg inbound" onClick={() => setOpen((o) => !o)} />
      <CycleTimeChart open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function PowerKpi(_props: UISlotProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <KpiCard label="Cold Chain" value={DEMO_PROFILE.kpis.coldChain} unit={DEMO_PROFILE.kpis.coldChainUnit} color="#26c6da" secondary={DEMO_PROFILE.kpis.coldChainStatus} onClick={() => setOpen((o) => !o)} />
      <EnergyChart open={open} onClose={() => setOpen(false)} />
    </>
  );
}

// --- Button Group Entries -----------------------------------------------

function DrivesButton({ viewer }: UISlotProps) {
  const open = useDriveChartOpen();
  return (
    <>
      <NavButton icon={<Speed />} label="Drives" active={open} onClick={() => viewer.toggleDriveChart()} />
      <DriveChartOverlay />
    </>
  );
}

function SensorsButton({ viewer }: UISlotProps) {
  const open = useSensorChartOpen();
  return (
    <>
      <NavButton icon={<Sensors />} label="Sensors" active={open} onClick={() => viewer.toggleSensorChart()} />
      <SensorChartOverlay />
    </>
  );
}

function AlarmsButton(_props: UISlotProps) {
  return <NavButton icon={<Warning />} label="Alarms" badge={3} />;
}

function MaintenanceButton({ viewer }: UISlotProps) {
  const maintenanceState = useMaintenanceMode();
  const isActive = maintenanceState.mode !== 'idle';
  return (
    <NavButton
      icon={<Build />}
      label="Maintenance"
      badge={isActive ? undefined : 1}
      active={isActive}
      onClick={() => viewer.emit('enter-maintenance' as string, undefined)}
    />
  );
}

function MachineControlButton({ viewer }: UISlotProps) {
  const lpm = viewer.leftPanelManager;
  const panelSnapshot = useSyncExternalStore(lpm.subscribe, lpm.getSnapshot);
  const isActive = panelSnapshot.activePanel === 'machine-control';
  return (
    <NavButton
      icon={<PrecisionManufacturing />}
      label="Machine"
      active={isActive}
      onClick={() => lpm.toggle('machine-control', MACHINE_PANEL_WIDTH)}
    />
  );
}

// --- Message Panel Entries ----------------------------------------------

function DriveOverloadMessage(_props: UISlotProps) {
  return (
    <TileCard
      title="Tray Former Jam Risk"
      subtitle="Packing Cell A - motor load 142%"
      severity="error"
      icon="warning"
      timestamp="12:34:05"
      componentPath="A3"
    />
  );
}

function MaintenanceDueMessage({ viewer }: UISlotProps) {
  return (
    <TileCard
      title="Outbound Dock 4 Queue"
      subtitle="2 vehicles waiting - next dispatch 14:20"
      severity="warning"
      icon="build"
      timestamp="Today"
      componentPath="ConveyorEntry2"
      onAction={() => viewer.emit('enter-maintenance' as string, undefined)}
    />
  );
}

function DriveInfoMessage(_props: UISlotProps) {
  return (
    <TileCard
      title="Robot Cell A - Entry Conveyor"
      subtitle="Cases moving | Speed: 120 mm/s"
      severity="info"
      icon="speed"
      timestamp="Live"
      componentPath="DemoCell/Conveyors/ConveyorEntry1/Motor"
    />
  );
}

const DOC_URL = `${import.meta.env.BASE_URL}pdf/fanuc-crx-educational-cell-manual.pdf#page=105`;

function RobotMaintenanceMessage(_props: UISlotProps) {
  const [docOpen, setDocOpen] = useState(false);
  return (
    <>
      <TileCard
        title="Gripper Service Due"
        subtitle={<>Robot Cell A1 - <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDocOpen(true); }} style={{ color: '#4fc3f7', textDecoration: 'underline', cursor: 'pointer' }}>see manual p.105</a></>}
        severity="warning"
        icon="build"
        timestamp="Today"
        componentPath="A4"
      />
      {docOpen && <DocViewerOverlay url={DOC_URL} title="Gripper Service - Manual p.105" onClose={() => setDocOpen(false)} />}
    </>
  );
}

// --- Bespoke Operations Cockpit ----------------------------------------

function FlowStage({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ color: 'rgba(255,255,255,0.45)', fontSize: 9, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase' }}>
        {label}
      </Typography>
      <Typography sx={{ color, fontSize: 13, fontWeight: 900, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {value}
      </Typography>
    </Box>
  );
}

type OpsTab = 'brief' | 'timeline' | 'actions';

const SHIFT_BRIEF = [
  { label: DEMO_PROFILE.copy.shiftName, value: '07:00-15:00', color: '#ffffff' },
  { label: 'Case target', value: DEMO_PROFILE.copy.caseTarget, color: '#81c784' },
  { label: 'Current', value: DEMO_PROFILE.copy.currentCases, color: '#4fc3f7' },
  { label: 'Decision due', value: DEMO_PROFILE.copy.decisionDue, color: '#ffa726' },
];

const INCIDENT_TIMELINE = [
  { time: '09:12', title: 'Tray former load rising', color: '#ffa726' },
  { time: '09:18', title: `${DEMO_PROFILE.assets.dock} queue predicted`, color: '#ef5350' },
  { time: '09:21', title: `${DEMO_PROFILE.assets.inboundVehicle} arrives at weighbridge`, color: '#4fc3f7' },
  { time: '09:27', title: `${DEMO_PROFILE.assets.maintenanceTech} assigned to ${DEMO_PROFILE.assets.robotCell}`, color: '#81c784' },
];

const ACTION_CARDS = [
  { label: `Assign ${DEMO_PROFILE.assets.maintenanceTech}`, detail: `${DEMO_PROFILE.assets.robotCell} service check`, color: '#81c784', action: 'maintenance' },
  { label: `Hold ${DEMO_PROFILE.assets.inboundVehicle}`, detail: 'Weighbridge buffer: 8 min', color: '#ffa726', action: 'map' },
  { label: `Clear ${DEMO_PROFILE.assets.dock}`, detail: `Move ${DEMO_PROFILE.assets.yardTug} to outbound bay`, color: '#4fc3f7', action: 'dock' },
] as const;

function MiniOpsTabs({ active, onChange }: { active: OpsTab; onChange: (tab: OpsTab) => void }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.45 }}>
      {(['brief', 'timeline', 'actions'] as OpsTab[]).map((tab) => (
        <Box
          key={tab}
          onClick={() => onChange(tab)}
          sx={{
            height: 22,
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            bgcolor: active === tab ? 'rgba(32,161,177,0.22)' : 'rgba(255,255,255,0.035)',
            border: '1px solid',
            borderColor: active === tab ? 'rgba(32,161,177,0.62)' : 'rgba(255,255,255,0.07)',
          }}
        >
          <Typography sx={{ color: active === tab ? '#20a1b1' : 'rgba(255,255,255,0.55)', fontSize: 8, fontWeight: 900, textTransform: 'uppercase' }}>
            {tab}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function ShiftBriefView() {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.65 }}>
      {SHIFT_BRIEF.map((item) => (
        <Box key={item.label} sx={{ p: 0.65, borderRadius: 1.2, bgcolor: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.055)' }}>
          <Typography sx={{ color: 'rgba(255,255,255,0.42)', fontSize: 7.5, fontWeight: 900, textTransform: 'uppercase' }}>{item.label}</Typography>
          <Typography sx={{ color: item.color, fontSize: 11, fontWeight: 900, lineHeight: 1.25 }}>{item.value}</Typography>
        </Box>
      ))}
    </Box>
  );
}

function IncidentTimelineView() {
  return (
    <Stack spacing={0.55}>
      {INCIDENT_TIMELINE.map((item) => (
        <Box key={item.time} sx={{ display: 'grid', gridTemplateColumns: '36px 8px 1fr', gap: 0.75, alignItems: 'center' }}>
          <Typography sx={{ color: 'rgba(255,255,255,0.48)', fontSize: 8, fontWeight: 900 }}>{item.time}</Typography>
          <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: item.color, boxShadow: '0 0 8px ' + item.color }} />
          <Typography sx={{ color: 'rgba(255,255,255,0.78)', fontSize: 9.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</Typography>
        </Box>
      ))}
    </Stack>
  );
}

function ActionCardsView({ viewer }: UISlotProps) {
  const runAction = (action: typeof ACTION_CARDS[number]['action']) => {
    if (action === 'maintenance') {
      viewer.focusByPath('A4');
      viewer.highlightByPath('A4', true);
      openAssetDetail(viewer, 'mt-03');
      viewer.emit('enter-maintenance' as string, undefined);
      return;
    }
    if (action === 'map') {
      const mapPlugin = viewer.getPlugin('osm-map') as { active?: boolean; toggle?: () => void; jumpTo?: (lat: number, lng: number, zoom?: number) => void } | undefined;
      if (mapPlugin && !mapPlugin.active) mapPlugin.toggle?.();
      mapPlugin?.jumpTo?.(DEMO_PROFILE.site.mapLatitude, DEMO_PROFILE.site.mapLongitude, DEMO_PROFILE.site.mapZoom);
      openAssetDetail(viewer, 'hgv-14');
      return;
    }
    openAssetDetail(viewer, 'dock-4');
    viewer.focusByPath('ConveyorEntry2');
    viewer.highlightByPath('ConveyorEntry2', true);
  };

  return (
    <Stack spacing={0.55}>
      {ACTION_CARDS.map((item) => (
        <Box
          key={item.label}
          onClick={() => runAction(item.action)}
          sx={{ p: 0.65, borderRadius: 1.2, bgcolor: 'rgba(255,255,255,0.035)', borderLeft: '3px solid ' + item.color, cursor: 'pointer', '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' } }}
        >
          <Typography sx={{ color: '#fff', fontSize: 9.5, fontWeight: 900, lineHeight: 1.15 }}>{item.label}</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 8.5, lineHeight: 1.2 }}>{item.detail}</Typography>
        </Box>
      ))}
    </Stack>
  );
}

function WakefieldOpsCockpit({ viewer }: UISlotProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeOpsTab, setActiveOpsTab] = useState<OpsTab>('brief');

  return (
    <Paper
      elevation={6}
      sx={{
        position: 'fixed',
        left: 68,
        top: 158,
        width: collapsed ? 236 : 298,
        display: { xs: 'none', md: 'block' },
        pointerEvents: 'auto',
        p: collapsed ? 1 : 1.15,
        borderRadius: 2,
        bgcolor: 'rgba(12, 15, 19, 0.72)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: collapsed ? 0 : 0.9 }}>
        <Box>
          <Typography sx={{ color: '#20a1b1', fontSize: 9, fontWeight: 900, letterSpacing: 1.2, lineHeight: 1 }}>
            {DEMO_PROFILE.client.operationsLabel}
          </Typography>
          <Typography sx={{ color: '#fff', fontSize: 13, fontWeight: 900, lineHeight: 1.25, mt: 0.35 }}>
            {DEMO_PROFILE.client.cockpitTitle}
          </Typography>
        </Box>
<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {!collapsed && (
            <Chip
              label="LIVE SIM"
              size="small"
              sx={{ height: 16, fontSize: 7.5, fontWeight: 900, bgcolor: 'rgba(102,187,106,0.12)', color: '#81c784', border: '1px solid rgba(102,187,106,0.3)' }}
            />
          )}
          <IconButton size="small" onClick={() => setCollapsed((v) => !v)} sx={{ p: 0.2, color: 'rgba(255,255,255,0.58)' }}>
            {collapsed ? <ExpandMore sx={{ fontSize: 17 }} /> : <ExpandLess sx={{ fontSize: 17 }} />}
          </IconButton>
        </Box>
      </Box>

      {!collapsed && <Stack spacing={0.85}>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75 }}>
          <FlowStage label="Inbound" value={DEMO_PROFILE.copy.inboundStatus} color="#4fc3f7" />
          <FlowStage label="Cell A" value={DEMO_PROFILE.copy.cellStatus} color="#ffa726" />
          <FlowStage label={DEMO_PROFILE.assets.dock} value={DEMO_PROFILE.copy.dockStatus} color="#ef5350" />
          <FlowStage label="Cold Store" value={DEMO_PROFILE.copy.coldStatus} color="#26c6da" />
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.75, alignItems: 'center' }}>
          {[
            { icon: <Route />, label: 'Gate' },
            { icon: <LocalShipping />, label: 'Dock' },
            { icon: <Inventory2 />, label: 'Pack' },
            { icon: <AcUnit />, label: 'Cold' },
          ].map((item) => (
            <Box key={item.label} sx={{ py: 0.55, borderRadius: 1.25, bgcolor: 'rgba(255,255,255,0.035)', textAlign: 'center' }}>
              <Box sx={{ color: '#20a1b1', display: 'flex', justifyContent: 'center', '& svg': { fontSize: 15 } }}>{item.icon}</Box>
              <Typography sx={{ color: 'rgba(255,255,255,0.58)', fontSize: 8, fontWeight: 800, mt: 0.15 }}>{item.label}</Typography>
            </Box>
          ))}
        </Box>

        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, fontWeight: 800, letterSpacing: 0.8 }}>SHIFT DISPATCH TARGET</Typography>
            <Typography sx={{ color: '#81c784', fontSize: 10, fontWeight: 900 }}>{DEMO_PROFILE.kpis.dispatchTarget}%</Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={DEMO_PROFILE.kpis.dispatchTarget}
            sx={{ height: 6, borderRadius: 6, bgcolor: 'rgba(255,255,255,0.08)', '& .MuiLinearProgress-bar': { bgcolor: '#81c784', borderRadius: 6 } }}
          />
        </Box>

        <MiniOpsTabs active={activeOpsTab} onChange={setActiveOpsTab} />
        {activeOpsTab === 'brief' && <ShiftBriefView />}
        {activeOpsTab === 'timeline' && <IncidentTimelineView />}
        {activeOpsTab === 'actions' && <ActionCardsView viewer={viewer} />}
      </Stack>}
    </Paper>
  );
}

type AssetDetail = {
  id: string;
  title: string;
  category: string;
  status: string;
  owner: string;
  location: string;
  metric: string;
  linkedAlert: string;
  suggestedAction: string;
  color: string;
};

const ASSET_DETAILS: Record<string, AssetDetail> = {
  'robot-cell-a': {
    id: 'robot-cell-a',
    title: DEMO_PROFILE.assets.robotCell,
    category: 'Factory cell',
    status: 'Load watch',
    owner: 'Packing maintenance',
    location: 'Tray former and entry conveyor',
    metric: 'Motor load 142% / conveyor 120 mm/s',
    linkedAlert: 'Tray Former Jam Risk',
    suggestedAction: 'Assign MT-03 and open gripper service checklist',
    color: '#ffa726',
  },
  'dock-4': {
    id: 'dock-4',
    title: DEMO_PROFILE.assets.dockLabel,
    category: 'Dispatch dock',
    status: 'Queue forming',
    owner: 'Yard supervisor',
    location: `${DEMO_PROFILE.client.siteCode} outbound bay`,
    metric: '2 vehicles waiting / next dispatch 14:20',
    linkedAlert: `${DEMO_PROFILE.assets.dockLabel} Queue`,
    suggestedAction: `Move ${DEMO_PROFILE.assets.yardTug} to bay and hold ${DEMO_PROFILE.assets.inboundVehicle} for 8 min`,
    color: '#ef5350',
  },
  'hgv-14': {
    id: 'hgv-14',
    title: DEMO_PROFILE.assets.inboundVehicle,
    category: 'Inbound vehicle',
    status: 'At weighbridge',
    owner: 'R. Taylor',
    location: 'Gatehouse and weighbridge',
    metric: `ETA ${DEMO_PROFILE.assets.dock}: 12 min / load 85%`,
    linkedAlert: `${DEMO_PROFILE.assets.dock} Queue`,
    suggestedAction: `Hold at weighbridge until ${DEMO_PROFILE.assets.robotCell} clears`,
    color: '#4fc3f7',
  },
  'yt-02': {
    id: 'yt-02',
    title: DEMO_PROFILE.assets.yardTug,
    category: 'Yard tug',
    status: 'Available',
    owner: 'S. Malik',
    location: `${DEMO_PROFILE.assets.coldStore} to ${DEMO_PROFILE.assets.dock} route`,
    metric: 'Rounds: 5 / load 40%',
    linkedAlert: 'Dock 4 Queue',
    suggestedAction: `Move staged pallets from cold store to ${DEMO_PROFILE.assets.dock}`,
    color: '#20a1b1',
  },
  'mt-03': {
    id: 'mt-03',
    title: DEMO_PROFILE.assets.maintenanceTech,
    category: 'Maintenance tech',
    status: 'Active',
    owner: 'Maintenance team',
    location: `${DEMO_PROFILE.assets.robotCell} patrol route`,
    metric: 'Checklist ready / 12 min decision window',
    linkedAlert: 'Gripper Service Due',
    suggestedAction: `Start ${DEMO_PROFILE.assets.robotCell} inspection workflow`,
    color: '#81c784',
  },
  'cold-store-b': {
    id: 'cold-store-b',
    title: DEMO_PROFILE.assets.coldStore,
    category: 'Cold chain zone',
    status: 'Watch',
    owner: 'QA-02',
    location: `${DEMO_PROFILE.client.siteCode} cold storage boundary`,
    metric: `${DEMO_PROFILE.kpis.coldChainStatus} / Zone B rising`,
    linkedAlert: 'Cold Chain: Zone B watch',
    suggestedAction: 'Keep dispatch priority on chilled pallets',
    color: '#26c6da',
  },
};

function openAssetDetail(viewer: UISlotProps['viewer'], assetId: string) {
  viewer.emit('wpf-asset-selected' as string, { assetId } as any);
}

function AssetDetailDrawer({ viewer }: UISlotProps) {
  const [assetId, setAssetId] = useState<string | null>(null);

  useEffect(() => {
    const handler = (event: any) => setAssetId(event?.assetId ?? null);
    viewer.on('wpf-asset-selected' as any, handler);
    return () => viewer.off('wpf-asset-selected' as any, handler);
  }, [viewer]);

  const asset = assetId ? ASSET_DETAILS[assetId] : null;
  if (!asset) return null;

  const runSuggestedAction = () => {
    if (asset.id === 'robot-cell-a' || asset.id === 'mt-03') {
      viewer.focusByPath('A4');
      viewer.highlightByPath('A4', true);
      viewer.emit('enter-maintenance' as string, undefined);
      return;
    }
    if (asset.id === 'dock-4') {
      viewer.focusByPath('ConveyorEntry2');
      viewer.highlightByPath('ConveyorEntry2', true);
      return;
    }
    if (asset.id === 'hgv-14' || asset.id === 'yt-02') {
      const mapPlugin = viewer.getPlugin('osm-map') as { active?: boolean; toggle?: () => void; jumpTo?: (lat: number, lng: number, zoom?: number) => void } | undefined;
      if (mapPlugin && !mapPlugin.active) mapPlugin.toggle?.();
      mapPlugin?.jumpTo?.(DEMO_PROFILE.site.mapLatitude, DEMO_PROFILE.site.mapLongitude, DEMO_PROFILE.site.mapZoom);
    }
  };

  return (
    <Paper
      elevation={7}
      sx={{
        position: 'fixed',
        left: 68,
        top: 454,
        width: 298,
        display: { xs: 'none', md: 'block' },
        pointerEvents: 'auto',
        p: 1.15,
        borderRadius: 2,
        bgcolor: 'rgba(12, 15, 19, 0.82)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.85 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ color: asset.color, fontSize: 9, fontWeight: 900, letterSpacing: 1.1, textTransform: 'uppercase' }}>{asset.category}</Typography>
          <Typography sx={{ color: '#fff', fontSize: 13, fontWeight: 900, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{asset.title}</Typography>
        </Box>
        <IconButton size="small" onClick={() => setAssetId(null)} sx={{ p: 0.2, color: 'rgba(255,255,255,0.55)' }}>
          <Close sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>

      <Stack spacing={0.65}>
        {[
          ['Status', asset.status],
          ['Owner', asset.owner],
          ['Location', asset.location],
          ['Metric', asset.metric],
          ['Linked alert', asset.linkedAlert],
        ].map(([label, value]) => (
          <Box key={label} sx={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 0.75 }}>
            <Typography sx={{ color: 'rgba(255,255,255,0.38)', fontSize: 8, fontWeight: 900, textTransform: 'uppercase' }}>{label}</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.76)', fontSize: 9.5, fontWeight: 700, lineHeight: 1.25 }}>{value}</Typography>
          </Box>
        ))}
        <Button
          size="small"
          onClick={runSuggestedAction}
          sx={{ mt: 0.35, height: 28, fontSize: 9, fontWeight: 900, color: '#071013', bgcolor: asset.color, '&:hover': { bgcolor: asset.color } }}
        >
          {asset.suggestedAction}
        </Button>
      </Stack>
    </Paper>
  );
}

// --- Guided Demo Strip --------------------------------------------------

type DemoStepAction = 'focus' | 'map' | 'maintenance' | 'none';

const DEMO_STEPS: Array<{
  label: string;
  title: string;
  note: string;
  script: string;
  action: DemoStepAction;
  path?: string;
  durationSec: number;
}> = [
  {
    label: 'Start',
    title: DEMO_PROFILE.client.siteName,
    note: 'Set the scene: one cockpit for factory, yard and cold chain',
    script: `We are looking at ${DEMO_PROFILE.client.siteCode}, a high-throughput food packing site. The ${DEMO_PROFILE.brand.product} is ${DEMO_PROFILE.brand.attribution} and brings the robot cell, dispatch yard, dock queue and cold-chain watch into one operational view.`,
    action: 'none',
    durationSec: 20,
  },
  {
    label: 'Factory',
    title: 'Factory shift risk appears',
    note: 'Tray former load rises and Robot Cell A becomes the constraint',
    script: 'The morning shift is running, but the tray former in Robot Cell A is starting to trend high on motor load. Operators see the risk before the line stops, with the affected machine highlighted in the 3D cell.',
    action: 'focus',
    path: 'A3',
    durationSec: 28,
  },
  {
    label: 'Yard',
    title: 'Yard impact becomes visible',
    note: 'Inbound HGV-14 and yard tug YT-02 are tied to the same dispatch plan',
    script: 'That factory constraint now has a yard impact. The map layer shows simulated GPS assets around the Wakefield site, including HGV-14 at the weighbridge and YT-02 moving toward Dock 4.',
    action: 'map',
    durationSec: 30,
  },
  {
    label: 'Dock',
    title: 'Dock 4 queue forms',
    note: 'Dispatch target is still recoverable, but the queue needs action',
    script: 'Dock 4 now has two vehicles waiting. The cockpit keeps the story joined up: line availability, cases packed, dock turnaround and cold-chain state all stay visible while the team decides what to prioritise.',
    action: 'focus',
    path: 'ConveyorEntry2',
    durationSec: 28,
  },
  {
    label: 'Action',
    title: 'Maintenance transaction is triggered',
    note: 'The service prompt opens the maintenance workflow and manual context',
    script: 'The supervisor triggers a maintenance action for Robot Cell A. This is the useful prototype moment: a client can see how an alert becomes a guided action, not just another dashboard warning.',
    action: 'maintenance',
    path: 'A4',
    durationSec: 30,
  },
  {
    label: 'Recover',
    title: 'Recovery plan is aligned',
    note: 'Factory, yard and cold chain return to one shared plan',
    script: 'The demo closes with the recovery view: Cell A is under watch, Dock 4 has a clear queue story, and cold-chain remains stable. This gives a client a realistic end-to-end picture without needing live plant data yet.',
    action: 'none',
    durationSec: 24,
  },
];

function GuidedDemoStrip({ viewer }: UISlotProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [scenario, setScenario] = useState<'normal' | 'dock4-blocked'>('normal');

  const runStepAction = (index: number) => {
    const step = DEMO_STEPS[index];

    if (step.action === 'map') {
      const mapPlugin = viewer.getPlugin('osm-map') as { active?: boolean; toggle?: () => void; jumpTo?: (lat: number, lng: number, zoom?: number) => void } | undefined;
      if (mapPlugin && !mapPlugin.active) mapPlugin.toggle?.();
      mapPlugin?.jumpTo?.(DEMO_PROFILE.site.mapLatitude, DEMO_PROFILE.site.mapLongitude, DEMO_PROFILE.site.mapZoom);
      openAssetDetail(viewer, 'hgv-14');
      return;
    }

    if ((step.action === 'focus' || step.action === 'maintenance') && step.path) {
      viewer.focusByPath(step.path);
      viewer.highlightByPath(step.path, true);
    }

    if (step.action === 'maintenance') {
      openAssetDetail(viewer, 'robot-cell-a');
      viewer.emit('enter-maintenance' as string, undefined);
    }
  };

  const goToStep = (index: number, shouldPlay = playing) => {
    const clamped = Math.max(0, Math.min(DEMO_STEPS.length - 1, index));
    setActiveStep(clamped);
    setElapsed(0);
    setPlaying(shouldPlay);
    runStepAction(clamped);
  };

  const startDemo = () => {
    goToStep(0, true);
  };

  const nextStep = () => {
    if (activeStep >= DEMO_STEPS.length - 1) {
      setPlaying(false);
      return;
    }
    goToStep(activeStep + 1, playing);
  };

  useEffect(() => {
    if (!playing) return;

    const timer = window.setInterval(() => {
      setElapsed((current) => {
        const next = current + 1;
        const duration = DEMO_STEPS[activeStep].durationSec;
        if (next >= duration) {
          window.setTimeout(() => {
            if (activeStep >= DEMO_STEPS.length - 1) {
              setPlaying(false);
              setElapsed(duration);
            } else {
              goToStep(activeStep + 1, true);
            }
          }, 0);
          return duration;
        }
        return next;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [activeStep, playing]);

  useEffect(() => {
    const startHandler = () => startDemo();
    const scenarioHandler = (payload?: { scenario?: 'normal' | 'dock4-blocked' }) => {
      if (payload?.scenario) setScenario(payload.scenario);
    };
    viewer.on('wpf-start-demo' as string, startHandler as any);
    viewer.on('wpf-scenario' as string, scenarioHandler as any);
    return () => {
      viewer.off('wpf-start-demo' as string, startHandler as any);
      viewer.off('wpf-scenario' as string, scenarioHandler as any);
    };
  }, [viewer, activeStep, playing]);

  const step = DEMO_STEPS[activeStep];
  const totalDuration = DEMO_STEPS.reduce((sum, item) => sum + item.durationSec, 0);
  const completedDuration = DEMO_STEPS.slice(0, activeStep).reduce((sum, item) => sum + item.durationSec, 0) + elapsed;
  const totalProgress = Math.min(100, (completedDuration / totalDuration) * 100);
  const stepProgress = Math.min(100, (elapsed / step.durationSec) * 100);

  return (
    <Paper
      elevation={7}
      sx={{
        position: 'fixed',
        left: '50%',
        bottom: 88,
        transform: 'translateX(-50%)',
        width: 640,
        maxWidth: 'calc(100vw - 220px)',
        display: { xs: 'none', lg: 'block' },
        pointerEvents: 'auto',
        p: 1,
        borderRadius: 2,
        bgcolor: 'rgba(12, 15, 19, 0.82)',
        backdropFilter: 'blur(18px)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 176px', gap: 1, alignItems: 'center' }}>
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
            <Chip
              label={playing ? 'DEMO RUNNING' : '2-3 MIN SCRIPT'}
              size="small"
              sx={{ height: 18, fontSize: 7.5, fontWeight: 900, bgcolor: playing ? 'rgba(102,187,106,0.14)' : 'rgba(32,161,177,0.16)', color: playing ? '#81c784' : '#20a1b1', border: '1px solid rgba(255,255,255,0.12)' }}
            />
            <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, fontWeight: 800, letterSpacing: 1 }}>
              STEP {activeStep + 1} / {DEMO_STEPS.length}
            </Typography>
          </Box>
          <Typography sx={{ color: '#fff', fontSize: 13, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{step.title}</Typography>
          <Typography sx={{ color: '#20a1b1', fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', mb: 0.35 }}>{step.note}</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.66)', fontSize: 10.5, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {scenario === 'dock4-blocked' && activeStep >= 2 ? `${step.script} Live scenario: Dock 4 is blocked, so the narrator is now using a recovery story with HGV-14 held and YT-02 rerouted.` : step.script}
          </Typography>
        </Box>

        <Stack spacing={0.6} sx={{ width: 176 }}>
          <Stack direction="row" spacing={0.75}>
            <Button
              size="small"
              variant="contained"
              startIcon={playing ? <Pause sx={{ fontSize: 15 }} /> : <PlayArrow sx={{ fontSize: 15 }} />}
              onClick={() => playing ? setPlaying(false) : startDemo()}
              sx={{ flex: 1, height: 28, fontSize: 9.5, fontWeight: 900, bgcolor: '#20a1b1', color: '#071013', '&:hover': { bgcolor: '#2db8ca' } }}
            >
              {playing ? 'Pause' : 'Start Demo'}
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={nextStep}
              sx={{ minWidth: 32, height: 28, px: 0.4, color: 'rgba(255,255,255,0.72)', borderColor: 'rgba(255,255,255,0.16)' }}
            >
              <SkipNext sx={{ fontSize: 17 }} />
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => goToStep(0, false)}
              sx={{ minWidth: 32, height: 28, px: 0.4, color: 'rgba(255,255,255,0.72)', borderColor: 'rgba(255,255,255,0.16)' }}
            >
              <RestartAlt sx={{ fontSize: 17 }} />
            </Button>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={totalProgress}
            sx={{ height: 5, borderRadius: 5, bgcolor: 'rgba(255,255,255,0.08)', '& .MuiLinearProgress-bar': { bgcolor: '#20a1b1', borderRadius: 5 } }}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 0.35 }}>
            {DEMO_STEPS.map((item, index) => (
              <Box
                key={item.label}
                onClick={() => goToStep(index, false)}
                sx={{
                  height: 18,
                  borderRadius: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  bgcolor: index === activeStep ? 'rgba(32,161,177,0.24)' : 'rgba(255,255,255,0.05)',
                  border: '1px solid',
                  borderColor: index === activeStep ? '#20a1b1' : 'rgba(255,255,255,0.08)',
                }}
              >
                <Typography sx={{ color: index === activeStep ? '#20a1b1' : 'rgba(255,255,255,0.52)', fontSize: 8, fontWeight: 900 }}>{item.label}</Typography>
              </Box>
            ))}
          </Box>
          <LinearProgress
            variant="determinate"
            value={stepProgress}
            sx={{ height: 3, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.06)', '& .MuiLinearProgress-bar': { bgcolor: '#81c784', borderRadius: 3 } }}
          />
        </Stack>
      </Box>
    </Paper>
  );
}

// --- Plugin -------------------------------------------------------------

export class DemoHMIPlugin implements RVViewerPlugin {
  readonly id = 'demo-hmi';
  readonly slots: UISlotEntry[] = [
    // KPI bar (top center)
    { slot: 'kpi-bar', component: OeeKpi, order: 10 },
    { slot: 'kpi-bar', component: PartsKpi, order: 20 },
    { slot: 'kpi-bar', component: CycleTimeKpi, order: 30 },
    { slot: 'kpi-bar', component: PowerKpi, order: 40 },

    // Button group (left sidebar)
    { slot: 'button-group', component: MachineControlButton, order: 5 },
    { slot: 'button-group', component: DrivesButton, order: 10 },
    { slot: 'button-group', component: SensorsButton, order: 20 },
    { slot: 'button-group', component: AlarmsButton, order: 30 },
    { slot: 'button-group', component: MaintenanceButton, order: 40 },

    // Bespoke cockpit overlay
    { slot: 'overlay', component: WakefieldOpsCockpit, order: 35 },
    { slot: 'overlay', component: GuidedDemoStrip, order: 45 },
    { slot: 'overlay', component: AssetDetailDrawer, order: 55 },

    // Messages (right panel)
    { slot: 'messages', component: DriveOverloadMessage, order: 10 },
    { slot: 'messages', component: MaintenanceDueMessage, order: 20 },
    { slot: 'messages', component: DriveInfoMessage, order: 30 },
    { slot: 'messages', component: RobotMaintenanceMessage, order: 40 },
  ];
}
