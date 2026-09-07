# Feature Specification: One View, Four Regions

**Feature Branch**: `013-one-view`

**Created**: 2026-09-07

**Status**: Draft

**Input**: User description: "The application is one non-scrolling view divided by what changes when: controls left, horizon row centre, scores beneath their own panels, detail right"

**SRD coverage**: SRD-v2 FR-40, FR-41, FR-43, FR-44, FR-45, FR-46, FR-47, FR-48; AT-10, AT-11, AT-12. SRD-v1 FR-11, FR-13, FR-20 to FR-22, FR-25, FR-31, FR-32 carried unchanged.

## Why this beat exists

The shell works and its author could not follow it. Three vertical screens put a control
and the thing it changes on different screens, which is the whole of the reported
clumsiness; and the row was chosen over a slider (ADR-0003) precisely because a reader
cannot hold an unseen frame in memory, so a page that scrolls reintroduces the fault the
row exists to prevent.

This beat moves things and computes nothing new. That is a strong claim about a 1,301-line
component whose presentation and computation have never been separated, so the claim is
held by a gate that lands **before** the first element moves: for a fixed seed, every
computed field, score and derived quantity is byte-identical across the refactor. Where the
gate turns red for a reason that is not a bug, the entanglement it found is a finding to be
recorded (SRD-v2 FR-40), not a licence to change the number.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The scope is held by a gate before anything moves (Priority: P1)

A digest of everything the run computes — published fields, the analysis and its
attribution, every score at every horizon, every derived quantity a panel reads — is taken
from the recorded case on `main`, committed, and asserted on every run thereafter. The
refactor proceeds under it.

**Why this priority**: FR-40 and AT-10. A layout beat that quietly moved a number would be
indistinguishable from one that did not, and this project's whole method is that the
difference is visible.

**Independent Test**: Headlessly, on the recorded seed, the digest matches the committed
one; changing one coefficient in the analysis fails the gate and names the quantity that
moved.

**Acceptance Scenarios**:

1. **Given** the recorded case, **When** the invariance gate runs, **Then** it reports one
   digest per computed quantity and compares each against the committed record.
2. **Given** a planted change to a scoring constant, **When** the gate runs, **Then** it
   fails and names the quantity, its recorded digest and its current one.
3. **Given** the refactor is complete, **When** the gate runs, **Then** every digest is
   unchanged from before the refactor.
4. **Given** a quantity the harness computes only in order to draw something, **When** the
   gate is written, **Then** that entanglement is recorded as a finding rather than
   resolved silently.

---

### User Story 2 - One viewport, and it does not scroll (Priority: P1)

A reader opens the application at the declared minimum viewport. Every control, all six
horizon panels, every score and the detail of whatever is selected are on screen at once.
No scrollbar appears on either axis.

**Why this priority**: FR-41, AT-11. Everything else in this document is a consequence of
it.

**Independent Test**: In a browser at the declared minimum size, the document scroll
extents equal the viewport on both axes and every named region is within the viewport
rectangle.

**Acceptance Scenarios**:

1. **Given** the declared minimum viewport, **When** the application has loaded, **Then**
   `scrollWidth` and `scrollHeight` do not exceed the client box, and no descendant
   introduces a scrollbar the layout did not declare.
2. **Given** a region whose content exceeds its box, **When** it renders, **Then** the
   region scrolls **within itself** and is declared as a scrolling region, rather than
   growing the page.
3. **Given** any state the application can reach — configuration failure, over-budget
   notice, an unbuilt row, a scoring refusal — **When** it renders, **Then** the no-scroll
   property still holds.

---

### User Story 3 - Four regions, divided by what changes when (Priority: P1)

The surface is one grid of four named regions: controls on the left, the horizon row in the
centre, each panel's scores directly beneath that panel in its own column, and the detail of
the last selection on the right.

**Why this priority**: FR-44 to FR-47. The division is by rate of change, not by subject:
causes in one place, the payload in the middle, consequences beneath, and the thing being
inspected to one side.

**Independent Test**: A shell test asserts the four regions exist, that the controls region
contains exactly the controls SRD-v1 names, and that each score sits in the same grid column
as the panel it belongs to.

**Acceptance Scenarios**:

1. **Given** the application, **When** it renders, **Then** issue time and lead time
   (SRD-v1 FR-25), the observation toggles (FR-31), quality control (FR-32), the domain
   choice (FR-11) and the track and profile editors' entry points are all in the controls
   region and nowhere else.
