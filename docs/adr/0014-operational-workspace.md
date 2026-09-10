# ADR-0014: A docked workspace, and what may persist in it

- **Status:** Accepted
- **Date:** 2026-09-08
- **Owed by:** the author's review of beat 017; SRD-v2 FR-41, FR-44 to FR-48
- **Written before:** beat 018
- **Supersedes:** the region-grid half of ADR-0012. That ADR's division by rate of change
  stands; its CSS-grid realisation and its doctrine of declared internal scroll do not.

## Context

Beats 013 to 017 took the application from six vertical screens to one viewport, named its
regions, moved the narrative to the site and put the explanation at the panel. Measured at
2560 × 1440 on beat 017's head, the result was still an article:

- the controls pane was a **1,344 px scroller in a 1,440 px window**;
- about **two fifths of the surface was empty** while the horizon panels were 200 px wide;
- and the surface reported in sentences where an instrument shows a readout.

The first of those is the one that matters, because it was **tested and passed**. ADR-0012 said
internal scroll was "a declared property of a region, not an accident", and a test asserted that
every scrolling element was one of the declared ones. The test proved the scrollers were
*intended*. It said nothing about whether the content should have fitted, and so the six-screen
page of SRD-v2 §1.1 survived, folded into a column and stamped legitimate.

That is beat 007's finding for the third time in this project: **a test that asserts the easy
property in place of the claim will pass while the claim is false.** "No undeclared scrollbar" is
easy. "The content fits, and where it does not it is a list and not an argument" is the claim.

## Decision

**The surface is a docked pane workspace — dockview — whose panes fill the screen, and a pane
may scroll a list but never a body of text.**

- **dockview, not golden-layout.** golden-layout is the idiom the author named, but its API is
  imperative DOM and would have to be wrapped into React 19; dockview is React-first and
  TypeScript-native, and is the same idiom.
- **Panes take the space they are given.** A horizon panel is measurably wider at 2560 than at
  the declared minimum. Fixed grid tracks that leave two fifths of an instrument empty are the
  fault this replaces.
- **The list/prose distinction replaces the declared-scroller doctrine.** A profile's levels and
  a manifest may scroll, because they are enumerations a reader scans. An explanation may not,
  because a pane that scrolls an explanation is a page.
- **Each horizon's scores live inside its own panel**, not in a separate region aligned by CSS
  subgrid. FR-46 asks that a score be read as one object with its picture; a score inside its
  panel is that, and it does not depend on two containers agreeing about geometry — which
  independent panes cannot do anyway.
- **The workspace arrangement may persist. A forecast may not.**

## The persistence question, answered rather than assumed

Principle IX says nothing persists between visits, and it was written about runs: a run is a seed
and a manifest, and replay is *re-computation from a manifest*, never restoration from a
snapshot. A persisted run would be a second way to bring a forecast back with none of the
manifest's checks — no code version, no configuration digest, no refusal when the tree has moved.

A persisted pane width is not that. It is a preference about furniture, and it survives a reload
because a reader who arranged their workspace should not have to arrange it twice.

So the constitution now draws the line explicitly rather than leaving it to be inferred — because
a reader of Principle IX could reasonably have inferred the opposite, and one did. The clause is
Principle IX's rather than Principle I's, which this beat's own drafts had it as: *no forecast
input or output persists between visits* is a bullet of *Derived Artefacts, Not Fixtures*, and
"nothing persists" is only how the rule is remembered. What is stored
is held by a key-set test in the same shape as feature 017's address grammar: geometry and pane
identity only, and a planted `seed` fails by name. The two mechanisms that could smuggle a run
out of a session are now guarded the same way.

## What was measured after it was built

The numbers in Context were beat 017's. These are beat 018's, taken from the built workspace
with the same instruments:

- **Dead space at 2 560 × 1 440, row built and scored: 71.9 per cent before, 56.0 per cent
  after.** Measured as the share of an eight-pixel grid over the viewport containing no
  rendered ink — no text, no canvas, no control, no drawn shape, no rule — with clipped and
  unpainted content excluded, and a background fill not counted as ink. What is left is
  reported rather than hidden: a selection pane with nothing selected in it (95.6 per cent of
  its own rectangle), the slack in the controls pane below the last control (74.1 per cent),
  and the band beneath the skill curve (97.6 per cent of 1 750 × 356).
