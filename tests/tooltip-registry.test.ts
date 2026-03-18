/**
 * TooltipContentRegistry Tests
 *
 * Tests content provider registration, lookup by contentType, and priority ordering.
 */
import { describe, it, expect } from 'vitest';
import { TooltipContentRegistry } from '../src/core/hmi/tooltip/tooltip-registry';

// Dummy components (just need to be distinguishable)
const DummyA = () => null;
const DummyB = () => null;

describe('TooltipContentRegistry', () => {
  it('should register and lookup provider by contentType', () => {
    const registry = new TooltipContentRegistry();
    registry.register({ contentType: 'drive', component: DummyA as any });
    expect(registry.getProvider('drive')).toBe(DummyA);
  });

  it('should return null for unregistered contentType', () => {
    const registry = new TooltipContentRegistry();
    expect(registry.getProvider('sensor')).toBeNull();
  });

  it('should respect priority when multiple providers for same type', () => {
    const registry = new TooltipContentRegistry();
    registry.register({ contentType: 'drive', component: DummyA as any, priority: 100 });
    registry.register({ contentType: 'drive', component: DummyB as any, priority: 10 });
    // Lower priority number = higher priority => DummyB wins
    expect(registry.getProvider('drive')).toBe(DummyB);
  });

  it('should handle multiple content types independently', () => {
    const registry = new TooltipContentRegistry();
    registry.register({ contentType: 'drive', component: DummyA as any });
    registry.register({ contentType: 'sensor', component: DummyB as any });
    expect(registry.getProvider('drive')).toBe(DummyA);
    expect(registry.getProvider('sensor')).toBe(DummyB);
  });

  it('should use default priority 100 when not specified', () => {
    const registry = new TooltipContentRegistry();
    registry.register({ contentType: 'drive', component: DummyA as any }); // default 100
    registry.register({ contentType: 'drive', component: DummyB as any, priority: 50 });
    // DummyB has lower priority number => wins
    expect(registry.getProvider('drive')).toBe(DummyB);
  });
});
