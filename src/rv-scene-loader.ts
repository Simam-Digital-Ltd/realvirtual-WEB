import { Scene, Object3D, Box3, Vector3, Quaternion, BufferAttribute, Mesh, BufferGeometry } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RVDrive, DriveDirection, type DriveConfig } from './rv-drive';
import { AABB } from './rv-aabb';
import { RVTransportSurface, type TransportSurfaceConfig } from './rv-transport-surface';
import { RVSensor, type SensorConfig } from './rv-sensor';
import { RVSource, type SourceConfig } from './rv-source';
import { RVSink } from './rv-sink';
import { RVTransportManager } from './rv-transport-manager';
import { SignalStore } from './rv-signal-store';
import { RVDrivesPlayback, type CompactRecording } from './rv-drives-playback';
import { RVReplayRecording } from './rv-replay-recording';
import { RVLogicEngine } from './rv-logic-engine';
import { NodeRegistry, type ComponentRef } from './rv-node-registry';
import { unityDirectionToGltf, unityPositionToGltf } from './rv-coordinate-utils';
import { validateExtras, printParitySummary, resetParityValidator } from './rv-extras-validator';
import { debug } from './rv-debug';

// Singleton loader instances
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

export interface RecorderSettings {
  playOnStart: boolean;
  replayStartFrame: number;
  replayEndFrame: number;
  loop: boolean;
}

export interface LoadResult {
  drives: RVDrive[];
  transportManager: RVTransportManager;
  signalStore: SignalStore;
  registry: NodeRegistry;
  playback: RVDrivesPlayback | null;
  replayRecordings: RVReplayRecording[];
  recorderSettings: RecorderSettings | null;
  logicEngine: RVLogicEngine | null;
  boundingBox: Box3;
  triangleCount: number;
}

/** Parse Direction string from GLB extras to DriveDirection enum */
function parseDirection(dirStr: string): DriveDirection | null {
  const map: Record<string, DriveDirection> = {
    'LinearX': DriveDirection.LinearX,
    'LinearY': DriveDirection.LinearY,
    'LinearZ': DriveDirection.LinearZ,
    'RotationX': DriveDirection.RotationX,
    'RotationY': DriveDirection.RotationY,
    'RotationZ': DriveDirection.RotationZ,
    'Virtual': DriveDirection.Virtual,
  };
  return map[dirStr] ?? null;
}

/** Extract DriveConfig from GLB node.userData.realvirtual.Drive */
/**
 * Parse Drive component extras from GLB.
 *
 * C# source: Packages/io.realvirtual.starter/Runtime/Components/Drive.cs
 * Consumed fields: Direction, ReverseDirection, Offset, StartPosition,
 *   TargetSpeed, Acceleration, UseAcceleration, UseLimits, LowerLimit, UpperLimit
 * Intentionally skipped: SpeedOverride, JogForward/Backward, TargetPosition,
 *   MoveThisRigidBody, smoothMotion, Jerk, SmoothAcceleration, runtime status fields
 */
function parseDriveExtras(driveData: Record<string, unknown>): DriveConfig | null {
  validateExtras('Drive', driveData);

  const dirStr = driveData['Direction'] as string | undefined;
  if (!dirStr) return null;

  const direction = parseDirection(dirStr);
  if (direction === null || direction === DriveDirection.Virtual) {
    if (direction === DriveDirection.Virtual) {
      console.warn(`  Skipping Virtual drive`);
    }
    return null;
  }

  return {
    direction,
    reverseDirection: (driveData['ReverseDirection'] as boolean) ?? false,
    offset: (driveData['Offset'] as number) ?? 0,
    startPosition: (driveData['StartPosition'] as number) ?? 0,
    targetSpeed: (driveData['TargetSpeed'] as number) ?? 100,
    acceleration: (driveData['Acceleration'] as number) ?? 100,
    useAcceleration: (driveData['UseAcceleration'] as boolean) ?? false,
    useLimits: (driveData['UseLimits'] as boolean) ?? false,
    lowerLimit: (driveData['LowerLimit'] as number) ?? -180,
    upperLimit: (driveData['UpperLimit'] as number) ?? 180,
    behaviors: [], // populated by loadGLB after parsing
    behaviorExtras: {}, // populated by loadGLB after parsing
  };
}

/**
 * Parse TransportSurface component extras from GLB.
 *
 * C# source: Packages/io.realvirtual.starter/Runtime/Components/TransportSurface.cs
 * Consumed fields: TransportDirection, Radial, TextureScale, HeightOffsetOverride
 * Intentionally skipped: AnimateSurface, AdvancedSurface, constraint settings,
 *   DriveReference (resolved via hierarchy), physics settings, runtime status
 */