- **That last band is where FR-45 had to overrule the instrument.** Left to fill what the row
  did not use, the skill curve grew to 698 px for six points — taller than the row it
  annotates — and the dead-space figure fell to 42.5 per cent. A stretched plot is ink to a
  grid of cells and is not information to a reader, so the share the curve may take is
  declared (`presentation.workspace.skillCurveFraction`) and the row keeps the dominant space
  FR-45 gives it. The 13.5 points that costs are reported rather than absorbed by a chart.
- **A horizon panel is 190 px at the floor and 280 px at the reference viewport.** Beat 017's
  was 277 px at 2 560 and could not have been anything else: the tracks were fixed.
- **The declared floor came down from 2 038 × 728 to 1 658 × 740.** The width fell because
  828 px of beat 013's floor was chrome declared unshrinkable — two 390 px columns and a 48 px
  gutter — and in a workspace the flanking panes flex to the width below which they cannot be
  *read*. **A 2 000 px window now shows the six-panel row**; on beat 017's head it got the
  fallback, which is what the author's screenshot showed.

  The height is this beat's second pass and its correction. The first declared **960**, which
  is taller than any browser viewport a reader has — a 1080-tall screen gives a window about
  900 px of it — so every ordinary window fell below the floor and met the answer meant for a
  small one. What forced 960 was the controls pane's own content at the 220 px it is narrowest,
  **823 px** of it, and a status strip that wrapped to two rows and took **110**. Neither is a
  quantity: a control surface set at a paragraph's line height, groups separated twice over,
  and a 64-character digest given 22 rem of a strip that then had no room for the statement
  beside it. Set as furniture the controls are **648** and the strip is one row of **66**, and
  the floor measures **1 658 × 740** — below 768, which is the shortest laptop in the matrix.
- **Nothing scrolls at the reference viewport** — not loaded, not with the row built and
  scored, not with a cell selected, not on any of the four provenance tabs, not with a panel
  enlarged — except with a profile pinned, when the selection pane scrolls that profile's
  levels, which is a list. At the declared floor one pane scrolls and it scrolls a list: the
  run's own term list of figures. Across the six viewports of the matrix the tallest scroll of
  any element in any state is **653 px sideways**, at 1 366 × 768, and it is the horizon strip:
  a list of six controls, each held to the width a horizon is legible at rather than squeezed
  until its skill figures truncate.
- **One digest moved**: `configuration`, and only because declared presentation figures
  changed. The other forty are byte-identical.

## Consequences

- **This repository takes its first UI dependency.** dockview and dockview-core. The build stays
  a static page servable from GitHub Pages, and the styles are imported rather than vendored.
- **Ninety-one shell tests were written against the region grid.** Their claims mostly survive
  and their selectors mostly do not; each that loses its subject is recorded against the claim it
  made, as beat 016 recorded the walkthrough's.
- **Explanation left the legend as well as the controls.** The prose test exempted `.legend` as
  a whole block, and the legend beneath the row is a paragraph, so two explanations of twenty
  words each lived inside a class that means *this labels a mark*. Every legend entry is
  counted on its own now. FR-51's requirement that the row *state* it is showing the field
  alone is met by a label of eight words; what the enlarged panel adds is the row's own help.
- **The scorer's statement is behind the disclosure and not over the figures.** FR-008 asked
  for the figure to be the readout and the scorer's words one disclosure away, and a two-line
  sentence drawn above the two figures that said the same thing was the readout-written-as-
  prose the review named. Principle VI is met by the figure: the skill against climatology is
  negative on screen with nothing opened, and a test reads it as a number rather than looking
  for a form of words.
- **The below-the-floor answer was itself two paragraphs of prose**, which is the fault this
  ADR exists to fix, arriving in the one presentation nobody was looking at. It is one line now
  — the size, as the declared figure it is — and the two paragraphs are the walkthrough's.
- **The walkthrough returns**, which beat 016 retired. Both decisions were right about different
  questions: panel help answers *what is this panel*, and a workspace of docked panes raises
  *what am I looking at*, which panel help cannot answer.
- **ADR-0012's diagnosis stands.** Dividing by rate of change — causes, payload, consequences,
  the thing being inspected — is still the right division. What is superseded is the belief that
  a CSS grid with declared scrollers realised it.
- **No computed quantity changes.** G-07 holds that, as it has held every beat since 013.
