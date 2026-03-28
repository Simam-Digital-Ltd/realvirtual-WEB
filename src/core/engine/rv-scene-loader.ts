import { Scene, Object3D, Box3, BufferAttribute, Mesh, BufferGeometry } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RVDrive } from './rv-drive';
import { RVErraticDriver } from './rv-erratic';
import { RVDriveSimple } from './rv-drive-simple';
import { RVDriveCylinder } from './rv-drive-cylinder';
import { AABB } from './rv-aabb';
// Side-effect imports: trigger registerComponent() at module load
import './rv-transport-surface';
import './rv-sensor';
import './rv-source';
import './rv-sink';
import './rv-grip';
import './rv-grip-target';
import './rv-connect-signal';
import { applySchema, resolveComponentRefs, getRegisteredFactories, type RVComponent, type ComponentContext, type ComponentSchema } from './rv-component-registry';
import { RVTransportManager } from './rv-transport-manager';
import { SignalStore } from './rv-signal-store';
import { RVDrivesPlayback, type CompactRecording } from './rv-drives-playback';
import { RVReplayRecording } from './rv-replay-recording';
import { RVLogicEngine } from './rv-logic-engine';
import { NodeRegistry, type ComponentRef } from './rv-node-registry';
import { GroupRegistry } from './rv-group-registry';
import { validateExtras, printParitySummary, resetParityValidator } from './rv-extras-validator';
import { parseActiveOnly, type ActiveOnly } from './rv-active-only';
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
  activeOnly: ActiveOnly;
}

import type { ModelConfig } from './rv-model-config';

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
  groups: GroupRegistry | null;
  /** Merged model-specific plugin configuration (modelname.json > GLB extras > settings.json). */
  modelConfig: ModelConfig;
}

/**
 * Create an AABB from BoxCollider data in GLB extras, or fallback to mesh bounds.
 * C# source: Unity built-in BoxCollider (center, size fields)
 */
function createAABBFromExtras(node: Object3D, rv: Record<string, unknown>): AABB {
  // Prefer mesh-based AABB when the node has visible geometry (TransportSurface, Sensor).
  // Only fall back to BoxCollider data for meshless nodes (e.g. Sink trigger colliders).
  const meshAABB = AABB.fromNode(node);
  if (meshAABB.halfSize.lengthSq() > 0) {
    return meshAABB;
  }

  console.log(`[AABB] ${node.name}: meshAABB halfSize=${meshAABB.halfSize.toArray()}, lengthSq=${meshAABB.halfSize.lengthSq()}`);

  // No mesh — use BoxCollider data from GLB extras
  // Legacy format: BoxCollider as top-level key
  const boxCollider = rv['BoxCollider'] as { center?: { x: number; y: number; z: number }; size?: { x: number; y: number; z: number } } | undefined;
  if (boxCollider?.center && boxCollider?.size) {
    validateExtras('BoxCollider', boxCollider as unknown as Record<string, unknown>);
    return AABB.fromBoxCollider(node, boxCollider.center, boxCollider.size);
  }

  // Current format: colliders array (Unity exports BoxCollider data here)
  const colliders = rv['colliders'] as Array<{ type?: string; center?: { x: number; y: number; z: number }; size?: { x: number; y: number; z: number } }> | undefined;
  if (colliders) {
    for (const col of colliders) {
      if ((col.type === 'Box' || col.type === 'BoxCollider') && col.center && col.size) {
        const bc = AABB.fromBoxCollider(node, col.center, col.size);
        console.log(`[AABB] ${node.name}: using BoxCollider halfSize=${bc.halfSize.toArray()}, center=${bc.center.toArray()}`);
        return bc;
      }
    }
  }

  // Last resort: return degenerate AABB
  return meshAABB;
}

/** Map of known drive behavior types → class + schema for data-driven instantiation */
const DRIVE_BEHAVIOR_MAP: Record<string, { ctor: new (n: Object3D) => RVComponent; schema: ComponentSchema }> = {
  Drive_ErraticPosition: { ctor: RVErraticDriver, schema: RVErraticDriver.schema },
  Drive_Simple: { ctor: RVDriveSimple, schema: RVDriveSimple.schema },
  Drive_Cylinder: { ctor: RVDriveCylinder, schema: RVDriveCylinder.schema },
};

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

