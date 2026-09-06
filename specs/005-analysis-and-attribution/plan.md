# Implementation Plan: Analysis and Attribution

**Feature**: `005-analysis-and-attribution` | **Spec**: [`spec.md`](./spec.md)
**Date**: 2026-09-08 | **Depends on**: 003 (the background), 004 (the observations)
**ADR landed first**: [0006](../../docs/adr/0006-analysis-scheme.md); ADR-0011 (adaptive
sampling, deferred) is written here because beat 006 owes it.

## Summary

Optimal interpolation over interface depth, and the attribution field that falls out of it.

The whole beat turns on one identity. Because `H` selects one cell per observation, `H·1 = 1`,
so at every cell

    Σ_k (I − K H)_ik + Σ_j K_ij = 1

The row sum of the gain **is** the weight the observations carried there. Nothing is
estimated, smoothed, normalised by hand or painted: the attribution field is that arithmetic,
exported from the same computation as the answer. That is Principle IV, and it is why
ADR-0006 chose optimal interpolation over 3D-Var, which gives the same numbers by a route
that does not hand you them.

## The finding: an observation's formal error is not what it is worth

The first working analysis produced a picture that was obviously wrong and quietly
instructive. Per-observation shares above **200 per cent** in the same cell as shares below
zero, and **1 342 of 10 000 cells** with a weight outside nought and one.

The cause was not the code. Beat 004's operator propagates an interface-depth error of about
**0.8 m** from a zero-noise profile — that is genuinely what the *instrument* could not know.
It is not what the observation is worth to a grid of 4.5 km cells. A point sounding of the
thermocline differs from a cell's mean interface depth by tens of metres of mesoscale
variability that no thermometer could have resolved.

So the analysis believed each observation about fifty times more than the background; two
Argo profiles twenty kilometres apart became nearly collinear in a covariance with a 60 km
length scale; and the gain fell apart in the way an ill-conditioned system does.

`analysis.interfaceRepresentativenessMetres` (25 m) is now declared and added in quadrature.

| | Before | After |
|---|---|---|
| Largest single share | 202.5 % | 78.9 % |
| Most negative share | large | −18.8 % |
| Cells clamped | 1 342 (13 %) | 287 (2.9 %) |

**287 is not a defect and the test does not demand zero.** Optimal interpolation with a
Gaussian covariance and clustered observations genuinely produces row sums a little outside
nought and one in the shadows between them. The spec's fifth edge case asks for the clamp
count to be a *published diagnostic*, not for the clamp never to fire, so it is on the surface
and the test bounds it below five per cent of the domain.

## Constitution Check

| Principle | Touched | How this beat complies |
|---|---|---|
| **II. Truth only through an instrument** | Centrally | `src/analysis/` imports observations, a background and a climatology, and nothing else. G-02's static halves already held that; its **behavioural** half lands here, in `tests/analysis/analysis.test.ts`: with every observation error at 10⁹ m the analysis departs from the no-observation blend by 8 × 10⁻¹³ m and the largest observation weight is 6 × 10⁻¹⁵. |
| **IV. Attribution derived, never authored** | Centrally | One construction site, branded. G-06 fails if the brand appears elsewhere *or* if anything under `src/harness/` contains a function producing an attribution. A test recomputes the weights from the gain by different code and asserts equality — the largest difference is exactly zero. |
| **V. No figure without provenance** | Yes | The influence radius is labelled a property of the **declared** length scale, on the surface, in those words (review R-7). The clamp count is published. The breakdown names which observations contributed and by how much. |
| **VI. The harness can lose** | Yes | Excluded observations are recorded with their reason and stay in the record for drawing. An observation of a quantity the analysis does not work in is excluded and *says why*. |
| **X. Declared in configuration** | Yes | Length scale, background error, representativeness, prior blend, influence threshold, bound inflation and the time bound. The schema refuses a length scale at or above half the domain, because an analysis in which everything influences everything cannot explain anything. |

**Result: PASS.** No Complexity Tracking entry.

## What the surface draws

The attribution field is drawn with a **sequential** palette — paper to ink, monotone in
lightness — rather than the diverging one the anomaly fields use. A weight runs from nothing
to all of it and has no sign, so a diverging scale would give it a blue half that means
nothing. Monotone lightness is also what makes it greyscale-legible, which FR-17 requires.

A cell's breakdown appears **only when a cell is selected**. FR-16 forbids a per-panel summary
bar as the primary attribution display, and says so because it was specified first and was
wrong: a summary can be computed from something other than the analysis, and then the picture
and the answer can disagree.

## Measured, and printed by the tests

| | |
|---|---|
| Gain row sum against exported weight, largest difference | **0** |
| Zero-instrument-error observation's weight at its own cell | 80.0 %, exactly σ_b²/(σ_b² + σ_r²) |
| Influence radius, measured | 160 km, against a declared 60 km length scale (2.7 L) |
| Behavioural boundary: departure with errors at 10⁹ m | 8 × 10⁻¹³ m; largest weight 6 × 10⁻¹⁵ |
| Analysis at 100 × 100 with 21 observations | 30 ms against a declared bound of 1 500 ms |
