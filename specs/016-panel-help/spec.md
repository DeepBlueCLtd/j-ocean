# Feature Specification: Help, Where the Reader Asks for It

**Feature Branch**: `016-panel-help`

**Created**: 2026-09-07

**Status**: Draft

**Input**: User description: "Panel-level help behind a control at each panel's top right, held to something on disk, teaching and never reporting; the tour retires"

**SRD coverage**: SRD-v2 FR-52, FR-53, FR-54, FR-55; AT-14; §7 rows for attribution, lead and issue time, references and skill, and the observation footprint.

## Why this beat exists

The walkthrough was the right instinct at the wrong altitude. It answers "why is this panel
next to that one" in a fixed order, beginning wherever it begins, and a reader confused by
attribution has to walk three panels to reach the sentence they wanted. It is also a second
place where the surface is described, which goes stale the moment a panel changes — the exact
failure the component tour's anchor discipline was built to catch, caught by anchor and not by
content.

Panel help inverts it: the explanation lives with the thing it explains, opens where the
reader is looking, closes again, and is held to a declaration on disk so that a panel gaining
a layer without gaining an explanation is **reported by name** rather than passing unnoticed.

And help teaches. It may not state a live figure, because a help panel that reported would be
a second source for a fact the surface already shows, and two sources for one fact is how a
surface starts lying.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Help at the panel, opening in place (Priority: P1)

A reader looking at the attribution layer presses the help control at that panel's top right.
The explanation opens over or beside that panel and closes again. No sequence starts, no next
button appears, nothing else on the surface moves.

**Why this priority**: FR-52. This is the whole beat: the right explanation at the moment of
confusion.

**Independent Test**: Each panel declaring help has a control at its top right; activating it
reveals that panel's text and no other; activating it again hides it; no region's geometry
changes.

**Acceptance Scenarios**:

1. **Given** a panel with help, **When** the control is activated, **Then** that panel's help
   opens in place and no other region moves.
2. **Given** open help, **When** the control is activated again or Escape is pressed, **Then**
   it closes and focus returns to the control (FR-57).
3. **Given** open help, **When** the reader changes a control or enlarges a panel, **Then**
   the help closes or follows its panel, and never survives orphaned over a panel that is no
   longer there.
4. **Given** any help, **When** it renders, **Then** it offers no next, no previous and no
   step count (FR-52).

---

### User Story 2 - A panel with no help shows no control (Priority: P1)

A panel that has nothing to explain has no help control, and the absence is a fact rather
than an oversight.

**Why this priority**: FR-53. A stub help entry is worse than none: it teaches the reader
that the control is not worth pressing.

**Independent Test**: The set of panels rendering a help control equals exactly the set
declaring help.

**Acceptance Scenarios**:

1. **Given** a panel with no declared help, **When** it renders, **Then** it has no help
   control and no disabled placeholder.
2. **Given** a declared help entry with empty content, **When** the build runs, **Then** it
   fails: an empty entry is a stub and FR-53 prefers absence.

---

### User Story 3 - Help is held to what the panel declares (Priority: P1)

Each panel declares the regions or layers it has. A gate compares those declarations against
the help entries on disk and names any panel whose declared feature has no explanation.

**Why this priority**: FR-54 and AT-14. Help kept separately from the thing it explains goes
stale silently; the component tour already answers to this discipline and this applies it for
the same reason.

**Independent Test**: A planted panel with an undeclared region fails the gate, and the
failure names the panel and the region.

**Acceptance Scenarios**:

1. **Given** the panels and the help entries, **When** the gate runs, **Then** every declared
   region or layer has an entry and every entry names an existing panel.
2. **Given** a planted panel declaring a region with no entry, **When** the gate runs, **Then**
   it fails naming the panel and the region (AT-14).
3. **Given** a help entry for a panel that has been deleted, **When** the gate runs, **Then**
   it fails naming the orphan.

---

### User Story 4 - Help teaches and does not report (Priority: P1)

No help text states a live figure or the current state of any component. It says what
attribution is; it does not say what the attribution is right now.

**Why this priority**: FR-55. Two sources for one fact is a lie waiting for a stale render.

