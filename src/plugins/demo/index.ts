/**
 * Demo plugins barrel — registers all demo/example HMI plugins.
 *
 * To add or remove a demo plugin, edit this file only — no changes needed in main.ts.
 * Each plugin self-registers its UI slots (KPI cards, buttons, messages, overlays).
 */

import type { RVViewer } from '../../core/rv-viewer';
import { KpiDemoPlugin } from './kpi-demo-plugin';
import { DemoHMIPlugin } from './demo-hmi-plugin';
import { TestAxesPlugin } from './test-axes-plugin';
import { MachineControlPlugin } from './machine-control-plugin';
import { MaintenancePlugin } from './maintenance-plugin';

export { KpiDemoPlugin } from './kpi-demo-plugin';
export { DemoHMIPlugin } from './demo-hmi-plugin';
export { TestAxesPlugin } from './test-axes-plugin';
export { PerfTestPlugin } from './perf-test-plugin';
export { MachineControlPlugin } from './machine-control-plugin';
export { MaintenancePlugin } from './maintenance-plugin';

/**
 * Register all demo/example plugins with the viewer.
 * PerfTestPlugin is lazy-loaded and only activated when `?perf` URL param is present.
 */
export function registerDemoPlugins(viewer: RVViewer): void {
  viewer
    .use(new KpiDemoPlugin())
    .use(new DemoHMIPlugin())
    .use(new TestAxesPlugin())
    .use(new MachineControlPlugin())
    .use(new MaintenancePlugin());
}
