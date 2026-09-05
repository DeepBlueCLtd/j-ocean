# Feature Specification: The Reduced-Gravity Model

**Feature Branch**: `003-reduced-gravity-model`

**Created**: 2026-09-05

**Status**: Draft

**Input**: User description: "The one-and-a-half layer reduced-gravity model on a configurable grid with measured step time"

**SRD coverage**: FR-03, FR-04, FR-05, FR-06, FR-07, NFR-04, G-03, AT-01, §10 (dynamic depth, GPU kernel — deferred)

## Why this beat exists

The questions the harness exists to ask are about combination of information, not about
dynamics. The simplest core that produces genuine eddies and fronts is therefore the
right one, and this beat delivers it: an active upper layer over a motionless deep layer,
integrated in typed arrays behind the kernel port, with its step time measured and its
invariants held to a stated tolerance.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A recognisable eddy field, headlessly (Priority: P1)

A developer initialises the model from the truth field at the run's start instant, on the
Gulf Stream domain, and integrates for 96 hours in Node. The result carries the meander
and the rings the truth carried, displaced and evolved, and the declared invariants are
conserved to the declared tolerance.

**Why this priority**: AT-01, and FR-03's requirement that the model be exercised by test
without the harness present. Everything downstream scores this field.

**Independent Test**: A vitest test integrates 96 h and asserts (a) upper-layer volume is
conserved to tolerance, (b) total energy drifts by less than tolerance, (c) the field's
spatial variance is within a declared band of the truth's at the same instant (it has not
decayed to nothing nor blown up).

**Acceptance Scenarios**:

1. **Given** an initial state from truth, **When** the model integrates 96 h, **Then**
   upper-layer volume is conserved to within the declared tolerance and the test prints
   the measured drift beside the tolerance.
2. **Given** the same, **When** energy is diagnosed at every hour, **Then** the drift is
   within tolerance and monotone in the sense the scheme's dissipation predicts.
3. **Given** the same, **When** the sea-surface height variance at 96 h is compared to the
   initial, **Then** it lies within the declared band.
4. **Given** the bland domain, **When** the same integration runs, **Then** it completes
   without instability and with variance in its own declared band.

---

### User Story 2 - Declared grid, measured step, honoured budget (Priority: P1)

A developer changes the grid from 100 × 100 to 200 × 200 in configuration. The model
reports its step time. If the projected time for the row's longest horizon exceeds the
declared frame budget, the run says so and does not freeze the page.

**Why this priority**: FR-06 says the budget is a number in configuration, not a judgement
at review; NFR-04 says the integration does not block the interface.

**Independent Test**: With an artificially tiny budget in configuration, a run reports
"exceeds budget" with the projected and declared figures, and the shell stays responsive.

**Acceptance Scenarios**:

1. **Given** a grid declared in configuration, **When** the model initialises, **Then** the
   timestep is set from the declared stability criterion for that grid and layer
   parameters, and the chosen timestep is reported as a computed figure.
2. **Given** a declared frame budget, **When** the first steps run, **Then** step time is
   measured through the timing module (constitution I, exemption a) and reported as a
   host-time figure, typographically marked.
3. **Given** the projected integration time for the longest declared horizon exceeds the
   budget, **When** the run is requested, **Then** the shell states the projected and
   declared figures, offers to proceed anyway, and does not integrate until told to.
4. **Given** integration is in progress, **When** the reader interacts with the page,
   **Then** the page responds, because integration is chunked to the clock port's step
   and yields between chunks.

---

### User Story 3 - Depth displayed, not integrated (Priority: P2)

A reader asks for the vertical structure at a cell. The model returns a profile diagnosed
from layer thickness under a declared thermal structure, with every level between the
model's own two labelled derived.

**Why this priority**: FR-07. The derived profile is what XBT observations are drawn
beside and compared to, and review R-1 makes the declared thermal structure the
observation operator too.

