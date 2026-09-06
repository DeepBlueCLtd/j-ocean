# Tasks: The Shore Forecast on Two Axes

**Feature**: `009-shore-forecast-two-axes` | **Plan**: [`plan.md`](./plan.md)

- [X] **T010** `runForecast` shows the analysis only observations with instants at or before
      the issue instant (FR-001). This is the beat's finding; see the plan.
- [X] **T011** `analyseAtIssue` split out, so the departure brief is the analysis and nothing
      integrated from it.
- [X] **T012** Horizons anchored to the default issue instant: moving issue time leaves valid
      instants where they are and lengthens the lead (FR-002).
- [X] **T013** `HorizonForecast`: a field, or a refusal saying why there is not one — outside
      validity, or before the forecast was issued (FR-005, FR-027).
- [X] **T014** `departureBrief`: the quay-side analysis, frozen (FR-004).
- [X] **T020** `forecast.validityWindowHours`, `quaysideOffsetHours` and `issueTimeControl` in
      configuration, with the refinements that keep them consistent. Schema version 5.
- [X] **T021** The manifest records the issue instant; format version 2 (FR-009).
- [X] **T030** One issue-time control above the row, with observation instants marked on it,
      the stale banner, and the re-issue button (FR-007, NFR-04).
- [X] **T031** `src/harness/SkillInset.tsx`: the curves that have been scored, labelled by
      issue instant (FR-008).
- [X] **T032** Every panel states the lead actually asked of it, and carries the brief's error
      beside its own.
- [X] **T033** The panel says when there was no external observation to caveat, rather than
      leaving a blank space.
- [X] **T040** `tests/run/shore-forecast.test.ts`: the withheld observations, the bodily drop,
      the anchoring, both refusals, byte-identical return to default, the frozen brief, and the
      brief-versus-forecast errors printed.
- [X] **T041** Shell tests: one control, the stale banner, the anchored valid instant, the
      lengthened lead, the outside-validity panel, the frozen brief across a re-issue, two
      curves in the inset, and the manifest's issue instant.
- [X] **T042** Screenshots: the row issued at default, issued twelve hours earlier, and the
      inset.
- [X] **T050** The correction on beat 006's engineering note, and the docs site.
- [X] **T060** `pnpm check` green: 227 tests, seven gates.

---

## What landed, against what the plan said

- **Three beats of skill figures were computed with future observations**, and the corrected
  ones are worse: the model is roughly no better than persistence. Reported, not tuned.
- **The independence caveat has nothing to attach to** in the recorded case, because no Argo
  profile has arrived by the default issue time.
- **The departure brief is within a few metres of the shore forecast** at every lead time and
  beats it at two of them. Printed by the test; asserted by nobody.
