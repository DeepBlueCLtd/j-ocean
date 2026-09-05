# Feature Specification: The Shore Forecast on Two Axes

**Feature Branch**: `009-shore-forecast-two-axes`

**Created**: 2026-09-05

**Status**: Draft

**Input**: User description: "The shore forecast on two axes: issue time and lead time, plus the departure brief"

**SRD coverage**: FR-25, FR-26, FR-27, §11 (presentation of the two axes)

## Why this beat exists

Staleness and lead time are routinely conflated, and only two controls can pull them
apart. This beat adds the instant a forecast was issued as an axis independent of the
lead time being asked of it, so that sliding issue time back drops the whole skill curve
bodily with nothing else changed, and it adds the departure brief — persistence from the
quay-side instant, never refreshed — as the baseline everything else is watched against.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Issue time is its own axis (Priority: P1)

A reader moves the issue-time control back by twelve hours. Every panel in the row now
shows a forecast initialised from the analysis at that earlier instant with only the
observations available then, valid at the same six instants as before, and the skill
figures drop across the row.

**Why this priority**: FR-25 is the point of the feature. The row is already the
lead-time axis; issue time is the only new control, which answers the §11 open question
about a two-dimensional control nobody can read.

**Independent Test**: Headlessly, for two issue times twelve hours apart, the skill at
each valid instant is computed and the earlier issue time's skill is lower at every
horizon within tolerance.

**Acceptance Scenarios**:

1. **Given** the recorded case at its default issue time, **When** issue time is moved
   earlier, **Then** the analysis reruns at the new issue time using only observations
   with instants at or before it, and every panel's forecast is re-integrated from it.
2. **Given** the move, **When** the panels are read, **Then** their valid instants are
   unchanged and their initialisation instants all read the new issue time (FR-15).
3. **Given** the move, **When** the skill figures are read, **Then** each is lower than
   before, and the row states "issued <duration> earlier" beside the control.
4. **Given** the control is returned to the default, **When** the row reads, **Then** it
   is identical to the recorded case, byte for byte in the results.

---

### User Story 2 - The departure brief (Priority: P1)

Every panel carries, beside the shore forecast's skill, the departure brief's skill: the
persistence field from the quay-side instant held constant and never refreshed. It is
correct at issue and loses to the world on its own.

**Why this priority**: FR-26 makes it the baseline everything is watched against.

**Independent Test**: The departure brief's skill against persistence-from-issue is zero
at the issue instant and its error against truth grows with lead time in the AT-02 test.

**Acceptance Scenarios**:

1. **Given** a declared quay-side instant, **When** the run initialises, **Then** the
   departure brief is the truth-through-instruments analysis at that instant held
   constant — never re-analysed, never re-integrated.
2. **Given** issue time is moved, **When** the brief is read, **Then** it has not changed.
3. **Given** each panel, **When** read, **Then** it shows the brief's error at that valid
   instant beside the shore forecast's, with the brief labelled as the baseline.

---

### User Story 3 - Outside validity, said, not extrapolated (Priority: P2)

A reader asks for a valid instant beyond the forecast's declared validity window (issue
time plus the declared maximum lead), or before its issue time. The panel says so and
draws no field.

**Why this priority**: FR-27.

**Independent Test**: With issue time moved so that the 96 h panel's valid instant exceeds
the declared validity, that panel shows the validity statement and no field.

**Acceptance Scenarios**:

1. **Given** a valid instant beyond validity, **When** the panel renders, **Then** it
   states "outside validity: issued <instant>, valid to <instant>" and draws no field or
   score.
2. **Given** a valid instant before the issue time, **When** requested, **Then** the panel
   states it and draws nothing.
3. **Given** a valid instant beyond the truth record, **When** the score is requested,
   **Then** the scorer's refusal (feature 006) is shown in the panel.

---

### User Story 4 - The two axes, presented (Priority: P3)

The issue-time control is a single scrubber above the row with the observations available
at each instant marked along it, and the row is the lead-time axis. A small inset shows
the skill-versus-lead-time curve for the current and default issue times so the bodily
drop is visible as a curve too.

**Why this priority**: §11's first open question. The proposal is that no two-dimensional
control is needed because the row is one of the axes.

**Independent Test**: Playwright asserts one issue-time control exists, marks the
observation instants, and the inset draws two curves when issue time differs from the
default.

**Acceptance Scenarios**:

1. **Given** the row, **When** rendered, **Then** exactly one issue-time control exists,
   with observation instants marked along it.
2. **Given** issue time differs from default, **When** the inset renders, **Then** two
   curves are drawn, labelled by issue instant.

---

### Edge Cases

- Issue time is moved before the first observation: the analysis is climatology and
  background only; the row says "no observations at this issue time".
- Issue time is moved forward of the default (later): permitted up to the latest instant
  for which 96 h of truth remains, enforced by the period arithmetic of feature 002.
- Issue time falls between observation instants: observations strictly after it are
  excluded; the scrubber snaps to a declared resolution (one hour).
- Re-integration for a new issue time exceeds the frame budget: the NFR-04 message
  appears and the row keeps the previous forecast, labelled as such, until the run is
  confirmed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The shore forecast MUST be produced by the same model, initialised from an
  analysis at the issue instant using only observations with instants at or before it
  (FR-25, review R-8).
- **FR-002**: Issue time MUST be an independent control; moving it MUST rerun the
  analysis and re-integrate every horizon, leaving valid instants unchanged (FR-25).
- **FR-003**: Returning the control to the default MUST reproduce the recorded case's
  results byte for byte (FR-08).
- **FR-004**: The departure brief MUST be the analysis at the declared quay-side instant
  held constant, MUST never be refreshed, and MUST be shown as the baseline on every
  panel (FR-26).
- **FR-005**: A panel whose valid instant lies outside the forecast's declared validity
  window, or before its issue time, MUST say so and draw no field or score (FR-27).
- **FR-006**: The validity window MUST be a declared configuration value (constitution X).
- **FR-007**: There MUST be exactly one issue-time control, with observation instants
  marked on it, and the row MUST serve as the lead-time axis (§11).
- **FR-008**: The skill-versus-lead-time inset MUST draw the default and current issue
  times as two curves when they differ.
- **FR-009**: Every rerun MUST be reproducible from the manifest, which MUST record the
  issue time (FR-08).

### Key Entities

- **IssueTime**: the instant an analysis was made and a forecast started; a control and a
  manifest field.
- **DepartureBrief**: the frozen quay-side analysis.
- **ValidityWindow**: declared maximum lead from issue.
- **SkillCurve**: skill against persistence at each horizon for one issue time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For issue times twelve hours apart, the earlier's skill is lower at every
  horizon in the headless test, figures printed.
- **SC-002**: Returning issue time to default reproduces the recorded results byte for
  byte.
- **SC-003**: The departure brief is unchanged by any issue-time move, asserted by
  identity.
- **SC-004**: An outside-validity panel shows the statement and no field, asserted by
  Playwright.

## Assumptions

- **R-8 resolved**: the shore forecast is the same model run from the analysis at issue
  time; there is no separate coarser product in V1.
- The quay-side instant is the recorded case's first track instant, declared in
  configuration.
- The default issue time is the recorded case's last observation instant before the
  forecast start, declared in configuration.
- The validity window defaults to the longest declared horizon (96 h).
