// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/** Tiny global store for HMI overlay visibility (persisted in localStorage). */

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'rv-hmi-visible';
const AUTO_RESTORE_KEY = 'rv-hmi-auto-restore';

let visible = loadInitial();
const listeners = new Set<() => void>();

function loadInitial(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('hmi') === '0') return false;
    if (params.get('hmi') === '1') {
      localStorage.setItem(STORAGE_KEY, '1');
      return true;
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === '0') {
      const restoreCount = Number(localStorage.getItem(AUTO_RESTORE_KEY) ?? '0');
      if (restoreCount < 1) {
        localStorage.setItem(AUTO_RESTORE_KEY, '1');
        localStorage.setItem(STORAGE_KEY, '1');
        return true;
      }
    }

    return raw === null ? true : raw === '1';
  } catch {
    return true;
  }
}

function notify() {
  for (const fn of listeners) fn();
}

export function toggleHmiVisible(): void {
  visible = !visible;
  try {
    localStorage.setItem(STORAGE_KEY, visible ? '1' : '0');
    if (visible) localStorage.removeItem(AUTO_RESTORE_KEY);
  } catch { /* ignore */ }
  notify();
}

export function setHmiVisible(next: boolean): void {
  if (visible === next) return;
  visible = next;
  try {
    localStorage.setItem(STORAGE_KEY, visible ? '1' : '0');
    if (visible) localStorage.removeItem(AUTO_RESTORE_KEY);
  } catch { /* ignore */ }
  notify();
}

export function getHmiVisible(): boolean {
  return visible;
}

/** React hook - triggers re-render when visibility changes. */
export function useHmiVisible(): boolean {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => visible,
  );
}
