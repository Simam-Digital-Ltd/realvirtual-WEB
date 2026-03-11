declare module 'three/webgpu' {
  import { WebGLRenderer, ShadowMapType } from 'three';
  export class WebGPURenderer extends WebGLRenderer {
    constructor(parameters?: { antialias?: boolean; alpha?: boolean; forceWebGL?: boolean });
    init(): Promise<void>;
    shadowMap: {
      enabled: boolean;
      type: ShadowMapType;
    };
  }
}
