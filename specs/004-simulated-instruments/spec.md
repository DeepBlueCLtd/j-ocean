# Feature Specification: Simulated Instruments

**Feature Branch**: `004-simulated-instruments`

**Created**: 2026-09-05

**Status**: Draft

**Input**: User description: "Simulated instruments: ownship track, surface measurements, XBT drops, declared error, QC flags"

**SRD coverage**: FR-01, FR-10 (Argo in the analysis), FR-12, FR-24, FR-32 (bias declaration), G-02, review R-1, R-3

## Why this beat exists

The model never sees truth except through a simulated instrument. This beat is the only
place in the codebase where a truth value becomes an observation, and it is where the
declared noise, the declared error characteristics, the quality flags and the observation
operator all live. Everything the harness later says a measurement was worth is priced
here.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The ownship samples the surface along its track (Priority: P1)

A recorded case declares an ownship track: a sequence of positions and instants. A
surface instrument samples truth at each, applies declared noise and error
characteristics, and emits observations.

**Why this priority**: The track and its surface measurements are the first observations
the analysis will use and the first thing the footprint (feature 008) draws.

**Independent Test**: With noise declared zero, the observation equals the truth-port
value at that position and instant; with noise declared, the residuals over many draws
have the declared variance.

**Acceptance Scenarios**:

1. **Given** a declared track and a surface instrument with declared noise, **When** the
   instrument samples, **Then** it emits one observation per track instant, each carrying
   position, instant, depth zero, value, instrument identity and the declared error
   characteristics.
2. **Given** noise declared zero, **When** the instrument samples, **Then** each value
   equals the truth-port value exactly.
3. **Given** noise declared with a variance, **When** the instrument samples across many
   seeded draws, **Then** the residual variance matches the declared variance within a
   declared statistical tolerance, and the draws are reproducible from the manifest.

---

### User Story 2 - XBT drops sample the column (Priority: P1)

The recorded case declares XBT drops: a position, an instant and the depths reached. Each
drop samples truth at those depths, applies the declared noise and a declared
depth-dependent error, and emits a profile observation that the analysis reads through the
declared observation operator.

**Why this priority**: The XBT is the instrument every counterfactual in feature 010 edits,
withholds or breaks, and review R-1 makes its operator the hinge of the harness.

**Independent Test**: A drop's profile at zero noise reproduces the truth column at the
sampled depths; the operator maps that profile to an interface-depth observation whose
value agrees with the truth interface depth to a stated tolerance.

**Acceptance Scenarios**:

1. **Given** a declared drop, **When** it samples, **Then** it emits a profile observation
   with one level per declared depth, each level carrying value, flag and the depth
   actually sampled.
2. **Given** the profile, **When** the observation operator is applied, **Then** it returns
   the interface depth implied by the profile under the declared two-layer thermal
   structure, with an error variance propagated from the level errors.
3. **Given** a profile whose deepest level is above the true interface, **When** the
   operator is applied, **Then** it reports the interface as "below the profile" with a
   lower bound and the analysis treats it accordingly, rather than inventing a depth.

---

### User Story 3 - Quality control flags, and a broken instrument (Priority: P2)

Every observation passes declared quality checks and carries the result as a flag. An
instrument can be declared broken with a stated bias; quality control can be toggled off
so the bias is not caught.

**Why this priority**: FR-24 says the rejected are drawn as rejected, and FR-32's "break an
instrument" counterfactual needs the bias and the toggle to exist as data before feature
010 wires them to a control.

**Independent Test**: With a declared bias larger than the gross-range check, the
observation is flagged; with quality control off, it is not.

**Acceptance Scenarios**:

1. **Given** the declared checks (gross range, departure from climatology beyond a
   declared multiple of its variance, vertical inversion for profiles), **When** an
   observation fails one, **Then** it carries the failing check's flag and its value is
   retained.
2. **Given** an instrument declared broken with a bias, **When** it samples, **Then** the
   bias is added after noise and before checks, and the manifest records the bias.
3. **Given** quality control toggled off, **When** the same instrument samples, **Then**
   its observations carry no flag and the manifest records that control was off.

---

### User Story 4 - Argo profiles enter as a second observation class (Priority: P2)

The committed Argo profiles are admitted to the analysis as real observations, with their
own Argo flags honoured by the same flag semantics, and marked as external so scoring can
apply its independence caveat.

**Why this priority**: Review R-3. The author may overturn this and keep Argo as a drawn
check only; the spec records the admitting choice and the flag that makes it reversible.

**Independent Test**: An Argo level with flag 4 is treated as flagged by the analysis
exactly as a failed ownship check would be; the observation carries `external: true`.

**Acceptance Scenarios**:

1. **Given** the observation artefact, **When** profiles are loaded, **Then** each becomes
   a profile observation with Argo flags mapped onto the harness's flag set and
   `external: true`.
2. **Given** a configuration toggle "assimilate Argo" set false, **When** the analysis
   runs, **Then** Argo profiles are available for drawing and absent from the analysis.

