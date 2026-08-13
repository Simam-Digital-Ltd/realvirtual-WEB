# Building a Browser-Native Industrial Digital Twin

**An engineering case study — Simam Digital**
Platform: `realvirtual WEB 6.3.16` · Live: [virtualfactory.simamdigital.com](https://virtualfactory.simamdigital.com)

---

## Abstract

Industrial digital twins have a credibility problem. Most of what is shown to buyers is a
rendered animation with a dashboard bolted to the side — the numbers are hardcoded, the
"live connection" is a mock, and the 3D scene is a video in disguise. Evaluators know this,
so they discount everything they are shown, including the parts that are real.

This case study documents the engineering behind a browser-native digital twin built to
fail that discount test: a deterministic 60 Hz simulation engine running in the browser,
where the KPIs on screen are computed from the physics that produced them, the industrial
protocol adapters are real, and the logistics map is drawn on genuine road geometry. It
covers the architecture, the four engineering problems that proved hardest, the fork-
management strategy that keeps a customised product mergeable with its upstream, and — as
importantly — an explicit account of what remains unproven.

**Scale.** 922 TypeScript/TSX source files, ~248,000 lines, 846 test files, ~8,000 test
assertions, running in-browser on Three.js with a React 19 HMI.

---

## 1. The problem

A factory operator considering a digital twin is trying to answer one question: *will this
tell me something true about my plant that I do not already know?*

The prevailing demo format cannot answer it. Three failure modes recur:

| Failure mode | What the evaluator sees | Why it kills the sale |
|---|---|---|
| **Cosmetic telemetry** | `OEE: 87%` — a string in the source | No basis to believe any other number |
| **Hidden capability** | Real protocol adapters exist but nothing surfaces them | Indistinguishable from a mock |
| **Inert geography** | A satellite image with straight lines between pins | Reads as a slide, not a system |

The third is the most damaging because it is the most seductive. A beautiful map that does
nothing teaches the viewer that the beauty is the product.

The engineering goal follows directly: **every claim the interface makes should be
traceable to a mechanism, and where it cannot be, it should say so.**

---

## 2. System architecture

The platform is a layered runtime. Nothing above a layer may reach into it laterally.

```
┌─────────────────────────────────────────────────────────┐
│  HMI            React 19 · MUI 7 · UI slot registry     │
├─────────────────────────────────────────────────────────┤
│  Plugins        64 modules · lifecycle + slot contract   │
├─────────────────────────────────────────────────────────┤
│  Engine         180 modules · drives, transport,         │
│                 sensors, sources/sinks, LogicSteps       │
├─────────────────────────────────────────────────────────┤
│  Sim loop       fixed 60 Hz accumulator (dt = 1/60 s)    │
├─────────────────────────────────────────────────────────┤
│  Scene          Three.js · GLB + `rv_extras` metadata    │
└─────────────────────────────────────────────────────────┘
                            ▲
        ┌───────────────────┴───────────────────┐
        │  Industrial interfaces (11 modules)   │
        │  WebSocket · MQTT · ctrlX · TwinCAT   │
        └───────────────────────────────────────┘
```

Three architectural decisions carry most of the weight.

### 2.1 Fixed-timestep determinism

The simulation advances on a fixed `dt = 1/60 s` accumulator rather than on animation
frames. This is inherited from the Unity `FixedUpdate` model and it is not a stylistic
choice — it is what makes results reproducible. Frame-rate-coupled simulation gives a
different answer on a laptop than on a workstation, which means it cannot be used for
throughput analysis. It also means every derived metric measures *simulated* time, so the
numbers freeze correctly when the operator pauses rather than drifting with wall-clock.

### 2.2 GLB as the single source of truth

All component configuration — drive parameters, sensor volumes, signal bindings, transport
surfaces — lives in `rv_extras` inside the GLB. There is no companion signal-map file.
This eliminates an entire class of production failure where the model and its config drift
apart, and it means a model is a self-contained, portable artefact.

### 2.3 The plugin boundary

Capability is added through a plugin contract with lifecycle hooks (`onModelLoaded`,
`onFixedUpdatePre/Post`, `onRender`) and declarative UI slots. Plugins are registered with
a *provenance tag*:

```ts
viewer.use(new ProductionMetricsPlugin(), 'project')
```

The `PluginOrigin` union — `core | commercial | internal | project | unknown` — is the
mechanism that makes Section 5 possible.

---

## 3. Engineering challenges

### 3.1 Making a KPI real, end-to-end

**Problem.** Replace a hardcoded `87%` with a number computed from the running simulation.

The obvious implementation was to read `transportManager.totalConsumed`. Investigation
showed this would have silently produced a permanently-zero counter: when the Rapier physics
plugin is active, the viewer **skips `transportManager.update()`** entirely and drives
consumption through the physics event path instead. The naive counter would have compiled,
run, and reported nothing — a bug that only manifests in the exact configuration used for
the flagship demo.

**Solution.** Instrument at the component level by wrapping the sink callback, preserving
any existing handler and registering a teardown:

```ts
private _attachSinks(sinks: readonly RVSink[]): void {
  this._sinkCount = sinks.length;
  for (const sink of sinks) {
    const previous = sink.onConsumed;
    sink.onConsumed = (mu, s) => {
      previous?.(mu, s);          // chain, never replace
      this._casesTotal++;
      this._events.push(this._elapsed);
    };
    this._restore.push(() => { sink.onConsumed = previous; });
  }
}
```

This path is common to both the transport and physics code paths, so the metric is correct
under either configuration.

**Design of the metric itself.** Raw event counts make poor KPIs — they are either too
noisy or too laggy. The engine accumulates against simulated time with:

- `RATE_WINDOW_SEC = 120` — rolling window for rate extrapolation
- `PUBLISH_INTERVAL_SEC = 0.25` — decouples React render rate from sim rate
- `TREND_INTERVAL_SEC = 5`, `TREND_POINTS = 20` — a 100-second sparkline history

Availability is derived as uptime over elapsed, where "up" means at least one drive is
running. Distribution to React uses `useSyncExternalStore` with stable snapshot identity,
so a 60 Hz simulation drives a 4 Hz UI without tearing or wasted renders.

**Result.** Both headline KPIs are now live, and — critically — the interface *distinguishes*
live from demo data. When drives are present and the run has exceeded two seconds, the card
reads `LIVE · 4/21 drives running`. When they are not, it falls back to the demo profile
and does not claim to be live. Honesty is implemented, not asserted.

### 3.2 Fork divergence with no common ancestor

**Problem.** The customised product had accumulated twelve commits of proprietary work
while upstream shipped a major release including the drag-and-drop layout planner we needed.

Investigation revealed the two repositories had an **empty merge-base** — no shared
ancestry whatsoever. Standard `git merge` and `git rebase` were both unavailable. The
choice was between cherry-picking upstream features indefinitely (accruing permanent
divergence) or rebaselining wholesale.

**Solution.** Wholesale rebaseline onto the upstream tree, then re-apply the proprietary
layer as a distinct, provenance-tagged registration block.

```
1,950 files changed · +381,275 / −11,605
1,723 added · 221 modified · 6 deleted
```

**Outcome.** `npx tsc --noEmit` → 0 errors. Production build succeeds. The proprietary
layer survives intact and the platform gains the layout planner, redesigned HMI, behaviours
framework, Monaco scripting, MQTT, and WebGPU support.

### 3.3 The silent regression class

The most instructive finding of the migration. Two defects passed a clean type-check and a
successful build while being completely broken at runtime:

1. **All proprietary plugin registrations were dropped.** The entry point is a shared file,
   so the upstream version replaced ours. Every plugin still existed and still compiled —
   but nothing instantiated them. The entire proprietary feature set was inert.

2. **The live KPI wiring was lost the same way**, silently reverting the cards to generic
   demo values and disconnecting the metrics engine built in §3.1.

Both were caught by manual inspection, not by tooling. **The lesson generalises: for
plugin-architecture systems, compilation success is not evidence of registration.** The
type system verifies that a plugin is *well-formed*; it cannot verify that it is *reachable*.
This is a known gap in the current test strategy and is the highest-priority item in §7.

A third, related finding: an upstream UI component seeds its display value once via
`useState` and never follows prop changes, so any live value passed to it freezes at its
first reading. Rather than patch upstream's file — which would create exactly the merge
friction §3.2 was undertaken to remove — the component is invoked with its animation
disabled, which bypasses the stale path entirely. **Adapt at the boundary; do not fork the core.**

### 3.4 Geography as a mechanism, not a backdrop

**Problem.** The logistics view drew straight lines between coordinates over a satellite
image. It looked like routing and was not.

**Solution.** Vehicles carry genuine geocoded destinations and are routed through the Google
Directions API. The returned `overview_path` becomes the movement track — vehicles
interpolate along real road polylines, and ETA and distance are read from the directions
leg rather than estimated. The base layer moved from satellite to **hybrid**, because road
topology is the information the viewer actually needs. Places Autocomplete allows dispatch
against real addresses.

The distinction is precise: the previous view *depicted* logistics; this one *computes* it.

---

## 4. Design: reducing signal entropy

An interface reviewed as "busy and noisy" was measured rather than argued about. The
audit found **32 UI slot registrations across 15 plugins** and **78 distinct colours** —
16 blues, 11 ambers, 10 greens, 5 reds. When eleven ambers coexist, amber has no meaning.

The remedy was a design system built on three enforced rules:

1. **Colour encodes state, never identity.** A component is not "the blue one."
2. **The accent is reserved for live and interactive elements.** If it is not changing or
   clickable, it is neutral.
3. **Everything else is neutral.** Structure carries hierarchy; colour carries exception.

The palette collapsed from 78 colours to **21 total, 6 chromatic** — one accent plus four
state colours over a neutral ink-to-text ramp. Colour is now scarce enough to be
informative.

---

## 5. Fork management as an engineering discipline

The most transferable practice in this project is the treatment of the upstream boundary as
a first-class architectural concern.

**The rule: zero upstream core modifications.** Every integration point adapts at the
boundary instead:

| Need | Rejected approach | Chosen approach |
|---|---|---|
| Recording format conversion | Extend upstream's recorder class | Standalone adapter module in our layer |
| A missing debug category | Add a member to upstream's union | Reuse an existing category |
| A stale UI component | Patch the component | Invoke it in a mode that avoids the path |
| Config not in upstream's type | Widen upstream's interface | Defensive local cast at the read site |
| Registering our plugins | Interleave with upstream's chain | Separate `'project'`-tagged block |

The payoff is compounding: because §3.2 required no upstream edits, the *next* upstream
release is a routine update rather than a second archaeology project. Fork discipline is
not tidiness — it is the difference between a product that tracks its upstream and one that
strands itself on a snapshot.

---

## 6. Verification status

Stated plainly, because a case study that overclaims reproduces the credibility problem in
§1.

**Verified:**
- Type-check clean across source and all 846 test files — 0 errors
- Production build succeeds at 6.3.16
- The metrics engine instruments the code path common to both transport and physics modes
- Palette consolidation measured before and after

**Not yet verified:**
- **Runtime behaviour post-migration.** The verification environment throttles background
  tabs, halting `requestAnimationFrame` — the simulation gained 0 ticks over a 4-second
  observation. The application compiles and builds; it has not been observed running since
  the rebaseline. This is the single most important open item.
- Live KPI values ticking in a real browser session
- Map routing against production API credentials (requires Directions and Places APIs
  enabled and referrer allowlisting)

---

## 7. Roadmap

| Priority | Item | Rationale |
|---|---|---|
| **P0** | Runtime verification of the rebaselined build | Nothing else can be trusted until this passes |
| **P0** | Plugin-registration smoke test | §3.3 showed the type system cannot catch this class |
| **P1** | Multi-floor factory building | Upstream's planner is single-level; multi-storey needs a layer on top |
| **P1** | Panel density pass | Second half of the design work; re-measure against the new HMI baseline |
| **P2** | Extend live metrics beyond the two headline KPIs | The mechanism generalises to cycle time, buffer occupancy, drive load |

---

## 8. Conclusion

The engineering thesis is that **credibility in a digital twin is an architectural
property, not a presentation one.** It comes from a deterministic fixed-timestep core that
produces reproducible numbers, from instrumenting the code path that actually executes
rather than the one that reads most naturally, from a plugin boundary disciplined enough to
survive a 381,000-line rebaseline, and from an interface that distinguishes what it
measures from what it assumes.

The most valuable finding was negative: two features passed every automated check while
being entirely non-functional at runtime. In plugin-architecture systems, *compiles* and
*runs* are genuinely independent properties, and a test strategy that verifies only the
first will ship inert code with full confidence. That gap is now the top of the backlog —
which is itself the point. A system worth trusting is one whose builders publish what it
has not yet proven.

---

*Engineering case study · Simam Digital · Platform licensed AGPL-3.0-only*
