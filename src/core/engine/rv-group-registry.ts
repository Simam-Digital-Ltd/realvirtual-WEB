/**
 * rv-group-registry.ts — Registry for Group components parsed from GLB extras.
 *
 * Groups are Unity components (realvirtual.Group) that tag scene nodes for
 * visibility control. Multiple nodes can belong to the same group, and a
 * single node can belong to multiple groups.
 *
 * Visibility is implemented via `node.visible = false` on group root nodes
 * only — Three.js automatically skips the entire subtree during rendering,
 * with zero per-frame cost for hidden groups.
 *
 * IMPORTANT: Do NOT use `node.traverse()` to set visibility — it would
 * clobber MU template visibility and LogicStep_Enable state on child nodes.
 */

import type { Object3D } from 'three';

/** Information about a single named group. */
export interface GroupInfo {
  /** Resolved full group name: prefixNodeName + GroupName */
  name: string;
  /** All Three.js nodes that belong to this group */
  nodes: Object3D[];
  /** Current visibility state */
  visible: boolean;
}

/**
 * Registry mapping group names to Object3D nodes with visibility state.
 *
 * Built during GLB scene load by parsing Group/Group_N components from
 * node.userData.realvirtual extras.
 */
export class GroupRegistry {
  private _groups = new Map<string, GroupInfo>();

  /**
   * Register a node under a group name.
   * If the group does not exist yet, it is created with visible=true.
   * If the group already exists, the node is added to its nodes list.
   */
  register(resolvedName: string, node: Object3D): void {
    let group = this._groups.get(resolvedName);
    if (!group) {
      group = { name: resolvedName, nodes: [], visible: true };
      this._groups.set(resolvedName, group);
    }
    group.nodes.push(node);
  }

  /** Get all groups as an array, sorted alphabetically by name. */
  getAll(): GroupInfo[] {
    return [...this._groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Get a single group by name. */
  get(name: string): GroupInfo | undefined {
    return this._groups.get(name);
  }

  /**
   * Set visibility for a single group.
   * Only sets `node.visible` on group root nodes — Three.js skips the
   * entire subtree automatically when parent is invisible.
   */
  setVisible(name: string, visible: boolean): void {
    const group = this._groups.get(name);
    if (!group) return;
    group.visible = visible;
    for (const node of group.nodes) {
      node.visible = visible;
    }
  }

  /**
   * Isolate: show only the target group, hide all others.
   */
  isolate(name: string): void {
    for (const [groupName] of this._groups) {
      const show = groupName === name;
      this.setVisible(groupName, show);
    }
  }

  /**
   * Show all: restore visibility for all groups.
   */
  showAll(): void {
    for (const group of this._groups.values()) {
      this.setVisible(group.name, true);
    }
  }

  /** Get all group names, sorted alphabetically. */
  getGroupNames(): string[] {
    return [...this._groups.keys()].sort();
  }

  /** Number of registered groups. */
  get groupCount(): number {
    return this._groups.size;
  }

  /** Clear all groups. */
  clear(): void {
    this._groups.clear();
  }
}
