# Implementation Plan: The Operational Surface

**Feature**: `018-operational-layout` | **Spec**: [`spec.md`](./spec.md)
**Date**: 2026-09-08 | **Depends on**: 013 to 017
**Stacked on**: beat 017's branch. Supersedes the region-grid half of ADR-0012.

## Summary

The four-region CSS grid becomes a **dockview** workspace: panes with headers, resizable,
re-dockable and tabbable, filling a 2560-wide screen. The controls column stops being a
scrolling article and becomes a control surface; the run's provenance stops being six stacked
disclosures and becomes tabs; the sentences that described state move into the help beat 016
built, and the walkthrough returns as an offer.

## What went wrong in 013, stated plainly

Beat 013's plan wrote: *"Internal scroll is declared, not accidental. A region that may scroll
within itself carries a `data-scrolls` attribute, and the no-scroll test asserts that every
element with a scrolling overflow is one of the declared ones."*

That is a well-tested dodge. The test proves the scrollers were **intended**; it says nothing
about whether the content should have fitted. Measured on beat 017's head at 2560 × 1440, the
controls pane is a 1,344 px scroller — the six-screen page of SRD-v2 §1.1, folded into a column
and declared legitimate. The test passed the whole way.

The lesson is beat 007's, for the third time: a test that asserts the easy property in place of
the claim will pass while the claim is false. "No undeclared scrollbar" is easy. "The content
fits, and where it does not, it is a list and not an argument" is the claim.

So FR-002 splits the two: a pane may scroll a **list** — a profile's levels, a manifest, an
enumeration a reader scans — and may never scroll a **body of text**. The test names which pane
scrolled and what kind of content it held.

## The pane set

| Pane | Holds | Notes |
|---|---|---|
| **Controls** | domain, issue and lead time, observation toggles, quality control and bias, the editors' entry points, run actions | A control surface: grouped, units and declared bounds on every input, no sentences |
| **Horizons** | the six panels, **each with its own scores beneath it** | See below |
| **Selection** | the last selection — a cell's breakdown, or a profile with its ghost | May scroll its level list |
| **Provenance** | the run, what was declared, the instruments, the truth record, the manifest, the deferrals — **as tabs** | The manifest tab may scroll: it is a document a reader copies, not an argument |
| **Status** | the not-operational statement, step time against budget, the results digest | Thin, always visible, never a tab (FR-58) |

**The scores move inside the horizon panel, and this is a correction rather than a compromise.**
Beat 013 aligned scores to their panels with CSS `subgrid` across two regions. Independent
dockview panes cannot share column tracks, so that trick cannot survive — and it should not:
FR-46 asks that a score be read *as one object with its picture*, and a score inside its panel is
that, without depending on two containers agreeing about geometry.

## Decisions this plan makes

- **dockview, not golden-layout.** golden-layout's API is imperative DOM and would have to be
  wrapped into React 19; dockview is React-first and TypeScript-native. Recorded in ADR-0014.
- **Persistence is permitted here, and the constitution now says why.** Principle IX forbids
  persisting **forecast inputs and outputs** — a run is a seed and a manifest, and replay is
  re-computation. Workspace chrome is not a forecast input. The constitution gains that
  distinction explicitly, because a reader of Principle IX could reasonably have concluded the
  opposite, and one did. It is **Principle IX** and not Principle I: the sentence *no forecast
  input or output persists between visits* is a bullet of *Derived Artefacts, Not Fixtures*, and
  this beat's first draft cited Principle I throughout because "nothing persists" is how the rule
  is remembered. The amendment landed where the rule is written.
- **What is persisted is held by a test in the same shape as beat 017's address grammar**: a key
  set, and a planted `seed` fails by name. The two mechanisms that could smuggle a run out of the
  session are now guarded the same way.
- **Every figure keeps its provenance typography and its disclosure.** The scorer's statement is
  not deleted; it stops being the first thing on screen. Beat 017 found three of the four figure
  kinds were distinguished by colour alone — that fix stands and is re-measured here.
- **The prose that leaves goes to help, and is recorded.** `docs/narrative-disposition.json` is
  the record; entries move from `stays` to `help`, and the test that holds it reports any that
  does not resolve.
- **The walkthrough returns to explain the *workspace*.** Beat 016 retired it because panel help
  serves a confused reader better, and that remains true for *what is this panel*. A workspace of
  docked panes raises a different question — *what am I looking at* — which panel help cannot
  answer. Its steps are reclaimed from beat 016's disposition record, and the record says so.

## Constitution Check

| Principle | Touched | How this beat complies |
|---|---|---|
| **IX. Derived artefacts, and nothing persists** | Amended, deliberately | The prohibition is on forecast inputs and outputs. Workspace geometry is neither, and a test proves what is stored carries no run quantity. |
| **V. No figure without its provenance** | Yes | Every figure keeps its kind and its disclosure. Fewer sentences, not less provenance. |
| **VI. The harness can lose** | Yes | A losing score is visible as a figure and the scorer's words are one disclosure away, unsoftened. |
| **X. Declared in configuration** | Yes | Pane geometry defaults, the reference viewport and the minimum are declared, not literals. |

**Result: PASS**, with one amendment to Principle IX recorded in the constitution and in
ADR-0014.

## Risks this plan accepts

- **dockview is the first UI dependency this repository has taken.** It earns an ADR. Its styles
  are imported, not vendored, and the build must stay a static page servable from GitHub Pages.
- **Ninety-one shell tests were written against the region grid.** Their claims mostly survive;
  their selectors mostly do not. Each one that loses its subject must be recorded against the
  claim it made, as beat 016 recorded the walkthrough's.
- **G-07 must stay green.** Rebuilding the surface computes nothing. A moved digest that is not a
  declared presentation figure means a computation was living in the layout.

## Measured

Every figure here came out of the built workspace, at 2 560 × 1 440 with the row built and
scored unless another window is named.

**And that sentence is the beat's own finding.** Two passes measured only at 2 560 × 1 440 and
1 920 × 1 080, which are screen sizes and not window sizes, and declared a floor 960 px tall
that no browser window reaches. Every figure about a *small* window below is now taken at one a
reader has: the declared floor, and the six real viewports of the matrix.

### Dead space, before and after

**71.9 per cent → 56.0 per cent.** One instrument, run against beat 017's head and against this
one at 2 560 × 1 440 with the row built and scored: an eight-pixel grid over the viewport, a
cell counted live if any rendered ink falls in it — a text node's own client rects, a canvas,
a control, an SVG's own shapes, a rule along the edge it is drawn on — with content inside a
`clip-path`, a closed disclosure, a `display: none` or `visibility: hidden` subtree excluded,
because none of it is painted. A background fill is not ink: an instrument that counted one
would report a blank pane as full.

The 56.0 is reported rather than explained away, and the instrument says where it is:

| Where | Of its own rectangle |
|---|---|
| the selection pane, with nothing selected in it | **95.6 %** empty, 470 × 667 |
| the horizons pane, below the skill curve | **97.6 %** empty, 1 750 × 356 |
| the provenance tab in view | 80.7 % empty, 470 × 666 |
| the controls pane, below the last control | 74.1 % empty, 340 × 1 359 |
| the horizons pane as a whole | 45.3 % empty, 1 750 × 1 359 |
| the status strip | 19.6 % empty |

Three of those are states rather than faults. A selection pane is empty because nothing has
been selected, which FR-048 says in nine words; a controls pane that ends is better than one
that pads; a provenance tab is a term list and a term list is mostly the paper between terms.

