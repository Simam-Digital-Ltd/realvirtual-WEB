/** Persists visual settings and camera bookmarks to localStorage. */

import { getAppConfig, isSettingsLocked } from '../rv-app-config';

const STORAGE_KEY = 'rv-visual-settings';

export type LightingMode = 'simple' | 'default';
export const LIGHTING_MODES: readonly LightingMode[] = ['simple', 'default'] as const;

export type ToneMappingType = 'none' | 'linear' | 'reinhard' | 'cineon' | 'aces' | 'agx' | 'neutral';
export const TONE_MAPPING_OPTIONS: readonly ToneMappingType[] = ['none', 'linear', 'reinhard', 'cineon', 'aces', 'agx', 'neutral'] as const;

export type ShadowQuality = 'low' | 'medium' | 'high';
export const SHADOW_QUALITY_OPTIONS: readonly ShadowQuality[] = ['low', 'medium', 'high'] as const;

export type ProjectionType = 'perspective' | 'orthographic';

export interface LightingModeSettings {
  lightIntensity: number;
  toneMapping: ToneMappingType;
  toneMappingExposure: number;
  ambientColor: string;
  ambientIntensity: number;
  dirLightEnabled: boolean;
  dirLightColor: string;
  dirLightIntensity: number;
  shadowEnabled: boolean;
  shadowIntensity: number;
  shadowQuality: ShadowQuality;
}

export interface CameraBookmark {
  px: number; py: number; pz: number;
  tx: number; ty: number; tz: number;
}

export interface VisualSettings {
  lightingMode: LightingMode;
  modeSettings: Record<LightingMode, LightingModeSettings>;
  projection: ProjectionType;
  fov: number;
  cameras: (CameraBookmark | null)[];
  /** Whether native MSAA antialiasing is enabled (requires page reload to change). */
  antialias: boolean;
  /** Shadow map resolution in pixels (512, 1024, or 2048). */
  shadowMapSize: number;
  /** Shadow softness radius (1-5). */
  shadowRadius: number;
  /** Maximum device pixel ratio (1.0 = performance, 1.5 = balanced, native = quality). */
  maxDpr: number;
  /** FPV walk speed in m/s. */
  fpvSpeed: number;
  /** FPV sprint speed in m/s. */
  fpvSprintSpeed: number;
  /** FPV mouse look sensitivity (radians per pixel). */
  fpvSensitivity: number;
  /** FPV eye height above ground in meters. */
  fpvEyeHeight: number;
}

const MODE_DEFAULTS: Record<LightingMode, LightingModeSettings> = {
  simple: {
    lightIntensity: 1.0, toneMapping: 'none', toneMappingExposure: 1.0,
    ambientColor: '#ffffff', ambientIntensity: 1.0,
    dirLightEnabled: false, dirLightColor: '#ffffff', dirLightIntensity: 1.5,
    shadowEnabled: false, shadowIntensity: 0.5, shadowQuality: 'medium',
  },
  default: {
    lightIntensity: 0.5, toneMapping: 'neutral', toneMappingExposure: 1.0,
    ambientColor: '#ffffff', ambientIntensity: 1.3,
    dirLightEnabled: true, dirLightColor: '#ffffff', dirLightIntensity: 1.5,
    shadowEnabled: true, shadowIntensity: 0.95, shadowQuality: 'medium',
  },
};

const DEFAULTS: VisualSettings = {
  lightingMode: 'default',
  modeSettings: {
    simple:  { ...MODE_DEFAULTS.simple },
    default: { ...MODE_DEFAULTS.default },
  },
  projection: 'perspective' as ProjectionType,
  fov: 45,
  cameras: [null, null, null],
  antialias: true,
  shadowMapSize: 1024,
  shadowRadius: 2,
  maxDpr: 1.5,
  fpvSpeed: 2.5,
  fpvSprintSpeed: 5.0,
  fpvSensitivity: 0.002,
  fpvEyeHeight: 1.7,
};

function migrateToneMapping(raw: unknown, mode: LightingMode): ToneMappingType {
  if (typeof raw === 'string' && (TONE_MAPPING_OPTIONS as readonly string[]).includes(raw)) return raw as ToneMappingType;
  if (raw === true) return 'neutral';
  if (raw === false) return 'none';
  return MODE_DEFAULTS[mode].toneMapping;
}

function parseModeSettings(raw: unknown): Record<LightingMode, LightingModeSettings> {
  const result: Record<LightingMode, LightingModeSettings> = {
    simple:  { ...MODE_DEFAULTS.simple },
    default: { ...MODE_DEFAULTS.default },
  };
  if (typeof raw !== 'object' || raw === null) return result;
  const obj = raw as Record<string, Partial<LightingModeSettings> & { toneMapping?: unknown }>;
  for (const mode of LIGHTING_MODES) {
    if (obj[mode]) {
      const d = MODE_DEFAULTS[mode];
      const s = obj[mode];
      result[mode].lightIntensity = s.lightIntensity ?? d.lightIntensity;
      result[mode].toneMapping = migrateToneMapping(s.toneMapping, mode);
      result[mode].toneMappingExposure = s.toneMappingExposure ?? d.toneMappingExposure;
      result[mode].ambientColor = s.ambientColor ?? d.ambientColor;
      result[mode].ambientIntensity = s.ambientIntensity ?? d.ambientIntensity;
      result[mode].dirLightEnabled = s.dirLightEnabled ?? d.dirLightEnabled;
      result[mode].dirLightColor = s.dirLightColor ?? d.dirLightColor;
      result[mode].dirLightIntensity = s.dirLightIntensity ?? d.dirLightIntensity;
      result[mode].shadowEnabled = s.shadowEnabled ?? d.shadowEnabled;
      result[mode].shadowIntensity = s.shadowIntensity ?? d.shadowIntensity;
      result[mode].shadowQuality = (s.shadowQuality && (SHADOW_QUALITY_OPTIONS as readonly string[]).includes(s.shadowQuality)) ? s.shadowQuality : d.shadowQuality;
    }
  }
  return result;
}

