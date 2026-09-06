# Tasks: Analysis and Attribution

**Feature**: `005-analysis-and-attribution` | **Plan**: [`plan.md`](./plan.md)

- [X] **T000** ADR-0006 (optimal interpolation, and why not 3D-Var or an ensemble filter);
      ADR-0011 (adaptive sampling, deferred with the *scoring trusted* trigger).
- [X] **T010** `config.analysis`: the state variable, background error, representativeness,
      length scale, prior blend, influence threshold, bound inflation and time bound. The
      schema refuses a length scale at or above half the domain.
- [X] **T020** `src/analysis/attribution.ts`: the branded type and its single construction site.
- [X] **T021** `src/analysis/optimal-interpolation.ts`: `B Hᵀ`, the Cholesky inverse of
      `H B Hᵀ + R`, the gain, the analysis, and the weights as the gain's row sums.
- [X] **T022** Flagged observations excluded and recorded with their reason; one-sided bounds
      admitted with a declared error inflation; observations of a quantity the analysis does
      not work in excluded with an explanation.
- [X] **T023** Interface observations priced with the declared representativeness added in
      quadrature. See the plan; this is the finding of the beat.
- [X] **T030** `breakdownAt`, `influenceOf` and `gainColumn` — a row of the gain, a column of
      it, and the raw column for the test that recomputes the weights independently.
- [X] **T040** Gate G-06, watched failing on a harness that paints an attribution of its own.
- [X] **T041** G-02's behavioural half, which has been waiting since beat 004.
- [X] **T050** The attribution panel: a sequential palette, the declared-radius caveat, the
      clamp count, and a breakdown that appears only for a selected cell.
- [X] **T060** `pnpm check` green: 189 tests, six gates.

---

## What landed, against what the plan said

- **The spec's "weights sum to 1" is asserted, and the clamp count is bounded rather than
  zero.** Optimal interpolation with a Gaussian covariance genuinely produces row sums
  slightly outside nought and one between clustered observations. The spec's own edge case
  anticipated this and asked for the count to be published; it is, on the surface, and the
  test requires it to stay under five per cent of the domain.
- **The "perfect observation" scenario now returns 80 per cent of the weight, not 100.** The
  spec's second scenario says a zero-error observation gives the analysis its own value. With
  representativeness declared, a zero-*instrument*-error observation is still not believed
  absolutely, because a point sounding cannot know a cell's mean interface depth. The test
  asserts the weight equals `σ_b²/(σ_b² + σ_r²)` exactly, which is a stronger statement than
  the one the spec asked for.
- **The surface observations do not enter the analysis at all**, and the record says why: in a
  two-layer model the surface temperature is the upper layer's own, so a surface thermometer
  does not constrain the interface depth. That is a fact about the model rather than a
  shortcoming of the instrument, and it is exactly the kind of thing the harness exists to
  make visible.
