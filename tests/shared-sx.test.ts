import { describe, it, expect } from 'vitest';
import { compactToggleGroupSx } from '../src/core/hmi/shared-sx';

describe('compactToggleGroupSx', () => {
  it('returns an array', () => {
    const result = compactToggleGroupSx('#66bb6a', '102,187,106');
    expect(Array.isArray(result)).toBe(true);
  });

  it('applies accent color to selected state', () => {
    const result = compactToggleGroupSx('#66bb6a', '102,187,106') as object[];
    const base = result[0] as Record<string, unknown>;
    const root = base['& .MuiToggleButton-root'] as Record<string, unknown>;
    const selected = root['&.Mui-selected'] as Record<string, unknown>;
    expect(selected.color).toBe('#66bb6a');
    expect(selected.bgcolor).toContain('102,187,106');
  });

  it('merges extra sx', () => {
    const result = compactToggleGroupSx('#4fc3f7', '79,195,247', { ml: 'auto' }) as unknown[];
    expect(result).toHaveLength(2);
  });

  it('merges array extra sx', () => {
    const result = compactToggleGroupSx('#4fc3f7', '79,195,247', [{ ml: 'auto' }, { mr: 1 }]) as unknown[];
    expect(result).toHaveLength(3);
  });

  it('handles no extra sx', () => {
    const result = compactToggleGroupSx('#4fc3f7', '79,195,247') as unknown[];
    expect(result).toHaveLength(1);
  });

  it('sets correct height', () => {
    const result = compactToggleGroupSx('#4fc3f7', '79,195,247') as object[];
    const base = result[0] as Record<string, unknown>;
    expect(base.height).toBe(22);
  });
});
