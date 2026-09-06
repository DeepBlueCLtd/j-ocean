# Tasks: Adaptive Sampling — assessment only

**Feature**: `012-adaptive-sampling` | **Assessment**: [`plan.md`](./plan.md)

The implementation tasks are deliberately **not** listed: the specification says this beat is
not to be planned until its trigger is met, and it is not met. These are the tasks of assessing
that honestly.

- [X] **T010** `tests/run/deferral-trigger.test.ts`: AT-02, AT-03 and AT-06 measured on every
      run, each asserting the state it is actually in, with the verdict printed in one place.
- [X] **T011** The assertions say that a failure means the trigger may now be met and the beat
      should be planned — not that the test should be relaxed.
- [X] **T020** ADR-0011 gains its assessment: the three conditions, the measurements, the single
      shared cause, and what adoption would need in order.
- [X] **T021** ADR-0009 already carries beat 008's observation that the profile disagreement is
      *not* its trigger; the deferrals page says the same for a reader.
- [X] **T030** The deferrals panel on the surface: four capabilities, four triggers, where a
      reader meets the run.
- [X] **T031** `docs/questions-for-the-author.md`: seven questions, most consequential first.
- [X] **T032** The `Deferred` page on the documentation site.
- [X] **T040** Shell test and screenshot for the deferrals panel.
- [X] **T050** `pnpm check` green: 245 tests, seven gates.

---

## What landed, against what the plan said

- **The beat was not built, and the reason is measured.** Two of the three trigger conditions
  fail, for one shared cause that is a disagreement between two declared numbers.
- **The specification stays complete**, because it was written before the trigger was met so
  that the capability is not re-invented on the day it is.