**Independent Test**: A test over the help sources rejects any interpolation of run state, any
provenance-typed figure component, and any numeric that is not a declared configuration value
named as such.

**Acceptance Scenarios**:

1. **Given** the help sources, **When** the test runs, **Then** none contains a computed,
   derived or host-time figure.
2. **Given** a planted help entry quoting a live skill score, **When** the test runs, **Then**
   it fails naming the entry.
3. **Given** help that needs a number to teach with (a length scale, a horizon), **When** it
   renders, **Then** it names it as declared configuration and reads it from configuration
   rather than restating a literal (Principle X).

---

### User Story 5 - The tour retires, and its content is placed (Priority: P2)

The walkthrough is removed. Each of its steps is either a panel's help entry, a section on
the welcome site, or recorded as deliberately dropped with a reason.

**Why this priority**: FR-52 says panel-level and not a tour, so the tour cannot simply
coexist; and its steps are good writing that should not be lost with it.

**Independent Test**: A disposition record covers every step; the test asserts each
destination exists.

**Acceptance Scenarios**:

1. **Given** the former steps, **When** the record is checked, **Then** every one resolves to
   a help entry, a site section, or a recorded drop with a reason.
2. **Given** the application, **When** it renders, **Then** no tour, overlay or step counter
   is present.
3. **Given** the figure-typography legend the tour carried, **When** it is placed, **Then** it
   is on the site and reachable from the application, since it explains the whole surface and
   not one panel.

---

### Edge Cases

- **Help longer than its panel.** The disclosure scrolls within itself; it may not grow the
  page (FR-41).
- **Help open in the enlarged state.** Help belongs to the panel, so the enlarged panel's help
  is the same entry at more room; swapping panels in the strip closes it.
- **Help for a region rather than a panel.** The scores region and the controls column each get
  one entry, per §7; they are panels for the purposes of the gate.
- **The §7 rows.** Attribution's explanation, lead time and issue time, the references and
  skill, and the observation footprint each have a named entry; the gate holds the four by
  name so the SRD table is a test and not a promise.
- **Reduced motion.** Opening and closing are instantaneous.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Narrative explaining a panel MUST be carried by that panel, behind a help control
  at its top right, opening in place and closing again (FR-52).
- **FR-002**: Help MUST NOT sequence: no next, previous, step count or tour (FR-52).
- **FR-003**: A panel with no declared help MUST render no help control (FR-53).
- **FR-004**: Each panel MUST declare its regions or layers, and a gate MUST fail by name on
  any declared feature without a help entry and on any entry without a panel (FR-54, AT-14).
- **FR-005**: Help MUST NOT state any live figure or any component's current state, and a test
  MUST hold it to that (FR-55).
- **FR-006**: A figure used to teach MUST be a declared configuration value, read from
  configuration (Principle X).
- **FR-007**: The walkthrough MUST be removed, and every step MUST have a recorded destination
  or a recorded reason for being dropped.
- **FR-008**: Opening or closing help MUST NOT move any region (FR-47, FR-49) and MUST be
  keyboard operable with focus returned on close (FR-57).

### Key Entities

- **HelpEntry**: panel id, the feature it explains, its text, and its declared-figure
  references.
- **PanelDeclaration**: a panel's id and the regions or layers it claims to have.
- **StepDisposition**: a former walkthrough step and where it went.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every panel declaring help offers exactly one control; every panel without help
  offers none (AT-14).
- **SC-002**: A planted panel with an undeclared region fails the gate by name (AT-14).
- **SC-003**: A planted help entry stating a live figure fails the test by name (FR-55).
- **SC-004**: No tour is rendered, and every former step resolves in the disposition record.
- **SC-005**: Opening help changes no region's bounding rectangle.
- **SC-006**: The four §7 help destinations exist and are held by name.

## Assumptions

- The help gate is a new numbered gate in the constitution's schedule, watched failing against
  a planted violation before it is trusted, as every gate here is.
- Help content lives beside the panel it explains, not in one file of all help; the gate makes
  the pairing checkable either way, and proximity is what keeps it honest.
- Panel declarations are the same declarations the layout of feature 013 uses for its regions,
  so there is one list and not two.
