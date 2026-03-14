/**
 * rv-inspector-helpers.ts — Pure helper functions and constants shared by the
 * Property Inspector and Hierarchy Browser.
 *
 * Extracted from rv-property-inspector.tsx to break circular imports and
 * consolidate duplicated badge color maps / type helpers.
 */

import { getConsumedFields, getIgnoredFields } from '../engine/rv-extras-validator';
import type { SignalStore } from '../engine/rv-signal-store';

// ── Hidden component types (not shown in inspector or hierarchy) ──────────

/** Component types that are internal/structural and not useful to display. */
const HIDDEN_COMPONENT_TYPES = new Set(['rigidbody', 'renderer', 'colliders', 'BoxCollider']);

export function isHiddenComponentType(type: string): boolean {
  return HIDDEN_COMPONENT_TYPES.has(type);
}

// ── Enum options ─────────────────────────────────────────────────────────

const DIRECTION_OPTIONS = [
  'LinearX', 'LinearY', 'LinearZ',
  'RotationX', 'RotationY', 'RotationZ',
];

const ACTIVE_OPTIONS = ['Always', 'Connected', 'Disconnected'];

/** Map of field names to their enum options. */
export const ENUM_FIELDS: Record<string, string[]> = {
  Direction: DIRECTION_OPTIONS,
  TransportDirection: DIRECTION_OPTIONS,
  RayCastDirection: DIRECTION_OPTIONS,
  Active: ACTIVE_OPTIONS,
};

// ── Hidden fields ────────────────────────────────────────────────────────

/** Fields hidden from the inspector (redundant with header or always empty). */
export const HIDDEN_FIELD_NAMES = new Set(['Name']);

// ── Component type suffix stripping ──────────────────────────────────────

/**
 * Strip numeric suffix from component type for validator lookup.
 * E.g. "ReplayRecording_1" -> "ReplayRecording", "Drive" -> "Drive"
 */
export function baseComponentType(type: string): string {
  return type.replace(/_\d+$/, '');
}

// ── Field type inference ──────────────────────────────────────────────────

export type FieldType = 'number' | 'boolean' | 'string' | 'enum' | 'vector3' | 'reference' | 'scriptableobject' | 'object';

/** Check if a value is a ComponentReference ({ type: "ComponentReference", path, componentType }). */
export function isComponentRef(value: unknown): value is { type: string; path: string; componentType: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return obj['type'] === 'ComponentReference' && typeof obj['path'] === 'string';
}

/** Check if a value is a ScriptableObject reference ({ type: "ScriptableObject", ... }). */
export function isScriptableObject(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return (value as Record<string, unknown>)['type'] === 'ScriptableObject';
}

export function inferFieldType(fieldName: string, value: unknown): FieldType {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (Array.isArray(value)) return 'object';
  if (isComponentRef(value)) return 'reference';
  if (isScriptableObject(value)) return 'scriptableobject';
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'x' in value &&
    'y' in value &&
    'z' in value
  ) return 'vector3';
  if (fieldName in ENUM_FIELDS) return 'enum';
  // Generic objects (structs like ConnectionInfo) — display as read-only
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return 'object';
  return 'string';
}

// ── Field status classification ───────────────────────────────────────────

export type FieldStatus = 'consumed' | 'ignored' | 'unknown';

export function classifyField(componentType: string, fieldName: string): FieldStatus {
  const base = baseComponentType(componentType);
  const consumed = getConsumedFields(base);
  if (consumed.includes(fieldName)) return 'consumed';

  const ignored = getIgnoredFields(base);
  if (ignored.includes('*') || ignored.includes(fieldName)) return 'ignored';

  return 'unknown';
}

// ── Badge color map (shared between hierarchy browser and inspector) ──────

export const BADGE_COLORS: Record<string, string> = {
  Drive: '#4fc3f7',
  TransportSurface: '#ffa726',
  Sensor: '#66bb6a',
  Source: '#ab47bc',
  Sink: '#ef5350',
  MU: '#78909c',
  DrivesRecorder: '#7e57c2',
  ReplayRecording: '#26a69a',
};

