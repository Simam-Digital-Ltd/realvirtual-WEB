/**
 * UIPluginRegistry — Collects UI slot entries from RVUIPlugins
 * and provides lookup by slot name.
 */

import type { RVUIPlugin, UISlot, UISlotEntry } from './rv-ui-plugin';

export class UIPluginRegistry {
  private entries: UISlotEntry[] = [];

  /** Register all slots from a UI plugin. */
  register(plugin: RVUIPlugin): void {
    this.entries.push(...plugin.slots);
    this.entries.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  }

  /** All components registered for a given slot. */
  getSlotComponents(slot: UISlot): UISlotEntry[] {
    return this.entries.filter((e) => e.slot === slot);
  }

  /** All settings-tab entries. */
  getSettingsTabs(): UISlotEntry[] {
    return this.entries.filter((e) => e.slot === 'settings-tab');
  }
}
