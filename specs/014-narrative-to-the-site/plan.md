# Implementation Plan: The Narrative Leaves the Application

**Feature**: `014-narrative-to-the-site` | **Spec**: [`spec.md`](./spec.md)
**Date**: 2026-09-07 | **Depends on**: 013 (the four regions)
**Stacked on**: beat 013's branch. The space this beat frees is the space 013 needs, and
SRD-v2 §8 says neither is demonstrable alone.

## Summary

The application stops carrying prose. Introductory matter, the system documentation and the
provenance of the derived artefacts go to the welcome site; the explanation of a panel that
stays goes to that panel's help, which beat 016 builds. Nothing is deleted, and a record on
disk says where each piece went — held by a test, because *we tidied the page* and *we deleted
the explanation* look identical from the outside.

## What 013 left, and why this beat is not just deletion

Beat 013 did not delete the narrative panels; it moved them into the controls region's
disclosures, closed by default, because deleting prose is beat 014's job and doing it inside a
layout beat would have made 013's scope claim untrue. So the surface today has the run, the
declared values, the instruments, the truth record, the manifest and the deferrals folded into
one column. This beat opens each one and asks the spec's question of it: does a reader **drive**
this, or **read a live figure** from it, or is it an **explanation**?

- **Drives it, or reads a live figure from it** — stays, compacted, in the region that owns it.
- **Explains a panel that stays** — goes to that panel's help entry. Beat 016 builds those, so
  until then the text lives in the disposition record and the test reports the destination as
  **owed**: a known hole with a beat number on it, which is not the same as a pass.
- **States no live figure at all** — goes to the site.

## The disposition record

`docs/narrative-disposition.json`, one entry per piece of matter: where it was, the matter
itself, its kind, and its destination. It carries the text, so a piece bound for a help entry
that does not exist yet is **in the repository** rather than in a diff nobody will find again.

The test (`tests/docs/disposition.test.ts`) holds it three ways:

1. every `site` entry resolves to a heading that exists in a page under `docs/site/`, and that
   section contains the matter;
2. every `help` entry is reported as owed, naming beat 016, and the count is asserted so that
   the holes cannot quietly grow;
3. every `stays` entry names one of the four regions of 013.

It is watched failing on a planted entry whose destination does not exist (SC-002), the way
every check in this repository is.

## Decisions this plan makes

- **The record is JSON and not prose**, because a test has to read it and because §7's table is
  generated from it rather than written twice. The site's disposition page and SRD-v2 §7 are
  both rendered from the one file.
- **The not-operational statement is not narrative** and does not move (FR-003, FR-058). It is
  the one sentence the application owes a reader who arrived without context.
- **Declared figures stay inline where they are used.** *What has been declared* moves to the
  data-model page as an explanation; the figures themselves keep their `Declared` typography
  next to the thing they declare, which is FR-004 and Principle V.
- **The deferrals panel becomes a link.** `docs/site/deferred.md` already carries the content
  and `tests/run/deferral-trigger.test.ts` already measures the triggers; performing a move that
  has already happened would be theatre. The record says so with the row marked as arriving.
- **The manifest stays.** Replay is something a reader drives. Its entry point stays in the
  controls region and opens into the detail region; only its explanation leaves.

## Constitution Check

| Principle | Touched | How this beat complies |
|---|---|---|
| **V. No figure without its provenance** | Centrally | A figure inside a moved paragraph relocates to the region that owns it and keeps its typography. A figure is never deleted with the sentence around it. |
| **VI. The harness can lose** | Yes | The deferrals and the *not earning its compute* words leave the application only to a page that states them at least as plainly. |
| **IX. Derived artefacts, not fixtures** | Yes | §7 and the site's disposition page are generated from the record, not transcribed beside it. |
| **X. Declared in configuration** | Yes | No figure moves out of a component into prose; declared figures stay where they are declared. |

**Result: PASS.** No Complexity Tracking entry.

## Risks this plan accepts

- **The help entries do not exist yet.** Between this beat and 016 a reader loses the
  explanations that are bound for help. The record keeps the text and the test counts the holes;
  the alternative — holding this beat until 016 — would leave 013's viewport unwinnable, and
  SRD-v2 orders the beats this way on purpose.
- **G-07 must stay green.** Removing prose computes nothing, so any moved digest means a figure
  was computed in order to be written into a sentence, which is a finding under FR-40.

## Measured

_Filled in when the beat lands._