**The band below the skill curve is the finding, and it is a finding about the instrument as
much as about the surface.** A horizon panel's field is square, so a row of six across 1 731 px
is 525 px tall — 264 px of field and the rest heading, labels and figures — in a pane 1 359 px
tall. Nothing short of a taller row or a grid of three by two uses that height, and a grid of
three by two is not this beat's to choose: ADR-0003 chose one row so that six figures read left
to right show the decay.

This beat's first pass gave the leftover to the skill curve, which grew to **698 px for six
points** — taller than the row it annotates — and measured **42.5 per cent** dead space. The
same tree with the curve at its declared share measures 56.0. So the instrument prefers the
surface FR-045 forbids, and it is worth saying why rather than picking whichever number reads
better: a stretched plot is ink to a grid of eight-pixel cells and is not information to a
reader. **FR-045 decides this, not the instrument** — the row is the payload and takes the
dominant space; the curve takes what six points need, declared as
`presentation.workspace.skillCurveFraction`. The 13.5 points of dead space that buys are the
honest price of it, and they are here rather than hidden inside a chart.

### The floor, re-measured

| | Beat 013 declared | Beat 018, first pass | Beat 018 measures |
|---|---|---|---|
| Floor | 2 038 × 728 | 1 658 × 960 | **1 658 × 748** |
| Of which chrome, in width | 828 px (390 + 390 + 48), unshrinkable | 448 px | 448 px (2 × 220 at the pane minimum, 2 × 4 sashes) |
| Of which chrome, in height | — | 136 px (110 status strip, 26 tab strip) | **92 px** (66 status strip, 26 tab strip) |
| The controls pane's content at 220 px | — | 823 px | **656 px** (648 to the last control, and the pane's own 8 px of bottom padding) |
| A horizon panel at 2 560 | 277 px | 280 px | **280 px** |
| A horizon panel at the floor | 190 px | 190 px | 190 px |
| A 2 000 px window | the fallback | the six-panel row | **the six-panel row** |

The width fell because beat 013's floor was built from the widths the flanking columns *were*,
and a track is that width in every window. The workspace's floor is built from the width below
which a pane cannot be **read** — `workspace.paneMinimumWidthPx` — and the declared widths are
shared down proportionally when a window cannot afford them.

**The height is the figure the first pass got wrong, and the mistake was not in the arithmetic.**
960 was measured honestly from the built workspace; what was never asked is whether a browser
window is ever 960 px tall, and it is not — a 1080-tall screen gives a window about 900 px of it
once the browser's own chrome is taken. So the floor was above every real viewport and every
real reader met the answer below it.

What actually forced 960, measured pane by pane at the floor's own width:

| | First pass | Now |
|---|---|---|
| The controls pane's own content, at the 220 px it is narrowest | **823 px** | **656 px** |
| The status strip, which wraps | **110 px** (two rows) | **66 px** (one row) |
| The dockview tab strip | 26 px | 26 px |
| The floor's height, which is their sum | 959, declared 960 | **748, declared 748** |

Neither of the two is a computed quantity and neither was a requirement. The controls pane was
set at the body's line height of 1.5 — a rule for a paragraph somebody reads, where a label, a
button and a readout are read one at a time — and its groups were separated twice over, by a
rule and by a gap. The status strip gave 22 rem of its width to an ellipsised 64-character
digest, which at the floor's width left no room for the statement beside it, so it wrapped and
took 110 px of a window that has 768. Set as furniture the controls are 648 px and the strip is
one row, and **no control, label, unit or declared bound left the pane**: the same seven groups
are there, and the digest is still there, ellipsised at 8 rem instead of 22 with the whole of it
on the manifest tab where a figure somebody copies belongs.

`presentation.workspace.provenanceFraction` is **not** among the causes, and it is worth saying
because it was the first suspect. The provenance pane's content is a term list that scrolls, so
it fills whatever height it is given and never asks for more; the selection pane's content is
89 px. The controls pane is the only pane on the vertical axis with a floor of its own.

Measured from the built workspace by `tests/shell/viewport-floor.spec.ts`: **1 658 × 748**, and
declared 1 658 × 748. Walked down by hand at the floor's width with the row scored, the workspace
holds at 748 and the controls pane clips below it — which is what makes 748 the floor rather than
a comfortable number.

**740 stood here for one pass and was 8 px short**, because the measurement stopped at the last
control's bottom edge and a pane needs its own bottom padding too. The census in
`tests/shell/census.ts` reported it as what it is — `scrollHeight` 656 in a `clientHeight` of
648 — and the fifth pass below records how.

**The floor's width is what decides what the centre holds, and its height is not.** Six panels
at `minimumPanelWidthPx` need width; a short window is short of height, and height is not what
makes a row of six unreadable. That is measured too: forced to one horizon at 1 658 × 735 the
horizons pane overflowed by 970 px, where the row it replaced fitted with the controls pane five
pixels over. So `useRoomForTheRow` is a media query on **width alone**, in CSS pixels, so the
centre swaps on the crossing and a reader at 200 per cent zoom gets the answer their pixel count
deserves. The author's window was the case that mattered: a 2 000 px monitor got beat 017's
fallback and gets the row here.

### The row, and the curve beneath it

| | First pass | Declared |
|---|---|---|
| A horizon panel, at 2 560 × 1 440 | 561 px tall | **525 px** |
| The skill curve beneath the row | 694 px | **403 px** |
| Of the horizons pane, 1 359 px tall | the curve took 51 % | the curve takes **30 %**, declared |

The panel lost 36 px because the scorer's statement left it for the disclosure, which is the
same move FR-008 asked for. The curve lost 291 px because FR-045 gives the dominant space to
the payload and a six-point line is not the payload.
`tests/shell/viewport-floor.spec.ts` asserts both: the curve is within its declared share, and
a horizon panel is taller than the curve beneath it.

### What scrolls, and what it holds

Every element with a scrolling overflow, in every state the census could reach — loaded, the
row built, scored, a cell selected, each of the four provenance tabs, a panel enlarged, a
profile pinned, and every disclosure forced open.

| Viewport | What scrolls | List or text |
|---|---|---|
| 2 560 × 1 440 | **nothing**, in every state above but one | — |
| 2 560 × 1 440, a profile pinned | `selection` → the level list | **list** — *a profile's levels, measured against the model's derived ones*; an Argo profile carries hundreds |
| 1 658 × 748, the declared floor | `provenance/run` → its own `dl`, and the manifest itself on its tab | **list** — *the run's own figures, one to a line*; **list** — *the manifest, as a reader copies it* |
| 1 366 × 768, below the width the row needs | `provenance/run` → its own `dl`, and the horizon strip sideways | **list** — *the run's own figures, one to a line*; **list** — *every declared horizon, as controls* |

Nothing scrolls a body of text at any of them. `tests/shell/one-view.spec.ts` also fails on a
pane that **clips**, which beat 013's test could not see at all: `overflow: hidden` produces no
scrollbar for a scrollbar test to catch, and that is exactly how a surface that does not fit
hides.

**Two rows of this table used to say something else, and what they said was the defect.** They
were *900 × 700, below the floor → the body of panes, one under another → **list** — the panes,
one under another*, and the same window with a panel enlarged. Stacking a whole application
vertically and scrolling it is not a list; it is the page, and calling it a list is how a
6,584 px column passed a test written to forbid exactly that. The column is deleted, so the rows
are gone rather than corrected, and 900 × 700 is not a window a reader has anyway.

### What the lower floor costs, said rather than absorbed

At **exactly** the declared floor the skill curve is 109 px tall, and six value-axis labels in
109 px overlap into a smudge. That is the honest price of a floor 220 px lower than the last
one, and it is the floor rather than the surface: at 1 920 × 900 — the shortest window in the
matrix that carries the row — the curve is 169 px and its axis reads cleanly, and at the
reference viewport it is 403. The row, the panels and every figure are legible at the floor;
the aid to reading them is cramped there. FR-045 says which of those may give way.

