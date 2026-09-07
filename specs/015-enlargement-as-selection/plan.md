# Implementation Plan: Enlargement Is a Selection, Not a Mode

**Feature**: `015-enlargement-as-selection` | **Spec**: [`spec.md`](./spec.md)
**Date**: 2026-09-07 | **Depends on**: 007 (the row), 013 (the four regions), 014 (the space)
**Stacked on**: beat 014's branch.

## Summary

Enlargement stops being a mode and becomes a selection: it replaces the contents of the centre
region and nothing else. The row survives above the enlarged panel as a strip carrying every
declared horizon and its skill figures, and choosing another horizon in the strip swaps the
centre directly — no close, no reopen, no unenlarged frame in between.

## What already exists, and what that changes about this beat

Beat 013 built the FR-43 answer for a viewport below the floor: one horizon at a time, with a
strip above it carrying all six and what each was worth. That is this beat's requirement,
built early because a no-scroll requirement without a smallest-case answer is an unfinished
one.

So this beat is not "build a strip". It is **make the strip the one way the centre holds a
single panel**, at any viewport, and delete the second implementation. The below-floor
presentation becomes an instance of enlargement rather than a parallel arrangement of the same
idea — which is the difference between a feature and a special case, and the reason the two
would otherwise drift.

## Decisions this plan makes

- **`CentreContent` is a discriminated union**, `{ kind: 'row' } | { kind: 'enlarged', leadHours }`,
  and it is the only thing that decides what the centre holds. The spec's *never both, never
  neither* is then a property of the type rather than a rule somebody has to remember.
- **Below the floor the union is forced, not shadowed.** The fallback selects an enlargement
  instead of rendering its own layout, so the strip, the marking, the keyboard behaviour and the
  scores have exactly one implementation.
- **No intermediate state is asserted by instrumenting renders, not by timing** (the spec's own
  assumption). The centre records each content kind it renders into a ledger the test reads; a
  swap must show `enlarged(48)` then `enlarged(96)` with no `row` between them. A timing
  assertion would pass on a fast machine and fail on a slow one, which is a test that measures
  the machine.
- **The strip's thumbnails are the same field objects at a smaller size.** Nothing is reduced,
  resampled or recomputed for the strip; the surface draws the array it already has into a
  smaller canvas. A reduction computed for the strip would be display causing computation, which
  is the entanglement beat 013 spent a gate on.
- **The marking is not colour.** A border weight and a stated label, held to a greyscale
  luminance margin the way beat 007 held the attribution hatch (FR-057).
- **The strip is a roving-tabindex listbox.** Arrow keys move, commit swaps, focus stays in the
  strip. That is what FR-057 means by operable, and it is also how a reader compares horizons
  without a mouse.
- **The enlarged panel's own controls stay at the panel** (attribution on, difference on),
  because they act on one panel and FR-044 puts single-panel controls at their panel.

## Constitution Check

| Principle | Touched | How this beat complies |
|---|---|---|
| **III. The model knows nothing about display** | Yes | Enlargement is a state in the shell; nothing below it is aware of it. |
| **V. No figure without its provenance** | Yes | The strip carries the scorer's own figures, not a rounding of them; an unscored horizon says so rather than showing a blank slot. |
| **VI. The harness can lose** | Yes | A refusal in the strip is printed as a refusal. A blank slot would be the harness declining to say it lost. |
| **X. Declared in configuration** | Yes | The strip's height and thumbnail size are declared beside the row's geometry; the horizons come from configuration as always (G-05). |

**Result: PASS.** No Complexity Tracking entry.

## Risks this plan accepts

- **Deleting the below-floor presentation is a real risk to a passing test.** Beat 013's
  `viewport-floor.spec.ts` asserts the fallback is operable; those assertions must keep passing
  against the unified implementation, not be relaxed to match it.
- **G-07 must be green and the field identity assertion must hold.** Beat 007 established by
  object identity that enlarging recomputes nothing. If enlargement is rebuilt and that
  assertion is weakened rather than kept, the beat has lost the property it exists to preserve.

## Measured

_Filled in when the beat lands._
