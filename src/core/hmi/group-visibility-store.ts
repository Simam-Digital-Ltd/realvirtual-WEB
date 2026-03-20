/**
 * group-visibility-store.ts — Persists group visibility state to localStorage.
 *
 * Stores which groups are hidden and which group (if any) is isolated,
 * so the state survives page reloads. Follows the same pattern as
 * visual-settings-store.ts.
 */

const STORAGE_KEY = 'rv-group-visibility';

export interface GroupVisibilitySettings {
  /** Names of groups that are currently hidden. */
  hiddenGroups: string[];
  /** Name of the isolated group (only this group visible), or null. */
  isolatedGroup: string | null;
}

const DEFAULTS: GroupVisibilitySettings = {
  hiddenGroups: [],
  isolatedGroup: null,
};

/**
 * Load group visibility settings from localStorage.
 * Returns defaults if nothing saved or data is corrupted.
 */
export function loadGroupVisibilitySettings(): GroupVisibilitySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<GroupVisibilitySettings>;
    return {
      hiddenGroups: Array.isArray(parsed.hiddenGroups) ? parsed.hiddenGroups : [],
      isolatedGroup: typeof parsed.isolatedGroup === 'string' ? parsed.isolatedGroup : null,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * Save group visibility settings to localStorage.
 */
export function saveGroupVisibilitySettings(settings: GroupVisibilitySettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* quota exceeded — silently ignore */ }
}
