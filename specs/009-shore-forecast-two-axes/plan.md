# Implementation Plan: The Shore Forecast on Two Axes

**Feature**: `009-shore-forecast-two-axes` | **Spec**: [`spec.md`](./spec.md)
**Date**: 2026-09-12 | **Depends on**: 005 (the analysis), 006 (scoring), 007 (the row)
**Milestone**: **M3, the surface**, third beat.

## Summary

Issue time becomes an axis of its own. The row is already the lead-time axis; a single
scrubber above it moves the instant the forecast was made, leaving every panel valid at the
same moment it was and making each of them a longer forecast of it. Beside every score sits
the departure brief — the quay-side analysis, frozen — as the baseline everything is watched
against. A panel that has fallen outside its forecast's validity says so and draws nothing.

## The finding, and it is the largest one this project has had

**Until this beat the analysis was given every observation the run produced, including the
ones that had not happened yet.**

The forecast is issued at +24 h. The recorded case's XBT drops are at +6, +18, +30, +42, +54
and +66 h, and its Argo profiles are spread across the whole period. The analysis at +24 h was
handed all of them: a forecast made on the second of September was using a measurement taken
on the fourth.

FR-001 of this spec says what it should always have said — *initialised from an analysis at
the issue instant using only observations with instants at or before it* — and now it does.
The effect is not small:

| | Before (all observations) | After (only what had happened) |
|---|---|---|
| Observations the analysis saw | 31 | **2** |
| Skill against persistence at 12 h | 0.133 | **−0.067** |
| Skill against persistence at 24 h | 0.145 | **0.089** |
| Skill against persistence at 96 h | 0.155 | **−0.057** |

Every skill figure beat 006 printed was bought with information the forecast could not have
had. The corrected row is roughly *no better than persistence*: positive at two horizons,
negative at three, zero at the first. The engineering note for beat 006 now carries a
correction pointing here, because a figure that has been superseded should not be left
looking current.

Two smaller consequences, both of which change what the harness can say:

- **The independence caveat is never triggered in the recorded case.** No Argo profile has
  arrived by +24 h, so nothing external is assimilated and review R-3's caveat has nothing to
  attach to. That is good for independence and useless for testing the caveat, so the caveat
  test moved to a later issue time and the panel now states *no external observation was
  assimilated in this window* rather than leaving a blank space a reader cannot read.
- **AT-03 got stronger.** With only the two drops that had reported, skill within 120 km of the
  third drop is **0.377** against **−0.012** outside it. The measurement is worth something,
  and now it is worth it locally in a way nothing else is doing for it.

## The two axes

Staleness and lead time are conflated routinely, and only two controls can pull them apart.

The declared horizons are measured from the **default** issue instant, which fixes the six
valid instants the row shows. Moving the control does not move the panels: it makes each of
them a longer forecast of the same moment. That is why the whole curve drops *bodily* rather
than shifting sideways, and it is the only presentation in which a reader can see staleness as
distinct from lead time.

Measured, twelve hours of staleness with nothing else changed:

```
  +0 h  issued at default  0.000   issued 12 h earlier  -0.023
 +12 h  issued at default -0.067   issued 12 h earlier  -0.161
 +24 h  issued at default  0.089   issued 12 h earlier  -0.004
 +48 h  issued at default -0.070   issued 12 h earlier  -0.174
 +72 h  issued at default  0.024   issued 12 h earlier  -0.056
 +96 h  issued at default -0.057   issued 12 h earlier  outside validity
```

Worse at every horizon that can be compared. That is SC-001, and the test asserts it rather
than printing it and hoping.

§11 asked whether a two-dimensional control was needed. It is not: **the row is one of the
axes**, so there is exactly one control, and the inset draws the curves that have actually
been scored so the bodily drop is visible as a shape as well as as twelve numbers.

## The departure brief

The analysis at the declared quay-side instant, held constant, never refreshed — asserted by
byte identity across an issue-time move.

At the quay-side instant of the recorded case **nothing has reported yet**, so the brief is
the background blended with climatology. That makes it a generous baseline rather than a weak
one, and the surface says so rather than letting a reader assume the brief is a straw man.

It is also uncomfortably competitive:

```
  +0 h  brief 81.5 m   shore forecast 81.6 m
 +24 h  brief 81.3 m   shore forecast 74.8 m
 +48 h  brief 80.4 m   shore forecast 86.4 m
 +96 h  brief 83.4 m   shore forecast 83.7 m
```

A frozen field from the quay side is within a few metres of the shore forecast at every lead
time, and beats it at two of them. The test prints both and asserts neither wins, because
which of them wins is a measurement and not an assumption.

## Constitution Check

| Principle | Touched | How this beat complies |
|---|---|---|
| **I. Seeded streams** | Yes | The instruments are sampled in full and filtered afterwards, so every draw happens whichever issue instant is asked for. Filtering earlier would make an observation's noise depend on when somebody chose to issue a forecast. |
| **II. Truth only through an instrument** | Yes, and materially | The analysis may now only see what an instrument had reported *by the instant it was made*. This is the beat where Principle II stopped being a statement about modules and became a statement about time. |
| **V. No figure without its provenance** | Yes | Every panel states the lead actually asked of it, not only its declared horizon; the manifest records the issue instant; a panel with no forecast says why. |
| **VI. The harness can lose** | Yes | The corrected skill figures are worse than the ones this project has been printing for three beats, and they are printed. |
| **X. Declared in configuration** | Yes | The validity window, the quay-side offset, and the control's range and resolution are declared, and the schema refuses a default issue time the control cannot reach. |

**Result: PASS.** No Complexity Tracking entry.

## Decisions this plan made

- **Re-issuing is asked for, not automatic.** Moving the scrubber marks the row stale and says
  which forecast is still on screen; re-integration happens on a button. NFR-04's edge case
  says exactly this, and it is the honest reading of "the interface does not freeze".
- **The manifest records the issue instant** (FR-009), because it is a reader's choice rather
  than a property of the integration, and a manifest that did not record it could not rebuild
  the fields it describes. Manifest format version 2.
- **The inset draws only curves somebody has scored.** A curve for an issue time nobody asked
  about would be a figure with no computation behind it.
- **Panels are anchored to the default issue instant**, so G-05 still asks its question
  unchanged: the row renders exactly the declared horizons, whatever the issue time is.

## Measured

- 227 headless tests, 26 shell tests, 7 gates.
- Returning the control to its default reproduces the recorded case **byte for byte** after a
  detour through another issue time.
