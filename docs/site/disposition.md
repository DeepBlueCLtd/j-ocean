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

The record itself is
[`docs/narrative-disposition.json`](https://github.com/DeepBlueCLtd/j-ocean/blob/main/docs/narrative-disposition.json),
and `tests/docs/disposition.test.ts` holds it: every destination on this page has to
exist and has to contain the words, and the help entries that do not exist yet are
counted so that the holes cannot quietly grow.

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

## Owed to beat 016-panel-help

It explains a panel that stays, so it belongs in that panel's help, which beat 016-panel-help builds. Until then the words live in the record and the test reports the destination as owed. That is a known hole with a beat number on it, and not a pass.

| Where it was | The words | Where they are now |
|---|---|---|
| The controls region, beneath Editing what was measured (beat 010) | A profile is edited where it was measured: enlarge a panel, click a needle, and the measurement fills the detail region with its levels draggable and the measured profile kept behind them as a ghost. | `help:controls/editing-what-was-measured` |
| The controls region, when the track is being redrawn (beat 010) | Enlarge a panel and drag a waypoint. The instruments resample truth where you put it, through the same instruments and the same noise streams. | `help:controls/editing-what-was-measured` |
| The manifest disclosure, above the paste box (beat 011) | Paste one and this visit becomes that run — rebuilt from its seed and its edits, not restored. The schema, the format version, the configuration digest and the domain are all checked before anything is provisioned, so a refused import leaves the run you have alone. | `help:controls/manifest` |
| The centre region, before the row is built (beat 013) | Building them means integrating the analysis forward four days, which takes a couple of seconds, so it happens when you ask: Build the horizon row is in the controls. | `help:centre/horizon-row` |
| The centre region, beneath Influence radius (beat 005) | An observation across a front influences the far side exactly as much as its own, which the flow would not. | `help:centre/attribution` |
| The scores region, before the row is scored (beat 013) | There is no scores table anywhere else: a table would ask you to match a row label against a panel heading at every glance. | `help:scores` |
| Each panel's score, in the disclosure headed Where this figure came from (beat 006) | A reduced-gravity model determines departures from a mean and not the mean itself, so every field is compared as an anomaly about its own. The offsets are published rather than absorbed. | `help:scores` |
| The detail region, above a cell's breakdown (beat 005) | A breakdown is an instrument of a selected cell, never a per-panel summary — that was specified first and was wrong. | `help:detail/attribution-breakdown` |

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