export function componentColor(type: string): string {
  if (type.startsWith('LogicStep_')) return '#8d6e63';
  if (type.startsWith('PLCInput')) return '#ef5350';
  if (type.startsWith('PLCOutput')) return '#66bb6a';
  if (type.startsWith('Drive_')) return '#29b6f6';
  return BADGE_COLORS[type] ?? '#90a4ae';
}

// ── Format display value for read-only fields ─────────────────────────────

export function formatDisplayValue(value: unknown): string {
  if (value === null || value === undefined) return '\u2014';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  if (isComponentRef(value)) {
    const last = value.path.split('/').pop() ?? value.path;
    return last;
  }
  if (isScriptableObject(value)) {
    const obj = value as Record<string, unknown>;
    return (obj['name'] as string) ?? 'ScriptableObject';
  }
  if (typeof value === 'object' && 'x' in (value as Record<string, unknown>)) {
    const v = value as { x: number; y: number; z: number };
    return `(${v.x}, ${v.y}, ${v.z})`;
  }
  return JSON.stringify(value);
}

// ── Signal reference helpers ──────────────────────────────────────────────

export function isSignalRefType(componentType: string): boolean {
  const short = componentType.split('.').pop() ?? '';
  return short.startsWith('PLCInput') || short.startsWith('PLCOutput');
}

export function signalTypeLabel(type: string): string {
  if (type === 'PLCOutputBool') return 'OutBool';
  if (type === 'PLCOutputFloat') return 'OutFloat';
  if (type === 'PLCOutputInt') return 'OutInt';
  if (type === 'PLCInputBool') return 'InBool';
  if (type === 'PLCInputFloat') return 'InFloat';
  if (type === 'PLCInputInt') return 'InInt';
  return type.replace('PLCOutput', 'Out:').replace('PLCInput', 'In:');
}

export function formatRefSignalValue(shortType: string, signalStore: SignalStore | null, path: string): string {
  if (!signalStore) return '\u2014';
  const value = signalStore.getByPath(path);
  if (value === undefined) return '\u2014';
  if (shortType.includes('Bool')) return value === true ? '\u25CF' : '\u25CB';
  if (typeof value === 'number') return shortType.includes('Int') ? Math.trunc(value).toString() : value.toFixed(1);
  return '\u2014';
}

// ── Sensor reference helpers ────────────────────────────────────────────

export function isSensorRefType(componentType: string): boolean {
  const short = componentType.split('.').pop() ?? '';
  return short === 'Sensor';
}

export function formatSensorStatus(signalStore: SignalStore | null, path: string): string {
  if (!signalStore) return '';
  const value = signalStore.getByPath(path);
  if (value === undefined) return '';
  return value === true ? '\u25CF' : '\u25CB';
}

// ── Signal component type detection (the component itself, not a ref) ─────

export function isSignalComponentType(type: string): boolean {
  return type.startsWith('PLCInput') || type.startsWith('PLCOutput');
}

/** Get live signal value for display in component header. */
export function getSignalDisplayValue(
  signalStore: SignalStore | null,
  nodePath: string,
  componentType: string,
  data: Record<string, unknown>,
): string | null {
  if (!signalStore || !isSignalComponentType(componentType)) return null;

  // Try path-based lookup first, then fall back to name-based
  let value = signalStore.getByPath(nodePath);
  if (value === undefined) {
    const signalName = (data['Name'] as string) || nodePath.split('/').pop() || '';
    if (signalName) value = signalStore.get(signalName);
  }

  if (value === undefined) return null;
  if (componentType.includes('Bool')) {
    return value === true ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return componentType.includes('Int') ? Math.trunc(value).toString() : value.toFixed(2);
  }
  return String(value);
}

// ── Reverse reference helpers (who points to this node?) ──────────────────

export interface ReverseReference {
  sourcePath: string;
  fieldName: string;
  componentType: string;
}

/** Check if two paths refer to the same node (handles root prefix and space normalization). */
export function pathsMatch(refPath: string, targetPath: string): boolean {
  if (refPath === targetPath) return true;
  const normRef = refPath.replace(/ /g, '_');
  const normTarget = targetPath.replace(/ /g, '_');
  if (normRef === normTarget) return true;
  if (normTarget.endsWith('/' + normRef)) return true;
  if (normRef.endsWith('/' + normTarget)) return true;
  return false;
}
