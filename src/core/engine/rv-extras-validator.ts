/**
 * rv-extras-validator.ts — Dev-mode GLB extras parity validator.
 *
 * Logs warnings for GLB extras fields that are present in the data
 * but not consumed or explicitly ignored by the TypeScript parsers.
 * This catches C#→TypeScript drift when new fields are added to Unity components.
 *
 * Only active in dev mode (import.meta.env.DEV). Zero overhead in production.
 *
 * Usage:
 *   validateExtras('Drive', driveData);
 *   // Logs: [Parity] Unhandled Drive field: "SpeedOverride" (value: 0)
 */

/** Fields consumed by each TypeScript parser (actively read and used). */
const CONSUMED: Record<string, string[]> = {
  // parseDriveExtras() — C# source: Drive.cs (Packages/io.realvirtual.starter/Runtime/Components/Drive.cs)
  Drive: [
    'Direction', 'ReverseDirection', 'Offset', 'StartPosition',
    'TargetSpeed', 'Acceleration', 'UseAcceleration',
    'UseLimits', 'LowerLimit', 'UpperLimit',
  ],

  // parseTransportSurfaceExtras() — C# source: TransportSurface.cs
  TransportSurface: [
    'TransportDirection', 'Radial', 'TextureScale', 'HeightOffsetOverride',
  ],

  // parseSensorExtras() — C# source: Sensor.cs
  Sensor: [
    'UseRaycast',        // C# field — maps to mode 'Raycast' vs 'Collision'
    'RayCastDirection',  // Vector3 — local-space ray direction (Raycast mode)
    'RayCastLength',     // float — max detection distance in mm (Raycast mode)
    // NOTE: 'InvertSignal' and 'Mode' do NOT exist in C# Sensor.cs.
    // They were legacy WebViewer fields. C# uses 'UseRaycast' instead.
  ],

  // parseSourceExtras() — C# source: Source.cs
  Source: [
    'AutomaticGeneration', 'Interval', 'GenerateIfDistance',
    'ThisObjectAsMU', 'PlaceOnTransportSurface',
    // Legacy WebViewer field names (fallback):
    'Spawn', 'SpawnInterval', 'SpawnDistance',
  ],

  // Sink — no extras parsed yet
  Sink: [],

  // MU — no extras parsed yet (template nodes only)
  MU: [],

  // BoxCollider — used by createAABBFromExtras()
  BoxCollider: ['center', 'size'],

  // Signal types — connection-relevant fields editable, Status read-only (object)
  PLCOutputBool: ['Comment', 'OriginDataType', 'Settings', 'Metadata', 'Active'],
  PLCInputBool: ['Comment', 'OriginDataType', 'Settings', 'Metadata', 'Active'],
  PLCOutputFloat: ['Comment', 'OriginDataType', 'Settings', 'Metadata', 'Active'],
  PLCInputFloat: ['Comment', 'OriginDataType', 'Settings', 'Metadata', 'Active'],
  PLCOutputInt: ['Comment', 'OriginDataType', 'Settings', 'Metadata', 'Active'],
  PLCInputInt: ['Comment', 'OriginDataType', 'Settings', 'Metadata', 'Active'],

  // DrivesRecorder — recorder settings parsing
  DrivesRecorder: [
    'PlayOnStart', 'ReplayStartFrame', 'ReplayEndFrame', 'Loop',
    'DrivesRecording',  // ScriptableObject reference
    'Active',           // ActiveOnly — controls playback in Connected/Disconnected mode
  ],

  // DrivesRecording_compact — parsed by parseCompactRecording()
  DrivesRecording_compact: [
    'fixedDeltaTime', 'numberFrames', 'driveCount', 'drives', 'positions', 'sequences',
  ],

  // ReplayRecording — parsed in the traverse loop
  ReplayRecording: [
    'Sequence', 'StartOnSignal', 'IsReplayingSignal',
    'Active',  // ActiveOnly — controls replay in Connected/Disconnected mode
  ],

  // LogicStep types — parsed by RVLogicEngine.build()
  LogicStep_SerialContainer: ['Active'],  // container, Active parsed for top-level guard
  LogicStep_ParallelContainer: ['Active'],
  LogicStep_SetSignalBool: ['Signal', 'SetToTrue', 'Active'],
  LogicStep_WaitForSensor: ['Sensor', 'WaitForOccupied', 'Active'],
  LogicStep_WaitForSignalBool: ['Signal', 'WaitForTrue', 'Active'],
  LogicStep_Delay: ['Duration', 'Active'],
  LogicStep_DriveToPosition: ['drive', 'Destination', 'Relative', 'Direction', 'Active'],
  LogicStep_DriveTo: ['drive', 'Destination', 'Relative', 'Direction', 'Active'],
  LogicStep_SetDriveSpeed: ['drive', 'Speed', 'Active'],
  LogicStep_Enable: ['Target', 'Enable', 'Active'],
  LogicStep_Pause: ['Active'],  // debugging breakpoint, no other fields consumed

  // ConnectSignal — C# source: ConnectSignal.cs (Packages/io.realvirtual.starter/Runtime/Components/ConnectSignal.cs)
  ConnectSignal: ['ConnectedSignal'],

  // Group — parsed by loadGLB group parsing
  Group: ['GroupName', 'GroupNamePrefix'],
};

