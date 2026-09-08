<!--
Sync Impact Report
==================
Version change: 0.0.0 → 1.0.0 (initial ratification)
Modified principles: none (new establishment)
Added sections:
  - Core Principles I–X
  - Additional Constraints (Technology, Repository Layout, Data)
  - Development Workflow (Spec-driven development, Architecture Decision Records,
    Quality gates, Gates are watched failing, Demonstrability)
  - Governance
Removed sections: none
Templates requiring updates:
  ✅ plan-template.md — Constitution Check section is generic and reads this file at plan time
  ✅ spec-template.md — no change required
  ✅ tasks-template.md — no change required
Follow-up TODOs: none. Principle I carries two bounded exemptions from the outset
  (step-time measurement; drawing a fresh seed before a run exists). A third is
  argued on its own merits under the erosion clause, never by analogy.
Lineage: modelled on the drogna constitution 1.6.0 (sibling harness, same author,
  same spec-kit workflow) and the BrowserTest constitution 1.0.0 (this report
  block and the semantic-versioning policy).
-->

# j-ocean Constitution

**Purpose of this document.** These are the non-negotiables of the model and the harness
that teaches with it. Every spec-kit phase — `specify`, `plan`, `tasks`, `analyze`,
`implement` — is checked against them. A plan that violates a principle is rejected or
must carry an explicit, argued entry in its Complexity Tracking table and a corresponding
ADR.

Source of truth for scope is `j-ocean-srd.md`. This constitution does not restate the
requirements; it states the rules that constrain how any of them may be met. Where a
principle cites an SRD identifier, the requirement is the reason and the principle is the
rule.

---

## Core Principles

### I. Seeded Streams, No Wall-Clock, Deterministic Replay (NON-NEGOTIABLE)

All stochastic behaviour derives from seeded streams, and no operational code reads the
host clock. A run reproduces from its manifest.

- Every generator is constructed from a seed obtained from the run manifest, through the
  RNG port. No component calls a global or module-level RNG: `Math.random`,
  `crypto.getRandomValues`, `crypto.randomUUID`, or any library that wraps them, is
  prohibited in operational code.
- All simulation time comes from the clock port. Prohibited in operational code paths:
  `Date.now`, `new Date()`, `performance.now`, `requestAnimationFrame` timestamps used as
  simulation time, and any library that reads them on the model's behalf.
- Every run writes a manifest recording the root seed, per-component derived seeds, the
  generator version, the clock configuration, the configuration digest, and the
  counterfactual state (FR-34). A run replayed from its manifest produces byte-identical
  fields and scores for the same code version. This is a test (AT-04), not an aspiration.
- Identifiers that appear in stored data or manifests derive deterministically from seed
  and logical position, never from entropy or wall-clock.
- **Two exemptions, each bounded.** (a) *Step-time measurement* (FR-06, NFR-04): the
  harness's timing module may read `performance.now` around a kernel step to report how
  long the machinery took. The figure is host time, is typographically marked as such
  (Principle V), and never enters the run, the manifest or any simulation-time quantity.
  (b) *Provisioning a seed*: the shell may read entropy exactly once, before any run
  exists, to draw a root seed that is then written into a manifest. A run never reads
  entropy. Both exemptions measure or prime the machinery, not the simulation, and neither
  has a simulation-time answer even in principle. A third request is evidence the
  principle is being eroded and must be argued on its own merits, never by analogy.
- Enforced by gate G-04 (`scripts/gates/check-host-time.ts`), which runs in CI and fails
  the build. An exemption is an inline `// j-ocean:allow-host-time <reason>` marker, and
  every marker is reviewed.

*Rationale (SRD FR-08, G-04, NFR-02, AT-04): this is the one property that cannot be
retrofitted at acceptable cost. Deterministic replay dies the moment one component reads
the host clock, and every counterfactual in §5.6 is a replay with one thing changed.*

### II. Truth Is Sampled Only Through an Instrument (NON-NEGOTIABLE)

The model never sees truth except through a simulated instrument.

- A synthetic observation is truth sampled at a chosen position, depth and time, with
  declared instrument noise and declared error characteristics applied. The instruments
  module is the only module permitted to import the truth-source port for the purpose of
  producing observations.
