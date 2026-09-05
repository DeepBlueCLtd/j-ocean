# Feature Specification: Foundation and Ports

**Feature Branch**: `001-foundation-and-ports`

**Created**: 2026-09-05

**Status**: Draft

**Input**: User description: "Foundation: toolchain, the four ports, seeded determinism, run manifest and the structural gates"

**SRD coverage**: NFR-01, NFR-02, NFR-03, FR-03, FR-04 (port only), FR-08, §2.1, G-03, G-04, PR-04, AT-04 (headless half)

## Why this beat exists

Nothing in the SRD can be built honestly until three things are true: time and randomness
come from ports and nowhere else, the model can be run and replayed without a browser, and
the gates that hold those boundaries have been watched failing. This beat delivers no
ocean. It delivers the shape every later beat fills in, and the proof that the shape is
enforced.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A run replays from its manifest (Priority: P1)

A developer starts a headless run from a seed, lets it advance a number of steps through
a trivial kernel, exports the run manifest, then starts a second run from that manifest
alone. The two runs produce byte-identical state.

**Why this priority**: Deterministic replay is the one property the SRD says cannot be
retrofitted (FR-08, AT-04). Every counterfactual in §5.6 is a replay with one thing
changed. If this story does not hold on day one it never will.

**Independent Test**: A vitest test constructs two runs, one from a seed and one from the
first's exported manifest, advances both, and compares state arrays byte for byte.

**Acceptance Scenarios**:

1. **Given** a root seed and a configuration, **When** a run is created, advanced 100
   steps and its manifest exported, **Then** the manifest records the root seed, every
   per-component derived seed, the generator version, the clock configuration and the
   configuration digest.
2. **Given** an exported manifest, **When** a run is created from it and advanced the same
   number of steps, **Then** its state is byte-identical to the original's.
3. **Given** a manifest whose configuration digest does not match the loaded
   configuration, **When** a run is created from it, **Then** creation fails with a
   message naming the digest mismatch, and no run exists.
4. **Given** two components each asking the RNG port for a stream, **When** both draw
   values, **Then** each stream is independent of the other's draw order, because each is
   derived from the root seed and a component name, not from shared state.

---

### User Story 2 - The gates are watched failing (Priority: P1)

A gate author introduces the host-time gate, the model-import gate and the vocabulary
gate. For each, they plant a violation in a scratch file, run the gate, watch it fail
naming the file and line, remove the violation, watch it pass, and record all of that in
the commit message.

**Why this priority**: PR-04. A gate that has never failed is worth nothing, and the
foundation's only demonstration is its gates failing on demand.

**Independent Test**: A test fixture directory contains one planted violation per gate;
running each gate against its fixture exits non-zero and names the violation; running
against the tree exits zero.

**Acceptance Scenarios**:

1. **Given** a file under `src/model/` that reads `Date.now()`, **When** the host-time gate
   runs, **Then** it exits non-zero and prints the file path and line.
2. **Given** a file under `src/model/` that imports from `src/harness/` or from `react`,
   **When** the model-import gate runs, **Then** it exits non-zero and prints the offending
   import.
3. **Given** a line carrying `// j-ocean:allow-host-time step timing`, **When** the
   host-time gate runs, **Then** it passes that line and lists the marker in its summary so
   it can be reviewed.
4. **Given** a file anywhere in the tree containing a word on the forbidden list, **When**
   the vocabulary gate runs, **Then** it exits non-zero and names the file; **and** a file
   containing the word "track" in ordinary navigational use passes.
5. **Given** a clean checkout, **When** `pnpm gates` is run, **Then** every gate in the
   tree runs, in order, and the command exits zero.

---

### User Story 3 - The shell opens and says what it is (Priority: P2)

A reader opens the built static site. The page loads its declared configuration,
validates it, provisions the recorded run, and shows a shell that says in plain words that
j-ocean is not an operational forecast system and that everything on screen is a relative
claim between references it computes itself.

**Why this priority**: NFR-02 (static assets; a URL) and FR-02 (the surface says what it
is not). This is the first thing a reader meets and it must be true before there is
anything else to meet.

**Independent Test**: A Playwright test loads the built site from a static file server,
asserts the not-operational statement is visible without scrolling, and asserts the
manifest's root seed is shown.

**Acceptance Scenarios**:

1. **Given** the site is built with `pnpm build`, **When** it is served statically and
   opened, **Then** no network request is made other than for the site's own assets.
2. **Given** the page has loaded, **When** the reader looks at it, **Then** the
   not-operational statement of FR-02 is visible without scrolling and cannot be dismissed.
3. **Given** a configuration file that fails schema validation, **When** the page loads,
   **Then** it shows the validation error and provisions no run.
4. **Given** a fresh visit, **When** the page loads, **Then** the run shown is the recorded
   case (the default seed from configuration), and the page states the seed.
5. **Given** the reader chooses "new run", **When** the action completes, **Then** a root
   seed is drawn once, a new manifest exists, and the page says the run is no longer the
   recorded case.

---

### User Story 4 - The four ports have a contract and a reference implementation (Priority: P3)

A developer reads `src/ports/` and finds exactly four interfaces — kernel, RNG, clock,
truth source — each with a contract test and at least one implementation the contract
test exercises.

**Why this priority**: §2.1 honest ports. Defining the ports now, before any of them has
a second implementation, is what keeps the second implementation cheap later and keeps a
fifth port from appearing by drift.

**Independent Test**: A contract test suite runs against every registered implementation
of each port; the trivial kernel and the constant truth source pass it.