/**
 * Fields intentionally ignored — present in GLB but not needed in WebViewer.
 * These are runtime status fields, Unity-only features, or component references
 * that have no WebViewer equivalent.
 */
const IGNORED: Record<string, string[]> = {
  Drive: [
    // Runtime status (read-only in C#, meaningless at load time)
    'CurrentSpeed', 'CurrentPosition', 'PositionOverwriteValue',
    'IsPosition', 'IsSpeed', 'IsStopped', 'IsRunning',
    'IsAtTargetSpeed', 'IsAtTarget', 'IsAtLowerLimit', 'IsAtUpperLimit',
    'IsSubDrive',
    // Features not implemented in WebViewer
    'SpeedOverride', 'SpeedScaleTransportSurface',
    'JumpToLowerLimitOnUpperLimit', 'LimitRayCast',
    'SmoothAcceleration', 'Jerk', 'smoothMotion',
    'JogForward', 'JogBackward', 'TargetPosition',
    'TargetStartMove', 'ResetDrive', '_StopDrive',
    'MoveThisRigidBody', 'UseInteract',
    // realvirtual component metadata
    'Name', 'Active',
  ],

  TransportSurface: [
    // Unity physics features not in WebViewer
    'AnimateSurface', 'AdvancedSurface',
    'ChangeConstraintsOnEnter', 'ConstraintsEnter',
    'ChangeConstraintsOnExit', 'ConstraintsExit',
    'DriveReference', 'ParentDrive',
    'UseMeshCollider', 'DebugMode', 'Layer',
    'UseAGXPhysics',
    // Runtime status
    'speed', 'SpeedScaleTransportSurface', 'IsGuided', 'LoadedPart',
    'Name', 'Active',
  ],

  Sensor: [
    // Display/visualization (not in WebViewer)
    'DisplayStatus', 'MaterialOccupied', 'MaterialNotOccupied',
    'ShowSensorLinerenderer', 'RayCastDisplayWidth',
    // Raycast details (not consumed)
    'AdditionalRayCastLayers',
    // Signal connections (handled via signal store)
    'SensorOccupied', 'SensorNotOccupied',
    // Filtering
    'LimitSensorToTag',
    // Debug
    'PauseOnSensor',
    // Runtime status
    'Occupied', 'LastTriggeredBy', 'RayCastDistance',
    'LastTriggeredID', 'LastTriggeredGlobalID',
    'Counter', 'ColliderCounter', 'CollidingMus', 'CollidingObjects',
    'Name', 'Active',
    // Legacy WebViewer fields that don't exist in C#
    'InvertSignal', 'Mode',
  ],

  Source: [
    // Features not in WebViewer
    'Destination', 'Enabled', 'FreezeSourcePosition',
    'DontVisualize', 'HideOnStop',
    'Mass', 'SetCenterOfMass', 'CenterOfMass',
    'GenerateOnLayer', 'OnCreateDestroyComponents',
    'StartInterval', 'RandomDistance', 'RangeDistance',
    'LimitNumber', 'MaxNumberMUs',
    'UsePooling', 'PoolSize', 'PrewarmPool', 'AllowPoolGrowth',
    'GenerateMU', 'DeleteAllMU',
    'SourceGenerate', 'SourceGenerateOnDistance',
    'UseAGXPhysics', 'overrideMaterial',
    // Runtime status
    'Created', 'PooledCount', 'ActiveCount',
    'Name', 'Active',
  ],

  Sink: [
    'DeleteMus', 'DeleteOnlyTag', 'DestroyFadeTime', 'Dissolve',
    'Delete', 'UseAGXPhysics',
    'SumDestroyed', 'DestroyedPerHour', 'CollidingObjects',
    'Name', 'Active',
  ],

  MU: [
    'DebugMode', 'ID', 'GlobalID', 'MUAppearences',
    'FixedBy', 'LastFixedBy', 'LoadedOn', 'StandardParent',
    'ParentBeforeFix', 'CollidedWithSensors', 'LoadedMus', 'CreatedBy',
    'SurfaceAlignSmoothment', 'UnfixSpeedInterpolate', 'NumInterpolations',
    'TransportSurfaces', 'Velocity',
    'Name', 'Active',
  ],

  DrivesRecorder: [
    // Runtime status
    'RecordAllDrivesWithinScene', 'Recording', 'Replaying',
    'RecordOnStart', 'CurrentFrame', 'NumberFrames',
    'CurrentSeconds', 'Duration', 'JumpToPositon',
    'Name',  // Active moved to CONSUMED
  ],

  // Signal types — runtime status (read-only structs)
  PLCOutputBool: ['Status', 'Name'],
  PLCInputBool: ['Status', 'Name'],
  PLCOutputFloat: ['Status', 'Name'],
  PLCInputFloat: ['Status', 'Name'],
  PLCOutputInt: ['Status', 'Name'],
  PLCInputInt: ['Status', 'Name'],

  // Behavior extras — intentionally passed through raw
  Drive_ErraticPosition: ['MinPos', 'MaxPos', 'Speed', 'IterateBetweenMaxAndMin', 'Name', 'Active'],
  Drive_Cylinder: ['Out', 'In', 'OneBitCylinder', 'InvertOutputLogic', 'MinPos', 'MaxPos', 'TimeOut', 'TimeIn',
    'StopWhenDrivingToMin', 'StopWhenDrivingToMax',
    '_out', '_in', '_isOut', '_isIn', '_movingOut', '_movingIn', '_isMax', '_isMin',
    'IsOut', 'IsIn', 'IsMax', 'IsMin', 'IsMovingOut', 'IsMovingIn',
    'Name', 'Active', '_fullTypeName', '_version', '_enabled'],
  Drive_Gear: ['*'],      // Not yet consumed, pass-through
  Drive_Simple: ['Forward', 'Backward', 'Speed', 'Accelaration', 'IsAtPosition', 'IsAtSpeed', 'IsDriving',
    'ScaleSpeed', 'CurrentPositionScale', 'CurrentPositionOffset', 'ScaleFeedbackPosition', 'Name', 'Active'],
  Drive_CAM: ['*'],       // Not yet consumed, pass-through

  // ReplayRecording
  ReplayRecording: ['Name'],  // Active moved to CONSUMED

  // LogicStep containers — generic fields (Active moved to CONSUMED)
  LogicStep_SerialContainer: ['Name'],
  LogicStep_ParallelContainer: ['Name'],
  LogicStep_SetSignalBool: ['Name'],
  LogicStep_WaitForSensor: ['Name'],
  LogicStep_WaitForSignalBool: ['Name'],
  LogicStep_Delay: ['Name'],
  LogicStep_DriveToPosition: ['Name'],
  LogicStep_SetDriveSpeed: ['Name'],
  LogicStep_Enable: ['Name'],
  LogicStep_Pause: ['Name'],
  LogicStep_DriveTo: ['Name'],

  // ConnectSignal — internal state, Name/Active metadata
  ConnectSignal: ['Name', 'Active'],

  // Group — component metadata
  Group: ['Name', 'Active', '_fullTypeName', '_version', '_enabled'],
};

