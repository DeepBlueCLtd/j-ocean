# Feature Specification: An Addressable, Operable Surface

**Feature Branch**: `017-addressable-surface`

**Created**: 2026-09-07

**Status**: Draft

**Input**: User description: "The selected panel, cell and observation are addressable; selecting writes the address and mounting does not; greyscale, keyboard and reduced motion carried; the disclaimer stays visible"

**SRD coverage**: SRD-v2 FR-56, FR-57, FR-58; AT-15. SRD-v1 FR-02 and FR-19 carried. Constitution Principle I (nothing persists, no run in the URL) is the binding constraint.

## Why this beat exists

Two people discussing a forecast need to point at the same thing. Today they cannot: every
selection is in memory, and a link opens the application on whatever it opens on. Addressing
the selection makes the surface citable — in the blog, in a review, in a message — which is
what a teaching instrument is for.

It also has one sharp edge. The constitution says nothing persists between visits and there is
no run in the URL: a run is a seed and its manifest, and replay is re-computation from a
manifest rather than restoration from a link. So the address carries **selection only** — which
panel, which cell, which observation — and never the run. A link therefore says *"look at cell
2,431 of the 48-hour panel"*, and what the reader sees there depends on the run they are in,
which is the honest thing for it to mean.

And the address is written by **selecting**, never by mounting. A surface that wrote its
default on mount would rewrite a reader's URL on any remount, which turns a citation into
whatever the last render felt like.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A link opens on the thing being discussed (Priority: P1)

A reader is sent a link naming the 48-hour panel and a cell. It opens the application with
that panel enlarged and that cell's breakdown in the detail region.

**Why this priority**: FR-56, AT-15.

**Independent Test**: A constructed address opens the application on that panel and that cell,
with the detail region filled.

**Acceptance Scenarios**:

1. **Given** an address naming a panel, **When** the application opens, **Then** that panel is
   the enlarged panel in the centre region (feature 015).
2. **Given** an address naming a cell, **When** the application opens, **Then** the detail
   region holds that cell's breakdown (SRD-v1 FR-18).
3. **Given** an address naming an observation, **When** the application opens, **Then** the
   detail region holds that profile with its ghost (SRD-v1 FR-28).
4. **Given** an address naming a horizon that is not declared, a cell outside the grid, or an
   observation this run does not have, **When** the application opens, **Then** it says so and
   shows the unselected state, rather than silently choosing something near it.

---

### User Story 2 - Selecting writes the address; mounting does not (Priority: P1)

A reader clicks a cell and the address updates. A remount — a hot reload, a re-render, a
returning tab — leaves the address exactly as it was.

**Why this priority**: FR-56 states it as the requirement and gives the reason: a default
written on mount rewrites a reader's URL behind their back.

**Independent Test**: Mount the surface with a given address and assert the address is
byte-identical afterwards; then select and assert it changed once.

**Acceptance Scenarios**:

1. **Given** any address, **When** the surface mounts, **Then** no write to the address occurs.
2. **Given** a mounted surface, **When** a selection is made, **Then** the address is updated
   once, replacing rather than pushing, so a reader poking at cells does not build a history
   they must escape backwards through.
3. **Given** a selection cleared, **When** it clears, **Then** the address returns to its
   unselected form.
4. **Given** the browser back button after several selections, **When** pressed, **Then**
   behaviour is what the replace-not-push choice implies, and it is stated rather than
   emergent.

---

### User Story 3 - The address carries selection and never the run (Priority: P1)

No seed, no manifest, no edits and no run state appear in the address. A reader wanting to
share a run shares its manifest, as they always did.

**Why this priority**: Constitution Principle I and SRD-v1's "no run in the URL". Without
this, addressability quietly becomes a second persistence mechanism with none of the
manifest's checks.

**Independent Test**: The address grammar admits exactly panel, cell and observation; a test
rejects any other key.

**Acceptance Scenarios**:

1. **Given** any reachable state, **When** the address is inspected, **Then** it contains only
   selection keys.
2. **Given** an address carrying an unknown key, **When** the application opens, **Then** the
   key is ignored and the surface says the link carried something it does not honour.
3. **Given** a reader wanting to share a run, **When** they look, **Then** the manifest entry
   point is what the surface offers them.

---

### User Story 4 - Operable without a mouse, legible without colour (Priority: P1)

Every control, every panel, the strip, the help disclosures and both selection surfaces are
reachable and operable from the keyboard, legible in greyscale, and free of motion when the
reader has asked for that.

**Why this priority**: FR-57, and SRD-v1 FR-19 carried: the attribution field may not rely on
colour blend alone.

