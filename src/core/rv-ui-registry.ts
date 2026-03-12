/**
 * UIPluginRegistry — Collects UI slot entries from plugins
 * and provides lookup by slot name.
 */

import type { UISlot, UISlotEntry } from './rv-ui-plugin';

export class UIPluginRegistry {
  private entries: UISlotEntry[] = [];

  /** Register slot entries from a plugin (slots may be undefined). */
  register(plugin: { slots?: UISlotEntry[] }): void {
    if (!plugin.slots || plugin.slots.length === 0) return;
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
