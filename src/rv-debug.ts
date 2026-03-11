/**
 * rv-debug.ts — Structured debug logging for the WebViewer.
 *
 * Categories can be toggled individually via URL parameter or localStorage.
 * Enable all:  ?debug=all  or  localStorage.setItem('rv-debug', 'all')
 * Specific:    ?debug=playback,loader  or  localStorage.setItem('rv-debug', 'playback,loader')
 * Disable:     ?debug=none  or  localStorage.removeItem('rv-debug')
 *
 * In dev mode (Vite), 'loader' category is enabled by default.
 */

export type DebugCategory =
  | 'loader'     // GLB loading, node registration
  | 'playback'   // DrivesPlayback, ReplayRecording
  | 'drive'      // Drive updates, positionOverwrite
  | 'transport'  // TransportSurface, MU movement
  | 'sensor'     // Sensor collision, occupancy
  | 'logic'      // LogicStep execution
  | 'signal'     // Signal store changes
  | 'erratic'    // ErraticDriver
  | 'parity';    // GLB extras parity validation

const ALL_CATEGORIES: DebugCategory[] = [
  'loader', 'playback', 'drive', 'transport', 'sensor', 'logic', 'signal', 'erratic', 'parity',
];

/** Active debug categories */
const activeCategories = new Set<DebugCategory>();

/** Initialize from URL params and localStorage */
function init(): void {
  const params = new URLSearchParams(window.location.search);
  const debugParam = params.get('debug') ?? localStorage.getItem('rv-debug') ?? '';

  if (debugParam === 'all') {
    ALL_CATEGORIES.forEach((c) => activeCategories.add(c));
  } else if (debugParam && debugParam !== 'none') {
    for (const cat of debugParam.split(',')) {
      const trimmed = cat.trim() as DebugCategory;
      if (ALL_CATEGORIES.includes(trimmed)) {
        activeCategories.add(trimmed);
      }
    }
  }

  // Dev mode defaults: enable loader
  if (import.meta.env.DEV && activeCategories.size === 0) {
    activeCategories.add('loader');
  }

  if (activeCategories.size > 0) {
    console.log(`[rv-debug] Active categories: ${[...activeCategories].join(', ')}`);
  }
}

init();

/** Check if a category is enabled */
export function isDebugEnabled(category: DebugCategory): boolean {
  return activeCategories.has(category);
}

/** Enable a category at runtime */
export function enableDebug(category: DebugCategory): void {
  activeCategories.add(category);
}

/** Disable a category at runtime */
export function disableDebug(category: DebugCategory): void {
  activeCategories.delete(category);
}

/** Structured debug log — only prints if category is active */
export function debug(category: DebugCategory, message: string, ...args: unknown[]): void {
  if (!activeCategories.has(category)) return;
  console.log(`[${category}] ${message}`, ...args);
}

/** Structured debug warning — always prints (but tagged) */
export function debugWarn(category: DebugCategory, message: string, ...args: unknown[]): void {
  console.warn(`[${category}] ${message}`, ...args);
}

/** Structured debug error — always prints (but tagged) */
export function debugError(category: DebugCategory, message: string, ...args: unknown[]): void {
  console.error(`[${category}] ${message}`, ...args);
}
