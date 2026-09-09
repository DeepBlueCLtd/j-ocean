# Software Requirements Document
## j-ocean — the application surface, Version 2

**Status:** Draft, 7 September 2026 — written against the built application after it was
used, which is the only condition under which this document could have been written.
**Author:** Doc
**Supplements:** `j-ocean-srd.md` (SRD-v1), whose requirements carry unchanged except
where amended by name below.

---

## 1. Purpose and scope

Version 1 shipped as a long scrolling page: introductory matter, blog, and the
application beneath, occupying some three vertical screens. It works. Its author could
not follow it.

That is a finding about the surface and not about the model, and this document is scoped
accordingly.

- **FR-40 (Scope.)** This beat **changes no numerics, adds no data source, and alters no
  computed quantity**. Everything it draws is already being computed. Where the refactor
  appears to require a logic change, that is a finding to be recorded rather than a task
  to be quietly done: it means the presentation and the computation were entangled, and
  which one they were entangled in is worth knowing. The scope shall be held by test —
  the model, analysis and scoring modules' outputs are unchanged for a fixed seed across
  this change.

### 1.1 What was wrong, stated plainly

Kept because the diagnosis is the reason every requirement below reads as it does.

- **The page was a narrative and the system is not one.** Sections implied steps to be
  completed and left behind. j-ocean has no steps: it is one system with causes on one
  side and consequences on the other, and every control affects everything at once.
- **Scrolling separated cause from effect.** A reader dragged a control and what changed
  was off screen. That is the whole of the reported clumsiness, and no amount of
  restyling a scrolling page fixes it.
- **The six-panel row was specified for a glance (SRD-v1 FR-13) and a scrolling page
  cannot deliver one.** The row was rejected in favour of a slider precisely because a
  reader cannot hold an unseen frame in memory; a page that scrolls reintroduces the
  fault the row exists to prevent.

---

## 2. The application is one view

- **FR-41** The application shall occupy **one viewport and shall not scroll**. Every
  control, every horizon panel, every score and the detail of whatever is selected shall
  be simultaneously visible. A reader who changes anything shall see everything that
  changed without moving.
- **FR-42** The **narrative content leaves the application**. Introductory matter, the
  blog and the system documentation belong to the site's welcome page and are reached by
  link. Nothing is deleted and §7 lists where each part went. The application opens on the
  forecast diagrams and the controls that drive them, and on nothing that competes with
  them for the reader's vertical space.
- **FR-43** Where the viewport is too small to carry the layout at the declared minimum,
  the application shall **say so and name the size it needs**, and shall offer the
  enlarged single-panel presentation of FR-49 as the fallback rather than a shrunken row
  no one can read. This is stated rather than deferred because a no-scroll requirement
  without a smallest-case answer is an unfinished requirement, and the honest answer here
  is that this instrument wants width.

---

## 3. The four regions

The layout is divided by **what changes when**, not by subject matter.

- **FR-44 (Controls, left.)** Every control a reader drives shall live in one column:
  issue time and lead time (SRD-v1 FR-25), observation toggles (FR-31), quality control
  (FR-32), domain choice (FR-11), and the track and profile editors' entry points. All
  the causes in one place, so that the thing just changed is never hunted for. A control
  that acts on one panel alone does not belong here; it belongs at that panel.
- **FR-45 (The horizon row, centre.)** The six panels of SRD-v1 FR-13 take the dominant
  region and the full width available to it. This is the payload and is given the space
  accordingly; nothing shares the centre region with it.
- **FR-46 (Scores, beneath the row.)** Each panel's skill figures shall be drawn
  **directly beneath that panel, in its column**, and not collected as a table elsewhere.
  A score beneath its own picture is read as one object with it; a table asks the reader
  to match a row label against a panel heading, which is a small tax paid at every glance.
  Aligned columns also draw the decay for free: six figures read left to right show skill
  falling away without a curve being plotted. SRD-v1 FR-20 to FR-22 are unchanged — two
  references, and the words *not earning its compute* where they apply.
