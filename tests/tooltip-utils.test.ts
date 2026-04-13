// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Tooltip Utils Tests
 *
 * Tests viewport clamping logic. projectToScreen requires a real Three.js
 * camera and renderer, so it is tested indirectly via integration.
 */
import { describe, it, expect } from 'vitest';
import { clampToViewport } from '../src/core/hmi/tooltip/tooltip-utils';

describe('clampToViewport', () => {
  it('should clamp tooltip that overflows right edge', () => {
    // Tooltip at x=1900, width=200, viewport=1920, margin=10
    const result = clampToViewport(1900, 100, 200, 150, 10, 1920, 1080);
    expect(result.x).toBeLessThanOrEqual(1920 - 200 - 10);
    expect(result.y).toBe(100);
  });

  it('should not modify position if within bounds', () => {
    const result = clampToViewport(400, 300, 200, 150, 10, 1920, 1080);
    expect(result.x).toBe(400);
    expect(result.y).toBe(300);
  });

  it('should clamp top edge', () => {
    const result = clampToViewport(400, 5, 200, 150, 10, 1920, 1080);
    expect(result.y).toBe(10);
  });

  it('should clamp bottom edge', () => {
    // y=1000, tooltipHeight=150, viewport=1080, margin=10 => max y = 1080-150-10 = 920
    const result = clampToViewport(400, 1000, 200, 150, 10, 1920, 1080);
    expect(result.y).toBe(920);
  });

  it('should clamp left edge', () => {
    const result = clampToViewport(2, 300, 200, 150, 10, 1920, 1080);
    expect(result.x).toBe(10);
  });

  it('should clamp both x and y simultaneously', () => {
    const result = clampToViewport(1900, 1000, 200, 150, 10, 1920, 1080);
    expect(result.x).toBeLessThanOrEqual(1920 - 200 - 10);
    expect(result.y).toBeLessThanOrEqual(1080 - 150 - 10);
  });

  it('should handle zero margin', () => {
    const result = clampToViewport(1800, 500, 200, 150, 0, 1920, 1080);
    expect(result.x).toBeLessThanOrEqual(1920 - 200);
  });

  it('should handle edge case where tooltip is larger than viewport', () => {
    // When tooltip is wider than viewport, clamp to margin
    const result = clampToViewport(500, 500, 2000, 1200, 10, 1920, 1080);
    // Right clamp: 1920 - 2000 - 10 = -90, then left clamp: max(-90, 10) = 10
    expect(result.x).toBe(10);
    // Bottom clamp: 1080 - 1200 - 10 = -130, then top clamp: max(-130, 10) = 10
    expect(result.y).toBe(10);
  });
});
