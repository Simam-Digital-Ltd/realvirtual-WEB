import { describe, it, expect, beforeEach } from 'vitest';
import { Object3D } from 'three';
import { GroupRegistry } from '../src/core/engine/rv-group-registry';

describe('GroupRegistry', () => {
  let registry: GroupRegistry;

  beforeEach(() => {
    registry = new GroupRegistry();
  });

  it('registers nodes under a group name', () => {
    const node = new Object3D();
    registry.register('Conveyors', node);
    const groups = registry.getAll();
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('Conveyors');
    expect(groups[0].nodes).toContain(node);
  });

  it('registers multiple nodes under same group', () => {
    const a = new Object3D();
    const b = new Object3D();
    registry.register('Conveyors', a);
    registry.register('Conveyors', b);
    expect(registry.get('Conveyors')!.nodes).toHaveLength(2);
  });

  it('registers same node in multiple groups', () => {
    const node = new Object3D();
    registry.register('Conveyors', node);
    registry.register('Entry', node);
    expect(registry.getGroupNames()).toContain('Conveyors');
    expect(registry.getGroupNames()).toContain('Entry');
  });

  it('setVisible hides group root nodes only (no traverse)', () => {
    const root = new Object3D();
    const child = new Object3D();
    child.visible = true;
    root.add(child);
    registry.register('Robots', root);

    registry.setVisible('Robots', false);
    expect(root.visible).toBe(false);
    // Child retains its own visible state — Three.js skips subtree via parent
    expect(child.visible).toBe(true);
  });

  it('setVisible restores root visibility', () => {
    const node = new Object3D();
    registry.register('Robots', node);
    registry.setVisible('Robots', false);
    registry.setVisible('Robots', true);
    expect(node.visible).toBe(true);
  });

  it('isolate shows only target group', () => {
    const a = new Object3D();
    const b = new Object3D();
    registry.register('Conveyors', a);
    registry.register('Robots', b);

    registry.isolate('Robots');
    expect(a.visible).toBe(false);
    expect(b.visible).toBe(true);
  });

  it('showAll restores all groups', () => {
    const a = new Object3D();
    const b = new Object3D();
    registry.register('Conveyors', a);
    registry.register('Robots', b);

    registry.isolate('Robots');
    registry.showAll();
    expect(a.visible).toBe(true);
    expect(b.visible).toBe(true);
  });

  it('sequential isolate calls update correctly', () => {
    const a = new Object3D();
    const b = new Object3D();
    registry.register('A', a);
    registry.register('B', b);

    registry.isolate('A');
    expect(a.visible).toBe(true);
    expect(b.visible).toBe(false);

    registry.isolate('B');
    expect(a.visible).toBe(false);
    expect(b.visible).toBe(true);
  });

  it('setVisible on unknown group is a no-op', () => {
    expect(() => registry.setVisible('NonExistent', false)).not.toThrow();
  });

  it('clear removes all groups', () => {
    registry.register('A', new Object3D());
    registry.clear();
    expect(registry.getAll()).toHaveLength(0);
  });

  it('showAll respects defaultHiddenGroups', () => {
    const nodeA = new Object3D(); nodeA.name = 'A';
    const nodeB = new Object3D(); nodeB.name = 'B';
    registry.register('GroupA', nodeA);
    registry.register('GroupB', nodeB);
    registry.setDefaultHiddenGroups(['GroupB']);

    registry.isolate('GroupA');  // hides GroupB
    registry.showAll();          // should restore GroupA but keep GroupB hidden

    expect(registry.get('GroupA')!.visible).toBe(true);
    expect(registry.get('GroupB')!.visible).toBe(false);
  });
});