function parseTransportSurfaceExtras(data: Record<string, unknown>): TransportSurfaceConfig {
  validateExtras('TransportSurface', data);

  // TransportDirection is exported as {x, y, z} in Unity LHS space — convert to glTF RHS
  const rawDir = data['TransportDirection'] as { x: number; y: number; z: number } | undefined;
  const transportDirection = rawDir
    ? unityDirectionToGltf(rawDir.x, rawDir.y, rawDir.z)
    : new Vector3(1, 0, 0); // Fallback: X-axis

  const isRadial = (data['Radial'] as boolean) ?? false;

  return {
    transportDirection,
    isRadial,
    textureScale: (data['TextureScale'] as number) ?? 1,
    heightOffset: (data['HeightOffsetOverride'] as number) ?? 0,
  };
}

/**
 * Parse Sensor component extras from GLB.
 *
 * C# source: Packages/io.realvirtual.starter/Runtime/Components/Sensor.cs
 * Consumed fields: UseRaycast, RayCastDirection, RayCastLength
 * NOTE: C# has NO 'InvertSignal' or 'Mode' fields — those were legacy WebViewer names.
 *   C# uses 'UseRaycast' (bool) to determine Raycast vs Collision mode.
 */
function parseSensorExtras(data: Record<string, unknown>): SensorConfig {
  validateExtras('Sensor', data);

  // C# uses UseRaycast (bool), not Mode (string). Support both for backwards compat.
  const useRaycast = (data['UseRaycast'] as boolean) ?? false;
  const modeStr = (data['Mode'] as string) ?? undefined; // legacy WebViewer field
  const mode = modeStr ? (modeStr === 'Raycast' ? 'Raycast' : 'Collision')
    : (useRaycast ? 'Raycast' : 'Collision');

  // Raycast parameters (only meaningful when mode === 'Raycast')
  const rawDir = data['RayCastDirection'] as { x: number; y: number; z: number } | undefined;
  const rayCastLength = (data['RayCastLength'] as number) ?? 1000; // default 1000mm

  // Convert direction from Unity LHS to glTF RHS (negate X)
  const rayCastDirection = rawDir
    ? { x: -rawDir.x, y: rawDir.y, z: rawDir.z }
    : { x: -1, y: 0, z: 0 }; // default: Unity local X → glTF -X

  return {
    invertSignal: false,
    mode,
    rayCastDirection,
    rayCastLength,
  };
}

/**
 * Parse Source component extras from GLB.
 *
 * C# source: Packages/io.realvirtual.starter/Runtime/Components/Source.cs
 * Consumed fields: AutomaticGeneration, Interval, GenerateIfDistance,
 *   ThisObjectAsMU, PlaceOnTransportSurface
 * Legacy WebViewer fallback: Spawn, SpawnInterval, SpawnDistance
 * Intentionally skipped: Destination, Mass, pooling, layer, runtime status, signals
 */
function parseSourceExtras(data: Record<string, unknown>, nodeName: string): SourceConfig {
  validateExtras('Source', data);
  // Spawn mode: Unity uses AutomaticGeneration (bool) + Interval > 0 vs. GenerateIfDistance > 0
  const autoGen = (data['AutomaticGeneration'] as boolean) ?? true;
  const interval = (data['Interval'] as number) ?? (data['SpawnInterval'] as number) ?? 0;
  const distance = (data['GenerateIfDistance'] as number) ?? (data['SpawnDistance'] as number) ?? 300;

  let spawnMode: 'Interval' | 'Distance' | 'OnSignal' = 'Interval';
  if (interval > 0) {
    spawnMode = 'Interval';
  } else if (autoGen && distance > 0) {
    spawnMode = 'Distance';
  }
  // Override with explicit Spawn field if present (legacy WebViewer format)
  const spawnStr = data['Spawn'] as string | undefined;
  if (spawnStr === 'Distance') spawnMode = 'Distance';
  else if (spawnStr === 'OnSignal') spawnMode = 'OnSignal';

  // ThisObjectAsMU is serialized as a relative path string (or null/empty if self)
  const templateRef = data['ThisObjectAsMU'] as string | null | undefined;
  // If empty, null, or path ends with own name -> Source itself is the template
  // Unity serializes as relative path e.g. "DemoCell/Turbine" where node.name = "Turbine"
  const sourceIsTemplate = !templateRef || templateRef === '' ||
    templateRef === nodeName || templateRef.endsWith('/' + nodeName);
  const muName = sourceIsTemplate ? nodeName : templateRef;

  return {
    spawnMode,
    spawnInterval: interval > 0 ? interval : 3, // default 3s if not set
    spawnDistance: distance,
    muName: muName ?? '',
    placeOnTransportSurface: (data['PlaceOnTransportSurface'] as boolean) ?? true,
    sourceIsTemplate,
  };
}