**Independent Test**: A keyboard-only pass reaches every interactive element in a stated order
with a visible focus indicator; a greyscale rendering keeps every distinction; with
`prefers-reduced-motion` set, no animation runs.

**Acceptance Scenarios**:

1. **Given** keyboard navigation only, **When** the reader tabs through, **Then** every
   control, panel, strip entry and help control is reachable with a visible focus ring, in an
   order that follows the four regions.
2. **Given** a greyscale rendering, **When** the attribution field is drawn, **Then** its
   structure is carried by something other than hue alone (SRD-v1 FR-19).
3. **Given** `prefers-reduced-motion`, **When** any selection, enlargement or help disclosure
   occurs, **Then** nothing animates.
4. **Given** the detail region filling, **When** it fills from a keyboard selection, **Then**
   the change is announced to assistive technology without stealing focus from the reader's
   place.

---

### User Story 5 - The disclaimer is visible, and not behind help (Priority: P2)

The statement that j-ocean is not an operational forecast system is on screen without
interaction, and is not the thing that got moved behind a help control when space ran short.

**Why this priority**: FR-58 and SRD-v1 FR-02. It is the one piece of prose the layout beat
may not reclaim.

**Independent Test**: On load, at the declared minimum viewport, the statement is within the
viewport rectangle and is not inside a disclosure.

**Acceptance Scenarios**:

1. **Given** the declared minimum viewport, **When** the application loads, **Then** the
   statement is visible without interaction.
2. **Given** the FR-43 fallback presentation, **When** it renders, **Then** the statement is
   still visible.
3. **Given** the help system, **When** entries are enumerated, **Then** none of them is the
   only place this statement appears.

---

### Edge Cases

- **A cell index from a different grid.** Addresses name a cell by index; a configuration with
  a different grid makes an old link meaningless. The address records the grid dimensions it
  was written against and the surface says the link was written for a different grid rather
  than selecting a cell that happens to share the number.
- **An observation id absent from this run.** A fresh seed produces different observations;
  the surface says the link names an observation this run does not have.
- **Address written before the row is built.** A panel selection implies the row; the surface
  says what building it costs (FR-48) and honours the selection once built, without having
  computed anything on mount.
- **Scrolling anchors.** There is no scrolling, so an address may not be a fragment anchor to
  a position; it names an object.
- **Focus on address-opened selection.** Opening from a link does not move focus to the detail
  region, because a reader arriving by link has not asked for it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The selected panel, cell and observation MUST be addressable, and a link MUST
  open the application on the named thing (FR-56, AT-15).
- **FR-002**: Selecting MUST write the address; mounting MUST NOT (FR-56, AT-15).
- **FR-003**: Address writes MUST replace rather than push, and the choice MUST be stated.
- **FR-004**: The address MUST carry selection only, and MUST NOT carry seed, manifest, edits
  or any run state (constitution Principle I).
- **FR-005**: An address naming something this run does not have MUST be reported, and the
  surface MUST NOT substitute a near match (Principle VI).
- **FR-006**: Every surface MUST be operable by keyboard with a visible focus order following
  the four regions (FR-57).
- **FR-007**: Every surface MUST be legible in greyscale, and the attribution field MUST NOT
  rely on colour blend alone (FR-57, SRD-v1 FR-19).
- **FR-008**: Every surface MUST respect `prefers-reduced-motion` (FR-57).
- **FR-009**: The not-operational statement MUST be visible without interaction in every
  presentation, including the FR-43 fallback, and MUST NOT be behind a help control (FR-58).

### Key Entities

- **Address**: panel, cell, observation, and the grid the cell index was written against.
- **Selection**: the single last-selected object the detail region draws (FR-47).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A link to a selected cell opens the application on that cell (AT-15).
- **SC-002**: Remounting the surface leaves the address byte-identical (AT-15).
- **SC-003**: The address grammar admits only selection keys; a planted run key is rejected by
  test.
- **SC-004**: A keyboard-only pass reaches every interactive element with a visible focus ring.
- **SC-005**: A greyscale rendering of the attribution field retains its structure.
- **SC-006**: With `prefers-reduced-motion` set, no animation runs anywhere on the surface.
- **SC-007**: The not-operational statement is within the viewport on load at the declared
  minimum, and in the fallback presentation.

## Assumptions

- The address is a query string rather than a path, so the application remains a single
  static page served from GitHub Pages with no routing configuration.
- "Byte-identical after remount" is asserted by comparing the full address string, since a
  reordered query string is still a rewritten URL to anyone who copies it.
- Greyscale legibility is tested by rendering with a saturation filter and asserting the
  distinctions a reader is asked to make survive, not by eye.
