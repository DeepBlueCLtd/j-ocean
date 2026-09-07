# SRD-v2: the surface beats

**Written**: 7 September 2026. **Against**: `j-ocean-ui-srd.md` (SRD-v2), which supplements
`j-ocean-srd.md` and changes no numerics.

Five beats. They are ordered by dependency and not by importance: 013 cannot be demonstrated
without the space 014 frees, 015 is what makes 013's smallest-viewport answer possible, and
017 addresses selections that 013 and 015 define.

| Beat | Feature | What it settles |
|---|---|---|
| 013 | [`one-view`](../specs/013-one-view/spec.md) | The invariance gate, one non-scrolling viewport, the four regions, scores in their own columns, the smallest-viewport answer |
| 014 | [`narrative-to-the-site`](../specs/014-narrative-to-the-site/spec.md) | Introductory matter, blog and system documentation to the welcome site, with a checked record of where each part went |
| 015 | [`enlargement-as-selection`](../specs/015-enlargement-as-selection/spec.md) | Enlargement replaces the centre only; the strip keeps the comparison, with figures |
| 016 | [`panel-help`](../specs/016-panel-help/spec.md) | Help at the panel, held to a declaration on disk, teaching and never reporting; the tour retires |
| 017 | [`addressable-surface`](../specs/017-addressable-surface/spec.md) | Selection is addressable, selecting writes and mounting does not; keyboard, greyscale, reduced motion; the disclaimer stays visible |

## Requirement coverage

Every requirement in SRD-v2 lands in exactly one beat.

| SRD-v2 | Beat | SRD-v2 | Beat |
|---|---|---|---|
| FR-40 scope held by test | 013 | FR-50 the strip carries scores | 015 |
| FR-41 one viewport, no scroll | 013 | FR-51 shown, not computed | 015 |
| FR-42 narrative leaves | 014 | FR-52 help at the panel | 016 |
| FR-43 too small says so | 013 (fallback from 015) | FR-53 no help, no control | 016 |
| FR-44 controls, left | 013 | FR-54 help held to disk | 016 |
| FR-45 the row, centre | 013 | FR-55 help teaches, never reports | 016 |
| FR-46 scores in their columns | 013 | FR-56 addressable selection | 017 |
| FR-47 detail, right | 013 | FR-57 greyscale, keyboard, motion | 017 |
| FR-48 empty regions speak | 013 | FR-58 the disclaimer is visible | 017 |
| FR-49 enlargement is a selection | 015 | §7 the disposition table | 014 and 016 |

| Acceptance | Beat |
|---|---|
| AT-10 byte-identical computed quantities for a fixed seed | 013, and green across 014 to 017 |
| AT-11 complete at the declared minimum, no scrollbar | 013 |
| AT-12 a control changes and every consequence is visible | 013 |
| AT-13 enlarge, swap, and nothing else moves | 015 |
| AT-14 help offered where declared, reported where missing | 016 |
| AT-15 a link opens on the cell; remounting does not rewrite | 017 |

Acceptance is watched in the browser, not inferred from green tests (SRD-v2 §8). Each beat's
plan owes a browser pass and a screenshot, as every beat here has.

## New gates

Two, both watched failing against a planted violation before they are trusted.

| Gate | Holds | Lands in | Planted violation |
|---|---|---|---|
| Surface invariance | Every computed field, score and derived quantity is byte-identical for the recorded seed | 013 | one coefficient changed in the analysis |
| Help coverage | Every declared panel region has a help entry and every entry a panel | 016 | a panel declaring a region with no entry |

## The open questions of §9, and where they are answered

| Question | Answered by |
|---|---|
| Whether the controls column stays fixed or gains a disclosure | 013, as a measurement: the column is specified fixed and the plan records what it takes to overflow |
| Whether attribution is derived from the analysis's own weights in the code as built | 013, as a **finding first**: recorded before it is fixed, per FR-40 |
| What the smallest viewport actually is | 013, measured from the built layout and then declared in configuration |

## What is deliberately not here

- **No numeric, data source or computed quantity changes.** Where the refactor appears to
  require one, it is a finding under FR-40. Feature 013 lists the three kinds expected.
- **No new capability.** Every diagram these beats rearrange is already computed.
- **No persistence.** Feature 017's addressability carries selection only; a run still travels
  as a manifest, and replay is still re-computation rather than restoration.
