# Software Requirements Document
## j-ocean, Version 1

**Status:** Draft, 5 September 2026 — written from the design conversation that settled
the model tier, the horizon row, the attribution field and the truth-scored sampling
experiment.
**Author:** Doc

j-ocean is a browser-resident ocean forecast model and the harness that teaches with it.
The model and the harness carry one name deliberately: the harness is not a viewer bolted
onto a library, and the model exists to be interrogated rather than to be run.

Requirements are numbered fresh. Where something is deferred it is recorded in §10 with
the condition that would bring it forward — a deferral without a trigger is an omission
wearing better clothes.

---

## 1. Purpose

j-ocean is a personal learning instrument for oceanographic forecasting: a small,
genuinely-integrating ocean model, scored against recorded truth, wrapped in a surface
that makes visible *where a forecast's answer came from* and *what a measurement was
worth*.

Three purposes, in strict priority order:

1. **Understanding** — how the contributions to a forecast trade against one another as
   lead time grows. A curve on a slide asserts that persistence decays; a thing the
   reader drags demonstrates it.
2. **Teaching** — the same understanding transferred to a reader who knows the ocean and
   not the numerics, without a lecture.
3. **Evidence** — modest, specific, falsifiable claims about sampling and forecast skill,
   scored against a truth record the harness did not author.

- **NFR-01 (Reviewability.)** The whole system shall be reviewable as one TypeScript
  codebase and observable in one browser. Data preparation is the one permitted exception
  and is a build step, never a runtime dependency (§4).

### 1.1 What this is not

- **FR-01** j-ocean holds no tracked entities of any kind. It models an ownship, a
  sampling track and the instruments on it; it never holds an entity whose position it
  infers rather than knows. No customer, project or bid material appears anywhere in the
  repository.
- **FR-02** j-ocean is not an operational forecast system and its surface shall say so
  where a reader meets it. Its numerics are real but reduced, its domain small, and its
  claims are about *relative* skill between references it computes itself.

---

## 2. Architecture

One browser application in three parts, and the boundaries between them are the design.

- The **model**: a reduced-gravity ocean integrating in typed arrays, knowing nothing
  about display.
- The **assimilation and scoring**: analysis, references, skill, and the per-cell
  attribution the display draws.
- The **harness**: the surface — horizon panels, attribution layer, profile editor,
  controls — which reads results and never reaches into the integration.

- **FR-03** The model shall be callable headlessly, with no import of any rendering
  module, so that it can be exercised by test and by a future worker or GPU
  implementation without the harness present. The harness may not read model internals;
  it reads published fields and derived diagnostics.

### 2.1 Honest ports

Genuine ports, each with more than one conceivable implementation: the **model kernel**
(state in, advanced state out — CPU today, GPU later, §10), the **RNG**, the **clock**,
and the **truth source** (a committed HYCOM subset today, conceivably another reanalysis).
Nothing else is dressed as a port.

- **FR-04** The CPU kernel is the **reference implementation** and shall remain so after
  any faster kernel lands. A second kernel is accepted only against the reference's
  output to a stated tolerance, and the tolerance is recorded rather than assumed.

---

## 3. The model

- **FR-05** The dynamical core shall be a **one-and-a-half layer reduced-gravity model**
  on a regular grid: an active upper layer over a motionless deep layer, integrated with
  a stated timestep under a stated stability criterion. The choice is deliberate and its
  reason is recorded: the questions this harness exists to ask are about *combination of
  information*, not about dynamics, and the simplest core that produces genuine eddies
  and fronts is therefore the right one.
- **FR-06** The grid shall be **configurable and shall start at 100 × 100**. The
  integration step time shall be measured and reported by the harness, and the resolution
  raised only until a declared frame budget is reached. The budget is a number in
  configuration, not a judgement made at review time.
- **FR-07** Depth shall be **displayed but not integrated** in Version 1: the vertical
  structure a reader sees is diagnosed from layer state, never advected. Every surface
  drawing a depth profile shall state that the levels between the model's own are
  **derived**. Dynamic depth is deferred, with its trigger, in §10.
- **FR-08** All stochastic behaviour shall derive from **seeded streams** recorded in a
  run manifest, and a run shall reproduce from its manifest. No entropy anywhere
  operational; no host clock read for any purpose the model depends on.