- **FR-47 (Detail, right.)** One region shall carry **whatever was last selected** — a
  cell's attribution breakdown (SRD-v1 FR-18), or an XBT's profile with its ghost
  (FR-28). Selecting shall fill this region and shall **never rearrange the layout**: a
  surface whose shape changes on a click makes a reader cautious about clicking, which is
  fatal to an instrument meant to be poked.
- **FR-48** A region with nothing in it shall **say what would appear there**, rather than
  render empty. An empty region is a claim the surface is not entitled to make.

---

## 4. Enlargement is a selection, not a mode

- **FR-49** Enlarging a panel shall **replace the contents of the centre region only**.
  The controls, the scores and the detail region shall not move. The row shall remain
  present as a **strip** along the top of the centre region with the enlarged panel marked
  in it, and selecting another panel in the strip shall swap the centre directly — no
  closing, no reopening, no return to an unenlarged state as an intermediate step.
- **FR-50** The reason the strip survives is the reason the row exists: **comparison
  across horizons is the lesson**, and an enlargement that hid the other five would trade
  the lesson for the detail. The strip shall carry each panel's score with it, so the
  comparison is not reduced to a picture.
- **FR-51** Enlargement shall change **what is shown and never what is computed**
  (SRD-v1 FR-14 carried). The attribution layer and the observation marks of SRD-v1 §5.4
  are drawn at their full fidelity only in the enlarged panel, and the row states that it
  is showing the field alone.

---

## 5. Help, where the reader asks for it

- **FR-52** Narrative that explains a panel shall be carried **by that panel**, behind a
  help control at the panel's top right, opening in place and closing again. It is
  **panel-level and not a tour**: no sequence, no next control, no wizard. A reader
  confused by attribution wants attribution explained, not a walkthrough that begins three
  panels away.
- **FR-53** A panel with no help shall show **no control**, and the absence is
  information rather than an oversight to be papered over with a stub.
- **FR-54** Each panel's help shall be **held to something on disk** — the regions or
  layers that panel declares — so that a panel gaining a feature and not a help entry is
  **reported by name** rather than passing unnoticed. This is the discipline the component
  tour already answers to and it is applied here for the same reason: help kept separately
  from the thing it explains goes stale silently.
- **FR-55** Help shall **teach and not report**: no help text may state any live figure or
  any component's current state, and a test shall hold it to that. A help panel that
  reported would be a second source for a fact the surface already shows.

---

## 6. Carried disciplines

- **FR-56** The selected panel, the selected cell and the selected observation shall be
  **addressable**, so a link opens the application at the thing being discussed.
  **Selecting writes the address; mounting does not** — a surface that wrote its own
  default on mount would rewrite a reader's URL on any remount.
- **FR-57** Every surface shall be legible in greyscale, operable by keyboard, and shall
  respect `prefers-reduced-motion`. The attribution field shall not rely on colour blend
  alone (SRD-v1 FR-19 carried).
- **FR-58** The statement that the application is not an operational forecast system
  (SRD-v1 FR-02) shall be **visible without interaction** and shall not be the thing moved
  behind a help control.

---

## 7. Where the narrative went

Nothing is dropped; the table below is the record, and it is **generated** rather than
written here: the record is `docs/narrative-disposition.json`, `tests/docs/disposition.test.ts`
holds every destination in it against the tree, and `scripts/docs/build-disposition.ts` renders
it into this section and into the site's disposition page. A table transcribed twice is two
tables that disagree the first time an entry is edited.

<!-- generated from docs/narrative-disposition.json by scripts/docs/build-disposition.ts -->

Generated from `docs/narrative-disposition.json`, which is held by `tests/docs/disposition.test.ts`.
77 pieces of matter: 15 stay in a region,
28 went to the site, 23 are a panel's own
help, built in beat 016-panel-help, 5 are the
walkthrough's, reclaimed in beat 018-operational-layout, and 6
were **dropped with a recorded reason** rather than carried anywhere. Every destination is
resolved by the test: a site section that contains the words, a help entry or a walkthrough
step that renders them, or a reason.

