# Assessment: Adaptive Sampling stays deferred

**Feature**: `012-adaptive-sampling` | **Spec**: [`spec.md`](./spec.md)
**Date**: 2026-09-15 | **Status**: **not planned — the trigger is measured and not met**

This is not an implementation plan, because the specification says it should not be one until
the trigger is met, and the trigger is not met. What follows is the assessment, the evidence,
and what would have to be true.

## The trigger, quoted

> once scoring (feature 006) and the counterfactuals (feature 010) are landed and trusted,
> since the paired experiment is worthless without a skill score anyone believes. "Trusted"
> means AT-02, AT-03 and AT-06 have passed and been watched in the shell.

## Measured, not judged

`tests/run/deferral-trigger.test.ts` measures all three on every run:

| | State | Measured |
|---|---|---|
| **AT-02** | not met | skill against persistence across the row: 0.000, −0.067, 0.089, −0.070, 0.024, −0.057. Positive at 24 h, as the central claim requires; the expected decline is absent. |
| **AT-03** | **met** | withholding one XBT takes local skill from 0.093 to 0.021 within 120 km of it, and moves the rest of the domain by two hundredths. |
| **AT-06** | not met | an edited profile moves the near horizon by 33.05 m and the far one by 32.29 m — 98 per cent of it. |

Two of the three fail for the **same** reason and it is not a defect in any code: the declared
reduced gravity and the declared thermal structure disagree about amplitude. Beat 006 found it
in the scores, beat 008 showed it as two profiles side by side, and beat 009 removed the future
observations that had been flattering the numbers.

## Why building it anyway would be worse than not building it

The paired experiment's whole content is *which track scored better*. Steering by a sensitivity
field and then scoring the result with a skill score that is roughly zero, from a model that is
worse than climatology at every horizon, would produce a number with a winner in it and no
information. ADR-0011 called that an advertisement before any of this was measured, and the
measurement has not changed the argument.

The specification stays, complete, so that the capability is not re-invented from scratch on the
day the trigger is met. That is what "assessed, deferred, cheap to adopt" means, and writing the
spec before the trigger rather than after is the part that makes it true.

## What this beat delivered instead

- **A trigger that is measured rather than remembered.** The test asserts the *current* state,
  so it fails when the figures improve, and the assertion messages say that a failure is the
  signal to plan the beat rather than to relax the test.
- **The deferrals on the surface.** All four of §10's deferrals, each with its trigger, where a
  reader meets the run — because leaving them off would make the harness look more capable than
  it is, which is the failure mode this project spends most of its effort avoiding.
- **`docs/questions-for-the-author.md`**: seven questions only the author can settle, most
  consequential first, each with the evidence that raised it and what changes either way.
- **A `Deferred` page on the documentation site**, with the same content for a reader who never
  opens the repository.

## Constitution Check

| Principle | Touched | How this beat complies |
|---|---|---|
| **VI. The harness can lose** | Centrally | The last beat of the project reports that the project's last feature should not be built yet, with the figures. |
| **V. No figure without its provenance** | Yes | Every figure in the assessment is printed by a test that recomputes it. |

**Result: PASS.**

## Measured

- 245 headless tests, 35 shell tests, 7 gates. Nothing deferred among the gates; one feature
  deferred, on evidence, with the evidence re-measured on every run.
