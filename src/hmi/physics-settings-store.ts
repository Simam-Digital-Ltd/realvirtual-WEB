/** Persists physics settings to localStorage. */

const STORAGE_KEY = 'rv-physics-settings';

export interface PhysicsSettings {
  enabled: boolean;
  gravity: number;
  friction: number;
  substeps: number;
  debugWireframes: boolean;
}

const DEFAULTS: PhysicsSettings = {
  enabled: true,
  gravity: 9.81,
  friction: 1.5,
  substeps: 1,
  debugWireframes: false,
};

export function loadPhysicsSettings(): PhysicsSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<PhysicsSettings>;
    return {
      enabled: parsed.enabled ?? DEFAULTS.enabled,
      gravity: parsed.gravity ?? DEFAULTS.gravity,
      friction: parsed.friction ?? DEFAULTS.friction,
      substeps: parsed.substeps ?? DEFAULTS.substeps,
      debugWireframes: parsed.debugWireframes ?? DEFAULTS.debugWireframes,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePhysicsSettings(settings: PhysicsSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* quota exceeded — silently ignore */ }
}
