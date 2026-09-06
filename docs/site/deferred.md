---
title: Deferred
summary: What this harness does not do, why, and exactly what would have to be true before it did.
order: 5
---

# Deferred, and what would trigger it

Four capabilities are **assessed, deferred and cheap to adopt**. That posture is a requirement
rather than a habit: a deferral without a trigger is a wish, and a deferral without an
assessment is an excuse. Each has an ADR, each quotes its trigger, and one of them is
*measured* on every test run.

## Adaptive sampling — the trigger is measured, and not met

Perturb the observations within their declared error, integrate an ensemble, and steer the
vessel toward where the members disagree; then race that against a lawnmower track and report
which won.

The trigger is that **scoring be trusted**, and the development plan says what that means:
AT-02, AT-03 and AT-06 have passed. `tests/run/deferral-trigger.test.ts` measures all three on
every run:

| | State | Measured |
|---|---|---|
| **AT-02** — skill declines across the row | not met | 0.000, −0.067, 0.089, −0.070, 0.024, −0.057. Positive at 24 h, as the central claim requires; the decline is absent. |
| **AT-03** — one measurement is worth something, locally | **met** | withholding one XBT takes local skill from 0.093 to 0.021 within 120 km of it, and moves the rest of the domain by two hundredths. |
| **AT-06** — an edit propagates near and fades far | not met | the edit moves the near horizon by 33.05 m and the far one by 32.29 m: 98 per cent of it. Advected, not dissipated. |

Two of the three fail for the **same reason**, and it is not a defect in any code: the declared
reduced gravity and the declared thermal structure disagree about amplitude, so the model's
interface anomaly is roughly three times the thermocline displacement the truth record carries,
about a mean that is too deep. That is [question 1 for the author](https://github.com/DeepBlueCLtd/j-ocean/blob/main/docs/questions-for-the-author.md).

An adaptive-sampling result steered by a skill score in that state would be an advertisement,
which is exactly what ADR-0011 was written to avoid. The specification for the beat exists in
full — written *before* the trigger was met, so that the capability is not re-invented from
scratch on the day it is.

**The trigger test asserts the current state, so it fails when the figures improve.** That is
deliberate. The day it fails is the day to plan the beat, and the assertion says so rather than
leaving somebody to relax it.

## Dynamic depth levels

Vertical structure that is advected rather than diagnosed. The trigger is a question about
vertical structure *evolving in time* — a counterfactual whose answer the harness cannot give.

Beat 008 put the measured profile beside the model's derived one and they disagree plainly: the
probe's thermocline is near 300 m and the model's near 590 m. **That is not the trigger.** It is
a static offset — the interface is in the wrong place, not resolved at the wrong number of
levels — and advected vertical structure would not move it. The deferral now stands on that
observation rather than on an assumption.

## A GPU kernel

The trigger is the declared frame budget binding at a grid somebody wants. At 100 × 100 it does
not: the kernel port is `createState` and `step`, a second kernel is accepted only against the
CPU reference to a tolerance recorded before anybody is invested in it, and that acceptance path
already exists.

## Observation latency and arrival order

Observations arriving *late* rather than not at all. Withholding is its special case, and beat
010 built that, which is why this one's trigger is the withhold counterfactual being in use.

---

Each of these is an ADR in [`docs/adr/`](https://github.com/DeepBlueCLtd/j-ocean/tree/main/docs/adr),
written in the same shape: what it would be, why it is deferred, why it stays cheap, what the
trigger is, and what the honest limitation is in the meantime. The surface states all four where
a reader meets the run, because leaving them off would make the harness look more capable than it
is.
