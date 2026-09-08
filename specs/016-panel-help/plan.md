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

### The declarations, and how there is one list

`src/harness/panels.json` holds **fifteen** panels: an id, the region it is in, the words at
its head, and the regions or layers it has. `src/harness/panels.ts` turns it into the type the
components take and declares `REGIONS` beside it.

There is one list because **a panel is drawn by naming its declaration** — `<PanelHead
panel="controls/manifest" />` — and `PanelHead` reads the heading out of that declaration, so
the words on the surface and the words in the list are one fact. `Regions.tsx` lays the four
regions out through `RegionSection`, whose `id` is typed `RegionId`, so a section for a region
nothing declares does not compile and the class and test id are derived from the name rather
than written beside it. Every panel's `region` is one of those names, checked by G-08.
`tests/docs/disposition.test.ts` asserts the record's own `regions` array equals `REGIONS`,
which removes the third copy that beat 014 had left.

G-08 closes it from the other end: every `panel="…"` in `src/harness/` must be declared, and
every declaration must be drawn. The two sets are the same set, and the browser checks the
same thing from the DOM — `tests/shell/panel-help.spec.ts` reads every `[data-panel]` on the
page and requires it to be declared, and requires a control on exactly those that declare help.

Nine of the fifteen have help; six have nothing to explain and say **why** in the declaration,
because "nobody has written it yet" and "there is nothing to write" look identical from the
surface and G-08 requires the sentence.

### G-08, watched failing

Four fixtures under `scripts/gates/fixtures/`, each spawned as the program CI runs. The gate
was watched failing on all four before it was registered in `run-all.ts`:

```text
help-coverage-unexplained
  src/harness/help/centre-attribution.tsx:1  panel "centre/attribution" declares the feature
  "the hatched channel" and nothing explains it

help-coverage-orphan
  src/harness/help/centre-horizon-row.tsx:1  this help entry names the panel
  "centre/horizon-row", which is not declared in src/harness/panels.json: an explanation of
  something nobody can see

help-coverage-stub
  src/harness/help/centre-attribution.tsx:7  the explanation of "the influence radius" on panel
  "centre/attribution" is empty (4 letters); FR-053 prefers no control at all to a stub

help-coverage-undeclared
  src/harness/Planted.tsx:8  the layout draws a panel "centre/horizon-panel" that
  src/harness/panels.json does not declare
```

And a fifth, on the shared `clean/` fixture, which declares nothing: it **fails** with *this
tree declares no panels at all*. Every pairing check above is satisfied by an empty list, so
the absence of the list has to be the failure rather than a skip.

### Help teaches, watched failing

`tests/harness/help.test.ts` reads the nine help sources and rejects run state, any
provenance-typed figure but `Declared`, and any digit not inside an expression that reads
`config.`. Comments are blanked first, for gate-lib's reason: a check that reads comments
flags the sentence explaining what it forbids.

It was watched failing on a real entry, planted in `src/harness/help/scores.tsx`:

```text
src/harness/help/scores.tsx:1  draws a computed figure; only a declared figure may appear in help
src/harness/help/scores.tsx:26 states the run: help teaches, it does not report
src/harness/help/scores.tsx:26 states a score: help teaches, it does not report
src/harness/help/scores.tsx:26 states a formatted quantity: help teaches, it does not report
src/harness/help/scores.tsx:26 draws a computed figure; only a declared figure may appear in help
src/harness/help/scores.tsx:26 states a numeral that is not read from configuration; a figure a
                               help entry teaches with is a declared one (Principle X, FR-006)
src/harness/help/scores.tsx:27 states a numeral that is not read from configuration; …
```

Four planted sources are kept in the test as the standing half of PR-04, including one that
must **pass**: the same numeral read from configuration.

### The eight, and the eleven

The eight `help:` destinations beat 014 owed are built, and the disposition test went from
*reporting them owed* to *resolving them*: `failuresOf` renders the entry with the validated
configuration and looks for the words. Fifteen help entries in the record now, of which the
eight are named and counted as before.

The walkthrough's eleven steps are seventeen pieces of matter: **seven** to a panel's help,
**seven** to the site, **three** dropped with a reason. The record asserts the step numbers are
exactly one to eleven, so a step cannot stop being accounted for.

### Tests deleted, against the claims they made

Six shell tests and one screenshot test went with `Walkthrough.tsx`. Each is recorded here
against what it asserted, and against what now holds that claim — or against the fact that
nothing does, because the claim went with its subject.

| Deleted | The claim it made | Where the claim is now |
|---|---|---|
| `offers a bright help button without scrolling, and opens on it` | a help control is on screen without interaction, measured to be in the top-right quarter of the viewport | `panel-help.spec.ts` › *puts the control at the top right of the panel it belongs to*, measured against each panel's own box rather than the window's |
| `finds an anchor for every step it declares` | every one of eleven steps resolves to an element on the page, and no two share a title | Gone with the tour. Its discipline is G-08, which holds content rather than anchors — the failure this beat exists to fix is a panel that keeps its test id and changes what it is |
| `rings the panel its step is about, not some other part of the page` | the spotlight's rectangle is the controls region's rectangle to two pixels | Gone. There is no spotlight: help opens at the control, so "which panel is this about" is answered by where the control is |
| `leaves the page underneath usable, and closes on Escape` | the tour is not modal, closes on Escape, and returns focus to the button | `panel-help.spec.ts` › *closes on the control and on Escape, with focus returned*. Not-modal is now stronger and measured differently: opening help changes no region's rectangle at all |
| `takes in a panel that appears after it was opened` | the tour recomputes its steps as the page provisions, rather than fixing them on opening | Gone, and correctly: help is per panel, so a panel that has not arrived has no control, and one that arrives brings its own |
| `drops a step whose panel is not on the page` | a step whose anchor is absent is dropped rather than shown against nothing | Held by construction: a panel that is not rendered renders no control. `panel-help.spec.ts` › *offers one on every panel that declares help* checks the two sets are equal in whatever state the page is in |
| `the walkthrough` (screenshots) | three figures of the tour for the site | Replaced by `panel help, where the reader asks for it`: five figures. The walkthrough's own blog note keeps its images, because it is a record of a beat that happened |

### What did not move

The viewport floor was re-measured rather than assumed, because this beat adds a control to a
panel one declared minimum wide: **2038 × 728 CSS px**, unchanged. No declared figure moved, so
G-07 is green with `scripts/gates/records/surface-invariance.json` **untouched** — all 41
digests byte-identical. No FR-40 finding.

Opening help changes no region's bounding rectangle, measured to the pixel at the floor, and
does not change the page's scroll extents. The horizon panel's help is 658 px tall in a 728 px
window and scrolls within itself, declared with `data-scrolls`.

### The constitution's schedule

G-08 was added, and so was **G-07**, which landed in beat 013 and had been running in CI
unlisted ever since. Recording that late is the finding rather than the fix, and ADR-0013 says
so. The constitution goes to 1.1.0: guidance materially expanded, no principle redefined.

### Counts

297 headless tests, 74 in a browser, **nine gates**, 18 screenshots.
