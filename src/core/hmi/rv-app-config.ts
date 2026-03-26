/**
 * App-level configuration singleton.
 *
 * Loaded from `public/settings.json` before React mounts.
 * Provides lock-mode helpers consumed by settings stores and UI.
 */

import type { VisualSettings } from './visual-settings-store';
import type { PhysicsSettings } from './physics-settings-store';
import type { InterfaceSettings } from '../../interfaces/interface-settings-store';
import type { SearchSettings } from './search-settings-store';

/** Settings tab identifiers used for selective locking. */
export type SettingsTabId = 'model' | 'visual' | 'physics' | 'interfaces' | 'devtools' | 'tests';

/** Top-level app configuration loaded from `public/settings.json`. */
export interface RVAppConfig {
  /** Lock all settings — hides the settings gear button entirely. */
  lockSettings?: boolean;
  /** Selectively lock individual tabs (settings gear still visible). */
  lockedTabs?: SettingsTabId[];
/** Default model URL or filename (priority: URL param > defaultModel > localStorage > demo.glb). */
  defaultModel?: string;

  /** Partial overrides merged on top of localStorage values. */
  visual?: Partial<VisualSettings>;
  physics?: Partial<PhysicsSettings>;
  interface?: Partial<InterfaceSettings>;
  search?: Partial<SearchSettings>;
}

// ─── Singleton State ───────────────────────────────────────────

let _config: RVAppConfig = {};

/** Replace the current app config (call once in main.ts before React mount). */
export function setAppConfig(config: RVAppConfig): void {
  _config = config;
}

/** Read the current app config. */
export function getAppConfig(): RVAppConfig {
  return _config;
}

/** True when the entire settings dialog should be hidden. */
export function isSettingsLocked(): boolean {
  return _config.lockSettings === true;
}

/** True when a specific settings tab should be hidden/disabled. */
export function isTabLocked(tab: SettingsTabId): boolean {
  if (_config.lockSettings) return true;
  return _config.lockedTabs?.includes(tab) ?? false;
}

// ─── Fetch ─────────────────────────────────────────────────────

/**
 * Fetch `public/settings.json`. Returns `{}` silently on 404, network error,
 * or invalid JSON so the app always boots with defaults.
 */
export async function fetchAppConfig(): Promise<RVAppConfig> {
  try {
    const resp = await fetch(`./settings.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!resp.ok) {
      console.log('[config] No settings.json found, using defaults');
      return {};
    }
    const json: unknown = await resp.json();
    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
      console.warn('[config] settings.json is not a JSON object, ignoring');
      return {};
    }
    const keys = Object.keys(json);
    console.log(`[config] Loaded settings.json (${keys.length} key${keys.length !== 1 ? 's' : ''})`);
    return json as RVAppConfig;
  } catch {
    console.log('[config] No settings.json found, using defaults');
    return {};
  }
}
