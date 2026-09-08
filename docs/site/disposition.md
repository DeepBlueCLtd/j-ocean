---
title: Disposition
summary: Where every piece of the application page's narrative went when the application stopped carrying it.
order: 6
---

<!-- generated from docs/narrative-disposition.json by scripts/docs/build-disposition.ts -->

# Where the narrative went

Beat 014 took the prose off the application. The application opens on the forecast
diagrams and the controls that drive them; nothing was deleted, and this page is the
record of where each piece of it went.

Beat 016 retired the walkthrough and built the panel help beat 014 was owed, so every one
of the tour's steps has a row here too: a help entry, a section of this site, or a reason
for being dropped.

The record itself is
[`docs/narrative-disposition.json`](https://github.com/DeepBlueCLtd/j-ocean/blob/main/docs/narrative-disposition.json),
and `tests/docs/disposition.test.ts` holds it: every destination on this page has to
exist and has to contain the words — a site section that contains them, or a help entry
that renders them.

## It went to this site

It stated no live figure, so it belongs where a reader arrives before the instrument.

| Where it was | The words | Where they are now |
|---|---|---|
| The controls region, the disclosure headed What has been declared (beat 001) | Every figure here is a value in configuration, validated before anything was computed. No component in the tree holds a literal for any of them. | [What has been declared](data-model.html) |
| The run disclosure, beside the computed cell size (beat 003) | a five-degree box is not square in kilometres | [Configuration](data-model.html) — already there before this beat, recorded as arrived rather than moved |
| The run disclosure, beneath Initialised from (beat 003) | Velocity is put in geostrophic balance with that thickness rather than taken from the truth, which carries motions this model has no layer for. | [What the initialisation takes from the truth, and what it does not](architecture.html) |
| The controls region, the disclosure headed What the instruments measured (beat 004) | Truth becomes an observation in exactly one module, and this is everything that module produced. Every figure below is what a measurement was priced at, not what it turned out to be worth — that is the analysis's question. | [How truth reaches the model](architecture.html) |
| The instruments disclosure, beneath XBT drops (beat 004) | An XBT infers its depth from a fall rate, so each level records the depth it reached, not the depth it was asked for. | [What the instruments measured, and what it was priced at](data-model.html) |
| The instruments disclosure, beneath What a drop told us (beat 004) | The observed quantity is the interface depth, inverted from the same two-layer relation the profile above is drawn from. A level far from the thermocline acquires an enormous depth error and weighs almost nothing, through the arithmetic rather than through a rule. | [What the instruments measured, and what it was priced at](data-model.html) |
| The instruments disclosure, beneath Argo (beat 004) | The truth record assimilated these profiles, so skill measured against it while assimilating them is not independent evidence, and every score will say so. | [What the instruments measured, and what it was priced at](data-model.html) |
| The instruments disclosure, beneath Flags (beat 004) | A flagged observation keeps its value and is drawn as flagged. Nothing is dropped, because what the analysis chose to ignore is as interesting as what it used. | [What the instruments measured, and what it was priced at](data-model.html) |
| The controls region, the disclosure headed The record this run is scored against (beat 002) | Two derived artefacts, regenerated from a digest-verified raw subset by gate G-01. Nothing here was edited by hand; a file that had been would fail the build. | [The record this run is scored against](data-model.html) |
| The truth disclosure, beneath Native resolution (beat 002) | Scoring will decline to resolve below it. | [The record this run is scored against](data-model.html) |
| The truth disclosure, beneath Instants (beat 002) | The source is missing occasional snapshots; the record carries its instants as they are and interpolates nothing at build time. | [The record this run is scored against](data-model.html) |
| The truth disclosure, beneath Depth levels (beat 002) | exact levels of the source, so no build-time vertical interpolation | [The record this run is scored against](data-model.html) |
| The truth disclosure, beneath Argo profiles (beat 002) | Flagged levels are kept and will be drawn as flagged, never omitted. | [The record this run is scored against](data-model.html) |
| The truth disclosure, beneath Climatology (beat 002) | Skill against this reference is therefore not a fully independent measure, and the surface will say so beside every such score. | [The record this run is scored against](data-model.html) |
| The controls region, the disclosure headed The manifest this run replays from (beat 011) | Everything needed to rebuild this run, and none of its state: replay is re-computation, not the restoration of a snapshot. Nothing persists between visits — no storage, no cookie, no run in the URL — so this file is the only thing that leaves and the only thing that comes back. | [What the manifest carries, and what replay is](architecture.html) |
| The centre region, the caption under the analysed field (beat 005) | This is not a picture computed to illustrate the answer; it is the same arithmetic that produced it, exported beside it, which is why it cannot disagree with it. There is no fixture behind this: it is the field the analysis produced on this visit. | [The attribution field is the analysis's own gain](architecture.html) |
| The controls region, beneath the domain choice (beat 013) | The same machinery over a deliberately bland ocean buys much less, and being able to watch it buy less is the point of the second domain. | [Why there are two domains](index.html) |
| The below-the-floor notice (beat 013) | The figure is in CSS pixels, so a window wide enough at 100 per cent is below it at 200 per cent zoom. That is the same answer for the same reason: at that zoom there are as few pixels to read six panels in. | [Configuration](data-model.html) — already there before this beat, recorded as arrived rather than moved |
| The controls region, the disclosure headed What this does not do, and what would change that (beat 012) | Four capabilities are assessed, deferred and cheap to adopt. Each has a trigger, and the triggers are written down rather than remembered. | [Deferred, and what would trigger it](deferred.html) — already there before this beat, recorded as arrived rather than moved |
| The deferrals disclosure, beneath Adaptive sampling (beat 012) | An ensemble, its spread, and a vessel steered by it against a lawnmower track. Deferred until scoring is trusted — which means AT-02, AT-03 and AT-06 have passed. AT-03 has; AT-02 and AT-06 have not, and both fail because two declared numbers disagree about amplitude. A test measures the trigger on every run, so this statement is never out of date. | [Adaptive sampling — the trigger is measured, and not met](deferred.html) — already there before this beat, recorded as arrived rather than moved |
| The deferrals disclosure, beneath Dynamic depth levels (beat 012) | Vertical structure that is advected rather than diagnosed. The trigger is a question about vertical structure evolving in time. The disagreement a reader can see between an XBT and the model's derived profile is not that trigger: it is a static offset, and advected structure would not move it. | [Dynamic depth levels](deferred.html) — already there before this beat, recorded as arrived rather than moved |
| The deferrals disclosure, beneath A GPU kernel (beat 012) | The trigger is the declared frame budget binding at a grid somebody wants. At 100 × 100 it does not. | [A GPU kernel](deferred.html) — already there before this beat, recorded as arrived rather than moved |
| The deferrals disclosure, beneath Observation latency (beat 012) | Observations arriving late rather than not at all. Withholding is its special case, and beat 010 built that. | [Observation latency and arrival order](deferred.html) — already there before this beat, recorded as arrived rather than moved |
| The walkthrough, step 1: What you are looking at (beat 013) | j-ocean is a teaching harness: a small, real ocean model, the simulated instruments that measure it, and an honest account of what each measurement was worth. It forecasts nothing you should act on. | [What you are looking at](index.html) |
| The walkthrough, step 1: the legend of the four figure kinds (beat 013) | Every number on the page is typed by where it came from, and the four kinds never change appearance between panels: declared — a value in configuration, validated before anything ran; computed — produced by the model or the analysis on this visit; derived — read off a committed artefact the build regenerates; host time — how long the machinery took, never simulation time. | [The figure kinds](data-model.html) |
| The walkthrough, step 2: Everything you can change (beat 013) | One column for every cause: which ocean, when the forecast was issued, which instruments the analysis was allowed to see, and whether quality control was running. Change any of them and every panel and every score answers where they are, without you moving. | [The four regions](index.html) |
| The walkthrough, step 7: Everything that was decided in advance (beat 013) | Grid, timestep, reduced gravity, instrument noise, forecast horizons. No component in the tree holds a literal for any of them, so changing the ocean means editing configuration, not code — and a configuration that does not validate stops the page rather than quietly substituting a default. | [What has been declared](data-model.html) |
| The walkthrough, step 8: How truth reaches the model (beat 013) | Only here. One module turns the truth record into observations — ownship surface samples, XBT drops, external Argo profiles — and the model has no other route to it. A build gate fails if anything else imports truth, which is what makes the skill figures mean anything at all. | [How truth reaches the model](architecture.html) |
| The walkthrough, step 9: The record it is scored against (beat 013) | A real HYCOM subset and real Argo profiles, regenerated from a digest-verified download by a build gate. Nothing here was written by hand; a file that had been would fail the build. The harness did not author the thing it is marked against. | [The record this run is scored against](data-model.html) |
| The walkthrough, step 11: What it deliberately does not do (beat 013) | Four capabilities are assessed, deferred, and cheap to adopt. Each has a written trigger, and a test measures the triggers on every run — so this list fails when it becomes wrong instead of going stale. | [Deferred, and what would trigger it](deferred.html) |

## It went to the panel's own help

It explains a panel that stays, so it is behind that panel's help control, opening where the reader is looking. The test renders each entry and holds these words against what it renders, so a panel whose explanation is edited away fails the build.

| Where it was | The words | Where they are now |
|---|---|---|
| The controls region, beneath Editing what was measured (beat 010) | A profile is edited where it was measured: enlarge a panel, click a needle, and the measurement fills the detail region with its levels draggable and the measured profile kept behind them as a ghost. | `help:controls/editing-what-was-measured`, under **editing a profile** |
| The controls region, when the track is being redrawn (beat 010) | Enlarge a panel and drag a waypoint. The instruments resample truth where you put it, through the same instruments and the same noise streams. | `help:controls/editing-what-was-measured`, under **redrawing the track** |
| The manifest disclosure, above the paste box (beat 011) | Paste one and this visit becomes that run — rebuilt from its seed and its edits, not restored. The schema, the format version, the configuration digest and the domain are all checked before anything is provisioned, so a refused import leaves the run you have alone. | `help:controls/manifest`, under **importing a manifest** |
| The centre region, before the row is built (beat 013) | Building them means integrating the analysis forward four days, which takes a couple of seconds, so it happens when you ask: Build the horizon row is in the controls. | `help:centre/horizon-row`, under **building the row** |
| The centre region, beneath Influence radius (beat 005) | An observation across a front influences the far side exactly as much as its own, which the flow would not. | `help:centre/attribution`, under **the influence radius** |
| The scores region, before the row is scored (beat 013) | There is no scores table anywhere else: a table would ask you to match a row label against a panel heading at every glance. | `help:scores`, under **skill against a reference** |
| Each panel's score, in the disclosure headed Where this figure came from (beat 006) | A reduced-gravity model determines departures from a mean and not the mean itself, so every field is compared as an anomaly about its own. The offsets are published rather than absorbed. | `help:scores`, under **anomalies about their own mean** |
| The detail region, above a cell's breakdown (beat 005) | A breakdown is an instrument of a selected cell, never a per-panel summary — that was specified first and was wrong. | `help:detail/attribution-breakdown`, under **a cell's breakdown** |
| The walkthrough, step 3: The forecast, at every horizon at once (beat 013) | One panel per declared horizon, all visible together rather than behind a slider — a forecast is a shape over lead time, and you cannot see a shape one frame at a time. | `help:centre/horizon-row`, under **building the row** |
| The walkthrough, step 3, second paragraph (beat 013) | Two axes, not one: lead time runs across the row, and issue time is a control on the left. Moving the issue time earlier gives the analysis fewer observations and is the clearest way to watch skill change. | `help:controls/issue-time`, under **lead time and issue time** |
| The walkthrough, step 4: What each forecast was worth (beat 013) | Each panel's skill sits directly beneath that panel, in its own column, rather than in a table you would have to match against a heading. A raw error is meaningless alone, so there is never one here without two references the harness computes itself. Zero means no better than the reference; negative means worse, and it is reported rather than tuned. Read the six columns left to right and the decay is there without a curve being plotted. | `help:scores`, under **skill against a reference** |
| The walkthrough, step 5: Whatever you last selected (beat 013) | Click a cell and this region fills with that cell's own breakdown: how much of the answer there came from observations, from the advected background, and from climatology. | `help:detail/attribution-breakdown`, under **a cell's breakdown** |
| The walkthrough, step 5, second half (beat 013) | Click a measurement's mark and it fills with that profile beside the model's derived one. Filling it moves nothing else on the surface, which is the point of it having a region of its own. | `help:detail/attribution-breakdown`, under **a measurement's own profile** |
| The walkthrough, step 6, second paragraph (beat 013) | Nothing persists between visits: no storage, no cookie, no run in the URL. Reload and this run is rebuilt from the seed rather than restored. | `help:controls/manifest`, under **importing a manifest** |
| The walkthrough, step 10: Taking the run with you (beat 013) | The manifest holds everything needed to rebuild this run and none of its state: replay is re-computation, not the restoration of a snapshot. Export it, import it in another browser, and the digests should match — that comparison is what caught an analysis that meant two different things. | `help:controls/manifest`, under **importing a manifest** |

## It was dropped, and here is why

The surface now says it better, or says it for itself. Nothing is carried; the reason is written down, because a paragraph that vanished without one is indistinguishable from a paragraph somebody lost.

| Where it was | The words | Where they are now |
|---|---|---|
| The walkthrough, step 2, the note beneath it (beat 013) | A control that acts on one panel alone is not here; it is at that panel. | Beat 016 makes it true rather than said. Every panel that has something to explain now carries its own control at its own top right, and a sentence promising that a surface behaves this way is worth less than the surface behaving this way. |
| The walkthrough, step 3, the note beneath it (beat 013) | Building the row integrates four days forward, so it happens when you ask. | The same fact is in help:centre/horizon-row already, in the sentence beat 014 sent there: “Building them means integrating the analysis forward four days, which takes a couple of seconds, so it happens when you ask.” Two sentences for one fact is the duplication this beat exists to remove, and the walkthrough's is the shorter of the two. |
| The walkthrough, step 6: Which run this is (beat 013) | A run is a seed and the state it grew into. The seed here is the declared one, so what you see is the recorded case — the same run described in the documentation, reproducible by anyone. | The run disclosure publishes the root seed and says whether this is the recorded case, both as live figures with their kind on them. A paragraph restating them beside them would be the second source for one fact that FR-055 exists to forbid, arriving through the door marked help. |

## It stayed on the application

A reader drives it, or reads a live figure from it, so it stays — compacted — in the region that owns it.

| Where it was | The words | Where they are now |
|---|---|---|
| The head of the controls region, outside its scroller (beat 001) | j-ocean is not an operational forecast system. Its numerics are real but reduced, its domain small, and its claims are about relative skill between references it computes itself, scored against a truth record it did not author. | The **controls** region |
| The run controls (beat 001) | Which run this is: the recorded case under its declared label, or a run whose seed was drawn for this visit. | The **controls** region |
| The run controls (beat 001) | The measured step time as host time, against the declared frame budget. | The **controls** region |
| The controls region, the disclosure headed The run (beat 001) | The root seed, the domain and its computed cell size, the declared timestep against the stability the criterion admits, the steps taken, the instant the run is valid at, what it was initialised from, the excluded sponge margin and the outcrop clamps. | The **controls** region |
| The controls region, the disclosure headed What has been declared (beat 001) | The declared grid and the declared epoch. | The **controls** region |
| The controls region, the disclosure headed What the instruments measured (beat 004) | The ownship surface count at its declared interval and declared errors, the XBT drops and their declared level count, what each drop told us about the interface depth with its error, whether Argo is assimilated, and how many of each check fired. | The **controls** region |
| The controls region, the disclosure headed The record this run is scored against (beat 002) | The domain, the truth source, its native resolution against the model grid, its instants and their spacing, its depth levels, the Argo profiles and levels with the flagged count, and the climatology window with its overlap with this run's period. | The **controls** region |
| The controls region, the disclosure headed The manifest this run replays from (beat 011) | The build, the digest of the fields and the analysis, the manifest itself, and the controls that download, paste and import one. | The **controls** region |
| The controls region, beneath the issue-time control (beat 009) | How many observations the analysis saw at this issue instant, and how many had not happened yet. | The **controls** region |
| The controls region, beneath the row's toggles (beat 008) | What is drawn over every panel: the surface measurements, the XBT drops, the Argo profiles, how many carry a flag, and whether quality control was on. | The **controls** region |
| The centre region, before the row is built (beat 005) | The weight observations carried in each cell — the analysis's own gain, drawn as a field. | The **centre** region |
| The centre region, before the row is built (beat 013) | Six panels at the declared horizons — each stating what it is valid for, what it was initialised from, and what it was worth against two references. | The **centre** region |
| The scores region, before the row is scored (beat 013) | Each panel's skill against persistence and against climatology appears here, in that panel's own column, once the row has been built and scored. | The **scores** region |
| The detail region, with nothing selected (beat 013) | Nothing is selected. Two things can appear here: a cell's attribution breakdown, from clicking a cell on any field; and a measurement's own profile beside the model's derived one, with the measured levels kept as a ghost, from hovering or clicking its mark. | The **detail** region |

<!-- end generated -->
