import { useState, useEffect } from 'react';
import { Box } from '@mui/material';
import { TileCard } from './TileCard';
import { useViewer } from '../hooks/use-viewer';

/** Resolve short componentPath to full signal store key and subscribe. */
function useSensorState(componentPath: string): boolean | undefined {
  const viewer = useViewer();
  const [occupied, setOccupied] = useState<boolean | undefined>(undefined);
  const [resolvedPath, setResolvedPath] = useState<string | null>(null);

  // Resolve path and subscribe whenever model loads
  useEffect(() => {
    const tryResolve = () => {
      const reg = viewer.registry;
      const store = viewer.signalStore;
      if (!reg || !store) { setResolvedPath(null); return; }

      const node = reg.getNode(componentPath);
      if (!node) {
        console.warn(`[SensorCard] Node not found: "${componentPath}"`);
        setResolvedPath(null);
        return;
      }
      const fullPath = reg.getPathForNode(node);
      if (!fullPath) { setResolvedPath(null); return; }

      console.log(`[SensorCard] "${componentPath}" → "${fullPath}" (current: ${store.get(fullPath)})`);
      setResolvedPath(fullPath);
      setOccupied(!!store.get(fullPath));
    };

    tryResolve();
    const offLoaded = viewer.on('model-loaded', tryResolve);
    const offCleared = viewer.on('model-cleared', () => {
      setResolvedPath(null);
      setOccupied(undefined);
    });
    return () => { offLoaded(); offCleared(); };
  }, [viewer, componentPath]);

  // Subscribe to signal store changes
  useEffect(() => {
    if (!resolvedPath) return;
    const store = viewer.signalStore;
    if (!store) return;
    return store.subscribe(resolvedPath, (val) => setOccupied(!!val));
  }, [viewer, resolvedPath]);

  return occupied;
}

/** Sensor card with live occupied/clear status from the signal store. */
function SensorCard({ title, componentPath }: { title: string; componentPath: string }) {
  const occupied = useSensorState(componentPath);
  return (
    <TileCard
      title={title}
      subtitle={occupied === undefined ? 'No data' : occupied ? 'Part detected' : 'Clear'}
      severity={occupied ? 'success' : 'info'}
      icon="sensors"
      timestamp="Live"
      componentPath={componentPath}
    />
  );
}

export function RightPanel() {
  return (
    <Box
      sx={{
        position: 'fixed',
        right: 8,
        top: 0,
        bottom: 0,
        width: 300,
        zIndex: 1200,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 1,
        overflow: 'auto',
      }}
    >
      <TileCard
        title="Drive Overload"
        subtitle="Axis3 — Current: 142%"
        severity="error"
        icon="warning"
        timestamp="12:34:05"
        componentPath="A3"
      />
      <TileCard
        title="Maintenance Due"
        subtitle="Belt Conveyor 2 — 4800h / 5000h"
        severity="warning"
        icon="build"
        timestamp="Today"
        componentPath="ConveyorEntry2"
      />
      <TileCard
        title="Drive 1 — Entry Conveyor"
        subtitle="Position: 234.5 mm | Speed: 120 mm/s"
        severity="info"
        icon="speed"
        timestamp="Live"
        componentPath="DemoCell/Conveyors/ConveyorEntry1/Motor"
      />
      <SensorCard title="Sensor Entry" componentPath="EntrySensor" />
      <SensorCard title="Sensor Exit" componentPath="ExitSensor" />
    </Box>
  );
}