---

### User Story 5 - Gate G-02 holds the boundary (Priority: P3)

A gate author plants an import of the truth-source port into `src/analysis/` and watches
G-02 fail. They plant a second `Observation` constructor outside `src/instruments/` and
watch it fail again.

**Why this priority**: FR-12 says a test shall hold the boundary; PR-04 says the test is
worth nothing until it has been seen to fail.

**Independent Test**: The G-02 fixtures contain both violations; the gate exits non-zero
on each and names it.

**Acceptance Scenarios**:

1. **Given** the planted import, **When** G-02 runs, **Then** it fails and names the file.
2. **Given** the planted constructor, **When** G-02 runs, **Then** it fails and names the
   second construction site.
3. **Given** instrument error declared arbitrarily large, **When** the analysis runs,
   **Then** the analysis field equals the background to tolerance — the behavioural half
   of the gate.

---

### Edge Cases

- A track instant falls between truth instants: the truth port interpolates in time and
  the observation records the interpolation as part of its error characteristics.
- A drop is declared at a position outside the domain: the instrument refuses and the
  configuration validation fails, naming the drop.
- Noise draws are requested from a stream that another component also uses: impossible by
  construction, since each instrument derives its own named stream from the RNG port.
- The bias is declared on the surface instrument rather than an XBT: supported; any
  instrument may be broken.
- Argo profile position falls inside the sponge layer: it is admitted and marked as inside
  the margin; scoring decides what to do with the margin.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `src/instruments/` MUST be the only module that imports the truth-source
  port to produce observations, and the `Observation` type MUST have a single construction
  site there (FR-12, G-02).
- **FR-002**: Every observation MUST carry position, instant, depth (or depths), value(s),
  instrument identity, declared error characteristics, flags, `external`, and the name of
  the RNG stream that produced its noise.
- **FR-003**: A surface instrument MUST sample truth along the declared track at declared
  instants with declared noise (FR-01, FR-12).
- **FR-004**: An XBT instrument MUST sample truth at declared depths at a declared position
  and instant, with declared noise and a declared depth-dependent error, and MUST record
  the depths actually sampled (FR-23's needle depends on this).
- **FR-005**: The observation operator MUST map a temperature profile to an interface-depth
  observation with propagated error under the two-layer thermal structure declared in
  feature 003, and MUST report "below the profile" with a bound when the interface is not
  reached (review R-1).
- **FR-006**: Declared quality checks — gross range, climatology departure, vertical
  inversion — MUST produce flags that are carried, never used to drop an observation
  (FR-24).
- **FR-007**: Any instrument MAY be declared broken with a bias added after noise and
  before checks; the bias and the quality-control toggle state MUST be recorded in the
  manifest (FR-32).
- **FR-008**: Argo profiles MUST be admitted as a second observation class with Argo flags
  mapped to the harness's flags and `external: true`, behind a configuration toggle
  (FR-10, review R-3).
- **FR-009**: All noise MUST come from named streams derived through the RNG port; an
  instrument's observations MUST reproduce from the manifest (FR-08).
- **FR-010**: Gate G-02 MUST implement the import-boundary check, the single-construction-
  site check, and the behavioural large-error test, and MUST be watched failing on
  fixtures for each (PR-04).

### Key Entities

- **Track**: an ordered sequence of (position, instant) for the ownship, declared in the
  recorded case and editable in feature 010.
- **Instrument**: a declared sampler with identity, noise, error characteristics, optional
  bias and its RNG stream name.
- **Observation** (opaque): the only currency the analysis accepts.
- **ProfileObservation**: an observation with levels; XBT or Argo.
- **Flag**: the result of a named quality check, or an Argo flag mapped onto the set.
- **ObservationOperator**: the declared mapping from a profile to an interface-depth
  observation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At zero noise, every observation equals the truth-port value exactly; at
  declared noise, residual variance matches to within the declared statistical tolerance
  over 10,000 seeded draws.
- **SC-002**: The operator recovers the truth interface depth from a zero-noise profile to
  within one display level.
- **SC-003**: G-02 fails on both planted fixtures and passes on the tree; the behavioural
  test passes.
- **SC-004**: A run's observations reproduce byte-identically from its manifest.
- **SC-005**: Every Argo flag in the artefact appears on the corresponding observation.

## Assumptions

- **R-1 resolved**: the observation operator is the two-layer thermal structure of
  feature 003; the interface depth is the observed quantity. ADR-0005 records the choice
  and the rejected alternative (a temperature-anomaly operator on a fixed vertical mode).
- **R-3 resolved provisionally**: Argo is admitted behind a toggle defaulting to true. The
  author may set the default to false; scoring (006) records the caveat either way.
- The recorded case's track and drops are declared in configuration; the lawnmower and
  steered tracks of feature 012 will be generated, not declared.
- Error characteristics are Gaussian with declared variance in V1; correlated error is
  not modelled and the assumption is stated on the observation.
