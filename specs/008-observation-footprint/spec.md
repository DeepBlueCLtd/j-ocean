# Feature Specification: The Observation Footprint

**Feature Branch**: `008-observation-footprint`

**Created**: 2026-09-05

**Status**: Draft

**Input**: User description: "The observation footprint: track line, XBT needles at sampled depths, flagged drawn as flagged"

**SRD coverage**: FR-23, FR-24, FR-07 (derived levels beside XBT)

## Why this beat exists

What the harness rejected is part of what the harness did, and a drop flattened to the
surface discards the dimension it exists for. This beat draws where the vessel has been
and what it measured: the track as a line carrying its surface measurements, XBT drops as
vertical needles through the displayed volume at the depths they genuinely sampled, and
every flagged observation drawn as flagged rather than omitted.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The track, carrying its measurements (Priority: P1)

A reader sees the ownship track drawn over every panel as a line, with the surface
measurements along it encoded on the line itself, and can read a measurement's value and
instant by hovering.

**Why this priority**: FR-23; the track is the first thing that says where the
information in the attribution field came from.

**Independent Test**: Playwright asserts a track path exists in each panel with as many
measurement marks as the recorded case has surface observations, and hovering one shows
its value and instant.

**Acceptance Scenarios**:

1. **Given** the recorded case, **When** a panel renders, **Then** the track is drawn as
   a line through the observation positions in instant order.
2. **Given** the line, **When** read, **Then** the surface measurement at each point is
   encoded on the line (by colour and by a second channel for greyscale) and hovering
   shows value, instant, instrument and flag state.
3. **Given** the panel's valid instant, **When** the track is drawn, **Then** the portion
   of the track after the initialisation instant is drawn distinctly, because it did not
   inform this forecast.

---

### User Story 2 - XBT drops as needles at their depths (Priority: P1)

In an enlarged panel, each XBT drop is drawn as a vertical needle through the displayed
volume, extending exactly to the depths it sampled, with the sampled levels marked.
Hovering a needle shows its profile beside the model's derived profile at that cell, the
derived levels labelled derived.

**Why this priority**: FR-23's needle and FR-07's derived-beside-measured comparison,
which is also the deferred trigger for dynamic depth.

**Independent Test**: A needle's rendered extent matches the drop's deepest sampled level
to within one display level; the hover view shows both profiles with the derived label.

**Acceptance Scenarios**:

1. **Given** an enlarged panel, **When** drops are drawn, **Then** each needle's extent
   equals the drop's actual sampled depth range and the sampled levels are marked.
2. **Given** a needle, **When** hovered, **Then** the measured profile and the model's
   derived profile at that cell are drawn together, the derived levels labelled derived
   and the two layer values labelled computed.
3. **Given** the row at row width, **When** drops are drawn, **Then** each is marked at its
   position with an indication of depth reached (a length-coded glyph), never flattened to
   an undifferentiated dot.

---

### User Story 3 - Flagged, drawn as flagged (Priority: P2)

An observation that failed a quality check, or carries a bad Argo flag, is drawn in the
footprint with its flag visible, never omitted, and the hover view names the check that
failed.

**Why this priority**: FR-24.

**Independent Test**: With an instrument declared broken so that its observations are
flagged, Playwright asserts the marks are present with the flagged style and hovering
names the check.

**Acceptance Scenarios**:

1. **Given** a flagged observation, **When** the footprint renders, **Then** the mark is
   drawn in the declared flagged style and is distinguishable in greyscale.
2. **Given** the mark, **When** hovered, **Then** the failing check and the flag are named
   and the value is shown.
3. **Given** quality control was toggled off for the run, **When** the footprint renders,
   **Then** the marks are not flagged and the panel states that quality control was off.

---

### User Story 4 - Argo profiles, drawn as external (Priority: P3)

Argo profiles are drawn as needles in a distinct external style, with their Argo flags
shown by the same flag semantics, and the hover view says whether they were assimilated.

**Why this priority**: FR-10 and review R-3. Whether Argo is assimilated is a toggle;
the footprint says which.

**Independent Test**: Playwright asserts Argo needles render in the external style and the
hover view reports assimilation state matching the configuration toggle.

**Acceptance Scenarios**:

1. **Given** Argo profiles in the domain and period, **When** an enlarged panel renders,
   **Then** each is a needle in the external style at its reported position.
2. **Given** "assimilate Argo" is false, **When** a needle is hovered, **Then** it says
   "drawn, not assimilated".

---

### Edge Cases

- Two drops at the same position: needles are offset by a declared minimum so both are
  visible, and the hover lists both.
- A drop's sampled depths exceed the displayed volume: the needle is drawn to the volume's
  floor with an indicator that it continues.
- The track crosses the sponge margin: the portion inside the margin is drawn but marked
  as inside the margin.
- The enlarged panel is at a horizon after the vessel's last observation: the footprint
  still draws, because the track informed the initial condition of every horizon.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The ownship track MUST be drawn as a line through the surface observation
  positions in instant order on every panel, with each measurement encoded on the line
  and readable by hover (FR-23).
- **FR-002**: Track segments after a panel's initialisation instant MUST be drawn
  distinctly from those before it.
- **FR-003**: In an enlarged panel, every XBT drop MUST be drawn as a vertical needle
  whose extent equals the depths actually sampled, with sampled levels marked (FR-23).
- **FR-004**: At row width, every drop MUST be marked with a depth-coded glyph and never
  reduced to an undifferentiated point.
- **FR-005**: Hovering a needle MUST show the measured profile beside the model's derived
  profile at that cell, with every level's kind labelled (FR-07).
- **FR-006**: A flagged observation MUST be drawn with a declared flagged style,
  distinguishable in greyscale, and hover MUST name the failing check (FR-24).
- **FR-007**: A run with quality control off MUST say so on every panel.
- **FR-008**: Argo profiles MUST be drawn in a distinct external style with their flags,
  and hover MUST state whether they were assimilated (FR-10, review R-3).
- **FR-009**: The footprint MUST read observation positions, depths, values and flags
  from the run's observation set and MUST NOT sample truth or compute anything.

### Key Entities

- **TrackMark**: a surface observation as drawn: position, value encoding, flag style.
- **Needle**: a profile observation as drawn: position, extent, level marks, style
  (ownship or external), flag style.
- **ProfileComparison**: the hover view of measured versus derived profile.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every observation in the recorded case has exactly one mark in each panel,
  asserted by count.
- **SC-002**: Needle extents match sampled depth ranges within one display level.
- **SC-003**: With a broken instrument, every flagged observation renders in the flagged
  style and none is omitted.
- **SC-004**: The greyscale test distinguishes flagged from unflagged marks.

## Assumptions

- The "displayed volume" of an enlarged panel is a 2.5-D presentation: the horizontal
  field with a depth axis for needles, not a full 3-D scene; the plan chooses the
  projection.
- Needles are drawn in the same WebGL module as the fields, as a separate line layer.