- The `Observation` type is opaque and constructed in the instruments module alone. There
  is no constructor, cast or helper elsewhere by which a truth value becomes an
  observation. The analysis consumes observations, a background and a climatology, and
  nothing else.
- Scoring (Principle V) reads truth to compare a forecast against it after the fact. It
  returns figures, never fields that flow back into an analysis. The model and the
  analysis import neither the truth port nor the scoring module.
- Climatology is the one truth-derived quantity the analysis may consume directly, and it
  is a build-step artefact with its own provenance — the window it was computed over and
  the source it was computed from — never the truth field at or near the valid instant.
  How much independence this costs when climatology is also a scoring reference is
  recorded, not hidden (SRD §11).
- Enforced by gate G-02 (`scripts/gates/check-truth-boundary.ts`): an import-boundary
  check on `src/analysis/` and `src/model/`, and a type-level check that `Observation`
  has a single construction site. A test exercises the boundary behaviourally: an
  analysis run with instrument error set arbitrarily large recovers nothing of truth
  beyond the background.

*Rationale (SRD FR-12, G-02): any path by which a truth value reaches the analysis
unmediated is a defect of the first order, because every claim in §1 about the worth of a
measurement is made worthless by it.*

### III. The Model Knows Nothing About Display (NON-NEGOTIABLE)

The model is callable headlessly and the harness reads published fields only.

- `src/model/` imports no rendering module, no DOM API, no React and no WebGL. It runs
  under vitest in Node with no browser present, and that is a test, not a convention.
- The dependency direction is one way: `model` ← `analysis`, `scoring`, `instruments` ←
  `harness`. Nothing in the first two rings imports the third. The harness reads
  published fields and derived diagnostics through a declared results interface; it never
  reaches into integration state.
- Enlarging a panel, hovering a cell, or any other act of display changes what is shown
  and never what is computed (FR-14).
- Enforced by gate G-03 (`scripts/gates/check-model-imports.ts`) and by the headless model
  test.

*Rationale (SRD FR-03, G-03): the boundary is what makes a worker or GPU kernel possible
later without the harness present, and what makes the model reviewable as a model.*

### IV. Attribution Is Derived, Never Authored (NON-NEGOTIABLE)

The attribution field is the analysis's own weights, drawn as a field.

- Every cell carries the weight each source — observations, advected background,
  climatology — actually carried in that cell's analysis. The field is exported by the
  analysis alongside the analysis field, from the same arithmetic.
- There is exactly one producer of the attribution type, in `src/analysis/`. No module
  computes an attribution-like field from anything else; the harness reads it and may not
  blend, smooth, paint or otherwise construct one. A cell's breakdown (FR-18) is read from
  that cell's weights.
- A per-panel summary bar is forbidden as the primary attribution display; it was
  specified first and was wrong (FR-16). A summary may exist only as an instrument of a
  selected cell.
- Enforced by gate G-06 (`scripts/gates/check-attribution-source.ts`): the attribution
  type has one construction site and no writer in `src/harness/`.

*Rationale (SRD FR-16, FR-17, G-06): a picture computed from the same arithmetic as the
answer cannot disagree with it; a picture painted to illustrate the answer can, and
eventually will.*

### V. No Figure Without Its Provenance

Every figure the surface draws is traceable to the computation that produced it, and says
what it is.

- A raw error figure never appears without at least one reference beside it. Skill is
  reported against persistence and against climatology (FR-20), in the convention where
  zero means *no better than the reference* and negative means *worse* (FR-21), and the
  display says so in those words when the model is not earning its compute.
- Every score names what it was computed against, where, and over what window (FR-22).
  A score whose provenance is not on screen is an assertion and is a defect.
- Three kinds of figure — **declared** (configuration), **computed** (by the model or
  analysis) and **derived** (diagnosed from computed state, such as the depth levels of
  FR-07) — are typographically distinct and do not change kind between states (NFR-05).
  Every surface drawing a depth profile states that the levels between the model's own
  are derived.
