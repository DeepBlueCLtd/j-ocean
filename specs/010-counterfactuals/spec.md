# Feature Specification: Counterfactuals

**Feature Branch**: `010-counterfactuals`

**Created**: 2026-09-05

**Status**: Draft

**Input**: User description: "Counterfactuals: edit a profile, withhold, break an instrument, redraw the track, revert"

**SRD coverage**: FR-28, FR-29, FR-30, FR-31, FR-32, FR-33, FR-34, AT-03, AT-06

## Why this beat exists

These are the interactions that turn a claim into something the reader caused. A reader
drags a measured profile and watches the forecast change at every horizon; withholds an
observation and reads the skill drop, which is the value of a single measurement, priced;
breaks an instrument and watches the bias be caught or not; redraws the track and asks
whether that was a better place to have sailed. Every one is reversible in one action and
the surface always says whether it shows the recorded run or an edit.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recorded or edited, and back in one action (Priority: P1)

The surface always states whether what is shown is the recorded run or an edit of it, and
a single action returns any edit to the recorded case.

**Why this priority**: FR-34. Every other story here is unsafe without it: a reader who
cannot tell an edit from the record has been misled by the harness.

**Independent Test**: After any edit, a status element reads "edited" and names the edit;
after revert, it reads "recorded case" and the results are byte-identical to the recorded
case.

**Acceptance Scenarios**:

1. **Given** the recorded case, **When** the surface renders, **Then** a persistent status
   reads "recorded case".
2. **Given** any edit, **When** applied, **Then** the status reads "edited" and lists the
   edits in order, and the manifest's counterfactual slot records them.
3. **Given** one or more edits, **When** the revert action is taken, **Then** all edits
   are removed, the run is re-derived, and results are byte-identical to the recorded case.

---

### User Story 2 - Edit a profile, with its ghost (Priority: P1)

A reader selects an XBT and drags points on its profile. The analysis reweights, the model
reruns, every horizon in the row updates, and the measured profile remains drawn as a
ghost behind the edit. A difference field — edited minus recorded — is offered for every
horizon.

**Why this priority**: FR-28, FR-29, FR-30, and AT-06 (propagates visibly at 24 h,
negligibly at 96 h, watched in the shell).

**Independent Test**: Headlessly, an edit to one profile changes the 24 h field by more
than a declared threshold within the observation's influence region and the 96 h field by
less than a declared fraction of that; in the shell, the ghost is present and the
difference field is drawn.

**Acceptance Scenarios**:

1. **Given** an XBT is selected, **When** a point on its profile is dragged, **Then** the
   profile's observation is replaced by the edited profile through the same observation
   operator, and the measured profile is drawn as a ghost behind it.
2. **Given** the edit, **When** applied, **Then** the analysis reruns and every declared
   horizon re-integrates from the new initial condition (FR-30).
3. **Given** the edit, **When** the difference view is chosen, **Then** each panel shows
   edited minus recorded for its horizon, with a diverging scale legible in greyscale and
   the region above a declared magnitude outlined (FR-29).
4. **Given** the edit, **When** the 24 h and 96 h difference magnitudes are compared,
   **Then** the 24 h change within the influence region exceeds the threshold and the
   96 h change is a declared fraction smaller, both figures shown (AT-06).

---

### User Story 3 - Withhold an observation (Priority: P1)

A reader toggles one observation off. The run repeats without it and the local skill in
its neighbourhood drops, while the skill elsewhere does not, and the panel shows the
radius.

**Why this priority**: FR-31 and AT-03. This is the value of a single measurement, priced.

**Independent Test**: Headlessly, withholding one XBT lowers skill inside its influence
region by more than a declared amount and changes skill outside by less than a declared
tolerance; both figures are printed.

**Acceptance Scenarios**:

1. **Given** an observation, **When** it is toggled off, **Then** it is excluded from the
   analysis, remains drawn in the footprint in a withheld style, and the run repeats.
2. **Given** the withheld run, **When** the panel is read, **Then** it shows local skill
   inside and outside the observation's influence region beside the recorded case's, and
   draws the region.
3. **Given** the observation is toggled back on, **When** the run repeats, **Then**
   results are byte-identical to before the toggle.

---

### User Story 4 - Break an instrument, catch it or not (Priority: P2)

A reader declares a bias on an instrument. With quality control on, the biased
observations are flagged and excluded, and the footprint shows them flagged. With quality
control off, they enter the analysis and the reader watches the bias propagate through the
row.

**Why this priority**: FR-32.

**Independent Test**: With a bias exceeding the gross-range check and control on, the
observations are flagged and skill is unchanged from the withheld case; with control off,
skill in the influence region falls below the recorded case's.

**Acceptance Scenarios**:

1. **Given** an instrument and a declared bias, **When** applied with quality control on,
   **Then** its observations are flagged, drawn as flagged, excluded, and the status names
   the bias.
2. **Given** the same with quality control off, **When** applied, **Then** the biased
   observations enter, the row updates, the difference field shows where the bias went,
   and the status says quality control is off.
