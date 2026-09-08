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

| | Beat 013 declared | Beat 018 measures |
|---|---|---|
| Floor | 2 038 × 728 | **1 658 × 960** |
| Of which chrome, in width | 828 px (390 + 390 + 48), unshrinkable | 448 px (2 × 220 at the pane minimum, 2 × 4 sashes) |
| A horizon panel at 2 560 | 277 px | **280 px** |
| A horizon panel at the floor | 190 px | 190 px |
| A 2 000 px window | the fallback | **the six-panel row** |

The width fell because beat 013's floor was built from the widths the flanking columns *were*,
and a track is that width in every window. The workspace's floor is built from the width below
which a pane cannot be **read** — `workspace.paneMinimumWidthPx` — and the declared widths are
shared down proportionally when a window cannot afford them. The height rose from 728 to 960
for two reasons, both of them real: each panel now carries its own skill figures, and the
controls pane at 220 px wraps more of its labels than it did at 390.

Measured from the built workspace by `tests/shell/viewport-floor.spec.ts`, which walks the
window down until a pane clips or a panel falls below the declared minimum: **1 658 × 959**, and
declared 1 658 × 960. At that width the flanking panes cost 448 px (2 × 220 at the pane minimum
and 2 × 4 px sashes), the row needs 1 210 px (6 × 190 px panels, 5 × 10 px gaps and 20 px of
pane padding), the workspace's chrome costs 136 px of height and the controls pane's own
content is 823 px at that width — which is the binding figure on the vertical axis.

**The full row appears at the declared floor width, 1 658 px**, given the declared 960 px of
height: `useAboveFloor` is a media query on both, in CSS pixels, so the presentation swaps on
the crossing and a reader at 200 per cent zoom gets the answer their pixel count deserves. The
author's window was the case that mattered: a 2 000 px monitor got beat 017's fallback and gets
the row here.

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
| 1 658 × 960, the declared floor | `provenance/run` → its own `dl` | **list** — *the run's own figures, one to a line* |
| 900 × 700, below the floor | the body of panes, one under another | **list** — *the panes, one under another* |
| 900 × 700, a panel enlarged | the horizon strip, sideways | **list** — *every declared horizon, as controls* |

Nothing scrolls a body of text at any of them, and the below-the-floor presentation was walked
to the same states as the workspace rather than assumed: the author's own screenshot of beat
017's head was a window in that presentation, and no test in the tree had anything to say about
it. `tests/shell/one-view.spec.ts` also fails on a pane that **clips**, which beat 013's test
could not see at all: `overflow: hidden` produces no scrollbar for a scrollbar test to catch,
and that is exactly how a surface that does not fit hides.

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

### The digests

**One moved: `configuration`.** Forty others are byte-identical, seed unchanged. The
configuration digest is over the whole file, and what changed in it is `presentation` alone:
the reference viewport, the floor, the two pane widths, the gutter, the new `workspace` block
and — in the pass that rebalanced the row against the curve — `workspace.skillCurveFraction`.
No computed quantity moved, which is what G-07 exists to say.

### The shell tests that lost their subject

Ninety-one shell tests were written against the region grid, and there are **114** now. Their
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
