# Feature Specification: Adaptive Sampling

**Feature Branch**: `012-adaptive-sampling`

**Created**: 2026-09-05

**Status**: Deferred — specified so it is not re-invented; not to be planned until its
trigger is met

**Trigger** (SRD §10): once scoring (feature 006) and the counterfactuals (feature 010)
are landed and trusted, since the paired experiment is worthless without a skill score
anyone believes. "Trusted" means AT-02, AT-03 and AT-06 have passed and been watched in
the shell.

**Input**: User description: "Adaptive sampling (deferred): ensemble sensitivity and the paired lawnmower-versus-steered experiment"

**SRD coverage**: FR-35, FR-36, FR-37, AT-05, FR-11 (the bland contrast)

## Why this beat exists

Sensitivity is computed by ensemble: perturb the observations within their declared
error, integrate the members, and report the spread. Where members diverge, ignorance
matters and sampling is worth spending; where they agree, further sampling buys nothing —
and the second finding is the more useful one. The paired experiment puts a lawnmower
track and a sensitivity-steered track through identical conditions and budgets, and is
presented so that the adaptive run losing is a reportable result.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sensitivity by ensemble spread (Priority: P1)

A reader asks for sensitivity. The harness perturbs every observation within its declared
error using named streams, integrates a declared number of members to a declared horizon,
and draws the spread as a field with the members' count and the horizon stated.

**Why this priority**: FR-35 is the computation the paired experiment steers by.

**Independent Test**: Headlessly, on the Gulf Stream domain the spread field has structure
(variance above a declared floor) concentrated near the front; on the bland domain the
spread is flat (variance below the floor) and the result says so.

**Acceptance Scenarios**:

1. **Given** the recorded case, **When** sensitivity is requested with N members, **Then**
   N perturbed observation sets are drawn from named streams, N integrations run, and the
   spread at each cell is published with N and the horizon as declared figures.
2. **Given** the bland domain, **When** sensitivity is computed, **Then** the spread is
   below the declared floor everywhere and the surface states "flat: sampling buys
   nothing here" rather than drawing a pattern in noise (AT-05).
3. **Given** the ensemble exceeds the frame budget, **When** requested, **Then** the
   NFR-04 message appears with both figures and the reader may reduce N.

---

### User Story 2 - The paired experiment (Priority: P1)

A reader starts the paired experiment: two runs from identical initial conditions under
an identical time budget and vessel speed, one following a declared lawnmower track, one
steered each leg toward the current sensitivity maximum reachable within the remaining
budget, each sampling truth along its own path through the same instruments.

**Why this priority**: FR-36.

**Independent Test**: Headlessly, both runs consume the same budget to within a declared
tolerance, and each run's observations come from its own track through the instruments
module.

**Acceptance Scenarios**:

1. **Given** the experiment, **When** started, **Then** both runs begin from the same
   analysis and clock, with the same instruments and noise stream roots.
2. **Given** the steered run, **When** each leg is planned, **Then** the destination is the
   sensitivity maximum reachable within the remaining budget at the declared speed, and
   the plan is drawn before it is sailed.
3. **Given** both runs complete, **When** scored, **Then** each shows skill at every
   horizon beside the other's, with provenance.

---

### User Story 3 - The adaptive run losing is a result (Priority: P1)

The comparison is presented so that either outcome is a finding. When sensitivity
concentrates somewhere the vessel cannot reach within budget, the lawnmower wins, and the
surface says the binding constraint was transit rather than information.

**Why this priority**: FR-37; a harness that could only show the adaptive run winning
would be an advertisement (constitution VI).

**Independent Test**: A configured case with the sensitivity maximum beyond reach yields
the lawnmower winning and the "transit-bound" statement; a case with it within reach
yields the steered run winning; both are printed.

**Acceptance Scenarios**:

1. **Given** the steered run scores lower, **When** the comparison renders, **Then** it
   states which run won by how much and draws the unreached sensitivity maximum with the
   distance the budget fell short.
2. **Given** the steered run scores higher, **When** rendered, **Then** the statement is
   symmetrical in form, so the two outcomes read as two results and not as a success and
   an excuse.

---

### Edge Cases

- N members with N below a declared minimum: refused, because spread from two members is
  not sensitivity.
- Sensitivity maximum inside the sponge margin: excluded from steering targets.
- The two tracks cross: no interaction, since each samples truth independently.
- Bland domain paired experiment: both runs score within tolerance of each other and the
  surface says the domain does not reward steering (FR-11).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sensitivity MUST be computed by ensemble: perturb observations within
  declared error from named streams, integrate a declared number of members to a declared
  horizon, publish spread with N and horizon as declared figures (FR-35).
- **FR-002**: A spread below a declared floor MUST be reported as flat in words, and no
  pattern MUST be drawn from it (AT-05, constitution VI).
- **FR-003**: The paired experiment MUST run two tracks from identical initial conditions,
  clock, instruments, budget and speed, each sampling truth through the instruments
  module along its own path (FR-36, FR-12).
- **FR-004**: The steered track MUST choose each leg's destination as the reachable
  sensitivity maximum within the remaining budget and MUST draw the plan before sailing.
- **FR-005**: The comparison MUST present either outcome symmetrically, MUST state which
  run won and by how much with provenance, and when the steered run loses MUST draw the
  unreached maximum and the shortfall (FR-37).
- **FR-006**: The ensemble MUST respect the frame budget with the NFR-04 message and an
  offer to reduce N.
- **FR-007**: Every ensemble and experiment MUST replay from the manifest.

### Key Entities

- **Ensemble**: N members, their perturbed observation sets, their streams, their spread.
- **SpreadField**: per-cell spread with N, horizon and floor.
- **PairedExperiment**: two runs, their tracks, budgets, scores and the comparison.
- **Leg**: a planned segment of the steered track with its destination and reason.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the bland domain the spread is below the floor and the flat statement is
  shown (AT-05).
- **SC-002**: The two configured cases produce the two outcomes with symmetrical
  statements, figures printed.
- **SC-003**: Both runs of the paired experiment consume the same budget within tolerance.
- **SC-004**: The experiment replays byte-identically from its manifest.

## Assumptions

- The ensemble perturbs observations only (not the background), per FR-35 as written; a
  background perturbation is the ensemble Kalman filter deferred in feature 005's ADR.
- N defaults to a declared value the frame budget allows at 100 × 100; the plan measures
  it.
- "Reachable within budget" is straight-line at declared speed; a routing that avoids the
  margin is a refinement for the plan.
