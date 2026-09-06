# ADR-0011: Adaptive sampling is assessed, deferred, and cheap to adopt

- **Status:** Deferred
- **Date:** 2026-09-08
- **Owed by:** SRD §10
- **Written before:** beat 006

## Context

Feature 012 would run an ensemble, compute its spread, and steer the ownship toward where the
spread is largest — then score that adaptive track against a lawnmower one, and report which
won.

## Decision

**Deferred.** The trigger, from the development plan, is *scoring trusted*: the paired
experiment is only worth running once the harness has been believed when it reports a
forecast being **worse** than a reference. An adaptive-sampling result from a scoring
machinery nobody has yet watched deliver bad news is an advertisement.

## Why it stays cheap

- The analysis publishes its gain, so an observation's influence field is already a column of
  it. An ensemble changes where the covariance comes from, not what the analysis exports.
- ADR-0006 names the ensemble Kalman filter as the rejected alternative it would become, and
  the interface a flow-dependent covariance would have to satisfy is the one already
  published.
- The track is declared data (beat 004), and beat 012's tracks are generated; the boundary
  between the two already exists.

## Consequences

Until this is adopted, the influence radius the surface draws is a property of the declared
length scale rather than of the flow, and the surface says so (ADR-0006). That statement is
the honest version of the limitation, and it is also the clearest possible description of
what adopting this ADR would buy.

## Assessed, beat 012 — the trigger is measured and not met

The development plan says the trigger is *scoring trusted*, and that trusted means **AT-02,
AT-03 and AT-06 have passed**. Beat 012 measured all three rather than judging them, and
`tests/run/deferral-trigger.test.ts` re-measures them on every run:

| | State | Measured |
|---|---|---|
| **AT-02** | not met | skill against persistence: 0.000, −0.067, 0.089, −0.070, 0.024, −0.057 across the row. Positive at 24 h, as the central claim requires; the expected decline is absent. |
| **AT-03** | **met** | withholding one XBT takes local skill from 0.093 to 0.021 within 120 km of it, and moves the rest of the domain by two hundredths. |
| **AT-06** | not met | an edited profile moves the near horizon by 33.05 m and the far horizon by 32.29 m — 98 per cent of it. The edit is advected, not dissipated. |

**Two of the three fail for the same reason**, and it is not a defect in any code: the declared
reduced gravity and the declared thermal structure disagree about amplitude, so the model's
interface anomaly is roughly three times the thermocline displacement the truth record carries,
about a mean that is too deep. Beat 006 identified it, beat 008 showed it as two profiles side
by side, and beat 009 removed the future observations that had been flattering the figures.

**So the deferral stands, and it now stands on evidence.** An adaptive-sampling result steered by
a skill score in this state would be precisely the advertisement this ADR was written to avoid.

The trigger test asserts the *current* state, so it fails when the figures improve. That is
deliberate: the day it fails is the day to plan beat 012, and the message on the assertion says
so rather than leaving somebody to relax the test.

**What adoption would need, in order.** Settle question 1 in `docs/questions-for-the-author.md`;
re-run; watch AT-02 and AT-06 in the shell; then plan beat 012 against the specification that
already exists in `specs/012-adaptive-sampling/`, which is why that specification was written
before the trigger was met rather than after.