---

## 4. Truth and observations

The harness's claims are worth what its truth record is worth. Two external datasets,
both freely obtainable, both converted at build time and committed as derived artefacts.

- **FR-09** The **truth record** shall be a subsetted **HYCOM** reanalysis field for the
  chosen domain, obtained over OPeNDAP so the subset is taken server-side, converted from
  NetCDF to the harness's own committed format by a script in the repository. A **drift
  gate** shall regenerate the artefact and fail the build on any difference, which is what
  makes it derived output rather than a fixture.
- **FR-10** The **observation record** shall be **Argo** profiles for the same domain and
  period, taken from the open Ifremer mirror by filtering the global profile index before
  downloading anything. Argo's own quality flags shall be carried through the conversion
  and honoured, not silently dropped.
- **FR-11** The default domain shall be a region with **genuine mesoscale structure** —
  the Gulf Stream front — because adaptive sampling is meaningless in a uniform ocean and
  a harness that demonstrated it in one would be demonstrating an artefact of its own
  configuration. A **second, deliberately bland domain** (an open-gyre box) shall be
  offered alongside, so a reader can watch the same machinery buy nothing there. That
  contrast is a requirement, not a bonus.

  *The domain is sized so that resolved features span usefully many cells: a five-degree
  box at 100 × 100 gives roughly 5 km cells against meanders and rings of 50–200 km. The
  front itself is sharper than that, so the model works at a slightly coarser scale than
  the truth field. That is stated rather than hidden, and a tighter box is available for
  a higher-resolution study.*

- **FR-12** **The model shall never see truth except through a simulated instrument.**
  A synthetic observation is truth sampled at a chosen position, depth and time, with
  declared instrument noise and declared error characteristics applied. Any code path by
  which a truth value could reach the analysis unmediated is a defect of the first order,
  and a test shall hold the boundary.

---

## 5. Functional requirements

### 5.1 The horizon row

- **FR-13** The primary surface shall be a **row of six panels** at declared lead times —
  6, 12, 24, 48, 72 and 96 hours — read left to right, all six visible at once. This is
  specified in place of a time slider and the reason is the requirement: a slider asks the
  reader to hold the previous frame in memory, which is the one thing a reader cannot
  reliably do, and what is not on screen is what the eye forgets. A grid is rejected for
  the hesitation at the row break.
- **FR-14** Each panel shall be **enlargeable in place**, because the attribution layer
  and the observation marks of §5.2 and §5.4 cannot be read at row width. The row carries
  the shape of the change; the enlarged panel carries the detail. Enlarging shall change
  what is shown and never what is computed.
- **FR-15** Every panel shall state the **instant it is valid for** and the **instant its
  forecast was initialised from**, because a panel that shows only a lead time is
  ambiguous the moment §5.5's issue-time control is touched.

### 5.2 Attribution

- **FR-16** Attribution shall be drawn as a **field, not a summary**: every cell carries
  its own mix of contributions — observations, advected background, climatology — because
  a single bar for a panel would average a bright observed patch together with an
  unvisited corner and be true of nowhere. This requirement exists because the row of
  summary bars was specified first and was wrong.
- **FR-17** The attribution field shall be **derived from the analysis itself** — the
  weight each source actually carried in each cell — and never authored beside it. A
  picture computed from the same arithmetic as the answer cannot disagree with it; a
  picture painted to illustrate the answer can, and eventually will.
- **FR-18** A reader hovering or selecting a cell shall be shown that **cell's own
  breakdown**. The bar chart survives as an instrument of the cell, not of the panel.
- **FR-19** The field shall be legible in greyscale and shall not rely on a three-way
  colour blend alone to carry its meaning.

### 5.3 Scoring

- **FR-20** Forecast error shall be reported as **skill against two references**:
  **persistence** (the initial field held constant) and **climatology** (the long-term
  mean for the domain and season). A raw error figure shall never appear without at least
  one reference beside it, because it means nothing on its own.
- **FR-21** Skill shall be stated so that zero means *no better than the reference* and
  negative means *worse*, and the display shall say **in those terms** when the model is
  not earning its compute. A harness that could only report success would be a
  demonstration of nothing.
