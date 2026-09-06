# ADR-0009: Dynamic depth levels are assessed, deferred, and cheap to adopt

- **Status:** Deferred
- **Date:** 2026-09-05
- **Owed by:** SRD §10
- **Written before:** beat 003

## Context

Version 1 displays depth but does not integrate it: the vertical structure a reader sees is
diagnosed from layer state and never advected. A reader dragging a temperature profile is
therefore changing a diagnosis, not a prognostic field.

## Decision

**Deferred.** The one-and-a-half layer core has one active layer, and adding advected
vertical structure means either more layers or a genuinely three-dimensional core — a change
to the model tier of ADR-0001, not an extension of it.

The trigger, quoted from the SRD:

> Dynamic depth is deferred, with its trigger, in §10. (FR-07)

Operationally: **when a reader's question turns on vertical structure evolving in time
rather than on the horizontal combination of information.** The observable symptom is a
counterfactual whose answer the harness cannot give — a profile edit whose consequence for a
later horizon is a genuine question and the surface can only reply that the levels between
the model's own are derived.

## Why it stays cheap

- The kernel port takes a state whose fields are named. Adding layers adds fields; it does
  not change the port.
- Every surface drawing a profile already states that the levels between the model's own are
  derived, so the honest label exists before the capability does and does not need
  retrofitting.
- The declared display levels live in configuration, so what a reader sees and what the model
  integrates are already separate ideas.

## Consequences

The harness cannot answer a question about vertical evolution and says so rather than
extrapolating. That refusal is a feature of Principle V, and the day it becomes an obstacle
is the day this ADR is superseded.

## Observed, beat 008 — the trigger is not met, and now that is evidence

Beat 008 put the measured profile beside the diagnosed one, and they disagree plainly. At the
first XBT drop the probe reads 28.0 °C at the surface and 14.0 °C at 665 m, with its
thermocline near 300 m; the model's diagnosed profile at the same cell is still 25.4 °C at
400 m and only reaches 11.1 °C at 600 m, putting its interface near 590 m.

That is a disagreement a reader can see, which is what §10 hoped this comparison would
surface. **It is not this ADR's trigger.** The trigger is a question about vertical structure
*evolving in time*, and this is a static offset: the interface is in the wrong place, not
resolved at the wrong number of levels. Adding advected vertical structure would not move it.

The cause is the mismatch beat 006 recorded between two declared numbers —
`model.reducedGravityMetresPerSecondSquared` and `model.thermalStructure` — which makes the
model's interface anomaly roughly three times the thermocline displacement the truth record
carries, about a mean that is itself too deep. Settling that is a configuration change and a
re-run.

So the deferral stands, and the reason for it has changed from an assumption to an
observation: the harness's vertical structure is wrong for a reason that dynamic depth levels
would not fix.
