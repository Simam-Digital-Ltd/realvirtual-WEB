// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

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
  private _modelRoot: Object3D | null = null;
  /** Nodes hidden by isolate that don't belong to any group */
  private _hiddenUngrouped: Object3D[] = [];
  /** Group names that should remain hidden after showAll(). */
  private _defaultHidden: string[] = [];
  /** Group names that are structural kinematic groups (not user-facing). */
  private _kinematicGroups = new Set<string>();

  /** Set the model root so isolate can hide ungrouped nodes. */
  setModelRoot(root: Object3D | null): void {
    this._modelRoot = root;
  }

  /** Set group names that should remain hidden after showAll(). */
  setDefaultHiddenGroups(names: string[]): void {
    this._defaultHidden = names;
  }

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
   * Isolate: show only the target group, hide all others AND ungrouped nodes.
   */
  isolate(name: string): void {
    // Collect all nodes belonging to the TARGET group
    const targetGroup = this._groups.get(name);
    if (!targetGroup) return;
    const targetNodes = new Set<Object3D>(targetGroup.nodes);

    // Build set of all ancestors of target group nodes up to model root
    const ancestorsOfTarget = new Set<Object3D>();
    for (const node of targetNodes) {
      let cur = node.parent;
      while (cur && cur !== this._modelRoot?.parent) {
        ancestorsOfTarget.add(cur);
        cur = cur.parent;
      }
    }

    // Hide/show groups
    for (const [groupName] of this._groups) {
      this.setVisible(groupName, groupName === name);
    }

    // Hide ungrouped top-level children of the model root that are NOT
    // ancestors of the target group's nodes
    this._restoreUngrouped();
    if (this._modelRoot) {
      for (const child of this._modelRoot.children) {
        if (!targetNodes.has(child) && !ancestorsOfTarget.has(child) && child.visible) {
          child.visible = false;
          this._hiddenUngrouped.push(child);
        }
      }
    }
  }

  /**
   * Show all: restore visibility for all groups and ungrouped nodes.
   * Re-applies defaultHiddenGroups after restoring visibility.
   */
  showAll(): void {
    for (const group of this._groups.values()) {
      const shouldHide = this._defaultHidden.includes(group.name);
      this.setVisible(group.name, !shouldHide);
    }
    this._restoreUngrouped();
  }

  /** Restore previously hidden ungrouped nodes. */
  private _restoreUngrouped(): void {
    for (const node of this._hiddenUngrouped) {
      node.visible = true;
    }
    this._hiddenUngrouped = [];
  }

  /** Get all group names, sorted alphabetically. */
  getGroupNames(): string[] {
    return [...this._groups.keys()].sort();
  }

  /** Number of registered groups. */
  get groupCount(): number {
    return this._groups.size;
  }

  /** Mark a group as kinematic (structural, not user-facing visibility). */
  markAsKinematic(name: string): void {
    if (this._groups.has(name)) {
      this._kinematicGroups.add(name);
    }
  }

  /** Check if a group is marked as kinematic. */
  isKinematic(name: string): boolean {
    return this._kinematicGroups.has(name);
  }

  /** Get all group names marked as kinematic. */
  getKinematicGroupNames(): string[] {
    return [...this._kinematicGroups];
  }

  /** Clear all groups. */
  clear(): void {
    this._groups.clear();
    this._kinematicGroups.clear();
  }
}
