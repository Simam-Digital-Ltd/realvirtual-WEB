/**
 * DemoHMIPlugin — Registers demo HMI content into the slot system.
 *
 * Each element self-registers with a slot and order. To customize:
 * create your own RVViewerPlugin with a `slots` array.
 */

import { useState } from 'react';
import { Speed, Sensors, Warning, Build, Visibility } from '@mui/icons-material';
import type { RVViewerPlugin } from '../core/rv-plugin';
import type { UISlotEntry, UISlotProps } from '../core/rv-ui-plugin';

// Core reusable components
import { KpiCard } from '../core/hmi/KpiCard';
import { TileCard } from '../core/hmi/TileCard';
import { NavButton } from '../core/hmi/NavButton';

// Custom charts (demo content)
import { OeeChart } from './OeeChart';
import { PartsChart } from './PartsChart';
import { CycleTimeChart } from './CycleTimeChart';
import { EnergyChart } from './EnergyChart';

// Custom overlays
import { SensorChartOverlay } from './SensorChartOverlay';

// Hooks
import { useDriveChartOpen } from '../hooks/use-drive-chart';
import { useSensorChartOpen } from '../hooks/use-sensor-chart';
import { useSensorState } from '../hooks/use-sensor-state';

// ─── KPI Bar Entries ────────────────────────────────────────────────────

function OeeKpi(_props: UISlotProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <KpiCard label="OEE" value="87" unit="%" color="#66bb6a" secondary="Target: 90%" onClick={() => setOpen((o) => !o)} />
      <OeeChart open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function PartsKpi(_props: UISlotProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <KpiCard label="Parts/h" value="28" unit="p/h" color="#4fc3f7" secondary="Shift total: 186" onClick={() => setOpen((o) => !o)} />
      <PartsChart open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function CycleTimeKpi(_props: UISlotProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <KpiCard label="Cycle Time" value="4.2" unit="s" color="#ffa726" secondary="Avg last hour" onClick={() => setOpen((o) => !o)} />
      <CycleTimeChart open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function PowerKpi(_props: UISlotProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <KpiCard label="Power" value="23.4" unit="kW" color="#ef5350" secondary="Avg: 18.7 kW" onClick={() => setOpen((o) => !o)} />
      <EnergyChart open={open} onClose={() => setOpen(false)} />
    </>
  );
}

// ─── Button Group Entries ───────────────────────────────────────────────

function DrivesButton({ viewer }: UISlotProps) {
  const open = useDriveChartOpen();
  return <NavButton icon={<Speed />} label="Drives" active={open} onClick={() => viewer.toggleDriveChart()} />;
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

function MaintenanceButton(_props: UISlotProps) {
  return <NavButton icon={<Build />} label="Maintenance" badge={1} />;
}

function ViewsButton(_props: UISlotProps) {
  return <NavButton icon={<Visibility />} label="Views" />;
}

// ─── Message Panel Entries ──────────────────────────────────────────────

function DriveOverloadMessage(_props: UISlotProps) {
  return (
    <TileCard
      title="Drive Overload"
      subtitle="Axis3 — Current: 142%"
      severity="error"
      icon="warning"
      timestamp="12:34:05"
      componentPath="A3"
    />
  );
}

function MaintenanceDueMessage(_props: UISlotProps) {
  return (
    <TileCard
      title="Maintenance Due"
      subtitle="Belt Conveyor 2 — 4800h / 5000h"
      severity="warning"
      icon="build"
      timestamp="Today"
      componentPath="ConveyorEntry2"
    />
  );
}

function DriveInfoMessage(_props: UISlotProps) {
  return (
    <TileCard
      title="Drive 1 — Entry Conveyor"
      subtitle="Position: 234.5 mm | Speed: 120 mm/s"
      severity="info"
      icon="speed"
      timestamp="Live"
      componentPath="DemoCell/Conveyors/ConveyorEntry1/Motor"
    />
  );
}

function EntrySensorMessage(_props: UISlotProps) {
  const occupied = useSensorState('DemoCell/EntrySensor');
  return (
    <TileCard
      title="Sensor Entry"
      subtitle={occupied ? 'Part detected' : 'Clear'}
      severity={occupied ? 'success' : 'info'}
      icon="sensors"
      timestamp="Live"
      componentPath="EntrySensor"
    />
  );
}

function ExitSensorMessage(_props: UISlotProps) {
  const occupied = useSensorState('DemoCell/ExitSensor');
  return (
    <TileCard
      title="Sensor Exit"
      subtitle={occupied ? 'Part detected' : 'Clear'}
      severity={occupied ? 'success' : 'info'}
      icon="sensors"
      timestamp="Live"
      componentPath="ExitSensor"
    />
  );
}

// ─── Plugin ─────────────────────────────────────────────────────────────

export class DemoHMIPlugin implements RVViewerPlugin {
  readonly id = 'demo-hmi';
  readonly slots: UISlotEntry[] = [
    // KPI bar (top center)
    { slot: 'kpi-bar', component: OeeKpi, order: 10 },
    { slot: 'kpi-bar', component: PartsKpi, order: 20 },
    { slot: 'kpi-bar', component: CycleTimeKpi, order: 30 },
    { slot: 'kpi-bar', component: PowerKpi, order: 40 },

    // Button group (left sidebar)
    { slot: 'button-group', component: DrivesButton, order: 10 },
    { slot: 'button-group', component: SensorsButton, order: 20 },
    { slot: 'button-group', component: AlarmsButton, order: 30 },
    { slot: 'button-group', component: MaintenanceButton, order: 40 },
    { slot: 'button-group', component: ViewsButton, order: 50 },

    // Messages (right panel)
    { slot: 'messages', component: DriveOverloadMessage, order: 10 },
    { slot: 'messages', component: MaintenanceDueMessage, order: 20 },
    { slot: 'messages', component: DriveInfoMessage, order: 30 },
    { slot: 'messages', component: EntrySensorMessage, order: 40 },
    { slot: 'messages', component: ExitSensorMessage, order: 50 },
  ];
}
