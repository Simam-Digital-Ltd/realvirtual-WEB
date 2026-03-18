import { describe, it, expect, vi } from 'vitest';
import { Object3D, Mesh, BoxGeometry, MeshBasicMaterial, Raycaster, Layers } from 'three';
import { RaycastLayers } from '../src/core/engine/rv-raycast-layers';

// ─── Helpers ────────────────────────────────────────────────────────

function createMockViewer() {
  const listeners = new Map<string, Set<Function>>();
  return {
    on(event: string, cb: Function) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
      return () => listeners.get(event)?.delete(cb);
    },
    emit(event: string, data?: unknown) {
      listeners.get(event)?.forEach(cb => cb(data));
    },
    _listeners: listeners,
  };
}

function createDriveMesh(driveName: string): Mesh {
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  mesh.name = driveName;
  mesh.userData = { rvType: 'Drive', rvPath: `/Root/${driveName}` };
  return mesh;
}

function createOverlayMesh(): Mesh {
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  mesh.userData = { _highlightOverlay: true };
  return mesh;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('RaycastManager', () => {
  it('should register and clear targets by type', () => {
    const targetRegistry = new Map<string, Object3D[]>();

    const driveMesh1 = createDriveMesh('Drive1');
    const driveMesh2 = createDriveMesh('Drive2');

    // Register
    targetRegistry.set('Drive', [driveMesh1, driveMesh2]);
    expect(targetRegistry.get('Drive')?.length).toBe(2);

    // Clear
    targetRegistry.clear();
    expect(targetRegistry.size).toBe(0);
  });

  it('should apply exclude filters to intersections', () => {
    const overlayMesh = createOverlayMesh();
    const driveMesh = createDriveMesh('Drive1');
    const sensorVizMesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    sensorVizMesh.name = 'something_sensorViz';

    const excludeFilters = [
      (obj: Object3D) => !!obj.userData?._highlightOverlay,
      (obj: Object3D) => !!obj.userData?._driveHoverOverlay,
      (obj: Object3D) => obj.name.endsWith('_sensorViz'),
    ];

    const allHits = [overlayMesh, driveMesh, sensorVizMesh];
    const filtered = allHits.filter(
      hit => !excludeFilters.some(filter => filter(hit))
    );

    expect(filtered).toEqual([driveMesh]);
  });

  it('should detect correct nodeType from userData', () => {
    const driveMesh = createDriveMesh('Axis1');

    function findNodeType(obj: Object3D): string | null {
      let current: Object3D | null = obj;
      while (current) {
        if (current.userData?.rvType) return current.userData.rvType;
        current = current.parent;
      }
      return null;
    }

    expect(findNodeType(driveMesh)).toBe('Drive');

    // Child mesh without userData should walk up
    const childMesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    driveMesh.add(childMesh);
    expect(findNodeType(childMesh)).toBe('Drive');
  });

  it('should emit drive-hover compat event with EXACT existing signature', () => {
    const viewer = createMockViewer();
    const receivedEvents: unknown[] = [];

    viewer.on('drive-hover', (data: unknown) => receivedEvents.push(data));

    // Compat-Layer must emit { drive, clientX, clientY } — NOT { drive, pointer }
    const mockDrive = { name: 'Drive1', path: '/Root/Drive1' };
    viewer.emit('drive-hover', {
      drive: mockDrive,
      clientX: 450,
      clientY: 300,
    });

    expect(receivedEvents.length).toBe(1);
    const evt = receivedEvents[0] as Record<string, unknown>;
    expect(evt).toHaveProperty('clientX', 450);
    expect(evt).toHaveProperty('clientY', 300);
    expect(evt).toHaveProperty('drive', mockDrive);
    // MUST NOT have 'pointer' property (breaking change)
    expect(evt).not.toHaveProperty('pointer');
  });

  it('should emit drive-focus compat event with node field', () => {
    const viewer = createMockViewer();
    const receivedEvents: unknown[] = [];

    viewer.on('drive-focus', (data: unknown) => receivedEvents.push(data));

    const focusNode = createDriveMesh('Drive1');
    const mockDrive = { name: 'Drive1', path: '/Root/Drive1' };

    viewer.emit('drive-focus', { drive: mockDrive, node: focusNode });

    expect(receivedEvents.length).toBe(1);
    const evt = receivedEvents[0] as Record<string, unknown>;
    expect(evt).toHaveProperty('drive', mockDrive);
    expect(evt).toHaveProperty('node', focusNode);
  });

  it('should not emit when disabled (during orbit)', () => {
    let enabled = true;
    const emitted: unknown[] = [];

    const emit = (data: unknown) => {
      if (!enabled) return;
      emitted.push(data);
    };

    emit({ nodeType: 'Drive', pointer: { x: 100, y: 200 } });
    expect(emitted.length).toBe(1);

    // Disable (orbit start)
    enabled = false;
    emit({ nodeType: 'Drive', pointer: { x: 150, y: 250 } });
    expect(emitted.length).toBe(1);

    // Re-enable (orbit end)
    enabled = true;
    emit({ nodeType: 'Drive', pointer: { x: 200, y: 300 } });
    expect(emitted.length).toBe(2);
  });

  it('should clearTargets on model-cleared', () => {
    const viewer = createMockViewer();
    const targetRegistry = new Map<string, Object3D[]>();

    targetRegistry.set('Drive', [createDriveMesh('D1'), createDriveMesh('D2')]);
    targetRegistry.set('Sensor', [new Object3D()]);
    expect(targetRegistry.size).toBe(2);

    viewer.on('model-cleared', () => targetRegistry.clear());
    viewer.emit('model-cleared');

    expect(targetRegistry.size).toBe(0);
  });

  it('should set layers on meshes when registering targets', () => {
    const driveMesh = createDriveMesh('D1');
    // Before registration: only on default layer
    expect(driveMesh.layers.test(new Layers())).toBe(true); // layer 0

    // Simulate registerTargets: enable DRIVE layer on all meshes
    driveMesh.layers.enable(RaycastLayers.DRIVE);

    const testLayers = new Layers();
    testLayers.set(RaycastLayers.DRIVE);
    expect(driveMesh.layers.test(testLayers)).toBe(true);
  });

  it('should enable/disable hover types via layers', () => {
    const raycaster = new Raycaster();

    // Default: only drives hoverable
    raycaster.layers.set(0); // reset
    raycaster.layers.enable(RaycastLayers.DRIVE);

    const driveLayer = new Layers();
    driveLayer.set(RaycastLayers.DRIVE);
    const sensorLayer = new Layers();
    sensorLayer.set(RaycastLayers.SENSOR);

    // Raycaster matches drives but not sensors
    expect(raycaster.layers.test(driveLayer)).toBe(true);
    expect(raycaster.layers.test(sensorLayer)).toBe(false);

    // Enable sensor hover
    raycaster.layers.enable(RaycastLayers.SENSOR);
    expect(raycaster.layers.test(sensorLayer)).toBe(true);

    // Disable drive hover
    raycaster.layers.disable(RaycastLayers.DRIVE);
    expect(raycaster.layers.test(driveLayer)).toBe(false);
    expect(raycaster.layers.test(sensorLayer)).toBe(true);
  });

  it('should provide driveHover deprecation getter', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const raycastManager = { enabled: true, hoveredNode: null as Object3D | null };
    const viewer = {
      get driveHover() {
        console.warn('viewer.driveHover is deprecated, use viewer.raycastManager');
        return {
          get enabled() { return raycastManager.enabled; },
          set enabled(v: boolean) { raycastManager.enabled = v; },
          get hoveredDrive() { return raycastManager.hoveredNode; },
          pointerClientX: 0,
          pointerClientY: 0,
        };
      }
    };

    const dh = viewer.driveHover;
    expect(warnSpy).toHaveBeenCalledWith('viewer.driveHover is deprecated, use viewer.raycastManager');
    expect(dh.enabled).toBe(true);

    warnSpy.mockRestore();
  });

  it('should have correct layer constants', () => {
    expect(RaycastLayers.DEFAULT).toBe(0);
    expect(RaycastLayers.DRIVE).toBe(1);
    expect(RaycastLayers.SENSOR).toBe(2);
    expect(RaycastLayers.MU).toBe(3);
    expect(RaycastLayers.METADATA).toBe(4);
    expect(RaycastLayers.SCENE_CLICK).toBe(5);
  });

  it('should remove layers when clearing targets', () => {
    const mesh = createDriveMesh('D1');
    mesh.layers.enable(RaycastLayers.DRIVE);

    const driveLayerTest = new Layers();
    driveLayerTest.set(RaycastLayers.DRIVE);
    expect(mesh.layers.test(driveLayerTest)).toBe(true);

    // Simulate clearTargets: disable layer
    mesh.layers.disable(RaycastLayers.DRIVE);
    expect(mesh.layers.test(driveLayerTest)).toBe(false);
  });

  it('should support multiple layers on same mesh', () => {
    const mesh = createDriveMesh('D1');
    mesh.layers.enable(RaycastLayers.DRIVE);
    mesh.layers.enable(RaycastLayers.SCENE_CLICK);

    const driveLayer = new Layers();
    driveLayer.set(RaycastLayers.DRIVE);
    const sceneLayer = new Layers();
    sceneLayer.set(RaycastLayers.SCENE_CLICK);

    expect(mesh.layers.test(driveLayer)).toBe(true);
    expect(mesh.layers.test(sceneLayer)).toBe(true);

    // Disable only DRIVE — SCENE_CLICK remains
    mesh.layers.disable(RaycastLayers.DRIVE);
    expect(mesh.layers.test(driveLayer)).toBe(false);
    expect(mesh.layers.test(sceneLayer)).toBe(true);
  });
});