### The matrix, at the sizes a reader has

`tests/shell/viewport-matrix.spec.ts` walks the six viewports declared in
`tests/shell/declared-geometry.ts`, in five states each — loaded, scored, a cell selected, and
each of the three provenance tabs it has to select to reach. Every one of them renders the
**workspace**; none of them scrolls the document on either axis; nothing is clipped.

| Viewport | Workspace or fallback | The centre holds | Document scrolls | Tallest scroll of any element | A list? |
|---|---|---|---|---|---|
| 1 366 × 768 | **workspace** | one horizon and the strip | no | **653 px**, sideways — the horizon strip | yes: *every declared horizon, as controls* |
| 1 536 × 864 | **workspace** | one horizon and the strip | no | **483 px**, sideways — the horizon strip | yes: *every declared horizon, as controls* |
| 1 920 × 900 | **workspace** | the six-panel row | no | **0 px** | — |
| 1 920 × 1 080 | **workspace** | the six-panel row | no | **0 px** | — |
| 2 560 × 900 | **workspace** | the six-panel row | no | **0 px** | — |
| 2 560 × 1 440 | **workspace** | the six-panel row | no | **0 px** | — |

The second-tallest at 1 366 × 768 is `provenance/run`'s own term list, 43 px. Both are lists a
reader scans and both say which list on the element; nothing at any of the six scrolls a body of
text, and nothing at any of the six is clipped.

**The strip's sideways scroll is a decision and not a leftover.** Its slots were `min-width: 0`
and shared the pane's width equally, so at 1 366 px six of them squeezed until each horizon's two
skill figures read `0.0` and `-2.` — a truncated figure, which is worse than a scrollbar on a
list of six controls. A slot may not go below `minimumPanelWidthPx`, which is the width a horizon
is legible at and the figure the row itself is built from; six of them do not fit a 548 px pane,
so the strip scrolls, which FR-049 has always allowed it to do.

On this beat's first head, four of those six were the stacked column: 6,515 px in a 428 px box
at 1 366 × 768, 6,565 in 524 at 1 536 × 864, and 6,584 in 560 at both 1 920 × 900 and
2 560 × 900. The two that were not are the two the surface had been measured at.

### Two faults the matrix found, both of them older than it

Neither produced a scrollbar, which is why the census measures clipping and not only scroll.

- **The enlarged panel's depth elevation was given its intrinsic height.** `.elevation svg` is
  `width: 100%` with a viewBox of 100 × 170, and `height: auto` on a replaced element with an
  intrinsic ratio means *width ÷ ratio*: at the 823 px the aside has in a 1 210 px pane, 1 398 px.
  It was laid out **879 px below the pane** and painted nowhere, and its depth labels — placed at
  `yOf(depth)` pixels, in the viewBox's own coordinates — sat in the top eighth of it, naming
  depths the lines beside them were not at. The drawing fills the box it is given now, on both
  axes, and the labels are placed as a share of it, which `preserveAspectRatio="none"` makes
  exact.
- **The skill curve could be crushed below its own heading and caption.** It is `flex: 1 1 auto`
  so it can shrink and let the row keep its room, and `min-height: 0` let it shrink to 30 px in a
  636 px pane — with the caption laid out 17 px below the pane and hidden by the `overflow` that
  was there to protect the layout. Its minimum is `min-content` now, which is the heading and the
  caption: the plot contributes nothing to it, because `contain: size` says what the component
  already assumed — it is measured by a `ResizeObserver` and drawn at whatever size it is given,
  so the `svg` carrying the last frame's size as attributes must not be what decides the next
  one.

**One thing the census turned up that the layout manager does, and that a later beat should
know.** A dockview tab that is not active stays laid out underneath the active one — same
rectangle, `display: block`, `visibility: visible` — and its boxes are squeezed rather than
sized. So a census that walks the tabs sees the *previous* tab's elements as well as the
current one's, and two of them report an overflow that no reader can see: the manifest tab's
two-term list of build and digest, and its paste box. Both are a list and a control rather than
a body of text, and neither is on screen. They are not counted above and `one-view.spec` does
not measure them, for the reason the rest of that file gives: measuring what is not painted is
measuring something no reader can see.

### Sentences left on the surface

**Zero**, outside panel help, the walkthrough and the statement of FR-58, measured by
`tests/shell/prose.spec.ts` in seven states. Beat 014's test exempted "any block that carries a
figure", which is how the two sentences the author's review named survived four beats; that
exemption is gone, and a block is counted when more than eight words remain after every
figure's own text is removed.

**And a second exemption went the same way, one pass later.** `.legend` was exempt as a whole
block — a legend labels marks, which is true of a legend — and the legend beneath the row is a
`<p>`, so the exemption covered everything inside it. Two explanations of twenty words each
lived there through this beat's own first pass:

> *the row shows the field alone at this size: the attribution layer and each measurement at
> the depth it reached are drawn in the enlarged panel*
>
> *the same field on every panel: this run analyses once, at 2026-09-08T09:00:00.000Z.
> Attribution becomes per horizon when the forecast cycles.*

That is beat 014's mistake in a smaller box: a class that means *this is allowed* rather than a
count of what is in it. Every **entry** of a legend is now counted on its own against
`LEGEND_WORDS`, ten, and the paragraph stays exempt because the paragraph is only its entries.
Five clauses moved as a result and each has an entry in `docs/narrative-disposition.json`: two
to `centre/attribution`'s help, one to `centre/horizon-row`'s, and two dropped with a reason
because the thing they explained says it itself. What is left in the legend is a label of eight
words and one of six.

FR-051 and FR-007 both hold across that move, which took reading them as asking different
things. FR-051 requires the row to **state that it is showing the field alone**, and it does:
*field only — depths in the enlarged panel*. What the enlarged panel adds, and that enlarging
changes what is shown and never what was computed, is an explanation, and explanation is help's.

The scorer's statement moved too, and did not leave the surface: FR-008 and US4 asked for the
figure to be the readout and the scorer's own words one disclosure away. *better than
persistence by 0.0 per cent; worse than climatology by 208.8 per cent* was a two-line sentence
drawn **over** the two figures that say the same thing. It is the first line inside *Where this
figure came from* now, byte for byte as the scorer produced it. Principle VI is unmoved and is
asserted where it belongs: `tests/shell/figure-kinds.spec.ts` reads the skill against
climatology as a **number** with nothing opened, requires it to be negative, and requires the
statement not to be visible until the disclosure is.

### The mask, and a claim beat 016 deleted coming back with a subject

The fourth pass reverses this beat's own decision that nothing would be covered by a scrim. The
old rationale was written into `Walkthrough.tsx` — *"nothing is covered by a scrim. A reader may
drag the …"* — and it is not left standing beside the thing that contradicts it; it is replaced
by what the module now does and why. The author's direction is the reason, and the reason behind
the reason is that *what am I looking at* is answered by suppressing what you are not looking at.

**Beat 016 struck out a test called `rings the panel its step is about, not some other part of
the page`, and recorded against it: "Gone. There is no spotlight."** There is one again, so the
claim comes back with its subject and to the same tolerance that beat asserted — two pixels.

| | Measured |
|---|---|
| The hole against the named pane's own rectangle, at all **7** steps | worst edge **0.36 px** out, against a stated tolerance of 2 |
| The margin between lit and dimmed, through `grayscale(1)` | the lit pane's paper **255.0** of 255, the dimmed pane's **110.0**, margin **145.0** against a declared 40 |
| Regions moved by opening the walkthrough, and by each of the six advances after it | **none**, to the pixel; the page grows on neither axis |
| The card, at the reference viewport | beside the pane at every step: `status: above; controls: right; horizons: right; selection: left; provenance: left` |
| The document, with a step open, at 1 366 × 768 and 2 560 × 1 440 | does not scroll on either axis, at any step |