/**
 * Create an AABB from BoxCollider data in GLB extras, or fallback to mesh bounds.
 */
/**
 * Create an AABB from BoxCollider data in GLB extras, or fallback to mesh bounds.
 * C# source: Unity built-in BoxCollider (center, size fields)
 */
function createAABBFromExtras(node: Object3D, rv: Record<string, unknown>): AABB {
  const boxCollider = rv['BoxCollider'] as { center?: { x: number; y: number; z: number }; size?: { x: number; y: number; z: number } } | undefined;
  if (boxCollider?.center && boxCollider?.size) {
    validateExtras('BoxCollider', boxCollider as unknown as Record<string, unknown>);
    return AABB.fromBoxCollider(node, boxCollider.center, boxCollider.size);
  }
  // Fallback: compute from mesh bounds
  return AABB.fromNode(node);
}

/** Signal type names recognized from GLB extras */
const SIGNAL_TYPES = ['PLCOutputBool', 'PLCInputBool', 'PLCOutputFloat', 'PLCInputFloat', 'PLCOutputInt', 'PLCInputInt'];

/**
 * Parse DrivesRecording_compact from GLB extras.
 * Supports both compact format (flat array) and ScriptableObject inline format.
 */
function parseCompactRecording(data: Record<string, unknown>): CompactRecording | null {
  // Compact format: flat positions array
  if (data['positions'] && data['drives'] && data['numberFrames']) {
    return {
      fixedDeltaTime: (data['fixedDeltaTime'] as number) ?? 0.02,
      numberFrames: (data['numberFrames'] as number) ?? 0,
      driveCount: (data['driveCount'] as number) ?? 0,
      drives: (data['drives'] as { id: number; path: string }[]) ?? [],
      sequences: data['sequences'] as { name: string; startFrame: number; endFrame: number }[] | undefined,
      positions: (data['positions'] as number[]) ?? [],
    };
  }
  return null;
}

/**
 * Parse DrivesRecording from ScriptableObject inline data.
 * Converts verbose Snapshot[] format to compact flat array.
 */