**Independent Test**: The diagnosed profile at a cell has exactly the declared number of
levels, each tagged `derived` except the two layer values tagged `computed`.

**Acceptance Scenarios**:

1. **Given** a cell's layer thickness, **When** the profile is diagnosed, **Then** it is a
   warm upper layer of the declared upper temperature over a cold deep layer of the
   declared deep temperature, with the interface at the diagnosed depth and a declared
   transition thickness, evaluated at the declared display levels.
2. **Given** the profile, **When** it is published, **Then** every value carries its kind:
   `computed` for the two layer temperatures, `derived` for every interpolated level.
3. **Given** the deferred trigger in SRD §10, **When** a reader sees the derived profile
   disagree with an XBT beside it, **Then** the surface has said the profile is derived,
   so the disagreement is a finding and not a defect.

---

### User Story 4 - The harness reads published fields only (Priority: P2)

The model publishes a results interface — sea-surface height, layer thickness, velocity
components, diagnosed profiles, step timing — and the harness reads that and nothing
else.

**Why this priority**: FR-03 and constitution III. This is the surface across which the
model is reviewable as a model.

**Independent Test**: G-03 passes; a test constructs the results interface and confirms
the integration state arrays are not reachable from it.

**Acceptance Scenarios**:

1. **Given** a run, **When** the harness asks for results, **Then** it receives copies or
   read-only views of the published fields, never the integration buffers.
2. **Given** a developer adds a getter exposing an integration buffer, **When** the
   results-interface test runs, **Then** it fails.

---

### User Story 5 - A second kernel is accepted against the reference (Priority: P3)

A developer implements a second kernel (a worker-hosted copy of the reference is the
first plausible one). The acceptance test integrates both from the same state for the
same steps and asserts agreement to a recorded tolerance.

**Why this priority**: FR-04 says the CPU kernel is the reference and stays so; the GPU
kernel of §10 is cheap to adopt only if the acceptance path already exists.

**Independent Test**: The kernel-acceptance test runs against every registered kernel and
prints the maximum absolute difference beside the recorded tolerance.

**Acceptance Scenarios**:

1. **Given** two registered kernels, **When** the acceptance test runs, **Then** it
   integrates both and fails if any field differs by more than the recorded tolerance.
2. **Given** only the reference kernel is registered, **When** the test runs, **Then** it
   passes trivially and says so, so that "no second kernel" is never mistaken for
   "second kernel accepted".

---

### Edge Cases

- The stability criterion is violated by a configuration that declares a grid too fine
  for its layer parameters: initialisation fails with the computed limit and the declared
  value, and no integration runs.
- Layer thickness goes to zero or negative in a cell (outcropping): the scheme clamps at
  a declared minimum thickness and counts the event; the count is a published diagnostic
  and a run with a non-zero count says so.
- The boundary: the domain is a box in an open ocean. Open boundaries are hard; a
  declared sponge layer relaxing toward the initial state is the V1 answer and its width
  is a declared value shown on the panel as an excluded margin for scoring (feature 006).
- The grid is not square: supported, because the domain box is not square in kilometres
  at Gulf Stream latitudes; the aspect is a declared value.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The model MUST be a one-and-a-half layer reduced-gravity shallow-water model
  on a regular grid, with declared reduced gravity, mean upper-layer thickness, Coriolis
  (beta-plane), lateral viscosity and bottom drag, integrated with a declared explicit
  scheme (FR-05).
- **FR-002**: The grid MUST be declared in configuration, MUST default to 100 × 100, and
  MUST NOT be a literal anywhere in the model (FR-06, constitution X).
- **FR-003**: The timestep MUST be computed from the declared stability criterion for the
  declared grid and parameters, MUST be reported as a computed figure, and initialisation
  MUST fail when the criterion cannot be met.
- **FR-004**: The model MUST integrate in `Float32Array` or `Float64Array` buffers, with
  the precision declared, and MUST import no rendering, DOM, React or WebGL module (FR-03,
  G-03).