The hole is measured from the pane at the moment the step is shown and re-measured on every
layout event the workspace can produce, so it follows the pane through a **sash drag** and a
**window resize** (a `ResizeObserver` over the pane and the dock) and through a **tab moved into
another group** (a `MutationObserver` over the dock's subtree — the layout manager builds new
elements for a moved tab, and an observer still watching the old one is watching nothing). All
three are asserted in a browser, each after waiting for the pane to have actually moved: the
layout manager measures its container asynchronously, and a rectangle read in the same task as a
resize is the rectangle before it.

**Three things this pass had to decide, and each is a cost rather than a free win.**

- **The hole is the pane's group, tab strip and all.** The element carrying `data-pane-id` is the
  pane's *body*; the layout manager puts its tabs in a strip 26 px above it. Lighting the body
  alone would leave a step about the provenance pane saying *the run, the instruments, the record
  and the manifest, **as tabs*** with the tabs unpressable, and "the lit pane stays operable" is a
  requirement. Nothing is guessed: the strip belongs to an element with a rectangle of its own,
  and a pane with no group — the status strip, which is not in the dock — is lit as itself.
- **A reader cannot move a tab while a step is open**, because the source or the target is
  dimmed, and a scrim that let them would be masking nothing. The layout manager's own sashes sit
  *above* the scrim by its own stacking, so resizing a pane still works — which matters, because
  the walkthrough's last step is the one that tells a reader to do it. The tab-move test is the
  one place in `walkthrough.spec.ts` that reaches past what a reader can do: it tells the scrim to
  ignore the pointer for the length of the drag, and says so, because what is under test is
  whether the mask re-measures and not the pointer path.
- **Nothing animates, in either media state.** A mask that slid between steps for a reader who had
  expressed no preference would be the first thing on this surface that moved — beat 017 holds
  "nothing animates" as one claim over every element — so the test asks under `reduce` *and* under
  `no-preference`.

**A defect the no-reflow test found on its first run, which had been in the tree since the
walkthrough returned.** The offer's label went from *Walk me through the workspace* to *Close the
walkthrough* when it was pressed. It is in the status strip; the strip's height is what the dock
does **not** get; and at the declared floor the shorter label let the strip reflow by 11 px, so
**every pane in the dock moved** on the click that opened a walkthrough whose whole claim is that
it moves nothing. Both labels occupy the same grid cell now, one of them hidden, so the control is
one width in both states. Nothing about the words changed.

### The digests

**One moved: `configuration`.** Forty others are byte-identical, seed unchanged. The
configuration digest is over the whole file, and what changed in it is `presentation` alone:
the reference viewport, the floor, the two pane widths, the gutter, the new `workspace` block,
`workspace.skillCurveFraction` in the pass that rebalanced the row against the curve, and
`minimumViewportHeightPx` in the pass that brought the floor down from 960 to 740. That third
pass moved **one figure and nothing else** — the diff on `config/j-ocean.json` is a single line
— and every other change it made is stylesheet, markup and test. No computed quantity moved,
which is what G-07 exists to say.

The fourth pass moves the same digest and no other, for the same reason: `presentation.workspace`
gains the mask's four figures — `walkthroughMaskOpacity`, `walkthroughCardWidthPx`,
`walkthroughCardMinimumHeightPx` and `walkthroughCardGapPx` — because a dimension or a colour the
surface needs is declared and never a literal in a stylesheet (Principle X). A mask computes
nothing, so nothing computed moved.

### The shell tests that lost their subject

Ninety-one shell tests were written against the region grid, and there are **131** now. Their
claims mostly survived and their selectors mostly did not: `region-controls` became `pane-controls`, `region-centre` became
`pane-horizons`, `region-detail` became `pane-selection`, and four disclosures became four tabs.
Those are repointings and are not recorded here. **Eight lost their subject outright**, and each
is recorded against the claim it made:

| The test | The claim it made | What happened to it |
|---|---|---|
| `one-view` → *is four named regions, and each score is in its own panel column* | A score's box shares a **column** with its panel's, structurally, by CSS `subgrid` across two regions | The subject is gone: independent panes cannot share tracks. The claim is stronger where it now lives — *draws each panel's score inside that panel, beneath its own picture*. A box inside another box cannot be under the wrong one. |
| `shell` → *the scores region says where the figures will appear before the row is scored* | An empty region says what would appear in it (FR-048) | The scores region is gone. Each panel says *not scored yet* for itself, which is the same fact said by the thing it is about, and the disposition record carries the sentence as `dropped` with that reason. |
| `panel-help` → *the walkthrough is gone from the surface* | Panel help does not sequence a reader (FR-052) | The subject came back. The claim is asserted where it is still true — *leaves panel help with nothing that sequences a reader* — and the walkthrough is held to its own requirement in `tests/shell/walkthrough.spec.ts`. |
| `addressable` → *reaches every control, in an order that follows the four regions* | The tab order does not go back on itself between regions | The fixed list of four regions in a fixed order cannot be promised by a workspace a reader may rearrange — and should not be: moving a pane moves where it comes in the reading order. The claim is now stated without the list: each pane is one contiguous run of tab stops. |
| `addressable` → *the disclaimer is in the controls region* | FR-58's statement is on the surface and not behind anything | It is in the status strip, which is **not a pane** — outside the dock, unclosable, untabbable. The claim is the same and is stronger: on beat 013's surface nothing could remove it because there were no controls to remove one with; here it is outside the dock by construction. |
| `addressable` → *distinguishes the four figure kinds by something other than colour* | A monochrome print says which kind a figure is | Moved to `tests/shell/figure-kinds.spec.ts` and given a second half: beat 017 read the **stylesheet**, and a print is made of pixels, so each kind is now photographed through a saturation filter and compared on ink, underline and lean. The stylesheet check is kept beside it; the two fail on different mistakes. |
| `shell` → *writes nothing to storage, in a whole visit* | NFR-02, measured rather than promised: the storage APIs are replaced before the page loads and any write is recorded | The claim was true only while the surface had no furniture to remember. A reader who drags a sash and comes back to a different arrangement has been given a layout manager and denied the only thing one is for, so the constitution's amended Principle IX allows exactly one thing to persist and the test is narrowed to it: *writes one key and no other storage*. Every part is still measured — one key, and it is the key configuration declares; no cookie, no IndexedDB, no session storage, nothing in the address. What is **inside** that key is `tests/shell/workspace.spec.ts`. |
| `shell` → *the skill curve is behind a disclosure* | The curve is an aid to reading the figures, not the figures | The disclosure is gone. Beat 013 disclosed it because at the width six panels take it would have been a small picture in a band of empty paper; in the horizons pane it has the row's own width and a **declared** share of the height, ruled, with a value axis and a tick per declared horizon. The claim survives in the share: an aid to reading is smaller than the thing being read, and `viewport-floor.spec` measures the two rectangles. |

**The third pass killed two more, and both died with the stacked column.**

