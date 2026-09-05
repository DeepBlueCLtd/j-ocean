# Feature Specification: Scoring and References

**Feature Branch**: `006-scoring-and-references`

**Created**: 2026-09-05

**Status**: Draft

**Input**: User description: "Scoring: skill against persistence and climatology with provenance on screen"

**SRD coverage**: FR-20, FR-21, FR-22, NFR-05, AT-02, AT-03 (local skill), review R-2, R-3

## Why this beat exists

A raw error figure means nothing on its own. This beat computes forecast error against the
committed truth and expresses it as skill against two references the harness computes
itself — persistence and climatology — in the convention where zero means no better and
negative means worse, and it attaches to every figure the provenance a reader needs to
disbelieve it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Skill against two references, headlessly (Priority: P1)

A developer scores a 24 h forecast against truth and receives, not an error, but two
skill figures: against persistence and against climatology, each with the error figures
beneath them.

**Why this priority**: FR-20, FR-21 and AT-02. Everything the harness claims is a
relative skill.

**Independent Test**: A forecast equal to persistence scores zero against persistence; a
forecast equal to truth scores one against both; a forecast worse than persistence scores
negative.

**Acceptance Scenarios**:

1. **Given** a forecast, its initial field and the truth at the valid instant, **When**
   scored, **Then** the result carries the forecast error, the persistence error, the
   climatology error, and two skill scores in the 1 − (error / reference error)
   convention.
2. **Given** a forecast identical to the initial field, **When** scored, **Then** skill
   against persistence is 0 within tolerance.
3. **Given** a forecast identical to truth, **When** scored, **Then** both skill scores are
   1.
4. **Given** a forecast worse than persistence, **When** scored, **Then** the skill is
   negative and the result's statement reads "worse than persistence" in those words.

---

### User Story 2 - Every score names its provenance (Priority: P1)

Every score object carries what it was computed against, where (the region and the
excluded margin), over what window, at what resolution floor, and whether the truth it was
scored against had assimilated any observation the analysis used.

**Why this priority**: FR-22 — a score without provenance is an assertion — and reviews R-2
and R-3.

**Independent Test**: A score's provenance serialises to a record naming reference,
region, margin, window, resolution floor, and the independence caveat; the shell cannot
draw a score without one.

**Acceptance Scenarios**:

1. **Given** a score, **When** its provenance is read, **Then** it names the reference, the
   scoring region (domain minus sponge margin), the window (initial instant to valid
   instant), the error metric, and the resolution floor from the truth artefact.
2. **Given** the analysis used an Argo profile within the window, **When** the score is
   computed, **Then** the provenance carries the independence caveat naming that profile.
3. **Given** a request to score at a scale finer than the truth's native resolution,
   **When** the scorer is asked, **Then** it refuses and says why (review R-2).

---

### User Story 3 - Skill declines with lead time (Priority: P2)

A developer scores the recorded case at every declared horizon. Skill against persistence
is positive at 24 h and declines across the row.

**Why this priority**: AT-02 is the first acceptance test that says the model is worth
running at all, and it is the curve the shore forecast (feature 009) moves bodily.

**Independent Test**: The AT-02 test scores all six horizons and asserts positive skill at
24 h and a non-increasing trend across horizons, printing the six figures.

**Acceptance Scenarios**:

1. **Given** the recorded case, **When** all horizons are scored, **Then** skill against
   persistence at 24 h is positive.
2. **Given** the same, **When** the six figures are inspected, **Then** they are
   non-increasing in lead time within a declared tolerance for non-monotonicity, and the
   test prints them.

---

### User Story 4 - Local skill, for the price of a measurement (Priority: P2)

A caller scores within a region — a disc of declared radius around a point — and outside
it, so that withholding an observation (feature 010) can be shown to degrade skill in its
neighbourhood and not elsewhere.

**Why this priority**: AT-03 is scored by comparing local skill with and without one
observation.

**Independent Test**: Local skill inside and outside a region are computed for a forecast
and sum-weight to the whole-domain figure.

**Acceptance Scenarios**:

