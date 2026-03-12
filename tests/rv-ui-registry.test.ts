/**
 * UIPluginRegistry Tests
 *
 * Tests slot component registration, ordering, and settings-tab retrieval.
 */
import { describe, it, expect } from 'vitest';
import { UIPluginRegistry } from '../src/core/rv-ui-registry';

// Dummy components (just need to be distinguishable)
const CompA = () => null;
const CompB = () => null;
const CompC = () => null;

describe('UIPluginRegistry', () => {
  it('registers and retrieves slot components', () => {
    const reg = new UIPluginRegistry();
    const plugin = {
      id: 'test-ui',
      slots: [
        { slot: 'kpi-bar', component: CompA as any, order: 10 },
        { slot: 'kpi-bar', component: CompB as any, order: 20 },
        { slot: 'messages', component: CompC as any, order: 10 },
      ],
    };
    reg.register(plugin);

    expect(reg.getSlotComponents('kpi-bar').length).toBe(2);
    expect(reg.getSlotComponents('messages').length).toBe(1);
    expect(reg.getSlotComponents('views').length).toBe(0);
  });

  it('sorts by order within slot', () => {
    const reg = new UIPluginRegistry();
    const plugin = {
      id: 'order-test',
      slots: [
        { slot: 'kpi-bar', component: CompB as any, order: 20 },
        { slot: 'kpi-bar', component: CompA as any, order: 10 },
      ],
    };
    reg.register(plugin);

    const comps = reg.getSlotComponents('kpi-bar');
    expect(comps[0].component).toBe(CompA);
    expect(comps[1].component).toBe(CompB);
  });

  it('settings-tabs are returned separately', () => {
    const reg = new UIPluginRegistry();
    const plugin = {
      id: 'settings-test',
      slots: [
        { slot: 'settings-tab', component: CompA as any, label: 'Dev Tools', order: 100 },
        { slot: 'settings-tab', component: CompB as any, label: 'Tests', order: 110 },
        { slot: 'kpi-bar', component: CompC as any, order: 10 },
      ],
    };
    reg.register(plugin);

    expect(reg.getSettingsTabs().length).toBe(2);
    expect(reg.getSettingsTabs()[0].label).toBe('Dev Tools');
  });

  it('multiple plugins can register to same slot', () => {
    const reg = new UIPluginRegistry();
    reg.register({
      id: 'plugin-a',
      slots: [{ slot: 'button-group', component: CompA as any, order: 10 }],
    });
    reg.register({
      id: 'plugin-b',
      slots: [{ slot: 'button-group', component: CompB as any, order: 20 }],
    });

    const comps = reg.getSlotComponents('button-group');
    expect(comps.length).toBe(2);
    expect(comps[0].component).toBe(CompA);
    expect(comps[1].component).toBe(CompB);
  });

  it('default order is 100 for entries without explicit order', () => {
    const reg = new UIPluginRegistry();
    reg.register({
      id: 'default-order',
      slots: [
        { slot: 'kpi-bar', component: CompB as any }, // order defaults to 100
        { slot: 'kpi-bar', component: CompA as any, order: 50 },
      ],
    });

    const comps = reg.getSlotComponents('kpi-bar');
    expect(comps[0].component).toBe(CompA); // order 50
    expect(comps[1].component).toBe(CompB); // order 100 (default)
  });
});
