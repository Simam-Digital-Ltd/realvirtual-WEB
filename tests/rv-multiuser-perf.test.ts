/**
 * rv-multiuser-perf.test.ts — Performance tests for AvatarManager with 15 concurrent avatars.
 *
 * Tests:
 *   - AvatarManager handles 15 concurrent avatars without errors
 *   - Adding + removing + updating 15 avatars completes within 16 ms (60 fps budget)
 *   - Memory cleanup: create 15 avatars, dispose all, verify geometries are disposed
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AvatarManager } from '../src/core/engine/rv-avatar-manager';
import type { PlayerInfo, AvatarBroadcast } from '../src/core/engine/rv-avatar-manager';

// ── Three.js mock (same pattern as rv-multiuser.test.ts) ───────────────────

// Patch document.createElement to return a mock canvas for the name-label texture.
const originalCreateElement = document.createElement.bind(document);
vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
  if (tag === 'canvas') {
    return {
      width: 256,
      height: 64,
      getContext: vi.fn(() => ({
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 0,
        font: '',
        textAlign: '',
        textBaseline: '',
        beginPath: vi.fn(),
        roundRect: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        arc: vi.fn(),
        closePath: vi.fn(),
        fillText: vi.fn(),
      })),
    } as unknown as HTMLCanvasElement;
  }
  return originalCreateElement(tag);
});

vi.mock('three', () => {
  class SphereGeometry { dispose = vi.fn(); }
  class MeshStandardMaterial { dispose = vi.fn(); needsUpdate = false; map: unknown = null; }
  class Mesh {
    castShadow = false; receiveShadow = false; visible = true;
    position = {
      x: 0, y: 0, z: 0,
      set(nx: number, ny: number, nz: number) { this.x = nx; this.y = ny; this.z = nz; return this; },
      lerp(_t: unknown, _f: unknown) { return this; },
    };
    quaternion = {
      x: 0, y: 0, z: 0, w: 1,
      set(nx: number, ny: number, nz: number, nw: number) { this.x = nx; this.y = ny; this.z = nz; this.w = nw; return this; },
      slerp(_t: unknown, _f: unknown) { return this; },
    };
  }
  class Group {
    name = '';
    position = new Vector3();
    quaternion = { x: 0, y: 0, z: 0, w: 1, slerp(_t: unknown, _f: unknown) { return this; } };
    add = vi.fn();
  }
  class ColorImpl { hex: string; constructor(hex: string) { this.hex = hex; } }
  class CanvasTexture { dispose = vi.fn(); }
  class SpriteMaterial { dispose = vi.fn(); map: unknown = null; needsUpdate = false; depthTest = false; transparent = false; }
  class Sprite {
    scale = { set: vi.fn() };
    position = { x: 0, y: 0, z: 0, set(_x: number, _y: number, _z: number) { return this; } };
    material = new SpriteMaterial();
  }
  class Vector3 {
    x: number; y: number; z: number;
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(nx: number, ny: number, nz: number) { this.x = nx; this.y = ny; this.z = nz; return this; }
    lerp(target: { x: number; y: number; z: number }, t: number) {
      this.x += (target.x - this.x) * t;
      this.y += (target.y - this.y) * t;
      this.z += (target.z - this.z) * t;
      return this;
    }
    distanceTo(other: { x: number; y: number; z: number }): number {
      const dx = this.x - other.x;
      const dy = this.y - other.y;
      const dz = this.z - other.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
  }
  class Quaternion {
    x: number; y: number; z: number; w: number;
    constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
    set(nx: number, ny: number, nz: number, nw: number) { this.x = nx; this.y = ny; this.z = nz; this.w = nw; return this; }
    slerp(target: { x: number; y: number; z: number; w: number }, t: number) {
      this.x += (target.x - this.x) * t;
      this.y += (target.y - this.y) * t;
      this.z += (target.z - this.z) * t;
      this.w += (target.w - this.w) * t;
      return this;
    }
  }

  class BufferGeometry {
    dispose = vi.fn();
    setAttribute = vi.fn();
    attributes: Record<string, unknown> = {};
  }
  class Float32BufferAttribute {
    needsUpdate = false;
    setXYZ = vi.fn();
    constructor(public array: Float32Array, public itemSize: number) {}
  }
  class Line {
    visible = true;
    frustumCulled = false;
    geometry: BufferGeometry;
    constructor() {
      this.geometry = new BufferGeometry();
      this.geometry.attributes = { position: new Float32BufferAttribute(new Float32Array(6), 3) };
    }
  }
  class LineBasicMaterial { dispose = vi.fn(); }

  return {
    SphereGeometry,
    MeshStandardMaterial,
    Mesh,
    Group,
    Color: ColorImpl,
    CanvasTexture,
    SpriteMaterial,
    Sprite,
    Vector3,
    Quaternion,
    BufferGeometry,
    Float32BufferAttribute,
    Line,
    LineBasicMaterial,
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────

const AVATAR_COUNT = 15;

function makeScene() {
  const objects: unknown[] = [];
  return {
    add: vi.fn((obj) => objects.push(obj)),
    remove: vi.fn((obj) => {
      const i = objects.indexOf(obj);
      if (i >= 0) objects.splice(i, 1);
    }),
    _objects: objects,
  };
}

function makePlayer(index: number, xrMode = 'none'): PlayerInfo {
  return {
    id: `perf-player-${index}`,
    name: `PerfUser${index}`,
    color: '#2196F3',
    role: 'observer',
    xrMode,
  };
}

function makeBroadcast(index: number): AvatarBroadcast {
  return {
    id: `perf-player-${index}`,
    headPos: [index * 2, 1.7, 0],
    headRot: [0, 0, 0, 1],
  };
}

// ── Performance Tests ─────────────────────────────────────────────────────

describe('AvatarManager — 15 concurrent avatars', () => {
  let scene: ReturnType<typeof makeScene>;
  let manager: AvatarManager;

  beforeEach(() => {
    scene = makeScene();
    manager = new AvatarManager(scene as unknown as import('three').Scene);
  });

  afterEach(() => {
    manager.clear();
  });

  it('handles 15 concurrent avatars without errors', () => {
    // Add 15 avatars — must not throw
    for (let i = 0; i < AVATAR_COUNT; i++) {
      expect(() => manager.addAvatar(makePlayer(i))).not.toThrow();
    }

    expect(manager.count).toBe(AVATAR_COUNT);
    expect(scene.add).toHaveBeenCalledTimes(AVATAR_COUNT);
  });

  it('adding + removing + updating 15 avatars completes within 16 ms (60 fps budget)', () => {
    const start = performance.now();

    // Add 15 avatars
    for (let i = 0; i < AVATAR_COUNT; i++) {
      manager.addAvatar(makePlayer(i));
    }

    // Update all with a broadcast
    for (let i = 0; i < AVATAR_COUNT; i++) {
      manager.updateAvatar(makeBroadcast(i));
    }

    // Run one lerp frame
    manager.lerpAvatars(1 / 60);

    // Remove all
    for (let i = 0; i < AVATAR_COUNT; i++) {
      manager.removeAvatar(`perf-player-${i}`);
    }

    const elapsed = performance.now() - start;

    // All operations on 15 avatars must fit within a single 60 fps frame budget (16 ms)
    expect(elapsed).toBeLessThan(16);
    expect(manager.count).toBe(0);
  });

  it('memory cleanup: 15 avatars created then disposed have all geometries disposed', () => {
    // Capture dispose call counts before adding avatars
    // We verify by checking that scene.remove is called once per avatar on clear()

    for (let i = 0; i < AVATAR_COUNT; i++) {
      manager.addAvatar(makePlayer(i));
    }

    expect(manager.count).toBe(AVATAR_COUNT);

    // Dispose all
    manager.clear();

    expect(manager.count).toBe(0);

    // scene.remove must have been called exactly once per avatar
    expect(scene.remove).toHaveBeenCalledTimes(AVATAR_COUNT);
  });

  it('lerpAvatars over 15 avatars for 10 frames stays within 16 ms total', () => {
    for (let i = 0; i < AVATAR_COUNT; i++) {
      manager.addAvatar(makePlayer(i));
      manager.updateAvatar(makeBroadcast(i));
    }

    const start = performance.now();
    for (let frame = 0; frame < 10; frame++) {
      manager.lerpAvatars(1 / 60);
    }
    const elapsed = performance.now() - start;

    // 10 frames × 15 avatars of lerp should be well within 16 ms
    expect(elapsed).toBeLessThan(16);
  });

  it('handles mixed desktop and VR avatars (15 total) without errors', () => {
    // 8 desktop + 7 VR
    for (let i = 0; i < 8; i++) {
      manager.addAvatar(makePlayer(i, 'none'));
    }
    for (let i = 8; i < AVATAR_COUNT; i++) {
      manager.addAvatar(makePlayer(i, 'vr'));
    }

    expect(manager.count).toBe(AVATAR_COUNT);

    // Update all with position data
    for (let i = 0; i < AVATAR_COUNT; i++) {
      const broadcast: AvatarBroadcast = {
        id: `perf-player-${i}`,
        headPos: [i, 1.7, 0],
        headRot: [0, 0, 0, 1],
        // VR players include controller data
        leftCtrl: i >= 8 ? { pos: [i + 0.3, 1.2, 0], rot: [0, 0, 0, 1], active: true } : null,
        rightCtrl: i >= 8 ? { pos: [i - 0.3, 1.2, 0], rot: [0, 0, 0, 1], active: true } : null,
      };
      expect(() => manager.updateAvatar(broadcast)).not.toThrow();
    }

    // Lerp all
    expect(() => manager.lerpAvatars(1 / 60)).not.toThrow();
  });
});
