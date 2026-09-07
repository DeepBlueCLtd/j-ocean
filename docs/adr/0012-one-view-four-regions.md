# ADR-0012: One view of four regions, divided by what changes when

- **Status:** Accepted
- **Date:** 2026-09-07
- **Owed by:** SRD-v2 FR-41, FR-43 to FR-48; SRD-v1 FR-13; ADR-0003
- **Written before:** beat 013

## Context

Version 1 shipped as a long scrolling page — introductory matter, blog, and the
application beneath it, some six vertical screens at the declared reference width. It
passed every test it had. Its author could not follow it.

The diagnosis is not "it needs restyling". It is that a reader dragged a control and what
changed was off screen, and that ADR-0003 chose a row of six panels over a slider on the
explicit ground that *a reader cannot hold an unseen frame in memory*. A page that
scrolls reintroduces the fault the row exists to prevent, one level up: the six panels are
side by side, and the control that drives them is two screens away.

So the question is not whether to scroll less. It is what a surface should be divided by
when everything on it is connected to everything else.

**By subject.** The obvious division: a section for the run, one for the instruments, one
for the analysis, one for the scores. This is what version 1 did, and it is what produced
six screens, because subjects have no natural bound and each one grew.

**By workflow.** Steps a reader completes and leaves behind. j-ocean has no steps: every
control affects everything at once, and a surface that implies otherwise is lying about
the system.

**By rate of change.** What the reader moves, what the reader moves it with, what results,
and what the reader is currently inspecting. Four things, and they change at four different
rates.

## Decision

**The application is one non-scrolling viewport of four named regions, divided by rate of
change: causes on the left, the payload in the centre, consequences directly beneath their
own panels, and the thing being inspected on the right.**

- **Controls, left.** Every control that drives the whole system, and the run's provenance
  behind disclosures beneath them. A control that acts on one panel alone is at that panel.
- **Centre.** The horizon row and nothing else. Its column count comes from the declared
  horizons, so a configuration with five or seven lays out without a code change.
- **Scores, beneath.** Each panel's skill figures in that panel's own grid column, sharing
  the centre's column tracks structurally rather than by arrangement. Six figures read left
  to right draw the decay without a curve being plotted.
- **Detail, right.** Whatever was last selected. Selecting fills it and moves nothing.

A region may scroll **within itself** where its content genuinely exceeds it, and that is a
declared property of the region rather than an accident: an undeclared scrollbar fails a
test by name.

Below the declared minimum viewport the application states the size it needs and offers the
single-panel presentation, rather than shrinking six panels past legibility.

## Consequences

- **The minimum viewport becomes a declared figure**, measured from the built layout rather
  than chosen, and refused by the schema if it cannot hold the declared horizons. It is
  **2 038 x 682 CSS pixels**: 848 px for the gutter and the two columns, 1 190 px for six panels
  at their declared minimum with five gaps between them, and a row 634 px tall once its labels
  and six score statements have wrapped in their own columns. The width is a sum of declared
  boxes; the height could not have been predicted, because a score statement is a sentence and a
  wider panel is a shorter score.

  This is the cost of the decision stated honestly, and it is not small: a 13-inch laptop is
  below the floor, so most readers meet the single-panel answer rather than the row. The
  alternative was six panels too narrow to read, or a row that scrolls -- which is the fault
  beat 007 caught, arriving through a different door. Whether 190 px is still the right minimum
  panel width now that six of them plus two columns is the binding constraint on the window is
  question 5 for the author.
- **The narrative has nowhere to live on the application**, which is why beat 014 exists.
  Until it lands, the introductory matter and the run's provenance sit behind disclosures in
  the controls region, and the open question of SRD-v2 §9 — whether that column stays fixed
  or gains a disclosure — is answered by measurement rather than by preference.
- **The scores table is deleted, not hidden.** A table asks a reader to match a row label
  against a panel heading at every glance; that tax is what this decision refuses to keep
  paying.
- **A layout change can now be wrong in a way a test catches.** Beat 007 learned that "all
  visible at once" is a claim about geometry and that asserting membership and order measures
  nothing. Both axes are measured here, in every state the application can reach.
- **This decision moves no number.** That claim is not made by the author of the change; it
  is held by gate G-07, which digests every computed quantity of the recorded case and was
  landed and watched failing before the first element moved.