- **FR-22** Every score shall name **what it was computed against, where, and over what
  window**. A score whose provenance is not on screen is an assertion.

### 5.4 The observation footprint

- **FR-23** The surface shall draw **where the vessel has been and what it measured**:
  the ownship track as a line carrying its surface measurements, and **XBT drops as
  vertical needles** through the displayed volume, each drawn at the depths it genuinely
  sampled. A drop flattened to the surface would discard the dimension it exists for.
- **FR-24** An observation that was quality-flagged shall be **drawn as flagged**, not
  omitted. What the harness rejected is part of what the harness did.

### 5.5 The shore forecast, on two axes

- **FR-25** The harness shall carry a **shore-issued forecast** with two independently
  adjustable axes: the instant it was **issued** and the **lead time** being asked of it.
  Separating them is the point — staleness and lead time are routinely conflated, and only
  two controls can pull them apart. Sliding issue time back shall drop the whole skill
  curve bodily with nothing else changed.
- **FR-26** The harness shall carry a **departure brief**: the forecast the vessel sailed
  with, authored as **persistence from the quay-side instant** and never refreshed. It is
  wrong in the way a real brief is wrong — correct at issue and losing to the world on its
  own — and it is the baseline everything else is watched against.
- **FR-27** Where a forecast is being asked for an instant outside its own validity, the
  surface shall **say so** rather than extrapolate silently.

### 5.6 Counterfactuals

The interactions that turn a claim into something the reader caused.

- **FR-28** A reader shall be able to **select an XBT and edit its profile** by dragging
  points on a line graph. The analysis reweights, the model reruns, and the forecast
  changes. **The measured profile shall remain drawn as a ghost** behind the edit, so the
  departure from what was actually observed is never lost.
- **FR-29** The consequence of an edit shall be offered as a **difference field** as well
  as a new forecast, because the instructive quantity is *where the edit propagated and how
  far*, which a pair of similar-looking fields does not show.
- **FR-30** An edit shall update **every horizon in the row**. An initial condition
  changed is an initial condition changed, and the ghost at each horizon supplies the
  comparison without a second mode.
- **FR-31** A reader shall be able to **withhold an observation** — toggle it off, rerun,
  read the skill drop. That is the value of a single measurement, priced.
- **FR-32** A reader shall be able to **break an instrument**: introduce a declared bias
  and watch it propagate. Quality control shall be toggleable, so a reader can watch the
  bias be caught, and watch it poison the analysis when it is not.
- **FR-33** A reader shall be able to **redraw the track**. Observations are resampled
  from truth at the new positions (FR-12), the run repeats, and the skill score answers
  whether that was a better place to have sailed.
- **FR-34** Every counterfactual shall be **reversible to the recorded case** in one
  action, and the surface shall always say whether what is displayed is the recorded run
  or an edit of it.

### 5.7 Adaptive sampling *(deferred to a later feature; specified here so it is not
re-invented)*

- **FR-35** Sensitivity shall be computed by **ensemble**: perturb the observations within
  their declared instrument error, integrate the members, and report the spread. Where
  members diverge, ignorance matters and sampling is worth spending; where they agree,
  further sampling buys nothing — and the second finding is the more useful one.
- **FR-36** The harness shall offer a **paired experiment**: two runs from identical
  initial conditions under an identical time budget, one following a fixed lawnmower
  track, one steered by sensitivity, each sampling truth along its own path.
- **FR-37** The paired experiment shall be presented so that **the adaptive run losing is
  a reportable result**. Where sensitivity concentrates somewhere the vessel cannot reach
  within its budget, the naive track wins, and that outcome teaches that the binding
  constraint is transit rather than information. A harness that could only show the
  adaptive run winning would be an advertisement.

---

## 6. Non-functional requirements

- **NFR-02** j-ocean builds to **static assets**; the demo is a URL. Each visit
  provisions a fresh seeded run; nothing persists between visits; manifest export and
  import provide replay.
- **NFR-03** **Toolchain:** TypeScript 5, React, a WebGL rendering surface, vitest,
  Playwright, pnpm. Data conversion is permitted a second runtime as a build step alone
  and shall be a single script with its inputs and outputs named (FR-09, FR-10).