export interface LoadGLBOptions {
  /** When true, apply WebGPU-specific geometry fixes (e.g., Uint16 index conversion). Default: false */
  isWebGPU?: boolean;
}

/** Pending component awaiting resolveComponentRefs + init() in Step 2 */
interface PendingComponent {
  component: RVComponent;
  type: string;
  path: string;
}

/**
 * Load a GLB file and extract all realvirtual components.
 *
 * Two-step model (like Unity Awake/Start):
 *   Step 1 "Awake": traverse, construct, applySchema, register ALL
 *   Step 2 "Start": resolveComponentRefs + init() ALL
 *
 * Returns drives, transport manager, signal store, registry, playback, logic engine, and scene metrics.
 */
export async function loadGLB(url: string, scene: Scene, options?: LoadGLBOptions): Promise<LoadResult> {
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

  // ── Detect Three.js name deduplication (e.g. "Grip" → "Grip_1") ──
  // Three.js GLTFLoader renames duplicate node names via createUniqueName().
  // Build a map of Object3D → original sanitized name for alias registration.
  const renamedNodes = new Map<Object3D, string>();
  const gltfParser = (gltf as unknown as { parser?: {
    associations?: Map<Object3D, { nodes?: number }>;
    json?: { nodes?: { name?: string }[] };
  } }).parser;
  if (gltfParser?.associations && gltfParser?.json?.nodes) {
    for (const [obj, ref] of gltfParser.associations) {
      if (ref.nodes !== undefined && ref.nodes < gltfParser.json.nodes.length) {
        const origName = gltfParser.json.nodes[ref.nodes].name ?? '';
        // Three.js sanitizes spaces → underscores before dedup
        const sanitized = origName.replace(/\s/g, '_');
        if (sanitized && obj.name !== sanitized) {
          renamedNodes.set(obj, sanitized);
        }
      }
    }
    if (renamedNodes.size > 0) {
      console.log(`[loadGLB] ${renamedNodes.size} node(s) renamed by Three.js (name dedup)`);
    }
  }

  let triangleCount = 0;
  let recordingData: CompactRecording | null = null;
  let recorderSettings: RecorderSettings | null = null;

  // Collected ReplayRecording configs (parsed after playback is created)
  const replayRecordingConfigs: { sequence: string; startOnSignal: ComponentRef | null; isReplayingSignal: ComponentRef | null; activeOnly: ActiveOnly }[] = [];

  // Generic pending array for Step 2 (replaces per-component collection arrays)
  const pending: PendingComponent[] = [];

  // MU templates and Group nodes (handled specially, not via init())
  const muTemplateNodes: Object3D[] = [];
  const groupNodes: { node: Object3D; key: string; data: Record<string, unknown> }[] = [];

  // ── Pre-scan: Drive/TransportSurface node sets for shadow classification ──
  const driveNodeSet = new Set<Object3D>();
  const transportSurfaceNodeSet = new Set<Object3D>();

  root.traverse((node: Object3D) => {
    const rv = node.userData?.realvirtual as Record<string, unknown> | undefined;
    if (!rv) return;
    if (rv['Drive']) driveNodeSet.add(node);
    if (rv['TransportSurface']) transportSurfaceNodeSet.add(node);
  });

  function isUnderDrive(node: Object3D): boolean {
    let current: Object3D | null = node.parent;
    while (current) {
      if (driveNodeSet.has(current)) return true;
      current = current.parent;
    }
    return false;
  }

  function isUnderTransportSurface(node: Object3D): boolean {
    let current: Object3D | null = node;
    while (current) {
      if (transportSurfaceNodeSet.has(current)) return true;
      current = current.parent;
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 1 "Awake": Traverse, construct, applySchema, register ALL
  // ═══════════════════════════════════════════════════════════════════
  root.traverse((node: Object3D) => {
    // ── Shadow classification and triangle counting ──
    const anyNode = node as unknown as {
      isMesh?: boolean;
      castShadow?: boolean;
      receiveShadow?: boolean;
      matrixAutoUpdate?: boolean;
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
        anyNode.castShadow = false;
      } else {
        const underDrive = isUnderDrive(node);
        const underTS = isUnderTransportSurface(node);
        const isStatic = !underDrive || underTS;
        if (isStatic) {
          anyNode.castShadow = false;
          anyNode.matrixAutoUpdate = false;
        } else {
          anyNode.castShadow = true;
        }
      }
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

    // ── Register ALL nodes in registry (Phase 1) ──
    const path = NodeRegistry.computeNodePath(node);
    registry.registerNode(path, node);

    const rv = node.userData?.realvirtual as Record<string, unknown> | undefined;
    if (!rv) return;

    // ── PLC Signals (registered first, before components that reference them) ──
    for (const sigType of SIGNAL_TYPES) {
      if (rv[sigType]) {
        const sigData = rv[sigType] as Record<string, unknown>;
        validateExtras(sigType, sigData);
        const status = sigData['Status'] as { Value?: boolean | number } | undefined;
        const signalName = (sigData['Name'] as string) || renamedNodes.get(node) || node.name;
        if (sigType.includes('Bool')) {
          signalStore.register(signalName, path, status?.Value as boolean ?? false);
        } else if (sigType.includes('Float')) {
          signalStore.register(signalName, path, status?.Value as number ?? 0);
        } else if (sigType.includes('Int')) {
          signalStore.register(signalName, path, status?.Value as number ?? 0);
        }
        registry.register(sigType, path, { address: path, signalName });
      }
    }

    // ── Drive (special case: inline construction, behaviors, initDrive) ──
    if (rv['Drive']) {
      const driveData = rv['Drive'] as Record<string, unknown>;
      validateExtras('Drive', driveData);

      const dirStr = driveData['Direction'] as string | undefined;
      if (dirStr) {
        const drive = new RVDrive(node);
        applySchema(drive as unknown as Record<string, unknown>, RVDrive.schema, driveData);

        // Collect DriveBehaviours
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
        drive.Behaviors = behaviors;
        drive.BehaviorExtras = behaviorExtras;
        drive.initDrive();

        drives.push(drive);
        registry.register('Drive', path, drive);
        node.userData._rvType = 'Drive';

        // Instantiate recognized drive behaviors via data-driven map
        for (const bName of behaviors) {
          const entry = DRIVE_BEHAVIOR_MAP[bName];
          if (entry) {
            const inst = new entry.ctor(node);
            applySchema(inst as unknown as Record<string, unknown>, entry.schema, behaviorExtras[bName] ?? {});
            pending.push({ component: inst, type: bName, path });
          }
        }

        console.log(
          `  Drive: ${node.name} [${drive.Direction}${drive.ReverseDirection ? ' REV' : ''}]` +
          ` path="${path}"` +
          (drive.UseLimits ? ` limits=[${drive.LowerLimit}, ${drive.UpperLimit}]` : '') +
          ` speed=${drive.TargetSpeed}` +
          (behaviors.length > 0 ? ` behaviors=[${behaviors.join(',')}]` : '')
        );
      }
    }

    // ── Auto-discovered components (via registered factories) ──
    for (const [type, factory] of getRegisteredFactories()) {
      if (!rv[type]) continue;
      const data = rv[type] as Record<string, unknown>;
      validateExtras(type, data);
      const aabb = factory.needsAABB ? createAABBFromExtras(node, rv) : null;
      const instance = factory.create(node, aabb);
      if (factory.beforeSchema) factory.beforeSchema(instance, data);
      applySchema(instance as unknown as Record<string, unknown>, factory.schema, data);
      if (factory.afterCreate) factory.afterCreate(instance, node);
      registry.register(type, path, instance);
      pending.push({ component: instance, type, path });
    }

    // ── MU templates ──
    if (rv['MU']) {
      validateExtras('MU', rv['MU'] as Record<string, unknown>);
      muTemplateNodes.push(node);
    }

    // ── Group components (Group, Group_1, Group_2, ...) ──
    for (const key of Object.keys(rv)) {
      if (key === 'Group' || /^Group_\d+$/.test(key)) {
        const gData = rv[key] as Record<string, unknown>;
        validateExtras('Group', gData);
        groupNodes.push({ node, key, data: gData });
      }
    }

    // ── DrivesRecording / DrivesRecorder / ReplayRecording (special cases) ──
    if (rv['DrivesRecording_compact'] && !recordingData) {
      recordingData = parseCompactRecording(rv['DrivesRecording_compact'] as Record<string, unknown>);
    }
    if (rv['DrivesRecorder']) {
      const recorderData = rv['DrivesRecorder'] as Record<string, unknown>;
      validateExtras('DrivesRecorder', recorderData);
      recorderSettings = {
        playOnStart: (recorderData['PlayOnStart'] as boolean) ?? true,
        replayStartFrame: (recorderData['ReplayStartFrame'] as number) ?? 0,
        replayEndFrame: (recorderData['ReplayEndFrame'] as number) ?? 0,
        loop: (recorderData['Loop'] as boolean) ?? false,
        activeOnly: parseActiveOnly(recorderData),
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
    for (const key of Object.keys(rv)) {
      if (key === 'ReplayRecording' || key.match(/^ReplayRecording_\d+$/)) {
        const rrData = rv[key] as Record<string, unknown>;
        validateExtras('ReplayRecording', rrData);
        const sequence = (rrData['Sequence'] as string) ?? '';
        const startOnSignal = (rrData['StartOnSignal'] as ComponentRef) ?? null;
        const isReplayingSignal = (rrData['IsReplayingSignal'] as ComponentRef) ?? null;
        const rrActiveOnly = parseActiveOnly(rrData);
        replayRecordingConfigs.push({ sequence, startOnSignal, isReplayingSignal, activeOnly: rrActiveOnly });
      }
    }
  });

  // ── Hide MU templates (before init — sources need them hidden) ──
  for (const muNode of muTemplateNodes) {
    muNode.visible = false;
    console.log(`  MU template: ${muNode.name} (hidden)`);
  }

  // ── Register alias paths for nodes renamed by Three.js dedup ──
  // Must happen AFTER Step 1 (signals registered) and BEFORE Step 2 (refs resolved).
  if (renamedNodes.size > 0) {
    const computeOriginalPath = (node: Object3D): string => {
      const parts: string[] = [];
      let current: Object3D | null = node;
      while (current && current.parent) {
        parts.unshift(renamedNodes.get(current) ?? current.name);
        current = current.parent;
        if (!current.parent) break;
      }
      return parts.join('/');
    };

    for (const [obj, origName] of renamedNodes) {
      const origPath = computeOriginalPath(obj);
      const currentPath = NodeRegistry.computeNodePath(obj);
      if (origPath !== currentPath) {
        registry.registerAlias(origPath, obj);
        // Also register signal path alias if this node has a signal
        const sigName = signalStore.nameForPath(currentPath);
        if (sigName !== undefined) {
          signalStore.register(sigName, origPath, signalStore.get(sigName) ?? false);
          debug('loader', `Signal alias: "${origPath}" → signal "${sigName}" (renamed "${origName}" → "${obj.name}")`);
        }
        debug('loader', `Node alias: "${origPath}" → "${currentPath}" (renamed "${origName}" → "${obj.name}")`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 2 "Start": resolveComponentRefs + init() ALL pending
  // ═══════════════════════════════════════════════════════════════════
  const context: ComponentContext = { registry, signalStore, scene, transportManager: manager, root };

  for (const { component } of pending) {
    resolveComponentRefs(component as unknown as Record<string, unknown>, registry);
    component.init(context);
  }

  // ── Build GroupRegistry (special case — not an RVComponent) ──
  let groups: GroupRegistry | null = null;
  if (groupNodes.length > 0) {
    groups = new GroupRegistry();
    for (const { node, data } of groupNodes) {
      if (data['_enabled'] === false) continue;
      const groupName = data['GroupName'] as string | undefined;
      if (!groupName) continue;
      const prefix = data['GroupNamePrefix'] as string | undefined;
      let resolvedName = groupName;
      if (prefix) {
        const prefixNode = registry.getNode(prefix);
        if (prefixNode) {
          resolvedName = prefixNode.name + groupName;
        }
      }
      groups.register(resolvedName, node);
    }
    const groupNames = groups.getGroupNames();
    console.log(`  Groups: ${groups.groupCount} groups [${groupNames.join(', ')}]`);
  }

  // ── WebGPU compatibility fixes ──
  const isWebGPU = options?.isWebGPU ?? false;
  let uvFixCount = 0;
  let indexFixCount = 0;
  root.traverse((node: Object3D) => {
    if (!(node as Mesh).isMesh) return;
    const geo = (node as Mesh).geometry as BufferGeometry;

    if (!geo.attributes.uv && geo.attributes.position) {
      geo.setAttribute('uv', new BufferAttribute(
        new Float32Array(geo.attributes.position.count * 2), 2,
      ));
      uvFixCount++;
    }

    if (isWebGPU && geo.index) {
      const nonIndexed = geo.toNonIndexed();
      (node as Mesh).geometry = nonIndexed;
      geo.dispose();
      indexFixCount++;
    }
  });
  if (uvFixCount > 0 || indexFixCount > 0) {
    console.log(`Geometry fixes: ${uvFixCount} missing UVs` + (indexFixCount > 0 ? `, ${indexFixCount} indexed->non-indexed (WebGPU)` : ''));
  }

  // ── Bounding box ──
  const boundingBox = new Box3().setFromObject(root);

  // ── BVH for fast raycasting ──
  try {
    const { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } = await import('three-mesh-bvh');
    BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
    BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
    Mesh.prototype.raycast = acceleratedRaycast;
    let bvhCount = 0;
    root.traverse((node: Object3D) => {
      const m = node as unknown as { isMesh?: boolean; geometry?: BufferGeometry };
      if (m.isMesh && m.geometry) {
        m.geometry.computeBoundsTree();
        bvhCount++;
      }
    });
    console.log(`[loadGLB] BVH computed for ${bvhCount} meshes`);
  } catch (e) {
    console.warn('[loadGLB] BVH computation failed (three-mesh-bvh):', e);
  }

  // ── DrivesPlayback ──
  let playback: RVDrivesPlayback | null = null;
  const rec = recordingData as CompactRecording | null;
  const recSettings = recorderSettings as RecorderSettings | null;
  if (rec) {
    try {
      playback = new RVDrivesPlayback(rec, registry, {
        loop: recSettings?.loop ?? false,
      });
      playback.activeOnly = recSettings?.activeOnly ?? 'Always';
      console.log(
        `  DrivesPlayback: ${rec.numberFrames} frames, ${rec.driveCount} drives, ` +
        `dt=${rec.fixedDeltaTime}s loop=${recSettings?.loop ?? false}` +
        (rec.sequences ? ` sequences=[${rec.sequences.map(s => s.name).join(',')}]` : '')
      );
    } catch (e) {
      console.warn(`  DrivesPlayback failed: ${e}`);
    }
  }

  // ── ReplayRecording instances ──
  const replayRecordings: RVReplayRecording[] = [];
  if (playback && replayRecordingConfigs.length > 0) {
    for (const cfg of replayRecordingConfigs) {
      const startAddr = registry.resolve(cfg.startOnSignal).signalAddress ?? null;
      const replayAddr = registry.resolve(cfg.isReplayingSignal).signalAddress ?? null;
      const rr = new RVReplayRecording(cfg.sequence, startAddr, replayAddr, playback, signalStore);
      rr.activeOnly = cfg.activeOnly;
      replayRecordings.push(rr);
      console.log(
        `  ReplayRecording: "${cfg.sequence}" startSignal=${startAddr ?? 'none'} replayingSignal=${replayAddr ?? 'none'}`
      );
    }
  }

  // ── LogicStep engine ──
  let logicEngine: RVLogicEngine | null = null;
  const engine = RVLogicEngine.build(root, registry, signalStore);
  if (engine.roots.length > 0) {
    logicEngine = engine;
  }

  // ── Parity summary ──
  printParitySummary();

  // ── Build signal path index (all suffix variants pre-hashed for O(1) lookup) ──
  signalStore.buildIndex();

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

  return { drives, transportManager: manager, signalStore, registry, playback, replayRecordings, recorderSettings, logicEngine, boundingBox, triangleCount, groups, modelConfig: {} };
}
