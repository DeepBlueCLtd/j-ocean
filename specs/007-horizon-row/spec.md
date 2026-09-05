# Feature Specification: The Horizon Row

**Feature Branch**: `007-horizon-row`

**Created**: 2026-09-05

**Status**: Draft

**Input**: User description: "The horizon row: six panels at declared lead times, enlargeable in place, attribution as a field"

**SRD coverage**: FR-02, FR-13, FR-14, FR-15, FR-16, FR-18, FR-19, FR-21 (display), FR-22 (display), NFR-04, NFR-05, G-05

## Why this beat exists

A curve on a slide asserts that persistence decays; a row the reader can see all at once
demonstrates it. This beat is the primary surface: six panels at declared lead times,
each stating what instant it is valid for and what it was initialised from, each carrying
the attribution as a field, and each enlargeable in place without changing what was
computed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Six panels, all visible, each saying what it is (Priority: P1)

A reader opens the recorded case and sees six panels left to right at 6, 12, 24, 48, 72
and 96 hours, all visible at once, each showing the forecast field with its skill against
both references beneath it, and each stating its valid instant and its initialisation
instant.

**Why this priority**: FR-13 and FR-15. The row is the design; the slider is rejected
because what is not on screen is what the eye forgets.

**Independent Test**: Playwright loads the shell and asserts six panels in a single row
with the declared horizons in order, each with a valid-instant label, an initialised-from
label, and two skill figures with their references named.

**Acceptance Scenarios**:

1. **Given** the recorded case, **When** the shell renders, **Then** six panels appear in
   one row in horizon order and none is hidden behind a scroll or a break.
2. **Given** a panel, **When** it is read, **Then** it states the instant it is valid for
   and the instant its forecast was initialised from, both as absolute instants in the
   run's clock, not only as a lead time.
3. **Given** a panel, **When** its score is read, **Then** it shows skill against
   persistence and skill against climatology, each naming its reference, and a negative
   skill reads "worse than persistence" in those words (FR-21).
4. **Given** a panel's score, **When** the reader asks for its provenance, **Then** the
   region, margin, window, metric, floor and caveat are shown (FR-22).

---

### User Story 2 - Attribution as a field, legible in greyscale (Priority: P1)

Each panel carries the attribution field: every cell's own mix of observation, background
and climatology weight, drawn so that it reads in greyscale and does not rely on a
three-way colour blend alone.

**Why this priority**: FR-16 and FR-19. The field replaces the summary bar that was
specified first and was wrong.

**Independent Test**: A Playwright screenshot of a panel with colour removed still
distinguishes an observed patch from an unvisited corner, as judged by a declared contrast
threshold on the rendered pixels.

**Acceptance Scenarios**:

1. **Given** a panel, **When** the attribution layer is shown, **Then** each cell is drawn
   from its own three weights read from the analysis record, and from nowhere else
   (G-06).
2. **Given** the layer, **When** rendered in greyscale, **Then** the dominant source in a
   cell is distinguishable by a second channel (hatching, pattern or luminance ordering)
   and not by hue alone.
3. **Given** a legend, **When** read, **Then** it names the three sources and the second
   channel that encodes them.

---

### User Story 3 - A cell's breakdown on hover or selection (Priority: P2)

A reader hovers or selects a cell and is shown that cell's breakdown: the three weights as
a bar, and the observations that contributed with their shares.

**Why this priority**: FR-18. The bar chart survives as an instrument of the cell.

**Independent Test**: Hovering a cell in Playwright shows a breakdown whose weights equal
the analysis record's for that cell.

**Acceptance Scenarios**:

1. **Given** a panel, **When** a cell is hovered, **Then** a breakdown appears with three
   weights summing to 1 and a list of contributing observations.
2. **Given** a cell is selected, **When** the pointer leaves, **Then** the breakdown
   persists until deselected.
3. **Given** the same cell in two horizons, **When** both breakdowns are read, **Then** the
   background and climatology weights differ as the analysis's do, because attribution is
   per horizon (the advected background carries forward and the observation's share
   spreads).

---

### User Story 4 - Enlarge in place, computing nothing (Priority: P2)

A reader enlarges one panel. The row keeps its shape; the enlarged panel shows the detail
the row cannot — the attribution field and, from feature 008, the observation marks. The
enlargement changes nothing computed.

**Why this priority**: FR-14.

**Independent Test**: A test records the analysis and model result identities before and
after enlarging, and asserts no recomputation occurred; a Playwright test asserts the
other five panels remain visible.

**Acceptance Scenarios**:

1. **Given** the row, **When** a panel is enlarged, **Then** it grows in place and the
   remaining five stay visible at reduced size.
2. **Given** a panel is enlarged, **When** the run's results are inspected, **Then** no
   field has been recomputed.
3. **Given** an enlarged panel, **When** the reader enlarges another, **Then** the first
   returns to row size.

---

### User Story 5 - Every declared horizon, and nothing else (Priority: P2)

