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

**The grammar.** `ADDRESS_KEYS` is `panel, cell, observation`, serialised in that order, so the
address of a selection is a function of the selection and not of the order things happened in.
A cell is `2431@100x100`; an observation is its own id; the unselected address is the empty
string. `tests/harness/address.test.ts` rejects a fourth key from two directions, and was
watched failing on a `seed` planted in `ADDRESS_KEYS` and honoured by the parser: four tests
fail, and the one worth having says *why* rather than that a list changed —

> the address grammar carries seed, which names the run rather than a selection. A run is a
> seed and a manifest, and replay is re-computation from the manifest: an address that carried
> one would be a second way to bring a run back, with no code version, no configuration digest,
> and no refusal when the tree has moved (constitution Principle I, SRD-v1 "no run in the URL").

The full output is in the beat's note.

**Mounting does not write**, asserted twice over because either assertion alone is too weak.
The whole address string is compared across three mounts — first load, reload, returning tab —
on a link that deliberately carries an unknown key, a cell from another grid and an observation
this run has not got, because a URL like that is where a tidying-up write would show. And
`history.replaceState` and `pushState` are wrapped from before the page's own script runs, so
*no write* is the absence of a call rather than the absence of a visible difference: **zero
writes across all three mounts**, and the string byte-identical each time. There is no effect
reconciling address with selection; the three selection handlers are the only writers, so there
is no code path from mounting to a write.

**The back button.** Writes replace, so three selections leave `history.length` where it was,
and Back lands on whatever the reader was looking at before j-ocean rather than on one of their
own selections. Asserted with three selections in between. The reason is that a reader poking
at cells to learn the field would otherwise build a history to escape backwards through, which
punishes the behaviour the instrument wants.

**The keyboard pass.** **25 tab stops, all reached**, in the order
`region-controls → region-centre → region-scores → region-detail`, never going backwards, every
one showing a focus ring. One further control is reachable only inside a radio group, which is
recorded rather than dropped: a group of choices is one tab stop with the arrows moving inside
it. The strip's six slots and the elevation's needles are roving-focus groups and are walked
with the arrow keys. Two things were **not reachable at all** before this beat and were built:
a cell could only be selected by pointing at it, and so could a profile. The field now carries a
cell cursor and the elevation is a roving-focus group.

**Greyscale**, measured through a real `grayscale(1)` filter on the composited page, with the
filter's application checked first so that a measurement on a photograph still in colour cannot
pass:

| Distinction | Margin, of 255 | Bar |
|---|---|---|
| The attribution field, brightest against darkest patch | **233.0** (22.0 to 255.0) | 40 |
| The strip's marking, marked border against unmarked | **176.0** | 40 |

**Two findings.** Three of the four figure kinds were distinguished by **colour alone** wherever
a figure carried the kind class without `.figure` and outside a panel — a `derived` level in the
profile comparison was drawn as plain text beside a `computed` one, which is the distinction
SRD-v1 FR-07 exists to draw. Fixed by making the kind the selector; display only. And the
Release control on a pinned mark had been **inert since beat 008**: it called the hover path,
which a pinned mark is guarded against by design, so the guard swallowed the control's own
click. Clearing is now its own act, which is also what T032 needs.

**Nothing moved.** G-07 is green with `scripts/gates/records/surface-invariance.json` untouched:
all 41 digests byte-identical. The measured viewport floor is still **2038 × 728** CSS px. 311
headless tests, 91 in a browser, nine gates, 19 screenshots.
