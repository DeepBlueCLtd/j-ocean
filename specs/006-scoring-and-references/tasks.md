# Tasks: Scoring and References

**Feature**: `006-scoring-and-references` | **Plan**: [`plan.md`](./plan.md)

- [X] **T010** `src/scoring/figure.ts`: a number that carries its kind, and survives JSON.
- [X] **T011** `src/scoring/scorer.ts`: the metric, the two references, the skill convention,
      the statement in the SRD's own words, and provenance a score cannot be built without.
- [X] **T012** Anomaly scoring about each field's own regional mean, with the offsets removed
      published beside the score. See the plan; this is finding 1.
- [X] **T013** Regions: the domain less its sponge margin, a disc, and its complement (AT-03).
- [X] **T014** The four refusals: below the resolution floor, outside the record, an empty
      region, and a perfect reference.
- [X] **T020** `src/instruments/interface-field.ts`: truth and climatology expressed in the
      analysis's state variable, by the *same* relation the observations use. Replaces a
      duplicate that had grown in `src/harness/`.
- [X] **T021** `src/run/forecast.ts`: spin up, sample, analyse, integrate to every declared
      horizon. The forecast starts from a model state that has been integrating, not from
      truth at its own issue time -- which would be scoring the record against itself.
- [X] **T030** `tests/scoring/scoring.test.ts`: the identities, the provenance, the refusals,
      the figure kinds, and local skill inside and outside a disc.
- [X] **T031** `tests/scoring/at-02.test.ts`: all six horizons, every figure printed.
- [X] **T040** The score panel: the statement verbatim, both references, the full provenance,
      the offsets removed, and the independence caveat. Scored on demand, because it costs a
      second and NFR-04 says the interface does not freeze.
- [X] **T050** `pnpm check` green: 206 tests, six gates.

---

## What landed, against what the plan said

- **AT-02's decline is not present, and the test says so** rather than asserting it. See
  finding 3 in the plan. The central claim -- positive skill against persistence at 24 h --
  holds and is asserted.
- **The model is worse than climatology at every horizon**, and a test asserts *that*, because
  Principle VI says the harness must be able to report it and this is the first chance to
  check that it can.
- **Two numbers for the author.** The amplitude mismatch of finding 2 is a disagreement between
  `model.reducedGravityMetresPerSecondSquared` and `model.thermalStructure`, and settling it is
  a configuration change and a re-run, not a code change.
