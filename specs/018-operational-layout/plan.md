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
- **Persistence is permitted here, and the constitution now says why.** Principle I forbids
  persisting **forecast inputs and outputs** — a run is a seed and a manifest, and replay is
  re-computation. Workspace chrome is not a forecast input. The constitution gains that
  distinction explicitly, because a reader of Principle I could reasonably have concluded the
  opposite, and one did.
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
| **I. Nothing persists** | Amended, deliberately | The prohibition is on forecast inputs and outputs. Workspace geometry is neither, and a test proves what is stored carries no run quantity. |
| **V. No figure without its provenance** | Yes | Every figure keeps its kind and its disclosure. Fewer sentences, not less provenance. |
| **VI. The harness can lose** | Yes | A losing score is visible as a figure and the scorer's words are one disclosure away, unsoftened. |
| **X. Declared in configuration** | Yes | Pane geometry defaults, the reference viewport and the minimum are declared, not literals. |

**Result: PASS**, with one amendment to Principle I recorded in the constitution and in ADR-0014.

## Risks this plan accepts

- **dockview is the first UI dependency this repository has taken.** It earns an ADR. Its styles
  are imported, not vendored, and the build must stay a static page servable from GitHub Pages.
- **Ninety-one shell tests were written against the region grid.** Their claims mostly survive;
  their selectors mostly do not. Each one that loses its subject must be recorded against the
  claim it made, as beat 016 recorded the walkthrough's.
- **G-07 must stay green.** Rebuilding the surface computes nothing. A moved digest that is not a
  declared presentation figure means a computation was living in the layout.

## Measured

_Filled in when the beat lands._