| Was on the application page | The matter | Now |
|---|---|---|
| The head of the controls region, outside its scroller | j-ocean is not an operational forecast system. Its numerics are real but reduced, its domain small, and its claims are about relative skill between references it computes itself, scored against a truth record it did not author. | Stays, in the **status** pane |
| The run controls | Which run this is: the recorded case under its declared label, or a run whose seed was drawn for this visit. | Stays, in the **status** pane |
| The run controls | The measured step time as host time, against the declared frame budget. | Stays, in the **status** pane |
| The controls region, the disclosure headed The run | The root seed, the domain and its computed cell size, the declared timestep against the stability the criterion admits, the steps taken, the instant the run is valid at, what it was initialised from, the excluded sponge margin and the outcrop clamps. | Stays, in the **provenance** pane |
| The controls region, the disclosure headed What has been declared | The declared grid and the declared epoch. | Stays, in the **provenance** pane |
| The controls region, the disclosure headed What the instruments measured | The ownship surface count at its declared interval and declared errors, the XBT drops and their declared level count, what each drop told us about the interface depth with its error, whether Argo is assimilated, and how many of each check fired. | Stays, in the **provenance** pane |
| The controls region, the disclosure headed The record this run is scored against | The domain, the truth source, its native resolution against the model grid, its instants and their spacing, its depth levels, the Argo profiles and levels with the flagged count, and the climatology window with its overlap with this run's period. | Stays, in the **provenance** pane |
| The controls region, the disclosure headed The manifest this run replays from | The build, the digest of the fields and the analysis, the manifest itself, and the controls that download, paste and import one. | Stays, in the **provenance** pane |
| The controls region, beneath the issue-time control | How many observations the analysis saw at this issue instant, and how many had not happened yet. | Stays, in the **controls** pane |
| The controls region, beneath the row's toggles | What is drawn over every panel: the surface measurements, the XBT drops, the Argo profiles, how many carry a flag, and whether quality control was on. | Stays, in the **controls** pane |
| The centre region, before the row is built | The weight observations carried in each cell — the analysis's own gain, drawn as a field. | Stays, in the **horizons** pane |
| The centre region, before the row is built | Six panels at the declared horizons — each stating what it is valid for, what it was initialised from, and what it was worth against two references. | Stays, in the **horizons** pane |
| The scores region, before the row is scored | Each panel's skill against persistence and against climatology appears here, in that panel's own column, once the row has been built and scored. | **Dropped**, with a reason: The scores region is gone. Beat 013 aligned each panel's figures to its column with CSS `subgrid` across two regions; beat 018 puts them inside the panel, which is what FR-046 asked for and is not achievable across independent panes. There is no region left for this to be the empty state of, and each panel now says "not scored yet" for itself -- the same fact, said by the thing it is about. |
| The detail region, with nothing selected | Nothing is selected. Two things can appear here: a cell's attribution breakdown, from clicking a cell on any field; and a measurement's own profile beside the model's derived one, with the measured levels kept as a ghost, from hovering or clicking its mark. | Stays, in the **selection** pane |
| The controls region, the disclosure headed What has been declared | Every figure here is a value in configuration, validated before anything was computed. No component in the tree holds a literal for any of them. | Site: `docs/site/data-model.md#What has been declared` |
| The run disclosure, beside the computed cell size | a five-degree box is not square in kilometres | Site, and was already there: `docs/site/data-model.md#Configuration` |
| The run disclosure, beneath Initialised from | Velocity is put in geostrophic balance with that thickness rather than taken from the truth, which carries motions this model has no layer for. | Site: `docs/site/architecture.md#What the initialisation takes from the truth, and what it does not` |
| The controls region, the disclosure headed What the instruments measured | Truth becomes an observation in exactly one module, and this is everything that module produced. Every figure below is what a measurement was priced at, not what it turned out to be worth — that is the analysis's question. | Site: `docs/site/architecture.md#How truth reaches the model` |
| The instruments disclosure, beneath XBT drops | An XBT infers its depth from a fall rate, so each level records the depth it reached, not the depth it was asked for. | Site: `docs/site/data-model.md#What the instruments measured, and what it was priced at` |
| The instruments disclosure, beneath What a drop told us | The observed quantity is the interface depth, inverted from the same two-layer relation the profile above is drawn from. A level far from the thermocline acquires an enormous depth error and weighs almost nothing, through the arithmetic rather than through a rule. | Site: `docs/site/data-model.md#What the instruments measured, and what it was priced at` |
| The instruments disclosure, beneath Argo | The truth record assimilated these profiles, so skill measured against it while assimilating them is not independent evidence, and every score will say so. | Site: `docs/site/data-model.md#What the instruments measured, and what it was priced at` |
| The instruments disclosure, beneath Flags | A flagged observation keeps its value and is drawn as flagged. Nothing is dropped, because what the analysis chose to ignore is as interesting as what it used. | Site: `docs/site/data-model.md#What the instruments measured, and what it was priced at` |
| The controls region, the disclosure headed The record this run is scored against | Two derived artefacts, regenerated from a digest-verified raw subset by gate G-01. Nothing here was edited by hand; a file that had been would fail the build. | Site: `docs/site/data-model.md#The record this run is scored against` |
| The truth disclosure, beneath Native resolution | Scoring will decline to resolve below it. | Site: `docs/site/data-model.md#The record this run is scored against` |
| The truth disclosure, beneath Instants | The source is missing occasional snapshots; the record carries its instants as they are and interpolates nothing at build time. | Site: `docs/site/data-model.md#The record this run is scored against` |
| The truth disclosure, beneath Depth levels | exact levels of the source, so no build-time vertical interpolation | Site: `docs/site/data-model.md#The record this run is scored against` |
| The truth disclosure, beneath Argo profiles | Flagged levels are kept and will be drawn as flagged, never omitted. | Site: `docs/site/data-model.md#The record this run is scored against` |
| The truth disclosure, beneath Climatology | Skill against this reference is therefore not a fully independent measure, and the surface will say so beside every such score. | Site: `docs/site/data-model.md#The record this run is scored against` |
| The controls region, the disclosure headed The manifest this run replays from | Everything needed to rebuild this run, and none of its state: replay is re-computation, not the restoration of a snapshot. Nothing persists between visits — no storage, no cookie, no run in the URL — so this file is the only thing that leaves and the only thing that comes back. | Site: `docs/site/architecture.md#What the manifest carries, and what replay is` |
| The centre region, the caption under the analysed field | This is not a picture computed to illustrate the answer; it is the same arithmetic that produced it, exported beside it, which is why it cannot disagree with it. There is no fixture behind this: it is the field the analysis produced on this visit. | Site: `docs/site/architecture.md#The attribution field is the analysis's own gain` |
| The controls region, beneath the domain choice | The same machinery over a deliberately bland ocean buys much less, and being able to watch it buy less is the point of the second domain. | Site: `docs/site/index.md#Why there are two domains` |
| The below-the-floor notice | The figure is in CSS pixels, so a window wide enough at 100 per cent is below it at 200 per cent zoom. That is the same answer for the same reason: at that zoom there are as few pixels to read six panels in. | Site, and was already there: `docs/site/data-model.md#Configuration` |
| The controls region, the disclosure headed What this does not do, and what would change that | Four capabilities are assessed, deferred and cheap to adopt. Each has a trigger, and the triggers are written down rather than remembered. | Site, and was already there: `docs/site/deferred.md#Deferred, and what would trigger it` |
| The deferrals disclosure, beneath Adaptive sampling | An ensemble, its spread, and a vessel steered by it against a lawnmower track. Deferred until scoring is trusted — which means AT-02, AT-03 and AT-06 have passed. AT-03 has; AT-02 and AT-06 have not, and both fail because two declared numbers disagree about amplitude. A test measures the trigger on every run, so this statement is never out of date. | Site, and was already there: `docs/site/deferred.md#Adaptive sampling — the trigger is measured, and not met` |
| The deferrals disclosure, beneath Dynamic depth levels | Vertical structure that is advected rather than diagnosed. The trigger is a question about vertical structure evolving in time. The disagreement a reader can see between an XBT and the model's derived profile is not that trigger: it is a static offset, and advected structure would not move it. | Site, and was already there: `docs/site/deferred.md#Dynamic depth levels` |
| The deferrals disclosure, beneath A GPU kernel | The trigger is the declared frame budget binding at a grid somebody wants. At 100 × 100 it does not. | Site, and was already there: `docs/site/deferred.md#A GPU kernel` |
| The deferrals disclosure, beneath Observation latency | Observations arriving late rather than not at all. Withholding is its special case, and beat 010 built that. | Site, and was already there: `docs/site/deferred.md#Observation latency and arrival order` |
| The controls region, beneath Editing what was measured | A profile is edited where it was measured: enlarge a panel, click a needle, and the measurement fills the detail region with its levels draggable and the measured profile kept behind them as a ghost. | Help, at the panel: `help:controls/editing-what-was-measured`, under *editing a profile* |
| The controls region, when the track is being redrawn | Enlarge a panel and drag a waypoint. The instruments resample truth where you put it, through the same instruments and the same noise streams. | Help, at the panel: `help:controls/editing-what-was-measured`, under *redrawing the track* |
| The manifest disclosure, above the paste box | Paste one and this visit becomes that run — rebuilt from its seed and its edits, not restored. The schema, the format version, the configuration digest and the domain are all checked before anything is provisioned, so a refused import leaves the run you have alone. | Help, at the panel: `help:controls/manifest`, under *importing a manifest* |
| The centre region, before the row is built | Building them means integrating the analysis forward four days, which takes a couple of seconds, so it happens when you ask: Build the horizon row is in the controls. | Help, at the panel: `help:centre/horizon-row`, under *building the row* |
| The centre region, beneath Influence radius | An observation across a front influences the far side exactly as much as its own, which the flow would not. | Help, at the panel: `help:centre/attribution`, under *the influence radius* |
| The scores region, before the row is scored | There is no scores table anywhere else: a table would ask you to match a row label against a panel heading at every glance. | Help, at the panel: `help:scores`, under *skill against a reference* |
| Each panel's score, in the disclosure headed Where this figure came from | A reduced-gravity model determines departures from a mean and not the mean itself, so every field is compared as an anomaly about its own. The offsets are published rather than absorbed. | Help, at the panel: `help:scores`, under *anomalies about their own mean* |
| The detail region, above a cell's breakdown | A breakdown is an instrument of a selected cell, never a per-panel summary — that was specified first and was wrong. | Help, at the panel: `help:detail/attribution-breakdown`, under *a cell's breakdown* |
| The walkthrough, step 1: What you are looking at | j-ocean is a teaching harness: a small, real ocean model, the simulated instruments that measure it, and an honest account of what each measurement was worth. It forecasts nothing you should act on. | Walkthrough: `walkthrough:step-1` (reclaimed from site: docs/site/index.md#What you are looking at) |
| The walkthrough, step 1: the legend of the four figure kinds | Every number on the page is typed by where it came from, and the four kinds never change appearance between panels: declared — a value in configuration, validated before anything ran; computed — produced by the model or the analysis on this visit; derived — read off a committed artefact the build regenerates; host time — how long the machinery took, never simulation time. | Site: `docs/site/data-model.md#The figure kinds` |
| The walkthrough, step 2: Everything you can change | One column for every cause: which ocean, when the forecast was issued, which instruments the analysis was allowed to see, and whether quality control was running. Change any of them and every panel and every score answers where they are, without you moving. | Walkthrough: `walkthrough:step-2` (reclaimed from site: docs/site/index.md#The four regions) |
| The walkthrough, step 2, the note beneath it | A control that acts on one panel alone is not here; it is at that panel. | **Dropped**, with a reason: Beat 016 makes it true rather than said. Every panel that has something to explain now carries its own control at its own top right, and a sentence promising that a surface behaves this way is worth less than the surface behaving this way. |
| The walkthrough, step 3: The forecast, at every horizon at once | One panel per declared horizon, all visible together rather than behind a slider — a forecast is a shape over lead time, and you cannot see a shape one frame at a time. | Help, at the panel: `help:centre/horizon-row`, under *building the row* |
| The walkthrough, step 3, second paragraph | Two axes, not one: lead time runs across the row, and issue time is a control on the left. Moving the issue time earlier gives the analysis fewer observations and is the clearest way to watch skill change. | Help, at the panel: `help:controls/issue-time`, under *lead time and issue time* |
| The walkthrough, step 3, the note beneath it | Building the row integrates four days forward, so it happens when you ask. | **Dropped**, with a reason: The same fact is in help:centre/horizon-row already, in the sentence beat 014 sent there: “Building them means integrating the analysis forward four days, which takes a couple of seconds, so it happens when you ask.” Two sentences for one fact is the duplication this beat exists to remove, and the walkthrough's is the shorter of the two. |
| The walkthrough, step 4: What each forecast was worth | Each panel's skill sits directly beneath that panel, in its own column, rather than in a table you would have to match against a heading. A raw error is meaningless alone, so there is never one here without two references the harness computes itself. Zero means no better than the reference; negative means worse, and it is reported rather than tuned. Read the six columns left to right and the decay is there without a curve being plotted. | Help, at the panel: `help:scores`, under *skill against a reference* |
| The walkthrough, step 5: Whatever you last selected | Click a cell and this region fills with that cell's own breakdown: how much of the answer there came from observations, from the advected background, and from climatology. | Help, at the panel: `help:detail/attribution-breakdown`, under *a cell's breakdown* |
| The walkthrough, step 5, second half | Click a measurement's mark and it fills with that profile beside the model's derived one. Filling it moves nothing else on the surface, which is the point of it having a region of its own. | Help, at the panel: `help:detail/attribution-breakdown`, under *a measurement's own profile* |
| The walkthrough, step 6: Which run this is | A run is a seed and the state it grew into. The seed here is the declared one, so what you see is the recorded case — the same run described in the documentation, reproducible by anyone. | **Dropped**, with a reason: The run disclosure publishes the root seed and says whether this is the recorded case, both as live figures with their kind on them. A paragraph restating them beside them would be the second source for one fact that FR-055 exists to forbid, arriving through the door marked help. |
| The walkthrough, step 6, second paragraph | Nothing persists between visits: no storage, no cookie, no run in the URL. Reload and this run is rebuilt from the seed rather than restored. | Help, at the panel: `help:controls/manifest`, under *importing a manifest* |
| The walkthrough, step 7: Everything that was decided in advance | Grid, timestep, reduced gravity, instrument noise, forecast horizons. No component in the tree holds a literal for any of them, so changing the ocean means editing configuration, not code — and a configuration that does not validate stops the page rather than quietly substituting a default. | Site: `docs/site/data-model.md#What has been declared` |
| The walkthrough, step 8: How truth reaches the model | Only here. One module turns the truth record into observations — ownship surface samples, XBT drops, external Argo profiles — and the model has no other route to it. A build gate fails if anything else imports truth, which is what makes the skill figures mean anything at all. | Site: `docs/site/architecture.md#How truth reaches the model` |
| The walkthrough, step 9: The record it is scored against | A real HYCOM subset and real Argo profiles, regenerated from a digest-verified download by a build gate. Nothing here was written by hand; a file that had been would fail the build. The harness did not author the thing it is marked against. | Site: `docs/site/data-model.md#The record this run is scored against` |
| The walkthrough, step 10: Taking the run with you | The manifest holds everything needed to rebuild this run and none of its state: replay is re-computation, not the restoration of a snapshot. Export it, import it in another browser, and the digests should match — that comparison is what caught an analysis that meant two different things. | Help, at the panel: `help:controls/manifest`, under *importing a manifest* |
| The walkthrough, step 11: What it deliberately does not do | Four capabilities are assessed, deferred, and cheap to adopt. Each has a written trigger, and a test measures the triggers on every run — so this list fails when it becomes wrong instead of going stale. | Site: `docs/site/deferred.md#Deferred, and what would trigger it` |
| The below-the-floor notice, first paragraph | All 6 declared horizons side by side, each at the declared minimum of 190 px, want a viewport of at least 2038 x 728 px once the controls column, the detail column and the page gutter have taken theirs. That figure was measured from the built layout, not chosen. | Walkthrough: `walkthrough:step-6` |
| The below-the-floor notice, second paragraph | So this is one horizon at a time instead. The strip carries all 6 and what each was worth, because comparison across horizons is the lesson; choosing one in the strip swaps the panel beneath it. Widen the window past the figure above and the full row returns without a reload. | Walkthrough: `walkthrough:step-6` |
| Nowhere: the workspace is beat 018's, and had nothing to explain it | Drag a sash to resize a pane, drag a tab to move or group one, and the arrangement you leave is the arrangement you return to. Only the furniture is remembered: no seed, no manifest and nothing the run computed, which travel as a manifest and are rebuilt rather than restored. | Walkthrough: `walkthrough:step-7` |
| The enlarged panel, beneath the depth elevation | A side elevation: longitude is the horizontal axis and latitude is not shown, so position is read from the field this is drawn beside. | Help, at the panel: `help:centre/horizon-panel`, under *enlarging a panel* |
| The detail region, at the head of a selected cell's breakdown | Cell 5050, as the analysis weighted it. | Help, at the panel: `help:detail/attribution-breakdown`, under *a cell's breakdown* |
| The centre region, the value beside Influence radius | A property of the declared correlation length scale, not of the ocean. | Help, at the panel: `help:centre/attribution`, under *the influence radius* |
| The centre region, the last line of the legend beneath the row | the row shows the field alone at this size: the attribution layer and each measurement at the depth it reached are drawn in the enlarged panel | Help, at the panel: `help:centre/horizon-row`, under *what the row draws, and what it does not* |
| The centre region, the legend beneath the row, with the attribution layer shown | the same field on every panel: this run analyses once, at the issue instant. Attribution becomes per horizon when the forecast cycles. | Help, at the panel: `help:centre/attribution`, under *the same field on every panel* |
| The centre region, the hatched entry of the legend beneath the row | a second channel, so the field reads without colour | Help, at the panel: `help:centre/attribution`, under *the hatched channel* |
| The centre region, the surface-measurement entry of the legend beneath the row | the track's own range | **Dropped**, with a reason: Beat 018. The clause named what the two figures beside it already are: the entry reads *surface measurement, dark for warm, over 18.1 to 24.3 degrees C*, and both ends are computed figures with their kind on them. A phrase that restates the figures next to it is the second source for one fact that FR-055 forbids, in four words. |
| The centre region, the dashed entry of the legend beneath the row | so it did not inform it | **Dropped**, with a reason: Beat 018. The consequence of the clause before it -- *dashed: measured after the forecast was initialised* -- and a legend entry that argues from its own label is explaining rather than labelling. The mark itself still says it in full: clicking one opens the selection pane, which reads *taken after this forecast was initialised, so it did not inform it*, at the mark the reader asked about. |
| Each horizon panel, above that panel's own skill figures | The scorer's own verdict on this horizon, in the scorer's words: better than persistence by 0.0 per cent; worse than climatology by 208.8 per cent. | Stays, in the **horizons** pane |
| The run controls, the notice shown when the projected time exceeds the declared budget | The projected time to integrate the longest declared horizon, against the declared frame budget, with the choice to integrate anyway. | Stays, in the **controls** pane |
| The run controls, the second sentence of the over-budget notice | The chunk it was measured on counts toward the twelve hours; nothing beyond it has been integrated. | Help, at the panel: `help:controls/run`, under *the frame budget* |
| The run controls, the last sentence of the over-budget notice | The page is saying so rather than freezing. | Help, at the panel: `help:controls/run`, under *the frame budget* |

<!-- end generated -->

---

## 8. Acceptance

| ID | Test |
|---|---|
| AT-10 | For a fixed seed, every computed field, score and derived quantity is byte-identical before and after this change (FR-40) |
| AT-11 | At the declared minimum viewport the application renders complete with no scrollbar |
| AT-12 | A control is changed and the resulting change in every horizon panel and every score is visible without the reader moving |
| AT-13 | A panel is enlarged, a second panel selected from the strip, and the controls, scores and detail regions are unmoved throughout |
| AT-14 | Every panel declaring help offers it, every panel without help offers no control, and a planted panel with an undeclared region is reported by name |
| AT-15 | A link to a selected cell opens the application on that cell; remounting the surface leaves the address unchanged |

Acceptance is **watched in the browser, not inferred from green tests** — this whole beat
exists because a suite of passing tests said nothing about whether the page could be
followed.

---

## 8.1 Amendment of 8 September 2026: the surface is a workspace

Beats 013 to 017 met every requirement in this document and the result still read as an article.
Measured at 2560 x 1440: a 1,344 px scrolling controls pane in a 1,440 px window, two fifths of
the surface empty, and state reported in sentences where an instrument shows a readout.

The requirements below are amended by feature 018 and ADR-0014. What changes is the realisation,
not the diagnosis of section 1.1.

- **FR-41** is unchanged in its demand -- one viewport, no scrolling -- and gains a distinction it
  lacked: a pane may scroll a **list** a reader scans, and may never scroll a **body of text**.
  The declared-scroller doctrine that let a column of prose satisfy this requirement is withdrawn.
- **FR-44 to FR-47** keep their division by rate of change and lose their realisation as a CSS
  grid of four fixed regions. The surface is a docked pane workspace whose panes fill the screen.
  In particular **FR-46**'s scores move *inside* each horizon panel rather than into a separate
  region aligned to it, which is what the requirement asked for and is not achievable across
  independent panes.
- **FR-48** stands, and is narrowed: an empty region still says what would appear in it, in as
  few words as will do it. It is not a licence for explanation on the surface.
- **New: explanation belongs to help (FR-52) or to a walkthrough.** The walkthrough that FR-52
  retired returns to explain the *workspace*; panel help continues to explain each panel. They
  answer different questions.
- **New: the workspace arrangement may persist.** Principle IX forbids persisting forecast inputs
  and outputs; pane geometry is neither. See ADR-0014.
- **FR-43 is unchanged in what it does and compacted in what it says.** The below-the-floor
  answer said the size it needed in two paragraphs, which was an explanation on the surface and
  was the first thing a reader at a small window met. It states the size as a declared figure,
  in one line; the explanation is the walkthrough's.
- **The declared floor is measured from the workspace and not from fixed tracks.** Beat 013's
  2 038 x 728 was 828 px of chrome that could not shrink, so an ordinary 2 000 px monitor got
  the fallback. In a workspace the flanking panes flex to the width below which they cannot be
  read, and the measured floor is **1 658 x 960**. The reference viewport is declared on both
  axes and is **2 560 x 1 440**.

## 9. Open questions

- Whether the controls column stays fixed or gains its own disclosure as it grows. It is
  small today and the requirement above assumes it stays small.
- Whether attribution is genuinely derived from the analysis's own weights (SRD-v1 FR-17)
  in the code as built. The refactor will make this visible; if it is computed separately
  for display, that is a finding under FR-40 and belongs in the record before it is fixed.
- What the smallest viewport actually is. FR-43 requires a number; the number comes from
  measuring the built layout rather than from choosing one now.