- **NFR-04** The integration shall not block the interface: step time shall be measured
  and reported, and a run that would exceed the declared budget shall say so rather than
  freeze the page.
- **NFR-05** Every figure the surface draws shall be traceable to the computation that
  produced it. Declared, computed and derived figures shall be typographically distinct
  and shall not change kind between states.

---

## 7. Development process

- **PR-01** The repository is public but unadvertised; no customer, project or bid
  material anywhere in it.
- **PR-02** Feature development follows spec-kit: constitution → specify → plan → tasks →
  analyze → implement, one feature per beat above.
- **PR-03** An **ADR** is written for any decision that is hard to reverse, was genuinely
  contested, or where a plausible alternative was rejected — the model tier, the kernel
  port, the horizon presentation and the truth-source choice each earn one. Deferrals are
  recorded as ADRs in the *assessed, deferred, cheap to adopt* posture with their trigger
  stated.
- **PR-04** **A check that has never been seen to fail is worth nothing.** Every gate is
  watched failing against a planted violation before it is trusted, and the commit message
  says so.
- **PR-05** **The tree is the authority and the record is a claim about it.** Where the
  two disagree, check the tree, then fix the record. The reason for declining a task is
  written at the moment it is declined.

---

## 8. Quality gates

- **G-01** Truth and observation artefacts regenerate identically (FR-09, FR-10).
- **G-02** No truth value reaches the analysis except through a simulated instrument
  (FR-12).
- **G-03** No rendering module is imported by the model (FR-03).
- **G-04** No wall-clock read and no unseeded randomness in operational code (FR-08).
- **G-05** Every horizon declared in configuration is rendered, and no panel is drawn for
  a horizon that is not declared (FR-13).
- **G-06** Attribution is read from the analysis's own weights and from nowhere else
  (FR-17).

---

## 9. Acceptance criteria

| ID | Test |
|---|---|
| AT-01 | The model integrates a recognisable eddy field over the Gulf Stream domain and conserves its declared invariants to a stated tolerance |
| AT-02 | Forecast skill against persistence is positive at 24 h and decays with lead time, scored against the committed HYCOM truth |
| AT-03 | Withholding a single XBT measurably degrades skill in its neighbourhood and demonstrably not elsewhere — influence is local and the harness shows the radius |
| AT-04 | A run reproduces from its exported manifest, the counterfactual state included |
| AT-05 | The bland-domain configuration produces flat sensitivity, and the harness says so rather than drawing a pattern in noise |
| AT-06 | A dragged profile edit propagates visibly at 24 h and negligibly at 96 h, watched in the shell rather than inferred from a green test |

---

## 10. Deferred, with triggers

Nothing here is dropped; each entry names what would bring it forward.

- **Dynamic depth levels.** A true 3D grid with vertical advection and diffusion, roughly
  twenty-five times the arithmetic and a tridiagonal solve per water column for the
  vertical stiffness. **Deferred.** *Trigger:* when the diagnosed profile of FR-07 stops
  being defensible against the XBT observations drawn beside it — that is, when a reader
  can see the derived structure disagree with what an instrument measured.
- **GPU kernel (WebGPU).** **Deferred**, and cheap to adopt because FR-04 keeps the CPU
  reference. *Trigger:* when the resolution demanded by FR-06's frame budget stops rising
  on the CPU before features of interest are resolved.
- **Adaptive sampling (§5.7).** Specified, unbuilt. *Trigger:* once scoring (§5.3) and the
  counterfactuals (§5.6) are landed and trusted, since the paired experiment is worthless
  without a skill score anyone believes.
- **Observation latency and arrival order.** Replaying a run with observations arriving
  late or out of order, to price timeliness separately from quantity. *Trigger:* once the
  withhold interaction (FR-31) exists, of which this is a generalisation.

---

## 11. Open questions

- How the two axes of §5.5 are presented together without a two-dimensional control that
  nobody can read.
- Whether climatology is computed from the HYCOM subset itself or brought in separately,
  and what that costs in independence when climatology is also a scoring reference.
- The exact vertical levels the display carries, and how the derived-versus-integrated
  distinction is drawn at each.
