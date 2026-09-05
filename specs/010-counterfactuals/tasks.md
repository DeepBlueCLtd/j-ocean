# Tasks: Counterfactuals

**Feature**: `010-counterfactuals` | **Plan**: [`plan.md`](./plan.md)

- [X] **T010** `src/instruments/edits.ts`: the five edits as data, the configuration three
      applied before sampling, the observation two applied after, and the vessel-speed rule.
- [X] **T011** An edited profile goes through the same observation operator, and its measured
      levels are kept as a ghost (FR-003).
- [X] **T012** `runForecast` takes a counterfactual; withheld observations leave the analysis
      and stay in the record (FR-006).
- [X] **T013** The manifest's counterfactual slot carries the edits, in order. Format version 3.
- [X] **T020** Level flags reach the observation the analysis consumes, past a declared
      rejection fraction. See finding 1 — this is the beat's defect.
- [X] **T021** `instruments.track.vesselSpeedKnots` and the `counterfactual` thresholds in
      configuration. Schema version 6.
- [X] **T030** `src/harness/Counterfactuals.tsx`: the run status, the edit list, revert, the
      bias control and the quality-control toggle (FR-001, FR-007).
- [X] **T031** Withhold and restore from a mark's own hover; withheld marks struck through and
      still drawn.
- [X] **T032** The profile editor: drag a point, the measurement kept as a ghost, the drag
      constrained to keep the profile monotone, applied on release (FR-003).
- [X] **T033** Draggable track waypoints on an enlarged panel, with the stretch statement
      (FR-008, FR-009).
- [X] **T034** The difference view: edited minus recorded per horizon, with the region above the
      declared magnitude outlined (FR-005).
- [X] **T040** `tests/run/counterfactuals.test.ts`: revert by bytes, AT-03, AT-06, the broken
      instrument caught and not caught, the bias the operator refuses, the small bias nothing
      catches, the redrawn track and the stretch.
- [X] **T041** Shell tests: the status and revert, withhold and the difference field, the
      profile drag and its ghost, the track drag and the stretch.
- [X] **T050** Screenshots, the engineering note, the docs site.
- [X] **T060** `pnpm check` green: 237 tests, seven gates.

---

## What landed, against what the plan said

- **Quality control was not excluding anything.** Level flags never reached the observation the
  analysis consumed; a nine-degree bias put a 285 m error into the analysis with a 2.4 m error
  bar, with the checks running.
- **A gross bias is caught by the operator, not by the check**, and identically whether quality
  control is on or off. Recorded as a limit, with a test that asserts the identity.
- **AT-06's decay is absent**: the edit is advected, not dissipated. Printed, not tuned away.
- **AT-03 is the clearest result in the project**: 0.093 to 0.021 inside the region, two
  hundredths outside it.
