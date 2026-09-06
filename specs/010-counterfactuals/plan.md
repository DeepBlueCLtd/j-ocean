# Implementation Plan: Counterfactuals

**Feature**: `010-counterfactuals` | **Spec**: [`spec.md`](./spec.md)
**Date**: 2026-09-13 | **Depends on**: 004 (the instruments), 005 (the analysis), 007–009 (the surface)
**Milestone**: **M3, the surface**, fourth beat — and the beat the whole harness was for.

## Summary

Five edits, all reversible in one action, all recorded in the manifest: withhold a measurement,
drag a measured profile, break an instrument, turn quality control off, redraw the track. The
surface always says whether it is showing the recorded run or an edit of it, and every panel
can show *edited minus recorded* for its own horizon.

An edit is a **value applied to a fresh run**, not a mutation of one. That is why reverting is
byte-identical by construction rather than by a promise about undo, and it is why the edits
divide the way they do: three of them (a bias, the quality-control toggle, a redrawn track) are
edits to the *declared configuration* and are applied before anything is sampled; two (withhold,
profile) are edits to *what was measured* and are applied after.

## Four findings

### 1. Quality control was flagging levels that nothing downstream ever heard about

The declared checks flag **levels**. The analysis consumes an **interface-depth observation**
derived from a profile. Until this beat the flags stopped at the levels: the derived
observation inherited only the profile's own flags, and level flags never reached it.

The consequence, measured on a nine-degree bias:

| | interface depth the analysis assimilated | its error bar |
|---|---|---|
| Unedited | 406.9 m | 0.8 m |
| Biased, **quality control on** | 691.3 m | 2.4 m |
| Biased, quality control off | 691.3 m | 2.4 m |

Three of twelve levels failed the gross-range check, the operator skipped them — and the
remaining biased levels produced an interface depth 285 m wrong, *confidently*, which the
analysis then trusted. Quality control changed what the surface said and nothing whatever about
what was computed.

A profile a declared fraction of whose levels failed a check is now not trusted at any depth,
and the interface derived from it carries the failing check's flag. `outside-record` does not
count towards that fraction: it says the truth record stopped, not that the instrument lied,
and every XBT that overshoots the record carries one.

### 2. The operator catches a gross bias before quality control can

Forty degrees puts every level far outside the two-layer structure, so the profile never
crosses the thermocline, so the operator returns a bound rather than a depth and the
observation is flagged `unresolved` — **whether or not quality control is running**. The two
runs are byte-identical.

For a warm bias, therefore, the gross-range check can never be the thing that catches it: any
bias large enough to trip the check is also large enough for the operator to refuse the profile,
and the operator gets there first, by arithmetic rather than by a rule. Quality control's value
in this harness is in what it *says*, not in what it excludes — and the test says so.

That also means FR-032's "watch the bias propagate with the check off" is only demonstrable in
the band between the two: a bias big enough to matter and small enough to invert. Nine degrees
is such a bias, and so is one and a half, which nothing catches at all.

### 3. AT-06's decay is not there

AT-06 expects an edited profile to move the near horizon visibly and the far one negligibly.
Measured:

```
an edited profile moves the influence region by 33.05 m at +24 h and 29.65 m at +96 h (90%)
anywhere in the domain:                        33.05 m           and 32.29 m           (98%)
```

The first half holds; the second does not. The anomaly the edit puts into the initial condition
is **advected rather than dissipated** — four days is not long enough for this model to forget
it, and the region it started in is not where it ends up. The test asserts what is true, prints
both readings, and says the decline is absent, exactly as beat 006 did with AT-02's.

Whether "negligible at 96 h" was a claim about the neighbourhood or about the domain is a
question for the author. On the domain-wide reading, this model does not do it.

### 4. AT-03 works, and is the clearest result this project has

```
withholding ownship-xbt/0000/interface at +24 h:
  inside  0.093 -> 0.021
  outside -0.019 -> -0.039
```

One measurement, withheld, costs three quarters of the skill in its own neighbourhood and moves
the rest of the domain by two hundredths. That is the value of a single measurement, priced,
which is the sentence this whole harness exists to be able to say.

## Constitution Check

| Principle | Touched | How this beat complies |
|---|---|---|
| **I. Seeded streams** | Yes | Edits are values in the manifest, applied to a fresh run. Reverting is arithmetic with a shorter list, so byte-identity is structural. |
| **II. Truth only through an instrument** | Centrally | An edited profile goes through the *same* observation operator as a measured one, and `src/instruments/edits.ts` is in the instruments ring because an edited profile has to become an `Observation` and there is one place where that may happen (G-02). |
| **IV. Attribution derived** | Yes | The difference field is arithmetic on two published forecasts, not a second opinion about what mattered. |
| **VI. The harness can lose** | Yes | Findings 1 and 2 are defects and limits in the harness's own quality control, found by building the control that exercises it. |
| **X. Declared in configuration** | Yes | The rejection fraction, the outline magnitude, the difference scale, the vessel's speed and both acceptance tests' thresholds are declared. |

**Result: PASS.** No Complexity Tracking entry.

## Decisions this plan made

- **Edits apply on release, not on drag.** Every application reruns the analysis and
  re-integrates six horizons — a second and a half. Doing that per mouse-move would make the
  drag the slowest thing in the harness and break NFR-04 in the most literal way available.
- **The difference is against a run at the same issue instant**, recomputed rather than
  remembered, so what a difference field shows is the edit and not the edit plus twelve hours
  of staleness.
- **The vessel-speed rule stretches rather than refuses.** A reader dragging a waypoint is
  asking "what if we had gone there", not "could we have got there by Tuesday". The stretch is
  stated on the surface.
- **Withheld marks are struck through, not removed.** What a reader withheld is part of what
  the reader did.
- **A recomputation no longer collapses an enlarged panel.** Enlargement is display state;
  a rerun that closed the panel a reader was looking at is the converse of the mistake FR-014
  forbids, and it was doing exactly that.

## Measured

- 237 headless tests, 30 shell tests, 7 gates.
- Revert is byte-identical after a withhold, a quality-control toggle and a bias, in that order.