| The test | The claim it made | What happened to it |
|---|---|---|
| `one-view` → *holds the same discipline below the declared floor* | The below-the-floor presentation — every pane in one column, the column scrolling — is held to the same census as the workspace, at 900 × 700 | The subject is gone: there is no second presentation to hold. What the test was *believing* is the defect — the column declared itself `data-scrolls="list"`, `data-list="the panes, one under another"`, and the census passed it as a list. The claim survives without its subject and is stronger for it: *is the same workspace below the width the row needs*, at 1 366 × 768, asserting the dock is there and `below-floor-body` is not. |
| `viewport-floor` → *offers the single-panel presentation, with the strip and the scores* | Below the floor every pane is still present and named, in one column, with `pane-provenance` holding four sections | Half its subject is gone. One horizon and the strip survive and are asserted where they were; `pane-provenance` does not, because the provenance is four tabs at every viewport now rather than four sections stacked below the floor. The test asks for `pane-provenance/run`, which is the tab, and adds what the old claim could not make: the dock is on screen and the stacked column is not. |

**The fourth pass killed one, and it died with the decision it was holding.**

| The test | The claim it made | What happened to it |
|---|---|---|
| `walkthrough` → *names a pane that is on the surface at every step, and leaves the run usable* | Half of it: every step resolves to a pane the layout draws. The other half: *"The run underneath is still usable with the card open: nothing is behind a scrim"* — the `advance` control, in the controls pane, is clicked with a step about the **status** pane open, and the run steps | The second half's subject is the decision this pass reverses, at the author's request, so it is gone rather than corrected: a reader may no longer act on a pane they cannot see, and that is the point of the mask. What replaces it is the half of "not modal" that is still true and now matters more — `walkthrough` → *leaves the lit pane operable, and the dimmed surface not*, which walks to the step about the **controls** pane, asks the browser what the pointer would reach at the middle of every pane, and then clicks `advance` for real. The first half moved into `lights the pane its step is about at every step`, where it is asked of the same step as the mask. |

The four tests this beat's second pass repointed are repointings and are recorded as such: the
legend assertion in `shell` → *draws attribution that survives having its colour removed* now
looks for the label rather than the explanation and measures the claim on pixels as it always
did; `enlargement` → *says what the row shows* looks for FR-051's label; and both `shell` →
*never shows an error figure without two references* and `figure-kinds` → *keeps the scorer's
own words one disclosure away* open the disclosure before looking for the statement, which is
where FR-008 put it. None of them lost its subject; each is asserting the same claim about a
surface that says it in the place the requirement asks for.

### The panes the built surface disagreed with

The plan's pane set was Controls, Horizons, Selection, Provenance-as-tabs and Status, and the
provenance was to be six tabs: the run, what was declared, the instruments, the truth record,
the manifest and the deferrals. It is **four**, and the two that are missing are missing for
reasons the surface made plain:

- **"What was declared" is not a tab, because there is nothing to put in it.** Beat 014 sent
  its two figures — the declared grid and the declared epoch — into the run's own list, where
  they sit beside the computed cell size and the largest stable step they are to be read
  against. A tab holding two figures already on another tab would be the second source for one
  fact that FR-55 forbids.
- **"The deferrals" left the application in beat 014** and are a page of the site. Bringing
  them back as a tab would undo that beat, and the link to them is in the status strip.

One thing the plan did not name and the surface asked for: **the status strip is not a pane.**
FR-58 says the statement that j-ocean is not an operational forecast system is visible without
interaction and is not the thing moved behind a control, and every dockview panel can be
closed, tabbed behind another or dragged into a corner. So it is outside the dock, and there is
no arrangement a reader can reach in which the statement is not on screen.

### The fifth pass: a census with no threshold, and the flake that was not one

The fourth pass reported, of `viewport-matrix.spec.ts`, *"one pre-existing flake:
`provenance/manifest / dl scrolls vertically, declaring null` at three viewports … marginal and
pre-existing, not caused by this change"*, and left it standing. **That claim was wrong on both
counts and it is corrected here rather than deleted.** The manifest tab's term list has
`scrollHeight` **59 px** at every viewport in the matrix; only the window it is given varies —
**12, 20, 20, 30, 23 and 53 px** at 1 366 × 768, 1 536 × 864, 1 920 × 900, 1 920 × 1 080,
2 560 × 900 and 2 560 × 1 440. The code version and the results digest were cut off at all six.
It looked intermittent because the census read the pane in the same task as the click that
opened its tab, and the layout manager mounts a panel asynchronously: what was measured at the
other three viewports was the tab that was closing. Nothing about it was marginal, and calling a
finding a flake is how a defect gets a second beat.

**A threshold is the wrong instrument for this property**, which is why the census now has none.
The fourth pass counted only elements whose computed `overflow` was `auto` or `scroll` — a filter
on the declaration and not on the fact. An element that runs past its box with `overflow:
visible` spills onto whatever is beside it and one with `hidden` cuts its content off, and
neither had a scrollbar to count.

#### What the census walks, and what it decides

Every element on the surface, at every viewport in the declared matrix, in every state the
suite reaches — loaded, the row built, scored, a cell selected, each of the four provenance tabs
with the pane the tab names waited for, the manifest tab with its paste box open, the
walkthrough on each of its steps, the over-budget notice and the configuration refusal. Anything
whose content runs more than **1 px** past its own client box on either axis is reported, and
`tests/shell/census.ts` then decides, in code, which of three things it is. There is no fourth.

| Element | Over its box | Verdict, and why |
|---|---|---|
| `provenance/manifest` → `pre[data-testid="manifest"]` | vertically, 124–559 px | **a declared list** — *the manifest, as a reader copies it* |
| `provenance/run` → its own `dl` | vertically, 43–328 px | **a declared list** — *the run's own figures, one to a line* |
| `horizons` → `div[data-testid="horizon-strip"]` | horizontally, 483–653 px | **a declared list** — *every declared horizon, as controls* |
| `selection` → the level list, with a profile pinned | vertically | **a declared list** — *a profile's levels, measured against the model's derived ones* |
| `horizons` → six `ul.mark-list`, and their `li` | both axes, up to 1 343 px | **exempt** — the marks as text: 1 px square under `clip-path: inset(50%)`, in the accessibility tree and painted nowhere, because a canvas says nothing to a reader who cannot see it |
| `.dv-live-region` | both axes, 106 px | **exempt** — the layout manager's own visually hidden live region, clipped to nothing |
| `.dv-tabs-container` | horizontally, 31–273 px | **exempt** — the layout manager's tab strip. Four provenance tabs need 464 px and the strip is 374 px at 1 920 × 900; it scrolls as a list of tabs on dockview's own 4 px scrollbar. Measured: a wheel over the strip moves it to `scrollLeft` 90 and the Manifest tab comes fully inside the box |
| `.dv-default-tab` | vertically, 2 px | **exempt** — an 18 px line box in a 16 px content box: the label's leading, not a glyph. The strip is 26 px tall and the overlap census measures the text rather than the box |
| `status` → `dd[data-testid="status-digest"]` | horizontally, 232–236 px | **exempt** — 64 hexadecimal characters ellipsised to 8 rem, on purpose and since the figure arrived. A reader compares two visits and a prefix compares as well as the whole; the whole of it is on the manifest tab |
| a closed `details` and its contents | either axis | **exempt** — the engine hides a closed disclosure with `content-visibility`, not `display: none`, so its boxes are measurable and painted nowhere. Nothing needs this entry today; it stays because the state worth measuring is the **open** one, and `one-view.spec.ts` opens the paste box at the floor and censuses that |

Each exemption carries that reason in the list itself, and one that does not excuses nothing:
`one-view.spec.ts` → *gives a written reason for every exemption the census applies* names any
entry whose reason is under 60 letters, and the census drops it, so the element it names is
reported as a defect until somebody writes down why it is not one.

#### The defects, and what each turned out to be

