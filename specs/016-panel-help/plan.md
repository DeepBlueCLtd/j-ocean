# Implementation Plan: Help, Where the Reader Asks for It

**Feature**: `016-panel-help` | **Spec**: [`spec.md`](./spec.md)
**Date**: 2026-09-07 | **Depends on**: 013 (the regions), 014 (the disposition record), 015 (the strip)
**Stacked on**: beat 015's branch.

## Summary

Explanation moves to the thing it explains: a control at each panel's top right, opening in
place and closing again, with no sequence and no next button. What a panel may be asked about
is declared on disk beside it, and a new gate names any declared feature with no explanation
and any explanation with no feature. Help teaches and never reports, held by a test. The
walkthrough retires, with every one of its steps placed.

## Beat 014 already owes eight entries, by name

`docs/narrative-disposition.json` carries eight pieces of matter whose destination is
`help:...` and which the disposition test currently reports as **owed to this beat**, with the
count asserted so a ninth could not arrive quietly. They are this beat's first content, and
paying them off is how the record goes from *owed* to *resolved*:

`help:controls/editing-what-was-measured` (two), `help:controls/manifest`,
`help:centre/horizon-row`, `help:centre/attribution`, `help:scores` (two), and
`help:detail/attribution-breakdown`.

The disposition test is therefore the acceptance test for half this beat, and it was written
before the beat existed — which is the point of having written it.

## Decisions this plan makes

- **One list of panels, not two.** The spec's assumption is that a panel's declaration is the
  same declaration feature 013's layout uses for its regions. It is: the declaration lives with
  the component, and the gate reads the same source the layout does. Two lists would be the
  staleness this beat exists to prevent, reintroduced by the fix for it.
- **Help content lives beside the panel it explains**, not in one file of all help. The gate
  makes the pairing checkable either way; proximity is what keeps a reader who edits a panel
  from missing the sentence that describes it.
- **G-08 holds the pairing in both directions.** A declared feature with no entry *and* an
  entry naming no panel. An orphan is the more likely failure — a panel is deleted and its
  explanation survives, describing something nobody can see.
- **The *teaches and does not report* rule is a test over the sources, not a review.** It
  rejects any interpolation of run state, any provenance-typed figure component, and any bare
  numeric that is not read from configuration and named as declared. A number a help entry
  teaches with — a length scale, a horizon — is read from configuration, which is Principle X
  applied to prose.
- **The tour's steps are placed through beat 014's record**, not a second one. `StepDisposition`
  is an entry kind in `docs/narrative-disposition.json`, with `dropped` and a reason as a
  permitted destination. One record for where writing went, checked by one test.
- **The figure-typography legend goes to the site.** It explains the whole surface rather than
  one panel, so it is not a help entry; the application links to it.

## Constitution Check

| Principle | Touched | How this beat complies |
|---|---|---|
| **V. No figure without its provenance** | Inverted, deliberately | Help carries **no** live figure at all. A figure in help would be a second source for a fact the surface already shows, and its provenance would be a copy. |
| **VI. The harness can lose** | Yes | A panel with nothing to explain shows no control. The absence is information, and a stub would be the surface pretending to have more to say. |
| **X. Declared in configuration** | Yes | Every number a help entry teaches with is read from configuration and named as declared. |

**Result: PASS.** No Complexity Tracking entry.

## Risks this plan accepts

- **Removing the walkthrough removes tests.** Several shell tests assert its anchors and its
  behaviour. Their claims do not survive the tour, but the *writing* does, and the disposition
  record is where that is checked. A test deleted with its subject is recorded, not silent.
- **G-08 is only as good as the declarations.** A panel that declares nothing passes trivially.
  The gate therefore also asserts that every panel the layout renders appears in the
  declarations, so declaring nothing is itself a failure.

## Measured

_Filled in when the beat lands._
