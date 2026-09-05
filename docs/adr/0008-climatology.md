# ADR-0008: Climatology is computed from the truth subset, and what that costs is recorded

- **Status:** Accepted
- **Date:** 2026-09-05
- **Owed by:** SRD §11
- **Written before:** beat 002

## Context

Climatology plays two roles in j-ocean and they pull in opposite directions.

As an **analysis source** it is one of the three things a cell's attribution accounts for,
and Principle II admits it as the single truth-derived quantity the analysis may consume
directly — a build-step artefact with its own provenance, never the truth field at or near
the valid instant.

As a **scoring reference** it is one of the two references skill is reported against, beside
persistence. A reference computed from the same data the forecast is scored against is not
fully independent of it, and SRD §11 asks the question directly.

The options were: compute the climatology from the same subset the truth record comes from;
obtain an independent climatology (World Ocean Atlas, say) at a different resolution and
epoch; or drop climatology as a reference and score against persistence alone.

## Decision

**Climatology is computed from the truth subset, over a declared window, and the overlap
between that window and the run period is recorded in the artefact's provenance and carried
onto every score that uses it.**

The provenance record names the source, the window start, the window end, and the overlap in
days with the run period. Beat 006 reads that record and states the caveat on screen beside
any skill-against-climatology figure; it is not a footnote in a document that the surface
does not carry.

An independent climatology was rejected for a specific reason rather than a general one: at
a different resolution and epoch it would introduce a second interpolation and a second
provenance to explain, and the interesting comparison — is the model beating a
long-run-average field? — is not made more honest by that field coming from a different
decade at a different grid spacing. Dropping climatology entirely was rejected because
persistence alone flatters a model over short horizons and punishes it over long ones, and
one reference cannot show that.

## Consequences

**Good.** One data pipeline, one resolution, one provenance to explain. The dependency is
visible rather than hidden, and it is visible *on the surface*, which is the form Principle
V requires.

**Accepted costs.** Skill against climatology is not a fully independent measure, and where
the climatology window overlaps the run period it is less independent still. The overlap is
stated in days so a reader can judge how much less. This is a known weakening of one of two
references, not a defect discovered later.

**What would change this.** A reader or reviewer treating skill-against-climatology as an
independent measure despite the caveat, which would mean the caveat is not doing its work
and belongs somewhere more prominent — or a decision to compute the climatology from a
window disjoint from the run period, which this ADR does not forbid and which the
configuration already expresses.
