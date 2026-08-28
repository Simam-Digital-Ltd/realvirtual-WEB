// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Plugin registration check.
 *
 * WHY THIS EXISTS
 * ---------------
 * This repository has shipped inert features four separate times, every one of
 * them with a clean `tsc --noEmit` and a passing production build:
 *
 *   1. The whole Simam plugin chain was dropped when an upstream rebase
 *      replaced `src/main.ts`.
 *   2. The live-KPI wiring went the same way via `demo-hmi-plugin.tsx`.
 *   3. `WakefieldSceneDressingPlugin` — 600 lines of set dressing — lost its
 *      registration when the model bundle was replaced, and stayed dead for
 *      several commits while the scene rendered as the stock demo.
 *   4. `DemoHMIPlugin` ended up registered twice, so unloading the model would
 *      have torn down the boot instance and killed the live KPIs.
 *
 * All four are one defect class: the plugin FILE survives and type-checks
 * perfectly, but its CALL SITE disappears. The type system proves a plugin is
 * well-formed; it cannot prove it is reachable. Nothing else in the toolchain
 * looks at reachability, so this script does.
 *
 * WHAT IT CHECKS
 *   - orphans: a plugin class nothing can ever construct
 *   - duplicates: a plugin built by two eager registration chains
 *
 * WHAT IT DOES NOT CHECK
 *   Reachable is not the same as ACTIVE. A plugin can still be gated off by
 *   mode, disabled by config, or live in a model bundle that never loads. This
 *   narrows the gap; it does not close it. Runtime verification remains the
 *   only proof that a feature actually works.
 *
 * Usage:  node scripts/check-plugin-registration.mjs [--json]
 * Exit:   0 clean · 1 findings · 2 script error
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const JSON_OUT = process.argv.includes('--json');

/** Files whose `new` calls count as EAGER registration chains. */
const REGISTRATION_GLOBS = [
  'src/main.ts',
  'src/plugins/models', // per-model plugin bundles
];

/**
 * Plugins deliberately never constructed by this app — base classes, or
 * exports kept purely for downstream consumers.
 * Add here WITH A REASON rather than weakening the check.
 */
const ALLOWED_ORPHANS = new Map([
  // Upstream-owned and unregistered upstream too — verified against
  // upstream/main and against our pre-rebase main.ts, where they never
  // appeared. Not our regressions; listed so the check can go green and
  // therefore stay meaningful. Re-verify if we ever adopt one.
  ['DocsBrowserPlugin', 'upstream plugin, upstream does not register it'],
  ['DriveGizmoPlugin', 'upstream plugin, consumed via asset-editor sources'],
  ['WebSensorPlugin', 'upstream plugin, upstream does not register it'],
]);

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(full);
  }
  return out;
}

const files = walk(SRC);
const rel = (f) => relative(ROOT, f).replace(/\\/g, '/');

// ---- 1. Declared plugin classes ---------------------------------------------
// Matched on `implements ... RVViewerPlugin` rather than on the name, so a
// helper merely called `SomethingPlugin` is not mistaken for one.
const declared = new Map(); // name -> file
const DECL = /export\s+class\s+([A-Za-z0-9_]+)\s+implements\s+[^{]*\bRVViewerPlugin\b/g;
for (const file of files) {
  for (const m of readFileSync(file, 'utf8').matchAll(DECL)) {
    declared.set(m[1], rel(file));
  }
}

// ---- 2. Reachability signals -------------------------------------------------
// There are THREE legitimate routes to the viewer. An earlier version of this
// script knew only the first and reported ten false positives — and a checker
// that cries wolf gets ignored, which is worse than not having one. So all
// three count:
//
//   a) `new FooPlugin(` inside a registration chain   — the common case
//   b) `new FooPlugin(` anywhere else                 — on-demand construction,
//      e.g. DriveChartOverlay builds DriveRecorderPlugin when a chart opens
//   c) `registerLazy(..., () => import(...).then(m => m.FooPlugin))`
//      — deferred registration, where the name never follows `new` at all
const built = new Map();      // name -> [files containing `new Name(`]
const lazyRegistered = new Set();

for (const file of files) {
  const path = rel(file);
  const text = readFileSync(file, 'utf8');
  for (const name of declared.keys()) {
    if (new RegExp(`new\\s+${name}\\s*\\(`).test(text)) {
      if (!built.has(name)) built.set(name, []);
      built.get(name).push(path);
    }
    if (new RegExp(`registerLazy[\\s\\S]{0,300}?\\b${name}\\b`).test(text)) {
      lazyRegistered.add(name);
    }
  }
}

const isChain = (p) => REGISTRATION_GLOBS.some((g) => p === g || p.startsWith(g + '/'));

// ---- 3. Findings -------------------------------------------------------------
const orphans = [];
const duplicates = [];

for (const [name, file] of declared) {
  const sites = built.get(name) ?? [];
  const chainSites = sites.filter(isChain);

  if (sites.length === 0 && !lazyRegistered.has(name)) {
    if (!ALLOWED_ORPHANS.has(name)) orphans.push({ plugin: name, file });
    continue;
  }
  // Duplicates only matter across EAGER chains — on-demand construction guards
  // itself with a getPlugin() lookup first.
  if (chainSites.length > 1) duplicates.push({ plugin: name, file, sites: chainSites });
}

if (JSON_OUT) {
  console.log(JSON.stringify({ declared: declared.size, orphans, duplicates }, null, 2));
} else {
  console.log(`Plugin registration check — ${declared.size} plugin classes declared`);
  console.log('  routes counted: eager chain · on-demand new · registerLazy\n');
  if (orphans.length) {
    console.log(`✗ ${orphans.length} UNREACHABLE (compiles, but nothing can construct it):`);
    for (const o of orphans) console.log(`    ${o.plugin.padEnd(32)} ${o.file}`);
    console.log('');
  }
  if (duplicates.length) {
    console.log(`✗ ${duplicates.length} BUILT BY TWO EAGER CHAINS (the second use() is dropped with a`);
    console.log('   warning, and unloading one owner can tear down the other\'s instance):');
    for (const d of duplicates) console.log(`    ${d.plugin.padEnd(32)} ${d.sites.join(', ')}`);
    console.log('');
  }
  if (!orphans.length && !duplicates.length) {
    console.log('✓ every plugin is reachable, and none is double-registered');
    console.log('  note: reachable ≠ active — mode gating and config can still disable it');
  }
}

process.exit(orphans.length || duplicates.length ? 1 : 0);