1. **Given** a region, **When** the scorer is asked for inside and outside skill, **Then**
   both are returned with their own provenance naming the region.
2. **Given** the region is smaller than the resolution floor, **When** asked, **Then** the
   scorer refuses.

---

### User Story 5 - Three kinds of figure, kept distinct (Priority: P3)

Every figure the scorer emits is typed as declared, computed or derived, and the shell
renders each kind distinctly and never re-types one.

**Why this priority**: NFR-05 and constitution V; scoring emits most of the figures the
shell will draw.

**Independent Test**: A type-level test asserts every numeric field on a score object
carries a kind; a Playwright test in feature 007 asserts the typographic distinction.

**Acceptance Scenarios**:

1. **Given** a score, **When** its figures are enumerated, **Then** error figures and
   skill are `computed`, the tolerance and thresholds are `declared`, and any figure
   diagnosed from the profile is `derived`.

---

### Edge Cases

- The reference error is zero (persistence equals truth): the skill is undefined; the
  score says "reference is perfect here" rather than dividing by zero.
- The valid instant is outside the truth record: the scorer refuses, and feature 009's
  validity statement uses the refusal.
- The scoring region after removing the margin is empty (a tiny domain): validation
  fails at configuration.
- The climatology window overlaps the scoring window entirely: the caveat says so and the
  climatology reference is still computed, because a caveated figure beats a missing one.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The scorer MUST compute forecast error against the truth-source port at the
  valid instant over the scoring region, using a declared metric (root-mean-square error
  of interface depth in V1) (FR-20).
- **FR-002**: The scorer MUST compute the same error for two references it constructs
  itself — persistence (the initial field held) and climatology (the artefact) — and MUST
  never return a forecast error without both (FR-20).
- **FR-003**: Skill MUST be expressed as 1 − (forecast error / reference error), so that
  zero means no better and negative means worse, and a negative score MUST carry the
  statement "worse than <reference>" in those words (FR-21).
- **FR-004**: Every score MUST carry provenance: reference, region, margin, window,
  metric, resolution floor, and the independence caveat naming any assimilated external
  observation in the window (FR-22, reviews R-2, R-3).
- **FR-005**: The scorer MUST refuse to score at a scale finer than the truth artefact's
  native resolution and MUST say why.
- **FR-006**: The scorer MUST provide local skill inside and outside a declared region
  (AT-03).
- **FR-007**: Every numeric figure a score carries MUST be typed declared, computed or
  derived, and the type MUST be preserved through serialisation (NFR-05).
- **FR-008**: The AT-02 test MUST score the recorded case at every declared horizon,
  assert positive skill against persistence at 24 h, and print all figures.
- **FR-009**: The scorer MUST read truth only to compare and MUST return figures, never
  fields, to any caller in the analysis or model rings (constitution II).

### Key Entities

- **Reference**: persistence or climatology; a field constructed by the scorer.
- **Score**: forecast error, reference errors, skill figures, statement, provenance.
- **Provenance**: the record of what, where, when, at what floor, with what caveat.
- **Region**: the scoring area: whole domain minus margin, or a disc, or its complement.
- **Figure**: a number with a kind (declared / computed / derived) and units.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The identity tests hold: persistence scores 0, truth scores 1, worse scores
  negative with the statement.
- **SC-002**: AT-02 passes on the recorded case with six printed figures.
- **SC-003**: No score object can be constructed without provenance (compile-time).
- **SC-004**: A request below the resolution floor is refused with a message.
- **SC-005**: Local and whole-domain skill are consistent to tolerance.

## Assumptions

- **R-2 resolved**: the resolution floor is the truth artefact's native resolution
  carried from feature 002.
- **R-3 resolved**: the independence caveat is carried on every score whose window
  contains an assimilated external observation; if the author sets "assimilate Argo" to
  false, the caveat is never triggered.
- The metric is root-mean-square error of interface depth over the region; sea-surface
  height is offered as a second metric only if the plan finds it cheap.
- Climatology as a reference and climatology as an analysis source are the same artefact
  with the same provenance (§11), and the cost in independence is what the caveat states.
