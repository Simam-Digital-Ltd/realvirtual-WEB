/** Persists visual settings and camera bookmarks to localStorage. */

const STORAGE_KEY = 'rv-visual-settings';

export interface CameraBookmark {
  px: number; py: number; pz: number;   // camera position
  tx: number; ty: number; tz: number;   // orbit target
}

export interface VisualSettings {
  shadows: boolean;
  shadowStrength: number;
  lightIntensity: number;
  cameras: (CameraBookmark | null)[];
}

const DEFAULTS: VisualSettings = {
  shadows: true,
  shadowStrength: 0.5,
  lightIntensity: 1.0,
  cameras: [null, null, null],
};

export function loadVisualSettings(): VisualSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS, cameras: [...DEFAULTS.cameras] };
    const parsed = JSON.parse(raw) as Partial<VisualSettings>;
    return {
      shadows: parsed.shadows ?? DEFAULTS.shadows,
      shadowStrength: parsed.shadowStrength ?? DEFAULTS.shadowStrength,
      lightIntensity: parsed.lightIntensity ?? DEFAULTS.lightIntensity,
      cameras: Array.isArray(parsed.cameras) ? parsed.cameras.slice(0, 3) : [...DEFAULTS.cameras],
    };
  } catch {
    return { ...DEFAULTS, cameras: [...DEFAULTS.cameras] };
  }
}

export function saveVisualSettings(settings: VisualSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* quota exceeded — silently ignore */ }
}
