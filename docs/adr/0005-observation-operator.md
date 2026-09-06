# ADR-0005: The observation operator observes the interface depth

- **Status:** Accepted
- **Date:** 2026-09-07
- **Owed by:** SRD review R-1
- **Written before:** beat 004

## Context

The model has one active layer. A reader's XBT has a temperature profile. Something has to
turn one into the other, twice over: forwards, so that a simulated instrument can produce an
observation of a quantity the model holds; and backwards, so that the analysis can use a
real temperature profile to say something about a layer thickness.

Review R-1 called this the hinge of the harness, and it is: everything the surface later says
a measurement was *worth* is priced by this mapping. Two candidates were considered.

**A temperature-anomaly operator on a fixed vertical mode.** Project the temperature anomaly
onto a declared first baroclinic mode and let the analysis work in anomaly space. It is what
an operational system would more likely do, it handles a profile that never crosses the
thermocline gracefully, and it is almost impossible to explain to the reader this harness
exists for. "Your measurement moved the first baroclinic mode coefficient" is not a sentence
that teaches anybody anything.

**The two-layer thermal structure, with interface depth as the observed quantity.** The same
relation the model already uses to *draw* a profile (FR-07, beat 003), inverted. The observed
quantity is a depth in metres, which is a thing a reader can point at on a picture, and it is
literally the model's prognostic variable.

## Decision

**The observation operator is the two-layer thermal structure declared in configuration, and
the observed quantity is the interface depth.**

    T(z) = T_deep + (T_upper - T_deep) · ½ · (1 − tanh((z − h) / L))

Forwards, an instrument samples truth and reports temperature at a depth. Backwards, each
sampled level implies an interface depth

    h = z − L · atanh( 2(T − T_upper)/(T_deep − T_upper) − 1 )

and the levels are combined by inverse-variance weighting, with each level's depth error
propagated from its temperature error through

    |dh/dT| = 2L / (|T_deep − T_upper| · (1 − f²))

**The propagation is the reason to prefer this operator, not a detail of it.** As a
measurement moves away from the thermocline, `f` approaches ±1 and `|dh/dT|` diverges: the
level's implied depth error goes to infinity and its weight goes to zero, automatically. A
thermometer at 100 m in an ocean whose interface is at 700 m contributes essentially nothing,
and it does so through the arithmetic rather than through a rule somebody remembered to write.

Where **no** level resolves the interface, the operator does not produce a depth. It reports
*below the profile* (or *above*) with the bound the profile establishes, and the analysis
treats that as a bound rather than a measurement. Inventing a depth there would be the exact
failure Principle V exists to prevent.

## Consequences

**Good.** One relation, declared once, used by the model to draw a profile, by the instrument
to sample one, and by the analysis to read one. A reader dragging a profile in beat 010 is
dragging the same curve the analysis inverts, so the consequence they see is the consequence
there is. The saturation is honest by construction.

**Accepted costs.** A real ocean is not two layers, so an XBT taken in a genuine seasonal
thermocline over a deeper permanent one will imply an interface depth that is a compromise
between them. That is a *finding* rather than a defect, and it is a finding only because the
surface says the profile is derived (beat 003) — which is why that label had to exist before
this operator did.

The operator also inherits the declared thermal structure's constants. If the declared upper
and deep temperatures are wrong for the domain, every observation is biased in the same
direction, which a test checks against the truth record rather than assuming.

**What would change this.** A question that needs the analysis to work in temperature rather
than in layer depth — the arrival of a second active layer (ADR-0009), most likely. That is a
new ADR, not an extra branch here.