function parseScriptableObjectRecording(data: Record<string, unknown>): CompactRecording | null {
  const soData = data['data'] as Record<string, unknown> | undefined;
  if (!soData) return null;

  const recordedDrives = soData['RecordedDrives'] as { Id: number; Path: string }[] | undefined;
  const snapshots = soData['Snapshots'] as { Frame: number; DriveID: number; Position: number }[] | undefined;
  const numberFrames = (soData['NumberFrames'] as number) ?? 0;
  const sequences = soData['Sequences'] as { Name: string; StartFrame: number; EndFrame: number }[] | undefined;

  if (!recordedDrives || !snapshots || numberFrames <= 0) return null;

  const driveCount = recordedDrives.length;
  const positions = new Array<number>(numberFrames * driveCount).fill(0);

  // Build id→index map
  const idToIndex = new Map<number, number>();
  for (let i = 0; i < recordedDrives.length; i++) {
    idToIndex.set(recordedDrives[i].Id, i);
  }

  // Fill positions from snapshots
  for (const snap of snapshots) {
    const idx = idToIndex.get(snap.DriveID);
    if (idx !== undefined && snap.Frame < numberFrames) {
      positions[snap.Frame * driveCount + idx] = snap.Position;
    }
  }

  return {
    fixedDeltaTime: 0.02, // Default, not stored in ScriptableObject
    numberFrames,
    driveCount,
    drives: recordedDrives.map((rd, i) => ({
      id: i,
      path: rd.Path.replace(/^\//, ''), // Normalize path
    })),
    sequences: sequences?.map((s) => ({
      name: s.Name,
      startFrame: s.StartFrame,
      endFrame: s.EndFrame,
    })),
    positions,
  };
}

/**
 * Load a GLB file and extract all realvirtual components.
 * Returns drives, transport manager, signal store, registry, playback, logic engine, and scene metrics.
 */
export async function loadGLB(url: string, scene: Scene): Promise<LoadResult> {
  console.log(`[loadGLB] Loading ${url}...`);
  resetParityValidator(); // Clear any previous load's parity data
  const gltf = await gltfLoader.loadAsync(url);
  console.log(`[loadGLB] GLTF parsed, adding to scene`);
  const root = gltf.scene;
  scene.add(root);

  const drives: RVDrive[] = [];
  const registry = new NodeRegistry();
  const signalStore = new SignalStore();
  const manager = new RVTransportManager();
  manager.scene = scene;

  let triangleCount = 0;
  let recordingData: CompactRecording | null = null;
  let recorderSettings: RecorderSettings | null = null;

  // Collected ReplayRecording configs (parsed after playback is created)
  const replayRecordingConfigs: { sequence: string; startOnSignal: ComponentRef | null; isReplayingSignal: ComponentRef | null }[] = [];

  // Collected nodes for second-pass processing
  const transportNodes: { node: Object3D; data: Record<string, unknown>; rv: Record<string, unknown> }[] = [];
  const sensorNodes: { node: Object3D; data: Record<string, unknown>; rv: Record<string, unknown> }[] = [];
  const sourceNodes: { node: Object3D; data: Record<string, unknown> }[] = [];
  const sinkNodes: { node: Object3D; rv: Record<string, unknown> }[] = [];
  const muTemplateNodes: Object3D[] = [];

  // First pass: shadows, triangles, drives, collect component nodes, register all nodes
  root.traverse((node: Object3D) => {
    // Enable shadows on mesh nodes (skip transparent materials)
    const anyNode = node as unknown as {
      isMesh?: boolean;
      castShadow?: boolean;
      receiveShadow?: boolean;
      material?: {
        transparent?: boolean;
        alphaTest?: number;
        opacity?: number;
        alphaMap?: unknown;
        map?: { format?: number };
      };
    };
    if (anyNode.isMesh) {
      const mat = anyNode.material;
      const hasAlpha = mat && (
        mat.transparent === true ||
        (mat.alphaTest ?? 0) > 0 ||
        mat.alphaMap != null ||
        (mat.opacity ?? 1) < 1
      );
      if (hasAlpha) {
        console.log(`  No shadow: ${node.name} (transparent=${mat?.transparent}, alphaTest=${mat?.alphaTest}, opacity=${mat?.opacity})`);
      }
      anyNode.castShadow = !hasAlpha;
      anyNode.receiveShadow = true;
    }
    const mesh = node as { geometry?: { index?: { count: number }; attributes?: { position?: { count: number } } } };
    if (mesh.geometry) {
      if (mesh.geometry.index) {
        triangleCount += mesh.geometry.index.count / 3;
      } else if (mesh.geometry.attributes?.position) {
        triangleCount += mesh.geometry.attributes.position.count / 3;
      }
    }

    // Check for realvirtual extras
    const rv = node.userData?.realvirtual as Record<string, unknown> | undefined;
    if (!rv) return;

    // Register node in registry (Phase 1)
    const path = NodeRegistry.computeNodePath(node);
    registry.registerNode(path, node);

    // Parse Drive
    if (rv['Drive']) {
      const driveData = rv['Drive'] as Record<string, unknown>;
      const config = parseDriveExtras(driveData);
      if (config) {
        // Check which DriveBehaviours exist on this node and store their extras
        const behaviors: string[] = [];
        const behaviorExtras: Record<string, Record<string, unknown>> = {};
        for (const key of Object.keys(rv)) {
          if (key !== 'Drive' && key.startsWith('Drive_')) {
            behaviors.push(key);
            const bExtras = rv[key] as Record<string, unknown>;
            behaviorExtras[key] = bExtras;
            validateExtras(key, bExtras);
          }
        }
        config.behaviors = behaviors;
        config.behaviorExtras = behaviorExtras;

        const drive = new RVDrive(node, config);
        drives.push(drive);
        registry.register('Drive', path, drive);

        console.log(
          `  Drive: ${node.name} [${config.direction}${config.reverseDirection ? ' REV' : ''}]` +
          ` path="${path}"` +
          (config.useLimits ? ` limits=[${config.lowerLimit}, ${config.upperLimit}]` : '') +
          ` speed=${config.targetSpeed}` +
          (behaviors.length > 0 ? ` behaviors=[${behaviors.join(',')}]` : '')
        );
      }
    }

    // Collect TransportSurface nodes (process after all drives are found)
    if (rv['TransportSurface']) {
      transportNodes.push({
        node,
        data: rv['TransportSurface'] as Record<string, unknown>,
        rv,
      });
    }

    // Collect Sensor nodes
    if (rv['Sensor']) {
      sensorNodes.push({
        node,
        data: rv['Sensor'] as Record<string, unknown>,
        rv,
      });
    }

    // Collect Source nodes
    if (rv['Source']) {
      sourceNodes.push({
        node,
        data: rv['Source'] as Record<string, unknown>,
      });
    }

    // Collect Sink nodes
    if (rv['Sink']) {
      validateExtras('Sink', rv['Sink'] as Record<string, unknown>);
      sinkNodes.push({ node, rv });
    }

    // Collect MU template nodes
    if (rv['MU']) {
      validateExtras('MU', rv['MU'] as Record<string, unknown>);
      muTemplateNodes.push(node);
    }

    // Register PLC signals in SignalStore and NodeRegistry
    for (const sigType of SIGNAL_TYPES) {
      if (rv[sigType]) {
        const sigData = rv[sigType] as Record<string, unknown>;
        validateExtras(sigType, sigData);
        const status = sigData['Status'] as { Value?: boolean | number } | undefined;
        if (sigType.includes('Bool')) {
          signalStore.register(path, status?.Value as boolean ?? false);
        } else if (sigType.includes('Float')) {
          signalStore.register(path, status?.Value as number ?? 0);
        } else if (sigType.includes('Int')) {
          signalStore.register(path, status?.Value as number ?? 0);
        }
        registry.register(sigType, path, { address: path });
      }
    }

    // Check for DrivesRecording (compact format or ScriptableObject inline)
    if (rv['DrivesRecording_compact'] && !recordingData) {
      recordingData = parseCompactRecording(rv['DrivesRecording_compact'] as Record<string, unknown>);
    }
    if (rv['DrivesRecorder']) {
      const recorderData = rv['DrivesRecorder'] as Record<string, unknown>;
      validateExtras('DrivesRecorder', recorderData);
      // C# source: Packages/io.realvirtual.starter/Runtime/Components/DrivesRecorder.cs
      // Consumed: PlayOnStart, ReplayStartFrame, ReplayEndFrame, Loop, DrivesRecording
      recorderSettings = {
        playOnStart: (recorderData['PlayOnStart'] as boolean) ?? true,
        replayStartFrame: (recorderData['ReplayStartFrame'] as number) ?? 0,
        replayEndFrame: (recorderData['ReplayEndFrame'] as number) ?? 0,
        loop: (recorderData['Loop'] as boolean) ?? false,
      };
      debug('loader', `DrivesRecorder: PlayOnStart=${recorderSettings.playOnStart} (raw=${recorderData['PlayOnStart']}), ` +
        `Loop=${recorderSettings.loop}, ReplayFrames=[${recorderSettings.replayStartFrame}..${recorderSettings.replayEndFrame}]`);
      if (!recordingData) {
        const recRef = recorderData['DrivesRecording'] as Record<string, unknown> | undefined;
        if (recRef && recRef['type'] === 'ScriptableObject') {
          recordingData = parseScriptableObjectRecording(recRef);
        }
      }
    }

    // Collect ReplayRecording components (may be multiple: ReplayRecording, ReplayRecording_1, etc.)
    for (const key of Object.keys(rv)) {
      if (key === 'ReplayRecording' || key.match(/^ReplayRecording_\d+$/)) {
        const rrData = rv[key] as Record<string, unknown>;
        validateExtras('ReplayRecording', rrData);
        const sequence = (rrData['Sequence'] as string) ?? '';
        const startOnSignal = (rrData['StartOnSignal'] as ComponentRef) ?? null;
        const isReplayingSignal = (rrData['IsReplayingSignal'] as ComponentRef) ?? null;
        replayRecordingConfigs.push({ sequence, startOnSignal, isReplayingSignal });
      }
    }
  });

  // Second pass: process TransportSurfaces (need drives registered in registry)
  const _worldQuat = new Quaternion();
  for (const { node, data, rv } of transportNodes) {
    const config = parseTransportSurfaceExtras(data);

    // TransportDirection is stored in local space by Unity (InverseTransformDirection).
    // Transform to world space using the node's world quaternion.
    node.getWorldQuaternion(_worldQuat);
    config.transportDirection.applyQuaternion(_worldQuat).normalize();

    const aabb = createAABBFromExtras(node, rv);
    const surface = new RVTransportSurface(node, config, aabb);

    // Find associated drive via registry hierarchy walk-up
    surface.drive = registry.findInParent<RVDrive>(node, 'Drive');
    if (!surface.drive) {
      console.warn(`  TransportSurface "${node.name}": no Drive found - will not transport`);
    }

    const surfacePath = NodeRegistry.computeNodePath(node);
    registry.register('TransportSurface', surfacePath, surface);
    manager.surfaces.push(surface);
    console.log(
      `  TransportSurface: ${node.name}` +
      ` dir=(${config.transportDirection.x.toFixed(2)}, ${config.transportDirection.y.toFixed(2)}, ${config.transportDirection.z.toFixed(2)})` +
      ` radial=${config.isRadial}` +
      (surface.drive ? ` drive=${surface.drive.name}` : ' NO DRIVE')
    );
  }

  // Process Sensors
  for (const { node, data, rv } of sensorNodes) {
    const config = parseSensorExtras(data);
    const aabb = createAABBFromExtras(node, rv);
    const sensor = new RVSensor(node, config, aabb);
    manager.sensors.push(sensor);
    const sensorPath = NodeRegistry.computeNodePath(node);
    registry.register('Sensor', sensorPath, sensor);

    // Bind sensor to SignalStore: when occupied state changes, update the signal
    signalStore.register(sensorPath, false);
    sensor.onChanged = (occupied) => {
      signalStore.set(sensorPath, occupied);
    };

    // Create sensor visualization
    if (config.mode === 'Raycast') {
      // Raycast mode: show a line from sensor origin in ray direction
      sensor.createRayVisualization();
    } else {
      // Collision mode: show a box around the BoxCollider zone
      const boxCollider = rv['BoxCollider'] as { center?: { x: number; y: number; z: number }; size?: { x: number; y: number; z: number } } | undefined;
      if (boxCollider?.center && boxCollider?.size) {
        // Convert Unity center to glTF space (negate X) — same as AABB does
        const gltfCenter = unityPositionToGltf(boxCollider.center.x, boxCollider.center.y, boxCollider.center.z);
        const halfSize = {
          x: Math.abs(boxCollider.size.x) / 2,
          y: Math.abs(boxCollider.size.y) / 2,
          z: Math.abs(boxCollider.size.z) / 2,
        };
        sensor.createVisualization(gltfCenter, halfSize);
      }
    }

    console.log(`  Sensor: ${node.name} mode=${config.mode} dir=${config.mode === 'Raycast' ? JSON.stringify(config.rayCastDirection) : 'N/A'} len=${config.rayCastLength}mm`);
  }

  // Process Sources
  for (const { node, data } of sourceNodes) {
    const config = parseSourceExtras(data, node.name);
    const source = new RVSource(node, config);
    source.spawnParent = root;

    // Find MU template via registry (path-based, safe)
    let template: Object3D | null = null;
    if (config.sourceIsTemplate) {
      template = node;
      console.log(`  Source: ${node.name} mode=${config.spawnMode} interval=${config.spawnInterval}s template=SELF`);
    } else if (config.muName) {
      template = registry.getNode(config.muName);
      if (template) {
        console.log(`  Source: ${node.name} mode=${config.spawnMode} interval=${config.spawnInterval}s template="${config.muName}"`);
      } else {
        console.warn(`  Source: ${node.name} - MU template "${config.muName}" not found in registry`);
      }
    } else {
      console.warn(`  Source: ${node.name} - no MU template configured`);
    }

    if (template) {
      source.setTemplate(template);
    }

    const sourcePath = NodeRegistry.computeNodePath(node);
    registry.register('Source', sourcePath, source);
    manager.sources.push(source);
  }

  // Process Sinks
  for (const { node, rv } of sinkNodes) {
    const aabb = createAABBFromExtras(node, rv);
    const sink = new RVSink(node, aabb);
    manager.sinks.push(sink);
    const sinkPath = NodeRegistry.computeNodePath(node);
    registry.register('Sink', sinkPath, sink);
    console.log(`  Sink: ${node.name}`);
  }

  // Hide MU templates (they're just for cloning, not visible in scene)
  for (const muNode of muTemplateNodes) {
    muNode.visible = false;
    console.log(`  MU template: ${muNode.name} (hidden)`);
  }

  // Bind Drive_Simple behaviors: connect Forward/Backward PLCOutputBool signals to drive.jogForward/jogBackward
  for (const drive of drives) {
    if (!drive.config.behaviors.includes('Drive_Simple')) continue;
    const simpleExtras = drive.config.behaviorExtras['Drive_Simple'];
    debug('loader', `Drive_Simple "${drive.name}": extras keys=${simpleExtras ? JSON.stringify(Object.keys(simpleExtras)) : 'NULL'}`);
    if (!simpleExtras) continue;

    debug('loader', `Drive_Simple "${drive.name}": Forward=${JSON.stringify(simpleExtras['Forward'])?.substring(0, 200)}`);
    const forwardRef = simpleExtras['Forward'] as ComponentRef | undefined;
    const backwardRef = simpleExtras['Backward'] as ComponentRef | undefined;

    if (forwardRef) {
      const resolved = registry.resolve(forwardRef);
      if (resolved.signalAddress) {
        const addr = resolved.signalAddress;
        // Read initial signal value
        drive.jogForward = signalStore.getBool(addr);
        // Subscribe to changes
        signalStore.subscribe(addr, (value) => {
          drive.jogForward = value === true;
        });
        debug('loader', `  Drive_Simple "${drive.name}": Forward signal="${addr}" (initial=${drive.jogForward})`);
      }
    }

    if (backwardRef) {
      const resolved = registry.resolve(backwardRef);
      if (resolved.signalAddress) {
        const addr = resolved.signalAddress;
        drive.jogBackward = signalStore.getBool(addr);
        signalStore.subscribe(addr, (value) => {
          drive.jogBackward = value === true;
        });
        debug('loader', `  Drive_Simple "${drive.name}": Backward signal="${addr}" (initial=${drive.jogBackward})`);
      }
    }
  }

  // Bind Drive_Cylinder behaviors: Out/In PLCOutputBool → drive.startMove(MaxPos/MinPos)
  for (const drive of drives) {
    if (!drive.config.behaviors.includes('Drive_Cylinder')) continue;
    const cylExtras = drive.config.behaviorExtras['Drive_Cylinder'];
    if (!cylExtras) continue;

    const minPos = (cylExtras['MinPos'] as number) ?? 0;
    const maxPos = (cylExtras['MaxPos'] as number) ?? 100;
    const timeOut = (cylExtras['TimeOut'] as number) ?? 1;
    const timeIn = (cylExtras['TimeIn'] as number) ?? 1;
    const oneBit = (cylExtras['OneBitCylinder'] as boolean) ?? false;
    const invertLogic = (cylExtras['InvertOutputLogic'] as boolean) ?? false;
    const stroke = Math.abs(maxPos - minPos);

    debug('loader', `Drive_Cylinder "${drive.name}": min=${minPos} max=${maxPos} timeOut=${timeOut}s timeIn=${timeIn}s oneBit=${oneBit} invert=${invertLogic} reverse=${drive.config.reverseDirection} dir=${drive.config.direction}`);

    // Set initial position to MinPos (Unity behavior: Start() sets CurrentPosition = MinPos)
    drive.currentPosition = minPos;
    drive.applyToNode();

    const outRef = cylExtras['Out'] as ComponentRef | undefined;
    const inRef = cylExtras['In'] as ComponentRef | undefined;

    if (outRef) {
      const resolved = registry.resolve(outRef);
      if (resolved.signalAddress) {
        const addr = resolved.signalAddress;
        signalStore.subscribe(addr, (value) => {
          let outVal = value === true;
          if (invertLogic) outVal = !outVal;

          if (oneBit) {
            // OneBitCylinder: true=extend, false=retract
            if (outVal) {
              drive.targetSpeed = stroke / timeOut;
              drive.startMove(maxPos);
              debug('drive', `Cylinder "${drive.name}": OUT → ${maxPos}mm at ${drive.targetSpeed.toFixed(0)}mm/s`);
            } else {
              drive.targetSpeed = stroke / timeIn;
              drive.startMove(minPos);
              debug('drive', `Cylinder "${drive.name}": IN → ${minPos}mm at ${drive.targetSpeed.toFixed(0)}mm/s`);
            }
          } else {
            if (outVal) {
              drive.targetSpeed = stroke / timeOut;
              drive.startMove(maxPos);
              debug('drive', `Cylinder "${drive.name}": OUT → ${maxPos}mm at ${drive.targetSpeed.toFixed(0)}mm/s`);
            }
          }
        });
        debug('loader', `  Drive_Cylinder "${drive.name}": Out signal="${addr}"`);
      }
    }

    if (inRef && !oneBit) {
      const resolved = registry.resolve(inRef);
      if (resolved.signalAddress) {
        const addr = resolved.signalAddress;
        signalStore.subscribe(addr, (value) => {
          let inVal = value === true;
          if (invertLogic) inVal = !inVal;
          if (inVal) {
            drive.targetSpeed = stroke / timeIn;
            drive.startMove(minPos);
          }
        });
        debug('loader', `  Drive_Cylinder "${drive.name}": In signal="${addr}"`);
      }
    }
  }

  // WebGPU compatibility fixes
  let uvFixCount = 0;
  let indexFixCount = 0;
  root.traverse((node: Object3D) => {
    if (!(node as Mesh).isMesh) return;
    const geo = (node as Mesh).geometry as BufferGeometry;

    // Fix 1: Add dummy UV attribute for meshes missing it
    if (!geo.attributes.uv && geo.attributes.position) {
      geo.setAttribute('uv', new BufferAttribute(
        new Float32Array(geo.attributes.position.count * 2), 2,
      ));
      uvFixCount++;
    }

    // Fix 2: Convert Uint16 index buffers to Uint32 (WebGPU requires Uint32)
    // Also convert to non-indexed to avoid WebGPU buffer size validation issues
    if (geo.index) {
      if (geo.index.array instanceof Uint16Array) {
        // Convert indexed Uint16 → non-indexed (avoids all WebGPU index format issues)
        const nonIndexed = geo.toNonIndexed();
        (node as Mesh).geometry = nonIndexed;
        geo.dispose();
        indexFixCount++;
      }
    }
  });
  if (uvFixCount > 0 || indexFixCount > 0) {
    console.log(`WebGPU fixes: ${uvFixCount} missing UVs, ${indexFixCount} Uint16->Uint32 indices`);
  }

  // Compute bounding box
  const boundingBox = new Box3().setFromObject(root);

  // Build DrivesPlayback if recording data found
  let playback: RVDrivesPlayback | null = null;
  const rec = recordingData as CompactRecording | null;
  const recSettings = recorderSettings as RecorderSettings | null;
  if (rec) {
    try {
      // PlayOnStart plays once through the full recording (or frame range) then stops.
      // Don't constrain frame range here — ReplayStartFrame/ReplayEndFrame are runtime
      // values used by ReplayRecording sequences, not for initial playback limiting.
      playback = new RVDrivesPlayback(rec, registry, {
        loop: recSettings?.loop ?? false,
      });
      console.log(
        `  DrivesPlayback: ${rec.numberFrames} frames, ${rec.driveCount} drives, ` +
        `dt=${rec.fixedDeltaTime}s loop=${recSettings?.loop ?? false}` +
        (rec.sequences ? ` sequences=[${rec.sequences.map(s => s.name).join(',')}]` : '')
      );
    } catch (e) {
      console.warn(`  DrivesPlayback failed: ${e}`);
    }
  }

  // Build ReplayRecording instances (signal-triggered sequence playback)
  const replayRecordings: RVReplayRecording[] = [];
  if (playback && replayRecordingConfigs.length > 0) {
    for (const cfg of replayRecordingConfigs) {
      const startAddr = registry.resolve(cfg.startOnSignal).signalAddress ?? null;
      const replayAddr = registry.resolve(cfg.isReplayingSignal).signalAddress ?? null;
      const rr = new RVReplayRecording(cfg.sequence, startAddr, replayAddr, playback, signalStore);
      replayRecordings.push(rr);
      console.log(
        `  ReplayRecording: "${cfg.sequence}" startSignal=${startAddr ?? 'none'} replayingSignal=${replayAddr ?? 'none'}`
      );
    }
  }

  // Build LogicStep engine from GLB hierarchy
  let logicEngine: RVLogicEngine | null = null;
  const engine = RVLogicEngine.build(root, registry, signalStore);
  if (engine.roots.length > 0) {
    logicEngine = engine;
  }

  // Print dev-mode parity warnings for unhandled GLB extras fields
  printParitySummary();

  const regSize = registry.size;
  const stats = manager.stats;
  console.log(
    `GLB loaded: ${drives.length} drives, ${stats.surfaces} surfaces, ` +
    `${stats.sensors} sensors, ${stats.sources} sources, ${stats.sinks} sinks, ` +
    `${signalStore.size} signals, ` +
    `registry: ${regSize.nodes} nodes, ${regSize.components} components [${regSize.types.join(',')}], ` +
    (playback ? `recording=${playback.totalFrames}f, ` : '') +
    (logicEngine ? `logicSteps=${logicEngine.stats.totalSteps}, ` : '') +
    `${Math.round(triangleCount / 1000)}K triangles`
  );

  return { drives, transportManager: manager, signalStore, registry, playback, replayRecordings, recorderSettings, logicEngine, boundingBox, triangleCount };
}
