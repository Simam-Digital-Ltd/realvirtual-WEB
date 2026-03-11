/**
 * SignalStore Unit Tests
 *
 * Tests the central signal store for PLC signal communication.
 */
import { describe, it, expect, vi } from 'vitest';
import { SignalStore } from '../src/rv-signal-store';

describe('SignalStore', () => {
  it('should register and get signals', () => {
    const store = new SignalStore();
    store.register('sig/bool1', false);
    store.register('sig/float1', 42.5);

    expect(store.get('sig/bool1')).toBe(false);
    expect(store.get('sig/float1')).toBe(42.5);
    expect(store.size).toBe(2);
  });

  it('should return undefined for unknown signals', () => {
    const store = new SignalStore();
    expect(store.get('nonexistent')).toBeUndefined();
  });

  it('should set and get bool signals', () => {
    const store = new SignalStore();
    store.register('sig/bool1', false);

    expect(store.getBool('sig/bool1')).toBe(false);
    store.set('sig/bool1', true);
    expect(store.getBool('sig/bool1')).toBe(true);
  });

  it('should getBool return false for missing signal', () => {
    const store = new SignalStore();
    expect(store.getBool('missing')).toBe(false);
  });

  it('should set and get float signals', () => {
    const store = new SignalStore();
    store.register('sig/float1', 0);

    store.set('sig/float1', 3.14);
    expect(store.getFloat('sig/float1')).toBeCloseTo(3.14);
  });

  it('should getFloat return 0 for missing signal', () => {
    const store = new SignalStore();
    expect(store.getFloat('missing')).toBe(0);
  });

  it('should set and get int signals', () => {
    const store = new SignalStore();
    store.register('sig/int1', 0);

    store.set('sig/int1', 99);
    expect(store.getInt('sig/int1')).toBe(99);
  });

  it('should getInt return 0 for missing signal', () => {
    const store = new SignalStore();
    expect(store.getInt('missing')).toBe(0);
  });

  it('should notify subscribers on value change', () => {
    const store = new SignalStore();
    store.register('sig/bool1', false);

    const cb = vi.fn();
    store.subscribe('sig/bool1', cb);

    store.set('sig/bool1', true);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(true);
  });

  it('should NOT notify when value unchanged', () => {
    const store = new SignalStore();
    store.register('sig/bool1', false);

    const cb = vi.fn();
    store.subscribe('sig/bool1', cb);

    store.set('sig/bool1', false); // same value
    expect(cb).not.toHaveBeenCalled();
  });

  it('should unsubscribe correctly', () => {
    const store = new SignalStore();
    store.register('sig/bool1', false);

    const cb = vi.fn();
    const unsub = store.subscribe('sig/bool1', cb);

    store.set('sig/bool1', true);
    expect(cb).toHaveBeenCalledTimes(1);

    unsub();
    store.set('sig/bool1', false);
    expect(cb).toHaveBeenCalledTimes(1); // not called again
  });

  it('should support multiple subscribers', () => {
    const store = new SignalStore();
    store.register('sig/x', 0);

    const cb1 = vi.fn();
    const cb2 = vi.fn();
    store.subscribe('sig/x', cb1);
    store.subscribe('sig/x', cb2);

    store.set('sig/x', 10);
    expect(cb1).toHaveBeenCalledWith(10);
    expect(cb2).toHaveBeenCalledWith(10);
  });

  it('should set signals even without prior register', () => {
    const store = new SignalStore();
    store.set('new/sig', true);
    expect(store.getBool('new/sig')).toBe(true);
  });

  it('should setMany update multiple signals', () => {
    const store = new SignalStore();
    store.setMany({ 'a': true, 'b': 42, 'c': false });

    expect(store.getBool('a')).toBe(true);
    expect(store.getFloat('b')).toBe(42);
    expect(store.getBool('c')).toBe(false);
  });

  it('should clear all signals', () => {
    const store = new SignalStore();
    store.register('a', true);
    store.register('b', 42);

    store.clear();
    expect(store.size).toBe(0);
    expect(store.get('a')).toBeUndefined();
  });
});
