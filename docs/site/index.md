---
title: Overview
summary: What j-ocean is, what it refuses to claim, and how to read the rest of this site.
order: 1
---

# j-ocean

A browser-resident ocean forecast model and the harness that teaches with it.

<div class="banner warn">
<p><strong>j-ocean is not an operational forecast system.</strong> Its numerics are real but
reduced, its domain small, and its claims are about <em>relative</em> skill between
references it computes itself, scored against a truth record it did not author.</p>
</div>

<p class="launch-cta">
<a href="app/index.html">Run j-ocean in your browser</a>
<span class="note">The application, built from <code>main</code>. Nothing to install.</span>
</p>

## What it is for

Three things, in order of how much they matter:

1. **Understanding.** What a measurement is worth, where a forecast's information came
   from, and what changes when a reader drags a profile and the machinery re-runs.
2. **Teaching.** The same understanding, transferred to a reader who knows the ocean and
   not the numerics, without a lecture.
3. **Evidence.** Modest, specific, falsifiable claims about sampling and forecast skill.

## The shape of it

One browser application in three rings, and the boundaries between them are the design.

| Ring | What it does | What it may not do |
|---|---|---|
| **Model** | A reduced-gravity ocean integrating in typed arrays | Import anything that draws; read the host clock; know a display exists |
| **Assimilation and scoring** | Analysis, references, skill, and the per-cell attribution | Reach truth except through a simulated instrument |
| **Harness** | Horizon panels, attribution layer, profile editor, controls | Reach into integration state, or paint a figure it did not compute |

Read [Architecture](architecture.html) for how those boundaries are held, the
[Data model](data-model.html) for what flows across them, and the
[Glossary](glossary.html) for the words this project uses precisely.

## Why there are two domains

SRD-v1 FR-11 declares an eventful Gulf Stream front and a deliberately bland open gyre, and
the contrast is a requirement rather than a bonus. The same machinery over a deliberately
bland ocean buys much less, and being able to watch it buy less is the point of the second
domain.

One of the two cannot be run today. The vessel's track waypoints are declared once, in the
eventful domain's longitudes, so the thermometer refuses to sample over the gyre; the
application prints the instrument's refusal in its own words beside the choice and leaves the
run you had standing. A track declared per domain is a configuration change and belongs to
whoever declares the configuration.

*Was on the application page, beneath the domain choice (beat 013). Moved here by beat 014.*

## Where the tree is

The build order is one feature per beat, in
[the development plan](https://github.com/DeepBlueCLtd/j-ocean/blob/main/docs/development-plan.md).
Each beat's [note](blog/index.html) says what landed and what it refuses to claim.

## Three habits worth knowing before you read the code

- **Every figure says what kind it is.** <span class="declared">Declared</span> values come
  from configuration, <span class="computed">computed</span> ones from the model or the
  analysis, <span class="derived">derived</span> ones are diagnosed from computed state, and
  <span class="host-time">host time</span> is how long the machinery took and never enters a
  run. The typography is the same here and in the application.
- **A check that has never failed is worth nothing.** Every gate is watched failing against
  a planted violation before it is trusted, and the commit says so.
- **The harness can lose.** There is no demo mode and no fixture that flatters. The surface
  must be able to report that the model is worse than persistence, and that a piece of
  machinery bought nothing.
