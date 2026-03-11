/**
 * React hook for transport statistics from TransportStatsPlugin.
 *
 * Polls the plugin's ring buffer at a configurable interval (default 200ms).
 *
 * Usage:
 *   const { spawned, consumed } = useTransportStats();
 */

import { useState, useEffect } from 'react';
import { usePlugin } from './use-plugin';
import type { TransportStatsPlugin } from '../plugins/transport-stats-plugin';

export function useTransportStats(refreshMs = 200): { spawned: number; consumed: number } {
  const plugin = usePlugin<TransportStatsPlugin>('transport-stats');
  const [stats, setStats] = useState({ spawned: 0, consumed: 0 });

  useEffect(() => {
    if (!plugin) return;
    const id = setInterval(() => {
      setStats({
        spawned: plugin.spawnedBuffer.last() ?? 0,
        consumed: plugin.consumedBuffer.last() ?? 0,
      });
    }, refreshMs);
    return () => clearInterval(id);
  }, [plugin, refreshMs]);

  return stats;
}
