# Wakefield interior — reference analysis

Evidence artifact for `wakefield-interior.ts`, following the img2threejs layered
observation protocol (`grimoire/intake/image_analysis.md`). Observation is stated
separately from inference; inference is marked.

**Reference set:** 5 user-supplied photographs — 1 interior process hall, 1 exterior
office elevation, 3 aerial views of UK industrial-estate sheds.

**Brand constraint:** two references show real, identifiable companies (a Coca-Cola
Enterprises elevation; Stapletons/Eddie Stobart livery). Only *architectural and
equipment typology* is taken from them. No logo, wordmark, livery or corporate colour
scheme is reproduced. The modelled site is Wakefield Precision Foods, our own fictional
operator.

**Scale:** measured from the running scene — the loaded GLB line is 12.5 × 3.65 × 7.17
world units, so 1 unit is treated as 1 metre. All dimensions below are metres.

---

## Layer 1 — Identification

High-care beverage canning / filling and packing hall. Broad classification: industrial
process environment. `primaryDomain: object`. Confidence 0.9.

## Layer 2 — Overall form

Clear-span rectangular hall. Two occupied levels: a ground process floor and an elevated
access walkway. Envelope is orthogonal, bilaterally regular along the process axis.
Roof plane is flat-to-shallow-pitch with linear rooflight strips (aerials).

Inferred ceiling height 8–10 m, from the ratio of wall height to the ~2 m control
cabinets and the ~1.1 m handrail.

## Layer 3 — Macro → meso → micro

**Macro**
- Building envelope: white insulated wall panels; horizontal joint lines at regular pitch
- Elevated walkway spanning the hall longitudinally, with stair access
- Conveyor network — several parallel runs on the long axis
- Machine cells inside guarded enclosures
- Control/MCC cabinet row against one wall
- Palletising and case-packing area

**Meso**
- Modular-belt conveyor, vivid yellow-green belt — the dominant repeated element
- Modular-belt conveyor, mid-blue belt — smaller number of runs
- Gravity roller conveyor, bright metal rollers
- Overhead can-transfer structure at high level
- Branded stainless process enclosure with glazed inspection panels
- Pillar jib crane: safety-yellow column and boom
- Articulated robot, safety-yellow, in the palletising cell
- Guarding frames: square-section posts with clear polycarbonate infill
- Red/white striped barrier panels
- Cardboard case stacks on pallets; stacked red crates

**Micro**
- Hazard tape edging on floor
- E-stop mushroom heads on conveyor posts
- Small dark HMI panels on cabinet fronts
- Drive motors / gearboxes at conveyor ends
- Two-rail tubular handrail with toe board
- High-level linear luminaires
- Machine nameplates; overhead cable tray runs

## Layer 4 — Spatial relationships

- `<walkway, spans-above, process floor>` — supported on posts, contact type: socket
- `<conveyor run, parallel-to, process axis>` — repeated at regular lateral pitch
- `<guarding, encloses, machine cell>` — posts butt to floor, panels socket into posts
- `<cabinet row, flush-with, wall>` — backs against the envelope
- `<jib crane, attached-to, floor>` — single column, boom sweeps a radius
- `<case stacks, rest-on, pallets>` — contact type: butt

## Layer 5 — Materials (PBR)

| Surface | albedo | metalness | roughness | note |
|---|---|---|---|---|
| Stainless frame, brushed | 0.55 grey | 1.0 | 0.38 | anisotropic in reality; approximated isotropic |
| Galvanised handrail | 0.62 grey | 1.0 | 0.52 | |
| White wall panel | 0.88 near-white | 0.0 | 0.85 | matte |
| Epoxy floor | 0.42 mid-grey | 0.0 | 0.65 | slight sheen |
| Lime modular belt | vivid yellow-green | 0.0 | 0.60 | plastic |
| Blue modular belt | mid blue | 0.0 | 0.55 | plastic |
| Cardboard | tan | 0.0 | 0.95 | |
| Safety yellow paint | saturated yellow | 0.0 | 0.50 | satin |
| Fire-door red | mid red | 0.0 | 0.45 | gloss |
| Polycarbonate guard | clear | 0.0 | 0.08 | transmissive; approximated with opacity |

Observation: highlights on the stainless are *baked into the photograph*; the albedo
values above are estimates with the photographic lighting reasoned out, not measured.

## Layer 6 — Colour & finish

Overall field is desaturated: white walls, grey floor, brushed stainless. Chroma appears
only as functional accent — yellow-green belts, safety yellow plant, red doors and
crates, blue belts and pallets. This matches the token-system rule that colour encodes
state rather than identity, so the palette is kept.

## Layer 7 — Identity-defining features

Ranked by how much each carries "this is a real production hall":

1. **Long parallel yellow-green modular-belt runs** — the single strongest cue
2. **Elevated walkway with tubular handrail** crossing above the process floor
3. **Row of grey control cabinets** against a wall
4. **Guarded cells** — stainless posts with clear infill panels
5. **Pillar jib crane** in safety yellow
6. **Linear rooflights** in rows (from the aerials)
7. Dock doors with levellers along one elevation (aerials)

## What the references do not show

- No view of the roof structure from beneath; truss form is inferred from the span and
  from UK portal-frame convention, not observed.
- Interior is a single viewpoint: the far short wall, the floor beneath the equipment,
  and all four corners are unobserved.
- Exterior and interior are different buildings. They are combined here as a plausible
  single site, which is an authoring decision, not an observation.

## Component mapping

| Detail | Implemented as |
|---|---|
| Wall panels + joints | `_hallEnvelope` — panel planes, joint line pitch 1.2 m |
| Rooflights | `_roofStructure` — emissive strips between trusses |
| Walkway | `_mezzanineWalkway` — deck, posts, two-rail handrail, toe board, stair |
| Lime belt runs | `_conveyorRun` ×3, lateral pitch 1.2 m |
| Blue belt run | `_conveyorRun` ×1 |
| Cabinet row | `_cabinetRow` — bodies, plinths, HMI panels, labels |
| Guarded cell | `_guardEnclosure` — posts + translucent infill |
| Jib crane | `_jibCrane` — column, boom, hoist block |
| High-bay lights | `_highBayLights` |
| Case stacks | `_palletStack` |
| Hazard edging | `_hazardMarkings` |