- **FR-005**: The model MUST publish a results interface — sea-surface height, layer
  thickness, velocity, diagnosed profiles, invariants, step timing, outcrop count — and
  MUST NOT expose integration buffers through it.
- **FR-006**: The model MUST diagnose upper-layer volume and total energy each hour and
  MUST conserve each to a declared tolerance over 96 h from a truth initial state, printed
  by the test (AT-01).
- **FR-007**: Step time MUST be measured through the timing module using the constitution
  I exemption, reported as a host-time figure, and MUST never enter the run or manifest
  (NFR-04).
- **FR-008**: A run whose projected time for the longest declared horizon exceeds the
  declared budget MUST say so with both figures and MUST NOT integrate until told to
  (FR-06, NFR-04).
- **FR-009**: Integration MUST be chunked so that the interface remains responsive; the
  chunk size MUST be declared.
- **FR-010**: The vertical structure MUST be diagnosed, never advected: a two-layer
  thermal profile (declared upper and deep temperatures, interface at diagnosed layer
  thickness, declared transition thickness) evaluated at declared display levels, with
  every level between the model's own tagged `derived` (FR-07, review R-1).
- **FR-011**: The reference CPU kernel MUST remain the reference; a kernel-acceptance test
  MUST integrate every registered kernel against it and fail beyond a recorded tolerance
  (FR-04).
- **FR-012**: Open boundaries MUST be handled by a declared sponge layer relaxing toward
  the initial state, its width declared and published so scoring can exclude it.
- **FR-013**: Initialisation from truth MUST map the truth's sea-surface height and
  velocity to layer thickness and velocity through a declared, documented relation, and
  MUST go through the truth-source port; the model MUST NOT import the truth artefact
  directly.

### Key Entities

- **ModelState**: the typed-array buffers for layer thickness and velocity at one instant.
- **ModelParameters**: the declared physical constants and scheme choices, from
  configuration.
- **Results**: the published, read-only view of state and diagnostics.
- **DiagnosedProfile**: a column of (depth, temperature, kind) tuples for one cell.
- **KernelRegistry**: the set of kernel implementations, with the reference marked.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The AT-01 test passes with the measured invariant drifts printed beside
  their tolerances, for both domains.
- **SC-002**: At 100 × 100, a 96 h integration completes within the declared budget on
  the development machine, and the measured step time is reported in the shell.
- **SC-003**: At a grid that violates the declared budget, the shell reports the overrun
  with both figures and remains responsive.
- **SC-004**: G-03 passes; the results-interface test passes; the headless test runs
  with no DOM.
- **SC-005**: The kernel-acceptance test runs and reports "reference only" when no second
  kernel is registered.

## Assumptions

- **R-1 resolved (with 004)**: the two-layer thermal structure declared here is also the
  observation operator used by the instruments and the analysis. It earns ADR-0005.
- The scheme is a leapfrog or forward-backward explicit scheme on an Arakawa C-grid with
  a Robert-Asselin filter if leapfrog; the plan chooses and the ADR for the model tier
  (ADR-0001) records why a reduced-gravity model and not a primitive-equation one.
- Initialisation from truth uses HYCOM sea-surface height as a proxy for interface
  displacement via the reduced-gravity relation, and HYCOM surface velocity for the layer
  velocity; the relation is documented in the model's README.
- The rough feasibility arithmetic: reduced gravity 0.02 m/s² over 500 m gives a gravity
  wave speed of about 3 m/s; at 5 km cells the stable timestep is of order 15 minutes;
  96 h is under 400 steps of 10⁴ cells, which is milliseconds. The budget will not bind at
  100 × 100 and is there for the resolution study.
- Dynamic depth (§10) and the GPU kernel (§10) stay deferred; their ADRs are written in
  this beat in the assessed-deferred posture with the triggers quoted from the SRD.
