# ADR-0007: Argo is admitted to the analysis behind a toggle, with a caveat on every score

- **Status:** Accepted, and the author's to overturn
- **Date:** 2026-09-07
- **Owed by:** SRD review R-3
- **Written before:** beat 004

## Context

The harness holds two classes of observation. The **ownship's** instruments are simulated:
they sample a truth record through a declared operator with declared noise, and the harness
knows exactly what they are worth because it priced them. **Argo profiles** are real
measurements of the real ocean, converted and committed in beat 002.

Review R-3 asked what Argo is *for*. Three answers were available.

**Drawn only, never assimilated.** Argo appears on the footprint so a reader can see what
else was in the water, and the analysis ignores it. Clean, and it wastes the most interesting
thing about the dataset.

**Assimilated as an ordinary observation.** Argo enters the analysis beside the ownship's
measurements. Realistic, and it quietly damages the harness's central claim: the model is
scored against a HYCOM reanalysis that *itself assimilated those same Argo profiles*. The
observation and the truth are not independent, and skill measured that way is flattered.

**Assimilated behind a declared toggle, with the dependency stated wherever a score is
shown.** More work, and it is the only one of the three that lets a reader see the effect and
know what it is worth.

## Decision

**Argo profiles are admitted to the analysis behind the configuration toggle
`instruments.argo.assimilate`, defaulting to true, and every observation derived from them
carries `external: true`.**

- Argo quality flags are mapped onto the harness's own flag set and honoured by the same
  semantics as a failed ownship check. A flagged level is kept and drawn as flagged, never
  dropped (FR-24).
- `external: true` is what makes the choice reversible and the caveat automatic: beat 006
  counts external observations in a score's provenance, and beat 008 labels the footprint
  *drawn, not assimilated* when the toggle is off.
- The dependency is stated in words, not implied: **the truth record assimilated these
  profiles.** Skill measured against it while assimilating them is not independent evidence,
  and the surface says so beside the figure.

> **The author's to overturn.** Setting the default to false is a one-line configuration
> change and no code change at all, which is the property this decision was designed to have.
> It is recorded as accepted rather than deferred because the beat could not otherwise
> proceed, not because the question is closed.

## Consequences

**Good.** A reader can toggle Argo and watch what a handful of real profiles is worth against
a scored truth, which is a genuinely interesting thing to be able to do. The caveat travels
with the score rather than living in a document the surface does not carry.

**Accepted costs.** Skill computed with Argo assimilated is not independent of the truth
record, and that is a real weakening of a real claim. It is stated rather than mitigated,
because there is no mitigation short of a truth record that did not assimilate Argo — which
would mean a different product, and ADR-0004 records why this one was chosen.

Note also how few they are: 25 profiles over a fortnight in the Gulf Stream box. That is the
ocean's actual sampling density, and it is a large part of what the harness exists to teach.
