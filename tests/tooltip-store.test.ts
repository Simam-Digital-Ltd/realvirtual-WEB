/**
 * TooltipStore Tests
 *
 * Tests store lifecycle: show/hide, priority resolution, subscribe/unsubscribe,
 * stable snapshot references, shallow-compare guard, and hideAll.
 */
import { describe, it, expect, vi } from 'vitest';
import { TooltipStore } from '../src/core/hmi/tooltip/tooltip-store';

describe('TooltipStore', () => {
  it('should start with no active tooltip', () => {
    const store = new TooltipStore();
    expect(store.getSnapshot().active).toBeNull();
  });

  it('should show and hide a tooltip', () => {
    const store = new TooltipStore();
    store.show({ id: 'drive', data: { type: 'drive', driveName: 'Axis1' }, mode: 'cursor', cursorPos: { x: 100, y: 200 } });
    expect(store.getSnapshot().active?.id).toBe('drive');
    store.hide('drive');
    expect(store.getSnapshot().active).toBeNull();
  });

  it('should notify listeners on show/hide', () => {
    const store = new TooltipStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.show({ id: 'test', data: { type: 'sensor' }, mode: 'fixed', fixedPos: { x: 0, y: 0 } });
    expect(listener).toHaveBeenCalledTimes(1);
    store.hide('test');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('should return stable snapshot when state unchanged', () => {
    const store = new TooltipStore();
    const snap1 = store.getSnapshot();
    const snap2 = store.getSnapshot();
    expect(snap1).toBe(snap2); // same reference
  });

  it('should NOT notify when show() called with identical data (shallow-compare)', () => {
    const store = new TooltipStore();
    const listener = vi.fn();
    store.show({ id: 'drive', data: { type: 'drive', driveName: 'Axis1' }, mode: 'cursor', cursorPos: { x: 0, y: 0 } });
    store.subscribe(listener);
    // Same data, different cursorPos -> should update position but NOT trigger re-render
    store.show({ id: 'drive', data: { type: 'drive', driveName: 'Axis1' }, mode: 'cursor', cursorPos: { x: 50, y: 50 } });
    // Position update via ref, not snapshot -> no notify
    expect(listener).toHaveBeenCalledTimes(0);
  });

  it('should resolve priority: higher wins', () => {
    const store = new TooltipStore();
    store.show({ id: 'low', data: { type: 'drive', driveName: 'Axis1' }, mode: 'cursor', priority: 5 });
    store.show({ id: 'high', data: { type: 'sensor' }, mode: 'cursor', priority: 20 });
    expect(store.getSnapshot().active?.id).toBe('high');
    store.hide('high');
    expect(store.getSnapshot().active?.id).toBe('low');
  });

  it('should update existing tooltip data when changed', () => {
    const store = new TooltipStore();
    store.show({ id: 'drive', data: { type: 'drive', driveName: 'Axis1' }, mode: 'cursor', cursorPos: { x: 0, y: 0 } });
    store.show({ id: 'drive', data: { type: 'drive', driveName: 'Axis2' }, mode: 'cursor', cursorPos: { x: 50, y: 50 } });
    expect(store.getSnapshot().active?.data.driveName).toBe('Axis2');
  });

  it('should unsubscribe correctly', () => {
    const store = new TooltipStore();
    const listener = vi.fn();
    const unsub = store.subscribe(listener);
    unsub();
    store.show({ id: 'x', data: { type: 'custom' }, mode: 'fixed' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('should hideAll and clear all tooltips', () => {
    const store = new TooltipStore();
    store.show({ id: 'a', data: { type: 'drive' }, mode: 'cursor' });
    store.show({ id: 'b', data: { type: 'sensor' }, mode: 'cursor', priority: 20 });
    store.hideAll();
    expect(store.getSnapshot().active).toBeNull();
  });

  it('should not notify on hide of non-existent tooltip', () => {
    const store = new TooltipStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.hide('nonexistent');
    expect(listener).not.toHaveBeenCalled();
  });

  it('should not notify on hideAll when already empty', () => {
    const store = new TooltipStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.hideAll();
    expect(listener).not.toHaveBeenCalled();
  });

  it('should store cursor position ref-based via getCursorPos', () => {
    const store = new TooltipStore();
    store.show({ id: 'drive', data: { type: 'drive' }, mode: 'cursor', cursorPos: { x: 100, y: 200 } });
    expect(store.getCursorPos('drive')).toEqual({ x: 100, y: 200 });

    // Update cursor position without changing data (no notify)
    const listener = vi.fn();
    store.subscribe(listener);
    store.show({ id: 'drive', data: { type: 'drive' }, mode: 'cursor', cursorPos: { x: 300, y: 400 } });
    expect(store.getCursorPos('drive')).toEqual({ x: 300, y: 400 });
    expect(listener).not.toHaveBeenCalled();
  });

  it('should create new snapshot reference on state change', () => {
    const store = new TooltipStore();
    const snap1 = store.getSnapshot();
    store.show({ id: 'test', data: { type: 'test' }, mode: 'fixed' });
    const snap2 = store.getSnapshot();
    expect(snap1).not.toBe(snap2);
  });

  it('should fall back to lower priority when higher is hidden', () => {
    const store = new TooltipStore();
    store.show({ id: 'p5', data: { type: 'a' }, mode: 'cursor', priority: 5 });
    store.show({ id: 'p10', data: { type: 'b' }, mode: 'cursor', priority: 10 });
    store.show({ id: 'p20', data: { type: 'c' }, mode: 'cursor', priority: 20 });
    expect(store.getSnapshot().active?.id).toBe('p20');

    store.hide('p20');
    expect(store.getSnapshot().active?.id).toBe('p10');

    store.hide('p10');
    expect(store.getSnapshot().active?.id).toBe('p5');
  });
});
