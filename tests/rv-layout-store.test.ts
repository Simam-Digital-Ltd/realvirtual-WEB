/**
 * Tests for LayoutStore — state management for the Layout Planner plugin.
 *
 * Verifies: add, remove, select, update transform, multi-tab catalogs, fetch error handling.
 */
import { describe, test, expect, vi } from 'vitest';
import { LayoutStore } from '../src/plugins/rv-layout-store';

describe('LayoutStore', () => {
  test('addComponent adds to placed array', () => {
    const store = new LayoutStore();
    store.addComponent({ id: '1', catalogId: 'belt-1m', glbUrl: 'https://example.com/belt.glb', label: 'Belt', position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] });
    expect(store.getSnapshot().placed).toHaveLength(1);
  });

  test('removeComponent removes by id', () => {
    const store = new LayoutStore();
    store.addComponent({ id: '1', catalogId: 'belt-1m', glbUrl: 'https://example.com/belt.glb', label: 'Belt', position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] });
    store.removeComponent('1');
    expect(store.getSnapshot().placed).toHaveLength(0);
  });

  test('selectComponent sets selectedId', () => {
    const store = new LayoutStore();
    store.addComponent({ id: '1', catalogId: 'belt-1m', glbUrl: 'https://example.com/belt.glb', label: 'Belt', position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] });
    store.selectComponent('1');
    expect(store.getSnapshot().selectedId).toBe('1');
  });

  test('updateTransform updates position and rotation', () => {
    const store = new LayoutStore();
    store.addComponent({ id: '1', catalogId: 'belt-1m', glbUrl: 'https://example.com/belt.glb', label: 'Belt', position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] });
    store.updateTransform('1', [100, 0, 200], [0, 45, 0]);
    const placed = store.getSnapshot().placed[0];
    expect(placed.position).toEqual([100, 0, 200]);
    expect(placed.rotation).toEqual([0, 45, 0]);
  });

  // --- Multi-library tab tests (require fetch mocking) ---

  const mockCatalog = (name: string) => JSON.stringify({
    version: '1.0', name, entries: [
      { id: 'item-1', name: 'Item', category: 'conveyor', glbUrl: 'https://example.com/a.glb', thumbnailUrl: 'https://example.com/a.png' },
    ],
  });

  test('addCatalog creates a new tab', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(mockCatalog('Lib 1')));
    const store = new LayoutStore();
    await store.addCatalog('https://lib1.example.com/catalog.json');
    expect(store.getSnapshot().catalogUrls).toHaveLength(1);
    expect(store.getSnapshot().activeTabUrl).toBe('https://lib1.example.com/catalog.json');
    expect(store.getSnapshot().catalogs.get('https://lib1.example.com/catalog.json')?.name).toBe('Lib 1');
  });

  test('multiple catalogs create multiple tabs', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(mockCatalog('Lib 1')))
      .mockResolvedValueOnce(new Response(mockCatalog('Lib 2')));
    const store = new LayoutStore();
    await store.addCatalog('https://lib1.example.com/catalog.json');
    await store.addCatalog('https://lib2.example.com/catalog.json');
    expect(store.getSnapshot().catalogUrls).toHaveLength(2);
  });

  test('removeCatalog removes tab and switches to next', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(mockCatalog('Lib 1')))
      .mockResolvedValueOnce(new Response(mockCatalog('Lib 2')));
    const store = new LayoutStore();
    await store.addCatalog('https://lib1.example.com/catalog.json');
    await store.addCatalog('https://lib2.example.com/catalog.json');
    store.removeCatalog('https://lib1.example.com/catalog.json');
    expect(store.getSnapshot().catalogUrls).toHaveLength(1);
    expect(store.getSnapshot().activeTabUrl).toBe('https://lib2.example.com/catalog.json');
  });

  test('setActiveTab switches active library', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(mockCatalog('Lib 1')))
      .mockResolvedValueOnce(new Response(mockCatalog('Lib 2')));
    const store = new LayoutStore();
    await store.addCatalog('https://lib1.example.com/catalog.json');
    await store.addCatalog('https://lib2.example.com/catalog.json');
    store.setActiveTab('https://lib2.example.com/catalog.json');
    expect(store.getSnapshot().activeTabUrl).toBe('https://lib2.example.com/catalog.json');
  });

  test('addCatalog with 404 sets error state on tab', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('Not Found', { status: 404 }));
    const store = new LayoutStore();
    await store.addCatalog('https://missing.example.com/catalog.json');
    expect(store.getSnapshot().catalogUrls).toHaveLength(1);
    // Tab exists but has error state -- no entries
    expect(store.getSnapshot().catalogs.get('https://missing.example.com/catalog.json')).toBeUndefined();
  });

  test('addCatalog with invalid JSON sets error state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('<!DOCTYPE html><html>'));
    const store = new LayoutStore();
    await store.addCatalog('https://broken.example.com/catalog.json');
    expect(store.getSnapshot().catalogs.get('https://broken.example.com/catalog.json')).toBeUndefined();
  });

  test('removeComponent clears selectedId if removed component was selected', () => {
    const store = new LayoutStore();
    store.addComponent({ id: '1', catalogId: 'belt', glbUrl: 'x.glb', label: 'A', position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] });
    store.selectComponent('1');
    store.removeComponent('1');
    expect(store.getSnapshot().selectedId).toBeNull();
  });

  test('subscribe notifies listener on changes', () => {
    const store = new LayoutStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.addComponent({ id: '1', catalogId: 'belt', glbUrl: 'x.glb', label: 'A', position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] });
    expect(listener).toHaveBeenCalled();
  });

  test('unsubscribe stops notifications', () => {
    const store = new LayoutStore();
    const listener = vi.fn();
    const unsub = store.subscribe(listener);
    unsub();
    store.addComponent({ id: '1', catalogId: 'belt', glbUrl: 'x.glb', label: 'A', position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] });
    expect(listener).not.toHaveBeenCalled();
  });

  test('setMode changes mode in snapshot', () => {
    const store = new LayoutStore();
    store.setMode('rotate');
    expect(store.getSnapshot().mode).toBe('rotate');
  });

  test('setGridEnabled persists to localStorage', () => {
    const store = new LayoutStore();
    store.setGridEnabled(false);
    expect(store.getSnapshot().gridEnabled).toBe(false);
    expect(localStorage.getItem('rv-layout-grid-enabled')).toBe('false');
  });

  test('setGridSize persists to localStorage', () => {
    const store = new LayoutStore();
    store.setGridSize(250);
    expect(store.getSnapshot().gridSizeMm).toBe(250);
    expect(localStorage.getItem('rv-layout-grid-size')).toBe('250');
  });

  test('updateLabel changes component label', () => {
    const store = new LayoutStore();
    store.addComponent({ id: '1', catalogId: 'belt', glbUrl: 'x.glb', label: 'Old', position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] });
    store.updateLabel('1', 'New Name');
    expect(store.getSnapshot().placed[0].label).toBe('New Name');
  });

  test('setComponents replaces all placed and clears selection', () => {
    const store = new LayoutStore();
    store.addComponent({ id: '1', catalogId: 'belt', glbUrl: 'x.glb', label: 'A', position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] });
    store.selectComponent('1');
    store.setComponents([
      { id: '2', catalogId: 'robot', glbUrl: 'y.glb', label: 'B', position: [1,0,1], rotation: [0,0,0], scale: [1,1,1] },
    ]);
    expect(store.getSnapshot().placed).toHaveLength(1);
    expect(store.getSnapshot().placed[0].id).toBe('2');
    expect(store.getSnapshot().selectedId).toBeNull();
  });
});