3. **Given** a bias below the check threshold, **When** applied with control on, **Then**
   the observations are not flagged and the row shows the small bias propagating — the
   harness does not pretend the check catches everything.

---

### User Story 5 - Redraw the track (Priority: P2)

A reader drags the track's waypoints. Observations are resampled from truth at the new
positions through the same instruments, the run repeats, and the skill score answers
whether that was a better place to have sailed.

**Why this priority**: FR-33.

**Independent Test**: Headlessly, a redrawn track produces observations at the new
positions with the same instruments and noise streams, and the run's skill differs from
the recorded case's, with both shown.

**Acceptance Scenarios**:

1. **Given** the track's waypoints, **When** one is dragged, **Then** the instruments
   resample truth at the new positions (FR-12), the surface measurements and drops move
   with the track, and the run repeats.
2. **Given** the redrawn run, **When** the row is read, **Then** each panel shows skill
   beside the recorded case's, and the status reads "edited: track".
3. **Given** the vessel's declared speed, **When** a waypoint is dragged so the track
   cannot be sailed in the recorded time, **Then** the surface says so and the instants
   are stretched or the edit refused, per a declared rule.

---

### Edge Cases

- Two edits interact (a withheld observation on a redrawn track): edits compose in order,
  the status lists them in order, and revert removes all.
- An edit is applied while a re-integration is in progress: the in-progress run is
  cancelled and the new one starts; the status says "computing".
- A dragged profile point crosses another: the drag is constrained so the profile stays
  monotone in depth, and the constraint is shown.
- The edit produces an interface depth below the profile's reach: the operator reports
  "below the profile" and the analysis treats it as feature 004 declares.
- A re-run exceeds the budget: the NFR-04 message, and the previous results stay,
  labelled as previous.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The surface MUST always state whether it shows the recorded run or an edit,
  MUST list edits in order, and MUST provide a single action that reverts to the recorded
  case with byte-identical results (FR-34).
- **FR-002**: Every edit MUST be recorded in the manifest's counterfactual slot so the
  edited run replays (FR-08, AT-04).
- **FR-003**: A reader MUST be able to select an XBT and drag its profile points; the
  edited profile MUST pass through the same observation operator; the measured profile
  MUST remain drawn as a ghost (FR-28).
- **FR-004**: Every edit MUST rerun the analysis and re-integrate every declared horizon
  (FR-30).
- **FR-005**: A difference field, edited minus recorded, MUST be available for every
  horizon with a greyscale-legible diverging scale and the region above a declared
  magnitude outlined (FR-29).
- **FR-006**: A reader MUST be able to withhold any observation; withheld observations
  MUST remain drawn in a withheld style; local skill inside and outside the influence
  region MUST be shown beside the recorded case's, with the region drawn (FR-31, AT-03).
- **FR-007**: A reader MUST be able to declare a bias on any instrument and toggle
  quality control; flagged observations MUST be drawn flagged; with control off the bias
  MUST enter the analysis (FR-32).
- **FR-008**: A reader MUST be able to drag track waypoints; observations MUST be
  resampled from truth at the new positions through the same instruments and named noise
  streams (FR-33, FR-12).
- **FR-009**: A track edit MUST respect a declared vessel speed by a declared rule
  (stretch instants or refuse), and the surface MUST say which applied.
- **FR-010**: Edits MUST compose in order and revert MUST remove all of them.
- **FR-011**: The AT-03 and AT-06 headless tests MUST live here and print their figures.
- **FR-012**: No counterfactual MAY read truth except through the instruments module
  (FR-12, G-02).

### Key Entities

- **Edit**: one of profile-edit, withhold, bias, quality-control toggle, track-redraw,
  with its parameters; ordered in the manifest's counterfactual slot.
- **Ghost**: the measured profile drawn behind an edited one.
- **DifferenceField**: edited minus recorded at one horizon.
- **RunStatus**: recorded / edited (with list) / computing / previous-results-shown.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After any sequence of edits, revert produces results byte-identical to the
  recorded case.
- **SC-002**: AT-03 passes: withholding one XBT lowers local skill inside its region by
  more than the declared amount and outside by less than tolerance, figures printed.
- **SC-003**: AT-06 passes headlessly, and the shell shows the ghost and the difference
  field for a dragged edit.
- **SC-004**: Every edit appears in the manifest and the edited run replays identically
  (with feature 011).
- **SC-005**: With a bias and control on, flagged observations are drawn flagged and
  excluded; with control off, they enter and the difference field is non-zero in the
  influence region.

## Assumptions

- Edits are applied to the current issue time (feature 009); changing issue time with
  edits present keeps the edits, because an edit to an observation is an edit to the
  record, not to a forecast.
- The observation-latency counterfactual of SRD §10 stays deferred; withhold is its
  special case and this beat is its trigger.
- The vessel speed rule defaults to stretching instants, so the redrawn track is always
  sailable and the stretch is stated.
