# Feature Specification: Analysis and Attribution

**Feature Branch**: `005-analysis-and-attribution`

**Created**: 2026-09-05

**Status**: Draft

**Input**: User description: "Analysis with per-cell attribution weights derived from the analysis itself"

**SRD coverage**: FR-16, FR-17, FR-18, G-06, AT-03 (radius), review R-7

## Why this beat exists

The analysis combines a background (the model advected from the last analysis), the
observations, and the climatology into an initial condition, and in doing so decides how
much each was worth in each cell. This beat makes those weights the attribution field —
computed by the same arithmetic as the answer, so that the picture cannot disagree with
it — and makes a cell's own breakdown available to whatever draws it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An analysis from three sources with declared covariances (Priority: P1)

A developer runs the analysis headlessly: a background field, a set of observations, a
climatology, and a declared background-error covariance (isotropic, with a declared
length scale) and declared observation errors. The analysis field returns, together with
its per-cell weights.

**Why this priority**: Nothing downstream — scoring, the row, the counterfactuals — has
an initial condition without it.

**Independent Test**: With no observations, the analysis equals the background blended
with climatology by the declared prior weight; with one perfect observation at a cell,
the analysis at that cell equals the observation.

**Acceptance Scenarios**:

1. **Given** no observations, **When** the analysis runs, **Then** the field is the
   declared blend of background and climatology and every cell's weights are
   (background: b, climatology: 1 − b, observations: 0).
2. **Given** one observation with zero error at a cell, **When** the analysis runs,
   **Then** that cell's value equals the observation and its observation weight is 1.
3. **Given** one observation with the declared error at a cell, **When** the analysis
   runs, **Then** the observation's influence falls off with distance under the declared
   covariance, and the weights at each cell sum to 1.
4. **Given** a flagged observation, **When** the analysis runs, **Then** it is excluded
   from the weights and recorded as excluded, with the flag, in the analysis record.

---

### User Story 2 - Attribution is the weights, drawn as a field (Priority: P1)

The analysis exports a per-cell attribution field: for each cell, the weight carried by
observations, by the advected background and by climatology. There is one producer of the
field and it is the analysis itself.

**Why this priority**: FR-16 and FR-17, and constitution IV. This is the requirement that
exists because the summary bar was specified first and was wrong.

**Independent Test**: G-06 passes; a test asserts the attribution at every cell equals the
weights the analysis actually applied there, recomputed independently from the gain
matrix.

**Acceptance Scenarios**:

1. **Given** an analysis, **When** its attribution is read, **Then** each cell carries
   three non-negative weights summing to 1 within floating tolerance.
2. **Given** the analysis gain, **When** the weights are recomputed from it in the test,
   **Then** they equal the exported attribution.
3. **Given** a developer writes a function under `src/harness/` that constructs an
   attribution value, **When** G-06 runs, **Then** it fails and names the site.

---

### User Story 3 - A cell's own breakdown (Priority: P2)

A caller asks the analysis record for a cell's breakdown and receives the three weights
and, for the observation weight, the list of observations that contributed with each
one's share.

**Why this priority**: FR-18 makes the bar chart an instrument of the cell. The
observation shares are what lets feature 010 say which XBT mattered where.

**Independent Test**: For a cell within one length scale of two observations, the
breakdown lists both with shares that sum to the cell's observation weight.

**Acceptance Scenarios**:

1. **Given** a cell, **When** its breakdown is requested, **Then** it returns the three
   weights and the per-observation shares.
2. **Given** a cell outside every observation's influence, **When** its breakdown is
   requested, **Then** the observation weight is 0 and the list is empty.

---

### User Story 4 - The radius of an observation's influence (Priority: P2)

A caller asks for the influence field of one observation: the weight it carried in every
cell. The region where that weight exceeds a declared threshold is the radius the harness
shows in AT-03.

**Why this priority**: AT-03 wants the harness to show that influence is local and to show
the radius; review R-7 notes the radius is a property of the declared covariance.

**Independent Test**: The influence field of a single observation is maximal at its cell
and falls below the threshold beyond a distance consistent with the declared length
scale.

**Acceptance Scenarios**:

1. **Given** one observation, **When** its influence field is requested, **Then** it is a
   field of weights, maximal at the observation's cell.
2. **Given** the declared threshold, **When** the influence region is computed, **Then**
   its extent is consistent with the declared length scale and the test prints both.

