/**
 * App-level configuration singleton.
 *
 * Loaded from `public/settings.json` before React mounts.
 * Provides lock-mode helpers consumed by settings stores and UI.
 */

import type { VisualSettings } from './hmi/visual-settings-store';
import type { PhysicsSettings } from './hmi/physics-settings-store';
import type { InterfaceSettings } from '../interfaces/interface-settings-store';
import type { SearchSettings } from './hmi/search-settings-store';
import type { UIVisibilityRule } from './hmi/ui-context-store';
import { debug } from './engine/rv-debug';

/** Configuration for context-aware UI visibility (loaded from settings.json `ui` key). */
export interface UIContextConfig {
  /** Contexts to activate on startup (e.g. ["kiosk"]). */
  initialContexts?: string[];
  /** Per-element visibility rule overrides — keys are element IDs like 'kpi-bar'. */
  visibilityOverrides?: Record<string, UIVisibilityRule>;
}

/** Settings tab identifiers used for selective locking. */
export type SettingsTabId = 'model' | 'visual' | 'physics' | 'interfaces' | 'devtools' | 'tests' | 'mcp' | 'multiuser';

/** Top-level app configuration loaded from `public/settings.json`. */
export interface RVAppConfig {
  /** Lock all settings — hides the settings gear button entirely. */
  lockSettings?: boolean;
  /** Selectively lock individual tabs (settings gear still visible). */
  lockedTabs?: SettingsTabId[];
/** Default model URL or filename (priority: URL param > defaultModel > localStorage > demo.glb). */
  defaultModel?: string;

  /** Global plugin IDs — lowest priority, overridden by modelname.json and GLB extras. */
  plugins?: string[];
  /** Global per-plugin config — lowest priority, deep-merged with model-specific config. */
  pluginConfig?: Record<string, Record<string, unknown>>;

  /** Partial overrides merged on top of localStorage values. */
  visual?: Partial<VisualSettings>;
  physics?: Partial<PhysicsSettings>;
  interface?: Partial<InterfaceSettings>;
  search?: Partial<SearchSettings>;

  /** Context-aware UI visibility configuration. */
  ui?: UIContextConfig;
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
      debug('config', 'No settings.json found, using defaults');
      return {};
    }
    const json: unknown = await resp.json();
    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
      console.warn('[config] settings.json is not a JSON object, ignoring');
      return {};
    }
    const keys = Object.keys(json);
    debug('config', `Loaded settings.json (${keys.length} key${keys.length !== 1 ? 's' : ''})`);
    return json as RVAppConfig;
  } catch {
    debug('config', 'No settings.json found, using defaults');
    return {};
  }
}