**Acceptance Scenarios**:

1. **Given** the kernel port, **When** a trivial reference kernel (identity, or a scalar
   diffusion on the grid) is registered, **Then** the contract test advances a state
   through it and confirms shape, dtype and determinism.
2. **Given** the clock port, **When** the simulation clock advances by a step, **Then**
   every consumer sees the same instant and no consumer can advance it independently.
3. **Given** a developer adds a fifth file to `src/ports/`, **When** the port-count test
   runs, **Then** it fails and its message points to constitution Principle VIII.

---

### Edge Cases

- A manifest exported by a newer code version is imported by an older one: the generator
  version differs, creation fails with a message naming both versions (fuller treatment in
  feature 011).
- The configuration digest is computed over a canonical serialisation, so a whitespace
  change to the configuration file does not change it, and a value change always does.
- A component asks for the same named stream twice: it receives the same sequence from
  the start both times, never a continuation.
- The host clock exemption marker appears outside the timing module: the gate fails,
  because the marker is permitted only where the constitution places it.
- `pnpm gates` is run on a machine without Python: gates 3–9 run; G-01 (feature 002)
  reports "skipped: no Python" as a failure, not a pass, because a skipped gate is not a
  passed gate.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The repository MUST be a pnpm workspace with TypeScript 5, React, vitest,
  Playwright and eslint configured, building to static assets with one command (NFR-03,
  NFR-02).
- **FR-002**: `src/ports/` MUST contain exactly four port interfaces — model kernel, RNG,
  clock, truth source — and a test MUST fail if a fifth is added (§2.1, constitution VIII).
- **FR-003**: The RNG port MUST provide named, independently-derived streams from a single
  root seed, and MUST record every derived seed in the run manifest (FR-08).
- **FR-004**: The clock port MUST be the only source of simulation time; it MUST be
  advanced by the run and by nothing else.
- **FR-005**: A run manifest MUST record root seed, derived seeds, generator version, clock
  configuration, configuration digest and a counterfactual-state slot (empty until feature
  010), and a run MUST be constructible from a manifest alone (FR-08, AT-04).
- **FR-006**: A run created from a manifest MUST reproduce the original's state
  byte-identically for the same code version, and this MUST be a test.
- **FR-007**: Gate G-04 MUST fail the build on any read of `Date.now`, `new Date()`,
  `performance.now`, `Math.random`, `crypto.getRandomValues` or `crypto.randomUUID` in
  operational code, MUST honour the `j-ocean:allow-host-time` marker only inside the
  timing module and the seed-provisioning step, and MUST list every marker it honoured.
- **FR-008**: Gate G-03 MUST fail the build on any import into `src/model/` from
  `src/harness/`, `react`, `react-dom`, or any WebGL or DOM-typed module (FR-03, G-03).
- **FR-009**: The vocabulary gate MUST fail the build on any tracked file containing a word
  from a reviewed list held beside the gate, and MUST NOT list "track" (constitution VII).
- **FR-010**: Every gate MUST be runnable locally by `pnpm gates`, MUST exit non-zero on
  a planted violation held in a fixture directory, and the commit introducing each gate
  MUST say it was watched failing (PR-04).
- **FR-011**: Configuration MUST be loaded by one module, validated against a schema
  before any computation, and a validation failure MUST be a readable startup error
  (constitution X).
- **FR-012**: The default seed MUST be a declared configuration value (the recorded case);
  a "new run" action MAY draw entropy exactly once before a run exists and MUST write the
  drawn seed to the manifest (review R-4; constitution I exemption b).
- **FR-013**: The shell MUST display the FR-02 not-operational statement where a reader
  meets it, MUST state the run's root seed, and MUST say whether the run is the recorded
  case.
- **FR-014**: The model, ports and manifest MUST run under vitest in Node with no DOM, and
  this MUST be a test (FR-03).

### Key Entities

- **Port**: one of four interfaces; carries a contract test and a registry of
  implementations.
- **RunManifest**: the complete description of a run: seeds, versions, digests,
  counterfactual state. Serialisable to JSON; the unit of export and import.
- **Configuration**: declared values (Principle X), validated against a schema; digested
  into the manifest.
- **Run**: a clock, a set of derived streams, a kernel and a state, constructed from a
  seed or a manifest.
- **Gate**: a script under `scripts/gates/` with a fixture directory of planted
  violations.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Two runs, one from a seed and one from the first's manifest, compare
  byte-identical after 1,000 steps in the replay test.
- **SC-002**: Every gate present in the tree fails on its planted fixture and passes on
  the tree, and `pnpm gates` exits zero on a clean checkout.
- **SC-003**: The built site loads from a static server with zero external requests, and
  the not-operational statement is visible in the first viewport.
- **SC-004**: The headless test suite runs to completion with no DOM available.
- **SC-005**: `src/ports/` contains four interfaces and the port-count test passes.

## Assumptions

- **R-4 resolved**: "fresh seeded run per visit" means nothing is persisted between
  visits; the default seed is fixed in configuration and is the recorded case; "new run"
  draws entropy once.
- The trivial kernel in this beat is a placeholder for the contract test only and is
  replaced, not extended, by feature 003.
- The truth-source port is defined here with a constant-field implementation for the
  contract test; its real implementation over the committed format is feature 002.
- Node 22 and pnpm 10 are the development baseline; the browser target is current
  evergreen browsers with WebGL 2.
- No CLAUDE.md or agent guidance file is created in this beat; the constitution and the
  development plan are the guidance.