| Where | What the census said | What it was, and the fix |
|---|---|---|
| `horizons` → `figure.analysed-field`, and the `figure.field` inside it | horizontally by **93 px**, at every viewport (351 in 258 at 1 366, 446 in 353 above it) | `.analysed-field .field` was `display: flex` with no direction, which is a **row**: the field's own label and colour scale were laid out *beside* the picture, 93 px outside the figure, and painted over the term list in the next column. A column, and the label is back under the picture |
| the same figure | not an overflow at all | the picture was **letterboxed**: 353 × 726 with a square canvas `object-fit: contain`'d in the middle third, and an overlay canvas whose coordinates no longer matched the picture a reader clicks. `container-type: size` on the figure and `min(100cqw, 100cqh - var(--field-label-height))` on the stack make the box the square itself — 258, 633 and 903 px at the three widths measured, with no band above or below |
| `provenance/manifest` → its own `dl` | vertically, 59 px in 12–53 | the two terms shrank because every provenance term list is `flex: 0 1 auto`. On this tab they are a fixed pair and the document below them is the declared scroller, so the pair keeps its height and the document gives way |
| `status` → `dd[data-testid="step-time"]` | horizontally by **65 px**, in the over-budget state | the 8 rem ellipsis was written against `.status-figures dd`, so the step time was ellipsised too — and what fell off the end of *1.234 ms/step **over** 16 ms* was the word that says whether the frame budget was met. A prefix of a digest compares; a prefix of a verdict is a different verdict. The cap is now written against the digest alone |
| `controls` → the pane itself | vertically by **8 px** at the floor | the pane's own **bottom padding**. `viewport-floor.spec.ts` measured the floor to the last control's bottom edge, so the declared height was 8 px short of the pane's content box: the last control sat flush against the pane's rule and 8 px more content would have been cut. The measurement now includes the padding and the declared floor is **1 658 × 748** |
| `provenance/manifest` → `textarea[data-testid="manifest-input"]` | vertically, 30 px in **13** | uncovered by the fix above: with the term list holding its height, the paste box became the thing that shrank. It keeps the three rows it declares, and the tab was then 421 px of content in a 311 px pane |
| `provenance/manifest` → `div.row-controls` | horizontally, 253 px in 209 | at the floor every pane is at `paneMinimumWidthPx`, so this tab is 220 px wide; a flex item's `min-width: auto` is its longest line, so *Download this manifest* hung 44 px outside the pane rather than wrapping. Below 340 px of tab the controls are set at the strip's size and may shrink, the file control is capped to the box, and the term list puts its label above its figure |
| the skill curve's value axis | 21 × 6 px of one label on the next, six times | found by the **overlap** census in the scored state once the floor grew by those 8 px: `TICKS` was 5 whatever the band's height, and the band the row leaves at the floor is 66 px. The axis now carries as many gridlines as can be read at the tick text's own line height |

#### The overlap census, which is a different question

An element can overflow without landing on anything, and a placed element can land on its
neighbour without overflowing anything. The author found the second kind by looking at the
surface — *"on App load, the Horizons panel has text overwriting other text"* — on a tree whose
overflow census was green. So the census asks both, and it asks the overlap of the **words**:
one `Range` per text node gives a rectangle per painted line, cut down by every clipping
ancestor, because what a scroller or an ellipsis does not paint cannot land on anything.

Measured on the boxes instead, the same walk reported six help controls painted over six score
figures, which is a `dd`'s whole grid cell and not its digits — a false positive that would have
bought the instrument's honesty for nothing.

What it found, before the fixes above, at every viewport in the matrix and on arrival:

| Painted over | By | How much |
|---|---|---|
| `dt` *Influence radius*, *Observations used*, *Excluded, still drawn*, *Cells clamped* | the analysed field's own label | 71 × 24 px each, 71 × 48 at 1 366 × 768 |
| `p[data-testid="row-invitation-statement"]`, and the declared horizons in it | the same label | 71 × 16 px |
| `dt` *Observations used*, *Excluded, still drawn* | the field's colour scale | 71 × 16 px |
| the *Download this manifest* control | the manifest tab's two clipped figures | 120 × 2 px — the same defect as the term list above, seen from the other side |

It is green now, in every state the suite walks, at every viewport in the matrix.

#### Watched failing, one class at a time

Each of the three outcomes was planted and watched, and then removed:

- **a defect.** `.status-figures dt { max-width: 12px; overflow: hidden }` →
  *in the "loaded" state these run past their own box … `status / dt overflows horizontally:
  scrollWidth 52 in clientWidth 12, scrollHeight 47 in clientHeight 47 (declaring null)`*
- **an overlap.** `[data-testid="row-invitation-statement"] { position: relative; top: -28px }` →
  *in the "loaded" state two pieces of text are painted on top of each other … `h2 "Horizons" is
  painted over p[data-testid="row-invitation-statement"].region-empty "Panels at, once the row is
  built.": 47 x 15 px of them intersect*
- **an exemption with no reason.** `because: 'deliberate'` on the digest → both halves fired:
  *these exemptions carry no reason a reader could review … `the status strip's digest`*, and the
  digest itself reported as *`status / dd[data-testid="status-digest"].computed overflows
  horizontally: scrollWidth 360 in clientWidth 128`*
- **a list that does not say which list.** `data-list=""` on the manifest → *in the "the Manifest
  tab" state these declare themselves lists and do not say which list …
  `provenance/manifest / pre[data-testid="manifest"]`*

And once more against the defect itself rather than a plant, because the overlap census exists to
catch a thing the overflow census was green on. The old stylesheet was put back and its 93 px of
overflow **excused** with an exemption — the excuse a threshold, or an exemption nobody read,
would have given it — and the overlap census failed anyway, on the words:

> in the horizons pane, `figcaption.figure-label` *"Weight carried by observations in each c"* is
> painted over `dt` *"Influence radius"*: 63 x 10 px of them intersect … over
> `p[data-testid="row-invitation-statement"]` *"Panels at, once the row is built."*: 47 x 9 px …
> `span.scale` *"01.00"* is painted over `dt` *"Observations used"*: 24 x 4 px

#### The floor, and the digest that moved

`presentation.minimumViewportHeightPx` is **748**, and the tables above are corrected to it: the
8 px is the controls pane's own bottom padding, which the floor's measurement had left out. They
were right about everything except that omission, and the sentence that used to say the workspace
holds at 740 says 748.

`presentation.fieldLabelHeightPx` is **72**, and it is new. A container query can ask the box
how wide and how tall it is; it cannot ask how tall the words under the picture came out, so the
room the field's label needs is declared like every other length in this layout (Principle X).
Measured: the label and its scale are **46.4 px** at every viewport in the matrix and **66.8 px**
in a column of 230 px or narrower, where the label wraps to a second line. A reserve too small
puts the label on the caption below it, and the overlap census fails by name.

Both are presentation figures and neither computes anything. G-07 records one digest moved —
`configuration`, `5bac990a…` → `daeafe80…` — and the other forty quantities are byte-identical.

#### One thing judged and left

The pre-row centre shows the word *Horizons* twice: on the pane's own tab, and on the head of
the column of figures beside the picture. The head is a `PanelHead`, which is how a panel's help
control is drawn and how G-08 pairs a declaration with the surface that draws it, so removing
the heading would remove the help (FR-052) and the gate would fail on the pairing. It is left,
and recorded here rather than fixed quietly. What did go is the field's **second** label: the
figure carried *Weight carried by observations, per cell* over the field's own *Weight carried by
observations in each cell*, which was invisible only for as long as the stylesheet was laying the
field's label out sideways.

### The sixth pass: a control that advanced sixteen hours and forty-eight minutes