---

### User Story 5 - The boundary holds behaviourally (Priority: P3)

With every observation's error set arbitrarily large, the analysis recovers nothing of
truth beyond what the background already carried.

**Why this priority**: FR-12's test "shall hold the boundary"; this is the half G-02
cannot check by reading source.

**Independent Test**: Correlation between (analysis − background) and (truth −
background) is zero within tolerance when observation errors are set to a declared
enormous value.

**Acceptance Scenarios**:

1. **Given** observation errors set enormous, **When** the analysis runs, **Then** the
   analysis equals the no-observation blend to tolerance, and the observation weights
   are all zero.

---

### Edge Cases

- Two observations at the same cell and instant: both enter; the gain handles them, and
  the breakdown lists both shares.
- An observation inside the sponge margin: it enters the analysis; scoring excludes the
  margin, not the analysis.
- An interface-depth observation reported as "below the profile" with a bound: entered as
  a one-sided constraint at the bound with inflated error; the analysis record says so.
- The covariance length scale is declared larger than the domain: validation fails,
  because an analysis in which everything influences everything is not one the
  attribution can explain.
- Weights that are slightly negative from floating-point: clamped to zero and
  renormalised, and the clamp count is a published diagnostic.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The analysis MUST be optimal interpolation with a declared, isotropic
  background-error covariance (declared length scale and variance), declared observation
  errors from each observation's characteristics, and a declared prior blend of
  background and climatology (review R-7).
- **FR-002**: The analysis MUST consume only observations (opaque type from
  `src/instruments/`), a background field, and the climatology artefact; it MUST NOT
  import the truth-source port or the scoring module (FR-12, constitution II).
- **FR-003**: The analysis MUST export a per-cell attribution field — observation,
  background, climatology weights — computed from the same gain as the analysis field,
  with exactly one construction site in `src/analysis/` (FR-16, FR-17, G-06).
- **FR-004**: Weights at every cell MUST be non-negative and sum to 1 within a declared
  tolerance; a test MUST recompute them from the gain and assert equality.
- **FR-005**: The analysis record MUST provide a per-cell breakdown including
  per-observation shares (FR-18).
- **FR-006**: The analysis record MUST provide the influence field of any single
  observation and the influence region above a declared threshold (AT-03).
- **FR-007**: Flagged observations MUST be excluded from the analysis and recorded as
  excluded with their flag; they MUST remain in the record for drawing (FR-24).
- **FR-008**: Gate G-06 MUST fail on any construction of the attribution type outside its
  single site and MUST be watched failing on a fixture (PR-04).
- **FR-009**: The behavioural boundary test of FR-12 MUST live here and pass.
- **FR-010**: The analysis MUST run headlessly under vitest in a declared time bound at
  100 × 100 with the recorded case's observation count, and the bound MUST be a declared
  value.

### Key Entities

- **Background**: the model's field advected from the previous analysis to the analysis
  instant.
- **AnalysisRecord**: the analysis field, the attribution field, the excluded
  observations, and the gain sufficient to answer breakdown and influence queries.
- **Attribution** (single construction site): three weights per cell.
- **Breakdown**: a cell's weights and per-observation shares.
- **InfluenceField**: one observation's weight in every cell, and its region.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Weights recomputed from the gain equal the exported attribution at every
  cell within tolerance.
- **SC-002**: G-06 fails on its fixture and passes on the tree.
- **SC-003**: The behavioural boundary test passes with the correlation printed.
- **SC-004**: The influence region of a single observation is consistent with the
  declared length scale and the test prints the measured extent.
- **SC-005**: The analysis at 100 × 100 with the recorded case's observations completes
  within the declared bound headlessly.

## Assumptions

- **R-7 resolved**: optimal interpolation with an isotropic Gaussian covariance is the V1
  scheme; ADR-0006 records it and the rejected alternatives (3D-Var with the same
  covariance, which gives identical weights at greater cost; an ensemble Kalman filter,
  deferred with feature 012's ensemble as its trigger).
- The analysis operates on interface depth (layer thickness) as its state variable, and
  velocity is diagnosed geostrophically from the analysed interface; the ADR records the
  alternative of analysing velocity directly.
- The analysis instant is the run's initial instant; feature 009 runs it at each issue
  time.
- Observation errors are uncorrelated with each other and with the background.
