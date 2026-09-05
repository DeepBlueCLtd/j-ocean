---
title: Glossary
summary: The words this project uses precisely, and the ones it refuses to use at all.
order: 4
---

# Glossary

<dl class="entries">

<dt>Attribution</dt>
<dd>The weight each source — observations, advected background, climatology — actually
carried in a cell's analysis, exported by the analysis from the same arithmetic as the
analysis field. It is <em>derived, never authored</em>: no module computes an
attribution-like field from anything else, and the harness may not blend, smooth or paint
one.</dd>

<dt>Background</dt>
<dd>The prior estimate the analysis starts from: the previous forecast advected to the
valid instant. One of the three sources attribution accounts for.</dd>

<dt>Beat</dt>
<dd>One feature, developed end to end — specify, plan, tasks, analyze, implement — before
the next begins. The sequence is the development plan.</dd>

<dt>Climatology</dt>
<dd>A long-run average field, computed from the truth subset over a declared window and
committed as a build-step artefact with its provenance. The one truth-derived quantity the
analysis may consume directly, and never the truth field at or near the valid instant. It
is also a scoring reference, and what that costs in independence is recorded rather than
hidden.</dd>

<dt>Computed</dt>
<dd>A figure produced by the model or the analysis, as against
<a href="#declared">declared</a> and <a href="#derived">derived</a>. Typographically
distinct, and it does not change kind between states.</dd>

<dt>Counterfactual</dt>
<dd>A replay of a run with exactly one thing changed — a profile dragged, an observation
withheld, an instrument broken. Reversible in one action, and recorded in the manifest so
that the edited run replays as faithfully as the original.</dd>

<dt id="declared">Declared</dt>
<dd>A value that came from configuration and was validated at startup. Horizons, grid size,
timestep, frame budget, instrument noise, domain extents and the validity window of a
forecast are all declared.</dd>

<dt id="derived">Derived</dt>
<dd>A figure diagnosed from computed state rather than integrated — most importantly the
vertical structure, which in this version is displayed but not integrated. Every surface
drawing a depth profile states that the levels between the model's own are derived.</dd>

<dt>Drift gate</dt>
<dd>The check that regenerates a committed artefact and fails the build on any difference,
so that a change is attributed to the tree or to the upstream rather than guessed at.</dd>

<dt>Gate</dt>
<dd>A check that fails the build. Every gate is watched failing against a planted violation
before it is trusted, and the commit that introduces it says so.</dd>

<dt>Horizon</dt>
<dd>A lead time at which a forecast is valid. Every horizon declared in configuration is
rendered as a panel, and no panel is drawn for a horizon that is not declared.</dd>

<dt>Host time</dt>
<dd>Wall-clock elapsed time, read from the host to report how long the machinery took. It
is marked as such wherever it is drawn and never enters a run, a manifest, or any
simulation-time quantity.</dd>

<dt>Enlarge in place</dt>
<dd>Growing one panel while the other five stay visible and shrink to their declared
minimum. Not a modal and not a new page: an enlargement that hid the row would be a slider
with extra steps. It changes what is shown and never what is computed, and the test asserts
that by object identity rather than by appearance.</dd>

<dt>Instrument</dt>
<dd>The simulated device through which — and only through which — the model may sample
truth. It applies declared noise and declared error characteristics at a chosen position,
depth and time.</dd>

<dt>Manifest</dt>
<dd>The complete description of a run: seeds, versions, digests and counterfactual state.
The unit of export and import, and the thing a run is rebuilt from.</dd>

<dt>Observation</dt>
<dd>Truth sampled through an instrument. The type is opaque and has exactly one
construction site, in the instruments module; there is no cast or helper anywhere else by
which a truth value becomes one.</dd>

<dt>Ownship</dt>
<dd>The vessel the harness models: its own position, its sampling track, and the
instruments on it. Its position is known, not inferred — which is the whole distinction
this project holds to.</dd>

<dt>Persistence</dt>
<dd>The reference forecast that says tomorrow looks like today. One of the two references
skill is reported against.</dd>

<dt>Panel</dt>
<dd>One horizon's view: the forecast field as an anomaly, the attribution layer, the
absolute instants it is valid for and was initialised from, both skill figures in the
scorer's own words, and the provenance one disclosure away.</dd>

<dt>Port</dt>
<dd>An interface with more than one conceivable implementation. There are four and there
will not quietly be a fifth.</dd>

<dt>Recorded case</dt>
<dd>The run produced by the declared default seed: the one two readers are both looking at
when they say "the recorded case". A reader may draw a new run instead, and the surface
then says the run is no longer the recorded case.</dd>

<dt>Row</dt>
<dd>The primary surface: one panel per declared horizon, in order, all visible at once. Not
a slider — what is not on screen is what the eye forgets, and a claim about a trend
delivered one frame at a time is a claim taken on trust. Not a grid — lead time is
one-dimensional, and laying it out in two invents an ordering the data does not have.</dd>

<dt>Second channel</dt>
<dd>Whatever carries a distinction besides hue: here, a diagonal hatch over the cells where
observations lead both other sources. It is what makes the attribution layer survive a
monochrome print, and the margin it must clear is measured in luminance rather than
asserted.</dd>

<dt>Skill</dt>
<dd>Performance relative to a reference, in the convention where zero means <em>no better
than the reference</em> and negative means <em>worse</em>. Reported against persistence and
against climatology, and the surface says so in those words when the model is not earning
its compute.</dd>

<dt>Track</dt>
<dd>The path the vessel has travelled. Ordinary navigational English, not forbidden, and
deliberately absent from the vocabulary gate's word list.</dd>

<dt>Truth record</dt>
<dd>A subsetted reanalysis field, converted to the project's own format by a script in the
repository and committed as a derived artefact. The harness's claims are worth what its
truth record is worth.</dd>

</dl>

## Words this project does not use

j-ocean holds no entity whose position it infers rather than knows, and the vocabulary gate
enforces that. It also holds no customer, project or bid material anywhere — code, docs,
data, commit messages or branch names. The forbidden list lives beside the gate; the half
of it that names things which must not be written down is held as salted hashes rather than
as words.