The author pressed *Integrate 12 hours* at 1 792 × 880, was shown the over-budget notice, pressed
*Integrate anyway*, and reported the only thing the surface let them see: *"it let it run for a
couple of seconds, but got no confirmation that it had completed."* Read off the run's own
figures, the missing confirmation was the smaller half.

| | Steps | Valid at | |
|---|---|---|---|
| before | 0 | 2013-09-01T00:00:00.000Z | step time not yet measured |
| after the press | 72 | 2013-09-01T04:48:00.000Z | the over-budget notice, and 1.042 ms/step |
| after *Integrate anyway* | **252** | **2013-09-01T16:48:00.000Z** | **16 h 48 min under a control labelled 12** |
| pressed a second time | **504** | 2013-09-02T09:36:00.000Z | 33 h 36 min for two presses of twelve hours |

**The probe kept the steps it never counted.** `integrate` advanced a chunk in order to time it,
*then* asked whether the projected time for the longest declared horizon was inside the frame
budget. On a refusal it returned — leaving those 72 steps applied — and *Integrate anyway* then
began a fresh `done = 0` and took a whole `stepsPerAdvance` from wherever the probe had left the
run. 72 + 180 = 252 steps at the declared 240 s timestep. `chunkSteps` is 72 and the advance is
180, so the arithmetic is exactly a chunk over on every refused advance.

The chunk is counted now rather than thrown away: throwing it away would do the same work twice
and drop the yield NFR-04 asks for. `src/harness/advance.ts` holds an advance as the step the run
is going **to**, `view.advanceToStep` carries that target across the reader's decision, and
resuming finishes the remainder. Measured, on the same window:

| | Steps | Valid at |
|---|---|---|
| press, refuse, proceed | **180** | **2013-09-01T12:00:00.000Z** |
| and again | **360** | **2013-09-02T00:00:00.000Z** |
| one press with the budget met, and a second | 180, then 360 | the same two instants |

Pressing *Integrate 12 hours* again while a refusal is standing continues the advance it refused
rather than adding another twelve hours to it, so no sequence of presses can put the run past
where the last press said it would be.

#### The gate never drove the shell's path

G-07 digests `state.afterDeclaredAdvance.bytes`, and it produced that state by calling
`Run.advance(180)` in `scripts/gates/surface-invariance.ts` — a **second implementation** of the
advance, written beside the shell's and asserted against nothing. The shell drove the model
chunked and behind a measuring probe. That path was digested by nothing, which is how a control
40 per cent wrong passed nine gates and 131 shell tests.

So the fix is to the class and not to the instance: the drive is `src/harness/advance.ts`, and the
shell and the gate both call it, the way `scoreEveryHorizon` became the row's own arithmetic in
beat 013. What it catches that it did not: a change to how far an advance goes, or to how it is
chunked, now moves the gate's digest, because the gate is running the shell's code. Beside it,
`tests/harness/advance.test.ts` asks the half a digest of one path cannot — that **every** way a
reader can reach the end of an advance lands on the same bytes: chunked, refused-in-the-middle
and resumed, and one straight call to `Run.advance(180)`. A digest holds a path against
yesterday; that test holds the paths against each other.

**No digest moved.** All 41 quantities are byte-identical, `state.afterDeclaredAdvance.bytes`
included, because the gate's own walk was taking the correct 180 steps already — the defect was
in the shell alone. The record's one changed line is that quantity's *producer* sentence, which
now names the module both callers go through.

#### The missing assertion, and where the hole was

`shell.spec.ts` → *integrates the run and reports the step time as host time* asserted that
`steps` was **not** `0` and that the instant had **changed**, with a comment saying the exact
count comes from configuration so the test waits for the integration to stop rather than
asserting a literal. That is the shape of the hole: a figure derived from configuration can be
derived in the test as well as in the shell, and a control 40 per cent wrong satisfies *not zero*.
Three tests replace the omission, and the hours they check against are read off the **button's own
label** rather than written down, so the claim is that the run stands where the control said it
would put it.

#### Confirming completion, and why it is painted nowhere

Nothing announced the end of an advance. The two `aria-live` regions on the surface carry
*Selection…* and the layout manager's *Manifest opened*; the figures that do move — `steps` and
`instant` — are on the run tab, and a reader may be looking at one of the other three.

The announcement is a live region in the run controls, `role="status"`, saying *Integrated 12
hours: **180** steps, valid at **2013-09-01T12:00:00.000Z*** in the provenance-typed figure
components, and *Integrating 12 hours: **72** of **180** steps* while it runs. It carries five
words once its figures are removed, against FR-007's eight.

**It is painted nowhere, and that is a measured decision rather than a preference** — and the
seventh pass below reverses it, because the author asked for the confirmation to be visible and a
home was found where it costs nothing. What follows is what the sixth pass measured and why it
stopped where it did. The controls
pane's own content at the floor's width is 656 px and the declared floor is that plus 92 px of
chrome. A visible line of confirmation is 19 px of a budget with nothing left in it, and the only
way to buy it is to re-declare `presentation.minimumViewportHeightPx` — a declared value, and this
pass moves none. So the announcement goes into the accessibility tree, hidden the way the mark
lists are, where it costs no layout. One 3 px consequence had to be paid for anyway and is
recorded: an out-of-flow element added after the last control stopped `*:last-child` applying to
that control, the pane grew to 659 px, and both `viewport-floor.spec.ts` and the floor's census in
`one-view.spec.ts` failed on it. The rule now names the control before a live region too.

#### A busy state that could not be seen

The author measured `aria-busy` absent and `advance` enabled at every sample. `view.integrating`
*did* disable the button — and it was set in the same task as the chunk it described, so the main
thread was blocked by the work before the browser could paint the state that says the work is
happening. Every chunk runs after a yield now, the measured one included; the group carries
`aria-busy` and both `advance` and *New run* are disabled while it runs. `shell.spec.ts` samples
it from inside the page between chunks, because an assertion driven from the test process cannot
see a state that lasts a tenth of a second, and requires that no sample caught the control
pressable while the surface said it was busy.

#### Two more things the drive path does that the control does not say

- **The step time in the status strip is the *first* chunk of the last press**, not the last
  chunk and not the advance's. It is why the strip read 1.042 ms/step after the probe and
  0.464 ms/step after proceeding: the same run, two measurements of the same work, and nothing on
  the surface says which chunk either belongs to. Left as it was — it is a host-time figure and
  marked as one — and recorded here.
- **A run provisioned mid-advance would have been written over by the advance it replaced.** The
  chunk loop closes over the run it began on and commits `steps` and `instant` from it, so a *New
  run* pressed between two chunks would have reported the old trajectory's step count under the
  new seed. The control is disabled while an advance runs, and the commit refuses a view whose run
  is not the one it began on: two answers, because the disabled control is a promise about a
  reader and the guard is a property of the code.


### The seventh pass: a busy pointer, a control that says how far, and a confirmation on screen

> *"When that long process is running, I need to see some kind of busy cursor — plus some
> verification that it's complete."*

#### Three long operations, one flag

The sixth pass gave the advance a busy state. It gave it to **one** of the three things on this
surface that take seconds:

| What a reader presses | What it does | What it said while it did it |
|---|---|---|
| *Integrate 12 hours* | 180 steps, chunked, yielding between chunks | `aria-busy`, a disabled control |
| *Build the horizon row* | six four-day integrations, in one blocking call | **nothing** |
| *Score every horizon against truth* | six horizons scored against the record, in one blocking call | **nothing** |