- Every panel states the instant it is valid for and the instant it was initialised from
  (FR-15). A forecast asked for an instant outside its validity says so rather than
  extrapolating silently (FR-27). The surface always says whether what is displayed is
  the recorded run or an edit of it (FR-34).

*Rationale (SRD §5.3, NFR-05): the harness exists to make visible where an answer came
from. A number that cannot say is the thing it exists to replace.*

### VI. The Harness Can Lose

The harness is built so that failure is a reportable result.

- j-ocean is not an operational forecast system and its surface says so where a reader
  meets it (FR-02). Its claims are about relative skill between references it computes
  itself, scored against a truth record it did not author.
- The surface must be able to report that the model is worse than persistence (FR-21),
  that sensitivity in the bland domain is flat and the machinery bought nothing (FR-11,
  AT-05), and that the adaptive run lost to the lawnmower (FR-37). A path by which any of
  these outcomes cannot be shown, or is softened into a pattern drawn in noise, is a
  defect.
- There is no demo mode, no fixture that flatters, and no "populate for the screenshot"
  path. Every field on screen came from a run.

*Rationale (SRD §1, FR-21, FR-37): a harness that could only report success would be a
demonstration of nothing, and one that could only show the adaptive run winning would be
an advertisement.*

### VII. No Tracked Entities, No Customer Material (NON-NEGOTIABLE)

j-ocean holds no tracked entities of any kind, and never will.

- It models an ownship, a sampling track and the instruments on it. It never holds an
  entity whose position it infers rather than knows: no contact, no detection, no
  tracklet, nothing that is or implies one.
- No customer name, project name or bid-specific material appears anywhere in the
  repository: code, docs, data, commit messages, branch names or issue tracker. The
  repository is public but unadvertised (PR-01).
- The word "track" is ordinary navigational English for the path the vessel has
  travelled, and is not forbidden. What is forbidden is somebody else's.
- Enforced by the forbidden-vocabulary gate (`scripts/gates/check-vocabulary.ts`), whose
  word list lives beside it and is reviewed with it.

*Rationale (SRD FR-01, PR-01).*

### VIII. Honest Ports, and the CPU Kernel Is the Reference

j-ocean claims exactly the pluggability it has, and no more.

- Genuine ports, expressed as interfaces with more than one conceivable implementation:
  the **model kernel** (state in, advanced state out), the **RNG**, the **clock**, and
  the **truth source** (a committed HYCOM subset today, conceivably another reanalysis).
- Nothing else is dressed as a port. The analysis scheme, the renderer, the observation
  record format and the manifest format are choices, not ports. Introducing an
  abstraction over any of them requires an ADR arguing why. Interface-for-its-own-sake is
  a constitution violation.
- The CPU kernel is the reference implementation and remains so after any faster kernel
  lands. A second kernel is accepted only against the reference's output to a stated
  tolerance, and the tolerance is recorded in the accepting test and its ADR rather than
  assumed (FR-04).

*Rationale (SRD §2.1, FR-04, §10): the documentation does not claim more than the code
delivers, and the GPU kernel stays cheap to adopt because the reference never moves.*

### IX. Derived Artefacts, Not Fixtures

Truth and observation records are build outputs with a drift gate, not files someone once
saved.

- The truth record (a subsetted HYCOM reanalysis) and the observation record (Argo
  profiles, with their quality flags carried through and honoured) are produced by a
  single named script whose inputs and outputs are named, converted to the harness's own
  committed format, and committed (FR-09, FR-10).
- Gate G-01 regenerates each artefact and fails the build on any difference. Upstream
  inputs are identified by digest so that a drift is attributed to the tree or to the
  upstream, never guessed.
- Data preparation is the one permitted second runtime, is a build step, and is never a
  runtime dependency (NFR-01, NFR-03). The browser application depends on committed
  artefacts alone.
- The application builds to static assets; the demo is a URL. **No forecast input or output
  persists between visits** — no seed, no manifest, no edit, no observation, no computed
  quantity, in storage, in a cookie or in the URL; manifest export and import provide replay
  (NFR-02).
