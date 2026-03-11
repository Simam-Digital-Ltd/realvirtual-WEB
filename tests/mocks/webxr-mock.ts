import { vi } from 'vitest';

export function mockNavigatorXR(options: { vr?: boolean; ar?: boolean } = {}) {
  const xr = {
    isSessionSupported: vi.fn(async (mode: string) => {
      if (mode === 'immersive-vr') return options.vr ?? false;
      if (mode === 'immersive-ar') return options.ar ?? false;
      return false;
    }),
    requestSession: vi.fn(async () => ({
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      end: vi.fn(async () => {}),
      requestReferenceSpace: vi.fn(async () => ({})),
      renderState: { baseLayer: null },
    })),
  };
  Object.defineProperty(navigator, 'xr', { value: xr, configurable: true });
  return xr;
}

export function clearNavigatorXR() {
  Object.defineProperty(navigator, 'xr', { value: undefined, configurable: true });
}