/** Summary of unhandled fields per component type (collected during load) */
const unhandledSummary = new Map<string, Map<string, unknown>>();

/**
 * Validate GLB extras for a component type.
 * Logs warnings for fields not in CONSUMED or IGNORED lists.
 * Only active in dev mode.
 */
export function validateExtras(componentType: string, data: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;

  const consumed = new Set(CONSUMED[componentType] ?? []);
  const ignored = IGNORED[componentType] ?? [];

  // Wildcard '*' in ignored means skip all validation for this type
  if (ignored.includes('*')) return;

  const ignoredSet = new Set(ignored);
  const known = new Set([...consumed, ...ignoredSet]);

  for (const key of Object.keys(data)) {
    if (!known.has(key)) {
      // Collect for summary
      if (!unhandledSummary.has(componentType)) {
        unhandledSummary.set(componentType, new Map());
      }
      const typeMap = unhandledSummary.get(componentType)!;
      if (!typeMap.has(key)) {
        typeMap.set(key, data[key]);
      }
    }
  }
}

/**
 * Print summary of all unhandled fields found during GLB load.
 * Call once after the full traverse is complete.
 */
export function printParitySummary(): void {
  if (!import.meta.env.DEV) return;
  if (unhandledSummary.size === 0) return;

  let totalFields = 0;
  const lines: string[] = [];

  for (const [type, fields] of unhandledSummary) {
    for (const [field, value] of fields) {
      const preview = typeof value === 'object' ? '{...}' : JSON.stringify(value);
      lines.push(`  ${type}.${field} = ${preview}`);
      totalFields++;
    }
  }

  console.warn(
    `[Parity] ${totalFields} unhandled GLB extras field(s) — add to CONSUMED or IGNORED in rv-extras-validator.ts:\n` +
    lines.join('\n')
  );
}

/**
 * Get editable field names for a component type. Used by property editor.
 * Returns the CONSUMED fields list for the given type, or an empty array
 * if the type is unknown.
 */
export function getConsumedFields(componentType: string): readonly string[] {
  return CONSUMED[componentType] ?? [];
}

/**
 * Get ignored field names for a component type. Used by property inspector.
 * Returns the IGNORED fields list for the given type, or an empty array
 * if the type is unknown. A wildcard entry ['*'] means all fields are ignored.
 */
export function getIgnoredFields(componentType: string): readonly string[] {
  return IGNORED[componentType] ?? [];
}

/**
 * Clear collected summary (call before loading a new model).
 */
export function resetParityValidator(): void {
  unhandledSummary.clear();
}
