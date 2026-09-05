# Implementation Plan: Scoring and References

**Feature**: `006-scoring-and-references` | **Spec**: [`spec.md`](./spec.md)
**Date**: 2026-09-09 | **Depends on**: 002 (truth, climatology), 003 (the model), 005 (the analysis)
**Milestone**: this beat completes **M2, headless science** — the harness has an answer before
it has a picture.

## Summary

Skill against two references the harness computes itself, in the convention where zero means
*no better* and negative means *worse*, with provenance attached to every figure.

This is the beat where the harness first gets to lose, and it does. The model is **worse than
climatology at every horizon**, by a factor of two to three, and the surface says so in those
words. Principle VI is not a hypothetical any more.

## Three findings, in the order they turned up

### 1. The raw error was mostly an offset

The first scored run reported a forecast error of 141 m and a climatology error of 27 m. Both
were dominated by a *bias*: the model's mean interface sits at 331 m by declaration
(`meanUpperLayerThicknessMetres` is 500 m, modulated by sea-surface height), while the
thermocline the two-layer operator diagnoses from the truth record sits at 224 m.

A reduced-gravity model has no absolute reference for its free surface. That is why the domain
mean is removed at initialisation (FR-013), and scoring has to use the same convention or it
measures an offset that neither field claims to determine. **Every field is now compared as an
anomaly about its own regional mean, and the means removed are published beside the score.**

| | Raw | As anomalies |
|---|---|---|
| Forecast error at 24 h | 135 m | **79 m** |
| Skill against persistence at 24 h | 0.036 | **0.145** |

### 2. The model is worse than climatology, and the reason is a declared number

Even as anomalies, the model's error is 79 m against climatology's 28 m. A two-month mean of
the same domain beats a four-day forecast comfortably, at every lead time.

The cause is an amplitude mismatch between two declared quantities. The model maps sea-surface
height to interface depth by `g/g' = 490`, so a ±0.5 m anomaly becomes ±245 m of interface
displacement; the truth's thermocline, as the declared two-layer structure diagnoses it, moves
only about ±50 m across the same front. **The model's anomaly is roughly three times too
large.**

That is a finding about `reducedGravityMetresPerSecondSquared` and
`thermalStructure` together, not a defect in any code, and it is the author's to settle. It is
*not* quietly fixed here by tuning a constant until the number improved, which would make this
suite a description of what somebody hoped for.

### 3. Skill does not decline across the row

AT-02 expects skill against persistence to be non-increasing in lead time. In the recorded
case it rises: 0.133 at twelve hours, 0.155 at ninety-six, wandering by a few hundredths in
between.

The printed figures say why. The forecast's error is roughly 80 m at *every* lead time, while
persistence's grows slowly from 92 m to 97 m — so the ratio improves. The forecast error is
dominated by finding 2's standing amplitude mismatch rather than by anything that decays, and
four days is not long enough for lead-time decay to become the larger effect.

The test asserts what is true, prints the six figures, and says out loud that AT-02's decline
is absent. Widening a tolerance until the assertion passed would have hidden exactly the thing
worth knowing.

## Constitution Check

| Principle | Touched | How this beat complies |
|---|---|---|
| **II. Truth only through an instrument** | Yes | Scoring reads truth to compare after the fact, through the port, and returns **figures, never fields**. G-02 continues to forbid the model and the analysis from importing it. |
| **V. No figure without its provenance** | Centrally | A `Score` cannot be built without one: reference, region, margin, window, metric, resolution floor, truth source and the independence caveat. Every number is a `Figure` carrying its kind, and the kind survives JSON. |
| **VI. The harness can lose** | Centrally, and for the first time in earnest | The surface prints `worse than climatology by 247.8 per cent` verbatim. There is no path by which that could be softened, because the statement is constructed in the scorer and rendered as-is. |
| **X. Declared in configuration** | Yes | The resolution floor comes from the truth artefact; the margin from the sponge; the metric is named in the provenance rather than assumed. |

**Result: PASS.** No Complexity Tracking entry.

## What the scorer refuses

- **A region finer than the truth's own resolution** (review R-2): *"scoring inside it would be
  scoring interpolation, not the ocean"*.
- **A valid instant outside the truth record** — which is the refusal beat 009's validity
  statement will rest on.
- **A region with nothing left in it** after the margin is removed.
- **Dividing by a perfect reference**: skill is `null` and the statement says *persistence is
  perfect here*, rather than infinity.

## Measured

```
  0 h  forecast 91.9 m  persistence 91.9 m  climatology 26.4 m  |  0.000  -2.478
 12 h  forecast 80.0 m  persistence 92.2 m  climatology 26.7 m  |  0.133  -1.994
 24 h  forecast 79.1 m  persistence 92.6 m  climatology 27.6 m  |  0.145  -1.863
 48 h  forecast 83.7 m  persistence 92.3 m  climatology 27.6 m  |  0.093  -2.032
 72 h  forecast 79.3 m  persistence 94.7 m  climatology 26.7 m  |  0.163  -1.965
 96 h  forecast 81.8 m  persistence 96.8 m  climatology 30.0 m  |  0.155  -1.730
```

And AT-03's scoring half, which works and is worth its own line:

> Within 120 km of the third XBT drop, skill against persistence is **0.335** over 1 836
> cells. Outside it, **0.110** over 5 722. The measurement is worth something, and worth it
> locally.