- **Workspace chrome is not a forecast input.** Where the surface is a layout the reader
  arranges, that arrangement — pane geometry and pane identity, and nothing else — may persist.
  The distinction is that a persisted run would be a second way to bring a forecast back with
  none of the manifest's checks, while a persisted pane width is a preference about furniture.
  What is stored is held by a key-set test in the same shape as the address grammar of feature
  017: a planted run key fails by name. (Amendment of 8 September 2026; ADR-0014.)

*Rationale (SRD §4, G-01): the harness's claims are worth what its truth record is worth,
and a record that cannot be regenerated cannot be trusted.*

### X. Declared in Configuration, Not Judged at Review

Every number the SRD calls declared is a value in configuration, validated at startup.

- Horizons (FR-13), grid size and frame budget (FR-06), timestep and stability criterion
  (FR-05), instrument noise and error characteristics (FR-12), domain extents (FR-11),
  and the validity window of a forecast (FR-27) live in configuration files validated
  against a schema before any computation. Invalid configuration is a startup failure
  with a readable message.
- Every horizon declared is rendered and no panel is drawn for a horizon that is not
  declared. Gate G-05 checks this in the running shell, not by reading the source.
- The integration does not block the interface: step time is measured and reported, and a
  run that would exceed the declared budget says so rather than freezing the page
  (NFR-04). The budget is a number in configuration, not a judgement made at review time.
- No component contains a literal path to a data artefact, a literal horizon, or a
  literal grid size. Configuration is loaded through one module.

*Rationale (SRD FR-06, FR-13, G-05, NFR-04).*

---

## Additional Constraints

### Technology

- **TypeScript 5** throughout; **React** for the shell; a **WebGL** rendering surface for
  fields; **vitest** for unit and headless tests; **Playwright** for the shell and for
  gate G-05; **pnpm**; **eslint** and **tsc --noEmit** in CI (NFR-03).
- **Python 3.11** is the single permitted second runtime, for data preparation only:
  fetching the HYCOM subset over OPeNDAP, filtering the Argo index, and converting both
  to the committed format. It is invoked as a build step, is never imported or spawned by
  the application, and lives entirely under `data/scripts/`.
- The model integrates in typed arrays (`Float32Array` / `Float64Array`), never in
  arrays of objects.
- The whole system is reviewable as one TypeScript codebase and observable in one
  browser (NFR-01). A plan that introduces a service, a server or a second application
  must say why in its Complexity Tracking table.

### Repository Layout

Feature work stays inside its own directories. The canonical layout is:

```text
j-ocean-srd.md                 # scope; the record this constitution constrains
.specify/                      # spec-kit memory, templates, scripts
specs/NNN-name/                # one directory per feature beat
docs/adr/                      # architecture decision records
docs/development-plan.md       # the sequence of beats and what each demonstrates
config/                        # declared values, schema-validated (Principle X)
data/scripts/                  # Python build step (Principle IX); the only Python
data/truth/, data/obs/         # committed derived artefacts
src/ports/                     # the four ports and nothing else (Principle VIII)
src/model/                     # kernel, grid, state; imports nothing above it
src/instruments/               # the only producer of Observation (Principle II)
src/analysis/                  # analysis and the attribution weights (Principle IV)
src/scoring/                   # references and skill (Principle V)
src/harness/                   # React shell, WebGL surface, controls
scripts/gates/                 # G-01 to G-06, runnable locally with one command
tests/                         # headless, boundary and shell tests
```

A plan that proposes a new top-level directory must say why.

### Data

- Committed artefacts are produced by scripts, never edited. A fresh checkout is
  equivalent to a long-running one.
- The default domain is the Gulf Stream front; a second, deliberately bland open-gyre
  domain is offered alongside it (FR-11). Both are declared in configuration and both
  artefacts are gated.
- The Argo quality flags are carried through conversion and are honoured by the analysis;
  a flagged observation is drawn as flagged, never omitted (FR-24).

---

## Development Workflow

### Spec-driven development

Feature development follows spec-kit: constitution → specify → plan → tasks → analyze →
implement, one feature per beat (PR-02). Every feature has a `specs/NNN-name/` directory
containing at minimum `spec.md`, `plan.md` and `tasks.md`. The sequence of beats is
`docs/development-plan.md`.

