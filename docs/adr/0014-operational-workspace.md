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

Principle I says nothing persists between visits, and it was written about runs: a run is a seed
and a manifest, and replay is *re-computation from a manifest*, never restoration from a
snapshot. A persisted run would be a second way to bring a forecast back with none of the
manifest's checks — no code version, no configuration digest, no refusal when the tree has moved.

A persisted pane width is not that. It is a preference about furniture, and it survives a reload
because a reader who arranged their workspace should not have to arrange it twice.

So the constitution now draws the line explicitly rather than leaving it to be inferred — because
a reader of Principle I could reasonably have inferred the opposite, and one did. What is stored
is held by a key-set test in the same shape as feature 017's address grammar: geometry and pane
identity only, and a planted `seed` fails by name. The two mechanisms that could smuggle a run
out of a session are now guarded the same way.

## Consequences

- **This repository takes its first UI dependency.** dockview and dockview-core. The build stays
  a static page servable from GitHub Pages, and the styles are imported rather than vendored.
- **Ninety-one shell tests were written against the region grid.** Their claims mostly survive
  and their selectors mostly do not; each that loses its subject is recorded against the claim it
  made, as beat 016 recorded the walkthrough's.
- **The walkthrough returns**, which beat 016 retired. Both decisions were right about different
  questions: panel help answers *what is this panel*, and a workspace of docked panes raises
  *what am I looking at*, which panel help cannot answer.
- **ADR-0012's diagnosis stands.** Dividing by rate of change — causes, payload, consequences,
  the thing being inspected — is still the right division. What is superseded is the belief that
  a CSS grid with declared scrollers realised it.
- **No computed quantity changes.** G-07 holds that, as it has held every beat since 013.