2. **Given** a control that acts on exactly one panel, **When** the layout is checked,
   **Then** it is at that panel and not in the controls column.
3. **Given** the centre region, **When** it renders, **Then** it contains the horizon row
   and nothing else competes with it for that region's space.
4. **Given** each horizon panel, **When** its skill figures render, **Then** they are in
   that panel's column immediately beneath it, and there is no scores table elsewhere.
5. **Given** the six columns read left to right, **When** a reader looks along them,
   **Then** the decay is visible in the figures themselves without a curve being plotted.

---

### User Story 4 - A control is changed and every consequence is visible (Priority: P1)

A reader drags issue time, or turns Argo off, or switches domain. Every horizon panel and
every score changes on screen without the reader moving.

**Why this priority**: AT-12; this is the defect the beat exists to fix.

**Independent Test**: In a browser, capture every panel and every score before and after one
control change; all of them are within the viewport rectangle in both captures, and the ones
the change affects have changed.

**Acceptance Scenarios**:

1. **Given** any control in the left column, **When** it is changed, **Then** no scroll
   occurs and the affected panels and scores are visible throughout.
2. **Given** a change that costs more than the declared frame budget, **When** it is made,
   **Then** the NFR-04 statement appears in place with both figures and the surface does not
   freeze (SRD-v1 carried).

---

### User Story 5 - The detail region fills without rearranging anything (Priority: P2)

A reader clicks a cell in the attribution layer, or an XBT mark. The right-hand region fills
with that cell's breakdown (SRD-v1 FR-18) or that profile with its ghost (FR-28). Nothing
else on the surface moves.

**Why this priority**: FR-47. A surface whose shape changes on a click teaches a reader not
to click, which is fatal to an instrument meant to be poked.

**Independent Test**: Record the bounding rectangle of every region before and after a
selection; only the detail region's contents differ, and every rectangle is identical.

**Acceptance Scenarios**:

1. **Given** nothing selected, **When** a cell is selected, **Then** the detail region
   fills and the geometry of the controls, centre and scores regions is unchanged to the
   pixel.
2. **Given** a cell selected, **When** an observation is selected instead, **Then** the
   detail region's content is replaced and no region moves.

---

### User Story 6 - An empty region says what would appear there (Priority: P2)

Before anything is selected, the detail region says what a selection would put there.
Before the row is built, the centre says what building it will cost and what it will show.

**Why this priority**: FR-48, and constitution Principle VI: an empty region is a claim the
surface has not earned.

**Independent Test**: On first load, every region either holds content or holds a sentence
naming what belongs in it; no region is visually empty.

**Acceptance Scenarios**:

1. **Given** no selection, **When** the detail region renders, **Then** it names the two
   things that can appear there and how to put one there.
2. **Given** a region that is empty because a computation has not been asked for, **When**
   it renders, **Then** it says so and what it will cost, rather than rendering blank.

---

### User Story 7 - Too small is answered, not deferred (Priority: P2)

A reader on a viewport below the declared minimum is told the size the application needs and
is offered the enlarged single-panel presentation instead of a six-panel row nobody can read.

**Why this priority**: FR-43. A no-scroll requirement without a smallest-case answer is an
unfinished requirement.

**Independent Test**: At a viewport one pixel below the declared minimum width, the
statement appears with the required size as a declared figure and the single-panel fallback
is operable.

**Acceptance Scenarios**:

1. **Given** a viewport below the declared minimum, **When** the application renders,
   **Then** it states the size it needs, drawn as a declared figure, and offers the
   single-panel presentation of FR-49.
2. **Given** the fallback presentation, **When** it renders, **Then** the strip of FR-49 is
   present and the controls and the selected panel's scores remain reachable.
3. **Given** the viewport is enlarged past the minimum, **When** it crosses, **Then** the
   full layout appears without a reload.

---

### Edge Cases

- **Configuration failure.** The failure banner replaces the surface; it must not add a
  scrolling page of stack trace. It is bounded and scrolls within itself.
- **A long score statement.** Skill statements are sentences; a column is narrow. The
  statement wraps within its column and is never truncated to fit, because a truncated
  provenance is a figure without its provenance (Principle V).
- **Deep browser zoom, or a large declared font.** The minimum viewport is expressed in CSS
  pixels; at 200% zoom a nominally adequate window is below the minimum and gets the FR-43
  answer, which is the correct behaviour rather than a bug.