### Architecture Decision Records

An ADR in `docs/adr/` is required for any decision that is hard to reverse, was genuinely
contested, or where a plausible alternative was rejected (PR-03). Routine choices do not
earn one. Four are owed from the SRD and are written before the beat that depends on
them: the model tier (FR-05), the kernel port (§2.1, FR-04), the horizon presentation
(FR-13), and the truth-source choice (FR-09). Deferrals (SRD §10) are recorded as ADRs in
the *assessed, deferred, cheap to adopt* posture with their trigger stated. ADRs are
numbered, dated, and carry Status / Context / Decision / Consequences.

### Quality gates

Every change must pass, in CI:

1. `eslint` and `tsc --noEmit`.
2. `vitest`, including the headless model test (Principle III) and the replay test
   (Principle I).
3. **G-01** artefact drift (Principle IX).
4. **G-02** truth boundary (Principle II).
5. **G-03** model imports (Principle III).
6. **G-04** host time and unseeded randomness (Principle I).
7. **G-05** declared horizons rendered, in Playwright (Principle X).
8. **G-06** attribution source (Principle IV).
9. The forbidden-vocabulary gate (Principle VII).
10. **G-07** surface invariance (SRD-v2 FR-40): for the recorded case, every computed field,
    score and derived quantity is compared against a committed record of its digest, so a
    beat that claims to move no number is held to it rather than believed.
11. **G-08** help coverage (SRD-v2 FR-53, FR-54, AT-14): every region or layer a panel
    declares has an explanation, every explanation names a panel and a feature that exist,
    and every panel the layout draws is declared — so a surface that declared nothing would
    fail rather than pass trivially.

Gates 3 to 11 live in `scripts/gates/` and run locally with one command.

### Gates are watched failing

A check that has never been seen to fail is worth nothing (PR-04). The commit that
introduces a gate plants a violation, watches the gate fail, removes the violation, and
says so in its message. A gate whose introducing commit does not say so is not yet
trusted, and the plan that relies on it says so.

### Demonstrability

Each beat is demonstrable before the next begins. "Demonstrable" means runnable from a
clean checkout with one command and visible in the browser, with the exception of the
foundation beat, whose demonstration is its gates failing on planted violations.

---

## Governance

This constitution supersedes other practices. Where a spec, plan or task conflicts with
it, the constitution wins and the artefact is amended.

- The tree is the authority and the record is a claim about it (PR-05). Where the two
  disagree, check the tree, then fix the record. The reason for declining a task is
  written at the moment it is declined.
- Amendments require an ADR recording what changed and why, a version bump here, and a
  dated line in the amendment log below.
- Every plan carries a Constitution Check section that names each principle it touches
  and how it complies.
- Violations that are genuinely necessary are recorded in the plan's Complexity Tracking
  table with the simpler alternative and why it was rejected. An unrecorded violation is
  a defect.
- Versioning is semantic. **MAJOR**: a principle removed or redefined so that
  previously-compliant work is no longer compliant. **MINOR**: a principle or section
  added, or guidance materially expanded, including a new bounded exemption. **PATCH**:
  clarification, wording, or a non-semantic refinement.

**Version**: 1.2.0 | **Ratified**: 2026-09-05 | **Last Amended**: 2026-09-08

*1.1.0 — 2026-09-21, ADR-0013. Two gates added to the schedule: **G-07 surface invariance**,
which landed in beat 013 and had been running in CI unlisted ever since, and **G-08 help
coverage**, which lands in beat 016. Recording G-07 late is the finding, not the fix: a gate
that runs and is not on the schedule is a gate nobody would notice the absence of. No principle
changed, so previously-compliant work remains compliant.*

*1.0.0 — ratified against SRD v1 (draft of 5 September 2026). Ten principles: five
non-negotiable (I, II, III, IV, VII), five binding but arguable (V, VI, VIII, IX, X). Principle I opens with two bounded exemptions rather
than accreting them, because the SRD itself asks for step-time measurement (NFR-04) and
a fresh seed per visit (NFR-02); the erosion clause is inherited from drogna 1.3.0.*
