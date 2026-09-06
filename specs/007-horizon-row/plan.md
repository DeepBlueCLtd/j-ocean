# Implementation Plan: The Horizon Row

**Feature**: `007-horizon-row` | **Spec**: [`spec.md`](./spec.md)
**Date**: 2026-09-11 | **Depends on**: 003 (fields), 005 (attribution), 006 (scores)
**Milestone**: this beat opens **M3, the surface** — the harness has had an answer since beat
006; this is the first beat in which a reader can see it.

## Summary

Six panels, one per declared horizon, in order, all visible at once. Each states the instant
it is valid for and the instant it was initialised from, carries both skill figures in the
scorer's own words with its provenance one disclosure away, and can be enlarged in place
without recomputing anything. Fields are painted by one module — WebGL2 where it exists,
canvas2d where it does not — and the attribution layer is legible without colour.

## Three findings

### 1. The row did not fit, and the test that should have caught it was counting

The first row passed its Playwright test: six panels, in horizon order, each with its
instants and its scores. It was also unusable. The page's prose column is 46 rem, six panels
at their minimum legible width need about 1 200 px, and the row had quietly become what the
spec's own edge case allows only as a last resort — a container that scrolls. Four and a half
panels were on screen.

The test asserted membership and order because those are easy to assert. **"All visible at
once" is a claim about geometry, and nothing was measuring geometry.** G-05 did not catch it
either, and correctly so: G-05's question is whether the rendered horizons are the declared
ones, and they were.

So the geometry is now declared — `presentation.referenceViewportWidthPx`,
`minimumPanelWidthPx`, `panelGapPx`, `pageGutterPx` — handed to the stylesheet as custom
properties so no width is a literal in CSS, and three things check it:

- the **schema** refuses a configuration whose reference width cannot hold every declared
  horizon at the declared minimum (a seventh horizon added without widening the row now fails
  at load, with the arithmetic in the message);
- a **Playwright test** sets the window to the declared reference width and measures the
  rendered boxes: the row's `scrollWidth` may not exceed its `clientWidth`, every panel must
  be at least the declared minimum wide and inside its container, and the *page* may not
  scroll horizontally at all;
- the **screenshot** is captured at that same declared width, so a figure in the
  documentation cannot show a row that fits when the shell's does not.

### 2. G-05's first planted violation planted nothing

The gate is meant to be watched failing. The first attempt served the page a configuration
with a *seventh* horizon and expected the row to miss it — and the row rendered seven panels,
because it is properly data-driven and does what it is told. Nothing was planted; the shell
was obeying a different file.

The failure the gate exists to catch is a row that has stopped agreeing with the configuration
**on disk**. The fixture now serves the page a configuration one horizon short while the gate
compares against the declared file, which is exactly that disagreement, and it is watched
failing on every run rather than once by a person.

### 3. The attribution is one field, and six panels of it would have implied six analyses

User Story 3's third scenario expects a cell's background and climatology weights to differ
between horizons. They cannot yet: the recorded case runs **one** analysis, at the issue
instant, and the row draws that one field on all six panels. Six identical fields side by
side is a picture that implies six analyses.

The row says so, in the legend, with the instant: *the same field on every panel; this run
analyses once at 2013-09-02T00:00:00.000Z; attribution becomes per horizon when the forecast
cycles*. Beat 009 cycles at each issue time, and the scenario becomes testable then. The
alternative — synthesising a per-panel attribution by decaying the weights — would have been
a figure with no provenance, which Principle V forbids and G-06 would have caught.

## Constitution Check

| Principle | Touched | How this beat complies |
|---|---|---|
| **III. The model knows nothing about display** | Yes | Everything here reads published fields and score objects. The model gained nothing; `field-surface.ts` imports no model module. |
| **IV. Attribution is derived, never authored** | Centrally | The hatch mask is a threshold on the analysis's own weights, read through `weightsAt`. The harness computes nothing attribution-shaped, and G-06 still passes. |
| **V. No figure without its provenance** | Yes | Every panel figure is a `Figure` with a kind, rendered in the three declared styles; the provenance is a disclosure on the panel, not a document elsewhere. |
| **VI. The harness can lose** | Yes | Six panels each print *worse than climatology* in the scorer's words. Nothing on the surface softens it. |
| **X. Declared in configuration** | Yes, and enlarged | The row's geometry, the anomaly limit the panels draw against and the hatch threshold all moved out of the code into `presentation`. |

**Result: PASS.** No Complexity Tracking entry.

## Decisions this plan made

- **One rendering module** (FR-010). `field-surface.ts` owns the palettes, the shaders and the
  fallback; `FieldView.tsx` owns geometry, markers, the legend and the click target. Beat 003
  had the two mixed, which was fine for one field and would not have been for twelve.
- **WebGL2 with a canvas2d fallback, and the fallback is exercised.** Headless Chromium does
  have WebGL2 here — ANGLE over SwiftShader — so every test would otherwise take the fast
  path and the fallback would be code nobody had run. A test refuses `getContext('webgl2')`
  in an init script, asserts the surface reports `canvas2d`, and counts distinct colours to
  confirm it painted a field rather than a rectangle.
- **The second channel is a diagonal hatch** in the shader, keyed on the analysis's dominant
  source, so the layer survives a monochrome print. The greyscale test measures luminance
  contrast between an observed patch and the unvisited corner against a declared margin.
- **The panels draw anomalies**, about each field's own regional mean, at a declared limit.
  Drawn raw they were a uniform red: the model's mean interface sits 100 m below the
  thermocline the truth record diagnoses (beat 006, finding 2). The row draws what the score
  measures, or the picture and the number would describe different things.
- **Enlargement is a class on an element.** The test asserts it by identity — the same
  `Float64Array` object is in the panel before and after — which is a stronger claim than
  "it looked the same".

## Measured

- 18 shell tests, 7 gates, all passing; G-05 runs in a browser and its planted violation
  fails on every run.
- Six panels at 190 px minimum in a 1 352 px row at the declared 1 400 px reference width;
  the page's own `scrollWidth` never exceeds its `clientWidth`.
- Greyscale luminance contrast between the observed patch and the unvisited corner:
  **150.0** of 255, against a declared margin of 40.
