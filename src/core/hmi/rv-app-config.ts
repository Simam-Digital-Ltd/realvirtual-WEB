/**
 * Re-export barrel — rv-app-config moved to core/rv-app-config.ts.
 * This file exists for backward compatibility during migration.
 * Import from '../rv-app-config' or '../../core/rv-app-config' instead.
 */
export {
  type UIContextConfig,
  type SettingsTabId,
  type RVAppConfig,
  setAppConfig,
  getAppConfig,
  isSettingsLocked,
  isTabLocked,
  fetchAppConfig,
} from '../rv-app-config';