export function loadVisualSettings(): VisualSettings {
  const fromStorage = loadFromLocalStorage();
  const override = getAppConfig().visual;
  if (!override) return fromStorage;
  return {
    lightingMode: override.lightingMode ?? fromStorage.lightingMode,
    modeSettings: fromStorage.modeSettings,
    projection: override.projection ?? fromStorage.projection,
    fov: override.fov ?? fromStorage.fov,
    cameras: fromStorage.cameras,
    antialias: fromStorage.antialias,
    shadowMapSize: fromStorage.shadowMapSize,
    shadowRadius: fromStorage.shadowRadius,
    maxDpr: fromStorage.maxDpr,
    fpvSpeed: fromStorage.fpvSpeed,
    fpvSprintSpeed: fromStorage.fpvSprintSpeed,
    fpvSensitivity: fromStorage.fpvSensitivity,
    fpvEyeHeight: fromStorage.fpvEyeHeight,
  };
}

function loadFromLocalStorage(): VisualSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS, modeSettings: { simple: { ...MODE_DEFAULTS.simple }, default: { ...MODE_DEFAULTS.default } }, cameras: [...DEFAULTS.cameras] };
    const parsed = JSON.parse(raw) as Partial<VisualSettings> & { lightIntensity?: number; qualityPreset?: string };
    const mode = (parsed.lightingMode && LIGHTING_MODES.includes(parsed.lightingMode)) ? parsed.lightingMode : DEFAULTS.lightingMode;
    const modeSettings = parseModeSettings(parsed.modeSettings);
    if (typeof parsed.lightIntensity === 'number' && !parsed.modeSettings) {
      modeSettings[mode].lightIntensity = parsed.lightIntensity;
    }
    const projection = (parsed.projection === 'perspective' || parsed.projection === 'orthographic') ? parsed.projection : DEFAULTS.projection;
    const antialiasRaw = (parsed as Record<string, unknown>).antialias;
    const antialias = typeof antialiasRaw === 'boolean' ? antialiasRaw : DEFAULTS.antialias;
    const shadowMapSizeRaw = (parsed as Record<string, unknown>).shadowMapSize;
    const shadowMapSize = (typeof shadowMapSizeRaw === 'number' && [512, 1024, 2048].includes(shadowMapSizeRaw))
      ? shadowMapSizeRaw : DEFAULTS.shadowMapSize;
    const shadowRadiusRaw = (parsed as Record<string, unknown>).shadowRadius;
    const shadowRadius = (typeof shadowRadiusRaw === 'number' && shadowRadiusRaw >= 1 && shadowRadiusRaw <= 5)
      ? shadowRadiusRaw : DEFAULTS.shadowRadius;
    const maxDprRaw = (parsed as Record<string, unknown>).maxDpr;
    const maxDpr = (typeof maxDprRaw === 'number' && maxDprRaw >= 0.5 && maxDprRaw <= 4)
      ? maxDprRaw : DEFAULTS.maxDpr;
    const fpvSpeedRaw = (parsed as Record<string, unknown>).fpvSpeed;
    const fpvSpeed = (typeof fpvSpeedRaw === 'number' && fpvSpeedRaw >= 0.5 && fpvSpeedRaw <= 20)
      ? fpvSpeedRaw : DEFAULTS.fpvSpeed;
    const fpvSprintSpeedRaw = (parsed as Record<string, unknown>).fpvSprintSpeed;
    const fpvSprintSpeed = (typeof fpvSprintSpeedRaw === 'number' && fpvSprintSpeedRaw >= 1 && fpvSprintSpeedRaw <= 40)
      ? fpvSprintSpeedRaw : DEFAULTS.fpvSprintSpeed;
    const fpvSensitivityRaw = (parsed as Record<string, unknown>).fpvSensitivity;
    const fpvSensitivity = (typeof fpvSensitivityRaw === 'number' && fpvSensitivityRaw >= 0.0005 && fpvSensitivityRaw <= 0.01)
      ? fpvSensitivityRaw : DEFAULTS.fpvSensitivity;
    const fpvEyeHeightRaw = (parsed as Record<string, unknown>).fpvEyeHeight;
    const fpvEyeHeight = (typeof fpvEyeHeightRaw === 'number' && fpvEyeHeightRaw >= 0.5 && fpvEyeHeightRaw <= 5)
      ? fpvEyeHeightRaw : DEFAULTS.fpvEyeHeight;
    return {
      lightingMode: mode,
      modeSettings,
      projection,
      fov: typeof parsed.fov === 'number' ? parsed.fov : DEFAULTS.fov,
      cameras: Array.isArray(parsed.cameras) ? parsed.cameras.slice(0, 3) : [...DEFAULTS.cameras],
      antialias,
      shadowMapSize,
      shadowRadius,
      maxDpr,
      fpvSpeed,
      fpvSprintSpeed,
      fpvSensitivity,
      fpvEyeHeight,
    };
  } catch {
    return { ...DEFAULTS, modeSettings: { simple: { ...MODE_DEFAULTS.simple }, default: { ...MODE_DEFAULTS.default } }, cameras: [...DEFAULTS.cameras] };
  }
}

export function saveVisualSettings(settings: VisualSettings): void {
  if (isSettingsLocked()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* quota exceeded — silently ignore */ }
}