So the notion is one module, `src/harness/working.ts`, and the stylesheet has one rule against
it: `cursor: progress` on the workspace and everything in it while anything long is running.
The workspace's own element carries the operation's **name** rather than a flag —
`data-working="building the horizon row"` — for the reason `data-presentation` and
`data-centre-content` carry theirs: a measurement that fails then says which of the three it
was looking at.
`progress` rather than `wait`, and the difference is a promise — `wait` says the application is
blocked, `progress` says it is working and still usable, which is what the chunked advance
delivers and what the panes a reader can still read make true. Nothing animates: a cursor is the
browser's own, so `prefers-reduced-motion` has nothing to turn off, and no spinner was added.

The two synchronous ones needed the sixth pass's own lesson one layer down. A flag set in a
click handler is committed to the DOM and **never painted**, because the browser's next chance to
draw comes after the work the flag describes is over. `working.ts` commits the flag and hands the
work to the frame after the one that paints it, bounded by a 100 ms timer so that a tab which is
never painted cannot leave a control disabled for ever.

One consequence is recorded rather than hidden: an edit applied through this — the quality-control
box, the bias field — now shows the reader's change when the rebuild **commits**, not when the
box is clicked, because until then the surface is showing the run as it stands. `shell.spec.ts`
clicks the box and asserts the edit list and the box together, where it used to ask Playwright's
`uncheck()` to prove the box had flipped by the time the click returned.

#### The control says how far it has got, and moves nothing saying it

*Integrating 72 of 180* is a relabel, and a relabel costs no line in a pane whose content height
**is** the declared floor. What it could cost is a reflow: beat 018's own walkthrough offer
changed its label and moved every pane in the dock by 11 px.

So the width is reserved. Both labels and the widest count the advance can show are laid in one
grid cell, `visibility: hidden` on the sizers, and the button is the widest of them in every
state. Measured through a whole advance, at the floor's width and at the reference width:

| | |
|---|---|
| The control, resting and working | **126.64 px**, at 1 658 and at 2 560 |
| It was, before the width was reserved | 105.5 px |
| The row it sits in, at the floor | 201 px, holding 126.64 + 4.8 + 58.08 = **189.5 px** |
| Samples of one advance in which anything moved | **0 of 5**, at each width |

The sizer for the count is written with `0` and not with the count's own digits, and that is not
fussiness: this surface's serif draws `1` 0.42 px narrower than every other digit, so *180 of
180* is **not** the widest three digits the label can hold and reserving its width would have
left a pixel of reflow behind for counts like *888*.

#### The confirmation, and where a measurement put it

Two homes were offered. The measurement chose, and it was not close:

| | Where the line goes | What it costs at the floor | The floor it implies |
|---|---|---|---|
| The run controls, beside the control that asked | 201 px wide, **two lines, 30 px** | 656 + 30 px of pane, + 92 px of chrome | **778 px** |
| The status strip, under the three figures | 372 px wide, **one line, 15 px** | **nothing** | **748 px** |

748 is the declared floor and 778 is past the **768 px** of the shortest window in the matrix,
which SC-009 forbids for the reason the first pass proved: a floor no browser window reaches puts
every reader below it. So the run controls were never really available, and the strip is not a
consolation — it is the better place twice over. It is on screen whatever pane has focus, and a
reader may close the controls pane; and it is where an operational surface puts *what just
happened*, beside RUN, STEP and FIELDS AND ANALYSIS.

**Why it is free there, measured at the floor's own width.** The strip's height is set by FR-58's
statement — 57 px of it in a 66 px strip — and the three figures beside it are 39 px, so there are
18 px under them that nothing was using. The confirmation is 15 px of that. It goes **under** the
figures rather than beside them as a fourth term, and that is the whole of why it is free: a
fourth column takes width from the statement, the statement is the one flexible thing in the
strip, and it answers by wrapping to a fourth line — 19 px, measured, of a height budget the floor
spends exactly.

| At the floor, 1 658 px wide | Before an advance | With the confirmation on screen |
|---|---|---|
| The status strip | 66 px | **66 px** |
| FR-58's statement | 519 × 57 | 421 × 57 |
| The readouts beside it | 430 × 56 | 529 × 56 |
| Of which the confirmation | 430 × 15, **empty** | 529 × 15, *Integrated 12 hours: 180 steps, valid at 2013-09-01T12:00:00.000Z* |
| The controls pane's own content | 656 px | **656 px** |
| The floor those imply | 748 | **748, declared 748** |

**`presentation.minimumViewportHeightPx` does not move, and no digest moves with it.** The pass
was authorised to spend the floor and did not have to. All 41 of G-07's quantities are
byte-identical, `configuration` included.

**Above the floor the line is *reserved*, and the census is why.** At 1 920 × 900 the strip is not
held up by the statement — it is 55 px, held up by the two site links — so a line that appears when
an advance finishes grows the strip and resizes the dock at the moment a reader's integration
completes. The layout manager needs a frame to answer that and cannot have one: the integration is
what is holding the main thread. The census caught it at three viewports of six, **839 px of
content in an 835 px dock**, and again at 1 920 × 1 080 after the first fix, which is how the
second half of the same fault was found — the *Step* readout is 17.27 px while it says *not yet
measured* and 21.61 px once it holds a figure, and a baseline that moves with it takes the three
figures from 39.02 px to 42.02 px. Those pixels used to vanish into a strip the site links were
holding up; under the confirmation they are pixels the strip grows.

So three things are held rather than allowed to arrive: the confirmation's line, whether or not
there is anything in it; the height of a readout, before it holds a figure; and the rows' tops
instead of a shared baseline. The strip is then the same height before an advance and after one,
at every viewport:

| | 1 366 × 768 | 1 658 × 748, the floor | 1 920 × 900 | 1 920 × 1 080 |
|---|---|---|---|---|
| The strip, before an advance and after | 106 px | **66 px** | 65 px | 65 px |
| What holding it costs there | 0 | **0** | 10 px of dock | 10 px of dock |

Holding a line is not saying anything in it. The line is **empty** until an advance has finished,
so a reader who has integrated nothing reads nothing; what is held is blank paper, which is the
opposite of the permanent noise FR-048 was narrowed against — and the alternative is a layout that
moves under the reader as a reward for pressing the control.

#### The integrating state, which the census had never seen

A control that relabels itself and a strip that gains a line are exactly the things that overflow
a box, land on a neighbour or wrap a strip to two rows, and neither had ever been censused —
because until this pass neither was on the surface. Both states are in the census now, at every
viewport in the matrix and at the declared floor: green, at all six, with nothing new over its box,
nothing clipped and nothing painted on anything — and it took one finding to get there, the
transient dock overflow above, which is exactly the class of thing the fifth pass wrote this
census for.

Holding the state open took two things and neither doctors a figure the surface draws. The advance
is 180 steps and is over in about **145 ms**, where one census across the socket costs **40 to
70 ms** to ask — so every unthrottled attempt measured the surface *after* the advance and would
have called that the integrating state. `model.chunkSteps` is routed to 1, which changes how often
an advance yields and not how far it goes (`tests/harness/advance.test.ts` holds every chunking to
the same bytes), and the browser's own CPU throttle is set to 30 while the census is taken. The
route a reader takes is the route the test takes — press, be refused on the frame budget, press
*Integrate anyway* — rather than routing the budget out of the way, because the budget is a figure
the strip prints and a test that changes it is measuring a strip nobody has.

#### A finding this pass did not fix

**At the floor, the over-budget notice does not fit the controls pane.** Measured at 1 658 × 748
with the row scored, the pane's content is **1 012 px in a 656 px box** while the notice stands:
a paragraph of five lines and a second button, in the pane whose content height is the floor. No
census had visited that state either — this pass added the integrating and integrated states and
found it on the way past — and it is left standing because fixing it is a change to what FR-008's
notice says and where, which is its own pass. The notice clears the moment a reader answers it,
either way.