- **A seventh declared horizon.** G-05 already holds that the row draws exactly the declared
  horizons; the layout must derive its column count from configuration, so a configuration
  with five or seven horizons lays out without a code change.
- **The row not yet built.** The centre region is not empty: it says what the row is and
  what it costs (FR-48).
- **`prefers-reduced-motion`.** Nothing about the region grid animates; region contents
  swap without transition.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A gate MUST record, for the recorded seed, a digest per computed field, score
  and derived quantity, and MUST fail naming any quantity whose digest changes (SRD-v2
  FR-40, AT-10). It MUST land and be watched failing before the layout changes.
- **FR-002**: The application MUST render complete within one viewport at the declared
  minimum, with no scrollbar on either axis, in every state it can reach (FR-41, AT-11).
- **FR-003**: The layout MUST be four named regions — controls, centre, scores, detail —
  and every element MUST belong to exactly one (FR-44 to FR-47).
- **FR-004**: Every control that drives the whole system MUST be in the controls region; a
  control acting on a single panel MUST be at that panel and MUST NOT be in the controls
  region (FR-44).
- **FR-005**: The centre region MUST carry the horizon row alone, at the full width
  available to it (FR-45).
- **FR-006**: Each panel's skill figures MUST render in that panel's column beneath it, and
  no scores table MUST exist elsewhere (FR-46). SRD-v1 FR-20 to FR-22 are unchanged: two
  references, and the *not earning its compute* words where they apply.
- **FR-007**: Selection MUST fill the detail region and MUST NOT change the geometry of any
  region (FR-47).
- **FR-008**: A region with no content MUST state what would appear in it (FR-48).
- **FR-009**: Below the declared minimum viewport the application MUST state the size it
  needs as a declared figure and MUST offer the single-panel presentation (FR-43).
- **FR-010**: The declared minimum viewport MUST be a value in configuration, measured from
  the built layout, and MUST NOT be a literal in any component (constitution Principle X).
- **FR-011**: No computed quantity, data source or numeric MUST change in this beat; an
  apparent need to change one MUST be recorded as a finding (FR-40).
- **FR-012**: The region grid MUST derive its column count from the declared horizons.

### Key Entities

- **Region**: one of four named areas, its content, and the sentence it shows when empty.
- **InvarianceRecord**: the committed per-quantity digests for the recorded seed.
- **ViewportFloor**: the declared minimum width and height, and the statement shown below it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At the declared minimum viewport, document scroll extents equal the client box
  on both axes, in each of: loaded, row-unbuilt, row-built, scored, cell-selected,
  over-budget and configuration-failure states (AT-11).
- **SC-002**: Every computed digest is identical before and after the beat (AT-10), and the
  planted change fails the gate by name.
- **SC-003**: One control change leaves every panel and every score inside the viewport
  rectangle, before and after (AT-12).
- **SC-004**: Selecting a cell changes no region's bounding rectangle (FR-47).
- **SC-005**: On first load no region is visually empty (FR-48).
- **SC-006**: At one pixel below the declared minimum, the statement names the required size
  and the fallback is operable (FR-43).

## Assumptions

- The declared minimum is **measured, not chosen** (SRD-v2 §9): the plan takes it from the
  built layout at the point six panels stop being legible, and configuration then declares it.
- The row's on-demand construction (a button, because it costs seconds) survives this beat as
  an FR-48 statement rather than becoming an automatic computation; making it automatic would
  change what is computed on load, which FR-40 forbids in this beat.
- Regions may scroll internally where content genuinely exceeds them (the manifest text, a
  long breakdown); the page may not. An internal scroll is a declared property of a region,
  not an accident.

## Findings to record

Under FR-40, these are recorded in `docs/questions-for-the-author.md` and the beat's ADR
rather than fixed in passing:

1. Whether the attribution drawn is derived from the analysis's own weights in the code as
   built, or computed separately for display (SRD-v2 §9). G-06 holds the type's construction
   site; it does not by itself prove the drawn field is the gain.
2. Every place where a computation happens **because** something is drawn — scoring on
   demand, the row built on a button, footprint construction inside a render path. Each is an
   entanglement of presentation with computation, which is exactly what FR-40 expects this
   refactor to expose.
3. Any figure that exists only in the shell, with no producer in the model, analysis or
   scoring modules.
