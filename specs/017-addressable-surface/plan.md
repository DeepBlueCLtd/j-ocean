# Implementation Plan: An Addressable, Operable Surface

**Feature**: `017-addressable-surface` | **Spec**: [`spec.md`](./spec.md)
**Date**: 2026-09-08 | **Depends on**: 013 (the regions), 015 (enlargement), 016 (help)
**Stacked on**: beat 016's branch. Last of the five SRD-v2 beats.

## Summary

The selected panel, cell and observation become addressable, so two people can point at the
same thing. Selecting writes the address; mounting never does. The address carries **selection
only** — never the run — and the surface is made operable by keyboard, legible in greyscale and
still under `prefers-reduced-motion`, with the not-operational statement visible in every
presentation.

## The sharp edge, and where the line is

Addressability is one small step from a second persistence mechanism, and this repository
already has one: a run is a seed and a manifest, and replay is **re-computation from a
manifest**, not restoration from a link (Principle I, AT-04). A URL carrying a seed would be a
second way to bring a run back, with none of the manifest's checks — no code version, no
configuration digest, no refusal when the tree has moved.

So the address is a **grammar with three keys and no others**, and a test rejects any addition.
A link therefore means *"look at cell 2,431 of the 48-hour panel"* and what a reader sees there
depends on the run they are in. That is the honest meaning, and the surface says it rather than
implying a link restores anything.

## Decisions this plan makes

- **The address is a query string, not a path**, so the application stays one static page with
  no routing configuration on GitHub Pages. Three keys: panel, cell, observation.
- **The cell key carries the grid it was written against.** A cell is an index, and an index
  into a different grid is a different place. Without the dimensions, an old link would select a
  cell that merely shares a number — the silent near-match FR-005 forbids. With them, the
  surface can say the link was written for a different grid.
- **Writes replace rather than push**, and the plan states why rather than leaving it emergent:
  a reader poking at cells to learn the field would otherwise build a history they have to
  escape backwards through, which punishes exactly the behaviour the instrument wants.
- **Mounting never writes**, and this is asserted by comparing the **whole address string**
  before and after a remount. A reordered query string is still a rewritten URL to anyone who
  copies it, so canonicalising on mount would fail the requirement while passing a laxer test.
- **An address naming something this run has not got is reported, never approximated.** A fresh
  seed produces different observations; a link to one of them names a thing that does not exist
  here, and saying so is the harness losing out loud (Principle VI).
- **Greyscale is tested by rendering, not by inspecting the stylesheet.** Beat 015 established
  the method — screenshot, decode, measure luminance — after beat 007's identity assertion turned
  out to be measuring something else. The same method applies here.

## What is already partly done, and must not be rebuilt

- **Greyscale.** Beat 007 measured the attribution hatch's luminance margin; beat 015 measured
  the strip's marking. This beat extends the coverage rather than starting it.
- **Reduced motion.** Beats 013 and 015 already assert instantaneous swaps. This beat's job is
  to make the claim total — *nothing* animates anywhere — and to hold it with one test rather
  than three scattered ones.
- **The disclaimer.** Beat 013 put it at the head of the controls region outside the scroller
  and beat 016 kept it out of help. This beat asserts it in **every** presentation, including
  the FR-43 fallback, and asserts that no help entry is the only place it appears.

## Constitution Check

| Principle | Touched | How this beat complies |
|---|---|---|
| **I. Seeded streams, deterministic replay** | Centrally, as a constraint | The address carries no seed, no manifest, no edits. A test rejects any key but the three, so addressability cannot become a second persistence mechanism. |
| **VI. The harness can lose** | Yes | A link naming an observation this run has not got is reported as such. A near match would be the surface pretending the link worked. |
| **X. Declared in configuration** | Yes | The grid the address is checked against is read from configuration, never assumed. |

**Result: PASS.** No Complexity Tracking entry.

## Risks this plan accepts

- **Keyboard operability across four regions is the largest surface this beat touches**, and
  the most likely place for a claim to be asserted more weakly than it is made. The test walks
  the whole surface in order and names what it could not reach, rather than counting reachable
  elements.
- **G-07 must be green.** Addressing computes nothing; a moved digest means opening a link
  caused a computation, which would be the FR-40 entanglement in its purest form.

## Measured

_Filled in when the beat lands._
