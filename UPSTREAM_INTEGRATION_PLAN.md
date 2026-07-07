# Upstream realvirtual WEB Integration Plan

Last checked: 2026-07-07
Upstream: game4automation/realvirtual-WEB `upstream/main` at `c016b5a`
Local branch: `main`

## Summary

Do not wholesale-merge `upstream/main` into this fork. Upstream now includes large architectural changes and also deletes/replaces several files our Simam demo depends on, including Firebase/DataConnect/geospatial pieces. A normal merge would be high-risk and would likely break the Wakefield cockpit, map/demo plugins, and Firebase hosting setup.

## Upstream Features Worth Porting

1. Measurement tool
   - Files: `src/plugins/measurement-plugin.tsx`, `src/plugins/rv-measurement-renderer.ts`, `src/core/hmi/MeasurementPanel.tsx`
   - Also needs: `src/core/hmi/create-store.ts`, `src/core/engine/rv-pointer-utils.ts`, `MEASUREMENT_LAYER` in `rv-constants`, plugin types updates.
   - Risk: Low/medium. Best first real feature to port.

2. Layout Planner beta
   - Files: `src/plugins/layout-planner/**`, `src/plugins/snap-point/**`, `src/core/library-component-loader.ts`, `src/core/hmi/scene/**`, `src/core/engine/rv-snap-point-registry.ts`, `src/core/engine/rv-local-filesystem.ts`, library GLBs under `public/models/library/**`, `public/scenes/**`.
   - Risk: High. Depends on upstream mode manager, scene store, snap-point engine, behavior runtime, mobile layout, and newer HMI structure.
   - Strategy: Port as a separate optional route/mode after Measurement is stable.

3. Product configurator / model options
   - Upstream demo uses `ModelOptionPlugin` and AAS remapping in `src/plugins/models/DemoRealvirtualWeb/index.ts`.
   - Risk: Medium. Useful for a sales/demo configurator, but should be adapted to Simam/Wakefield as a bespoke “variant selector” rather than copied literally.

4. Document linking / AASX nameplates
   - Files/docs: `doc-document-linking.md`, `public/aasx/**`, `src/plugins/aas-link-plugin.ts` and related tooltip pieces.
   - Risk: Medium. Strong client credibility feature, but needs model metadata IDs to be useful.

5. AI/MCP bridge updates
   - Files: `mcp-bridge/**`, `src/plugins/mcp-bridge-plugin.ts`, docs.
   - Risk: Medium. Keep separate from client demo UI; useful for internal support and AI-assisted debugging.

## Safe Batch Order

### Batch A: Baseline and Guardrails
- Create branch `codex/upstream-feature-port`.
- Commit or stash current Simam demo work first.
- Add upstream docs locally for reference only: layout planner, document linking, AI integration.
- Run `npm run build -- --emptyOutDir=false` and focused existing tests.

### Batch B: Measurement Tool
- Port measurement plugin and smallest dependencies.
- Register globally or only for `DemoRealvirtualWeb`.
- Add one focused test for `formatDistance`/measurement store.
- Verify build.

### Batch C: Simam Product Configurator Lite
- Build our own small Wakefield variant selector using the plugin pattern.
- Example variants: `Food packing`, `Cold-chain`, `Palletising`, `Maintenance demo`.
- Reuse upstream idea, not a risky full merge.

### Batch D: Layout Planner Spike
- Copy upstream layout planner and snap-point folders into a branch.
- Compile to reveal missing core dependencies.
- Port missing dependencies one-by-one only when required.
- Keep planner disabled behind `?mode=planner` until it builds and does not affect HMI mode.

### Batch E: Client Demo Hardening
- Add a presenter reset mode.
- Add deployment checklist.
- Keep realvirtual WEB attribution and upstream AGPL headers intact.

## Files That Must Not Be Blindly Overwritten

- `src/plugins/demo/**`
- `src/plugins/osm-map-plugin.tsx`
- `src/plugins/site-intelligence-plugin.tsx`
- `src/plugins/models/DemoRealvirtualWeb/index.ts`
- `src/core/rv-firebase.ts`
- `src/core/dataconnect-service.ts`
- `src/core/geospatial-service.ts`
- `firebase.json`, `.firebaserc`, `dataconnect/**`
- `index.html`

## Current Recommendation

Start with Batch B: Measurement Tool. It is client-visible, useful, and much less risky than importing the full layout planner architecture in one go.
