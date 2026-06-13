// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { useSyncExternalStore } from 'react';

let activeRobotId: string | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

export function openTrendOverlay(robotId: string): void {
  activeRobotId = robotId;
  notify();
}

export function closeTrendOverlay(): void {
  activeRobotId = null;
  notify();
}

export function getActiveTrendRobotId(): string | null {
  return activeRobotId;
}

export function useTrendOverlay(): string | null {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => activeRobotId,
  );
}
