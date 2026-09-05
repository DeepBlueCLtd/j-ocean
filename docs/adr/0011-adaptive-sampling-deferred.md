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