A maintainer adds a seventh horizon to configuration and the row shows seven panels; they
remove one and the row shows five. Gate G-05 runs in Playwright and fails if the rendered
horizons differ from the declared ones.

**Why this priority**: G-05 and constitution X; the gate is watched failing on a planted
mismatch.

**Independent Test**: G-05 fixture configuration declares seven horizons while a planted
rendering bug draws six; the gate fails and names the missing horizon.

**Acceptance Scenarios**:

1. **Given** a configuration declaring N horizons, **When** the shell renders, **Then**
   exactly N panels are drawn with those horizons.
2. **Given** the planted fixture, **When** G-05 runs, **Then** it fails naming the
   horizon not rendered.

---

### User Story 6 - The shell says what it is not, and when it is over budget (Priority: P3)

The not-operational statement of FR-02 is visible where the reader meets the row. When a
run would exceed the declared frame budget, the row says so with both figures rather than
freezing.

**Why this priority**: FR-02 and NFR-04 are already required by features 001 and 003; this
story places them on the row.

**Independent Test**: Playwright asserts the statement is visible with the row, and, with a
tiny declared budget, the over-budget message appears and the page responds to a click.

**Acceptance Scenarios**:

1. **Given** the row, **When** rendered, **Then** the FR-02 statement is within the same
   viewport.
2. **Given** an over-budget configuration, **When** the run is requested, **Then** the
   message appears with projected and declared figures, and a click on any control is
   handled.

---

### Edge Cases

- The viewport is narrower than six panels at minimum legible width: the row shrinks
  panels to a declared minimum and then, only then, allows horizontal scroll within the
  row's own container — never a grid.
- A horizon's valid instant is outside the truth record: the panel renders the forecast
  and its score reads "no truth at this instant" rather than a figure (feature 009's
  validity rule applies to the forecast; this is the score's own refusal).
- The attribution at a cell is all background (no observation, prior blend zero
  climatology): the cell renders as background-dominant and the breakdown says so.
- Declared, computed and derived figures appear together on one panel: each is
  typographically distinct per a declared style, and a figure never changes style between
  states (NFR-05).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The primary surface MUST be a single row of panels, one per declared
  horizon, in horizon order, all visible at once, and MUST NOT be a slider or a grid
  (FR-13).
- **FR-002**: Every panel MUST state its valid instant and its initialisation instant as
  absolute instants in the run's clock, in addition to its lead time (FR-15).
- **FR-003**: Every panel MUST show skill against persistence and against climatology,
  naming each, with "worse than <reference>" in words when negative, and MUST expose the
  score's provenance (FR-21, FR-22).
- **FR-004**: Every panel MUST draw the attribution field from the analysis record's
  weights and nowhere else, and MUST be legible in greyscale through a second channel
  beyond hue (FR-16, FR-17, FR-19, G-06).
- **FR-005**: Hovering or selecting a cell MUST show that cell's breakdown from the
  analysis record (FR-18).
- **FR-006**: A panel MUST be enlargeable in place with the other panels remaining
  visible, and enlargement MUST NOT trigger any recomputation (FR-14).
- **FR-007**: Gate G-05 MUST run in Playwright, MUST fail if rendered horizons differ
  from declared, and MUST be watched failing on a planted fixture (G-05, PR-04).
- **FR-008**: The FR-02 statement MUST be visible in the same viewport as the row.
- **FR-009**: An over-budget run MUST be reported with projected and declared figures
  and the page MUST remain responsive (NFR-04).
- **FR-010**: Fields MUST be rendered through one WebGL module under `src/harness/`, so
  that the renderer choice is confined and cheap to revisit (NFR-03, review R-8).
- **FR-011**: Declared, computed and derived figures MUST be rendered in three
  typographically distinct styles declared once, and a figure's style MUST NOT change
  between states (NFR-05).

### Key Entities

- **Panel**: one horizon's view: field, attribution layer, labels, scores, and (from
  feature 008) marks.
- **Row**: the ordered set of panels and the enlarge state.
- **Breakdown view**: the hovered or selected cell's weights and contributors.
- **FigureStyle**: the three declared styles.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Six panels render in one row at the declared horizons with valid and
  initialised instants on each, asserted by Playwright.
- **SC-002**: The greyscale screenshot test passes the declared contrast threshold.
- **SC-003**: Enlarging a panel triggers zero recomputation, asserted by result identity.
- **SC-004**: G-05 fails on its fixture and passes on the tree.
- **SC-005**: With an over-budget configuration, the page handles a click within a
  declared time while reporting the overrun.

## Assumptions

- The horizon presentation earns ADR-0003 (row versus slider versus grid), written before
  this beat with the SRD's reasoning.
- The WebGL surface renders one field texture per panel with the attribution layer as a
  second texture composited in a shader; the second channel for greyscale legibility is a
  pattern texture chosen in the plan.
- "Visible at once" means at a declared reference viewport width; below it the row's
  own container scrolls, the page never does.
