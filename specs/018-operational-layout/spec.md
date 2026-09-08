# Feature Specification: The Operational Surface

**Feature Branch**: `018-operational-layout`

**Created**: 2026-09-08

**Status**: Draft

**Input**: Author's review of beat 017 — "It has introduced a scrolling pane. The look and feel
is still that of a blog article, though it uses a scrollable portion to *pretend* to reduce
overall height. Consider this as an operational SPA, arranged within a js-goldenlayout style
layout manager. Assume the screen will be at least 2k pixels wide. I need deliberately placed
controls that do a job, not blocks of text that describe what's happening. It's ok to offer a
walkthrough to explain the content."

**SRD coverage**: amends SRD-v2 FR-41 and FR-44 to FR-48, and supersedes the region-grid half of
ADR-0012. SRD-v1 FR-02, FR-07, FR-11, FR-13, FR-25, FR-31, FR-32 carried. SRD-v2 FR-40 binding:
this beat changes no computed quantity.

## Why this beat exists

Beats 013 to 017 fixed the diagnosis and not the disease. The page no longer scrolls, the
regions are named, the narrative is on the site and the explanation is at the panel — and the
result still reads as an article, because the *content* was rearranged rather than reconceived.

Three measurements, taken at 2560 × 1440 on beat 017's head:

- **The controls column is a 1,344 px scroller in a 1,440 px window.** Beat 013's own plan called
  internal scroll "a declared property of a region, not an accident". That framing is a dodge:
  declaring a scroller does not make the content fit, it makes not-fitting legitimate by fiat.
  A pane that scrolls through six disclosures is the scrolling page, moved sideways.
- **About two fifths of the surface is empty** while the horizon panels are 200 px wide. Fixed
  grid tracks do not take the space they are given; an instrument should.
- **The surface reports in sentences where an instrument shows a readout.** *"The analysis at this
  issue instant saw 2 observations; 29 had not happened yet."* *"Drawn over every panel: 25 surface
  measurements, 6 XBT drops and 25 Argo profiles…"* *"better than persistence by 0.0 per cent;
  worse than climatology by 208.8 per cent."* Each is true, sourced and well written, and each is
  prose doing a readout's job.

The prose is not accidental: Principle V, Principle VI and FR-48 asked for it. This beat does not
abandon those. It moves the *explaining* to where beat 016 already put it — the panel's own help,
and a walkthrough the author has asked back — and leaves the surface itself showing figures,
units and controls, with provenance one disclosure away as it always was.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The surface is a workspace of panes, not a document (Priority: P1)

A reader opens the application on a 2560-wide screen. It is a docked workspace: a control pane,
the horizon panels, the selection, and the run's provenance as tabs. Every pane is filled by its
contents. No pane scrolls a body of text.

**Why this priority**: this is the defect the beat exists to fix.

**Independent Test**: at the declared reference width, every pane's content fits its box, and the
only elements that scroll are those declared as **lists** — a profile's levels, a manifest — never
a pane of prose.

**Acceptance Scenarios**:

1. **Given** the declared reference viewport, **When** the application renders, **Then** the
   document does not scroll and no pane scrolls a body of explanatory text.
2. **Given** the run's provenance, **When** it renders, **Then** it is a tabbed pane and not a
   column of stacked disclosures.
3. **Given** any pane, **When** the viewport grows, **Then** the panes take the space: the
   horizon panels are wider at 2560 than at the declared minimum, rather than leaving it empty.

---

### User Story 2 - The layout is a layout manager, and the reader may arrange it (Priority: P1)

Panes have headers, may be resized, re-docked and tabbed together. The arrangement the reader
leaves is the arrangement they return to.

**Why this priority**: the author's direction, and the reason it is safe: **Principle IX forbids
persisting forecast inputs and outputs, not workspace chrome.** The two are different, and the
distinction is now written down rather than inferred.

**Independent Test**: a rearranged layout survives a reload; and a test asserts that what is
persisted names no seed, manifest, edit, observation or any run quantity.

**Acceptance Scenarios**:

1. **Given** a rearranged workspace, **When** the reader returns, **Then** the arrangement is
   restored.
2. **Given** the persisted workspace state, **When** it is inspected, **Then** it contains
   geometry and pane identity only, and a planted run key fails the test by name.
3. **Given** a stored layout from an older build, **When** it cannot be applied, **Then** the
   default arrangement is restored and the surface says the stored workspace was not usable.
4. **Given** a reader who has rearranged badly, **When** they ask, **Then** one control returns
   the default arrangement.

---

### User Story 3 - Controls do a job (Priority: P1)

Every control is a control: labelled, grouped by what it acts on, with its units and its
declared bounds visible. No control is introduced by a paragraph.

**Why this priority**: the author's direction, and SRD-v1 FR-25, FR-31, FR-32 and FR-11 name the
controls the surface owes.

**Independent Test**: every interactive element carries an accessible name and, where it takes a
value, its unit and declared range; and no text block on the control pane is a sentence that
merely describes what a control does.

**Acceptance Scenarios**:

1. **Given** the control pane, **When** it renders, **Then** the controls SRD-v1 names are
   present, grouped, and each states its units and declared bounds.
2. **Given** a control whose meaning needs explaining, **When** the reader asks, **Then** the
   explanation is that panel's help (FR-52), not a paragraph beside the control.
3. **Given** the control pane, **When** its text is counted, **Then** it contains no
   explanatory sentence outside a help disclosure.

---

### User Story 4 - Figures are readouts, and keep their provenance (Priority: P1)

A score is a number with a unit and a reference, not a sentence. The scorer's own words —
including *worse than climatology* — remain reachable, one disclosure away, in the scorer's own
phrasing.

**Why this priority**: Principle V and Principle VI are not negotiable, and the author's
direction does not ask them to be. It asks them to stop being the first thing on screen.

**Independent Test**: each horizon shows its two skills as figures with their references; the
scorer's statement is present behind a disclosure and is byte-identical to what the scorer
produced.

**Acceptance Scenarios**:

1. **Given** a scored row, **When** the scores render, **Then** each is a figure with its
   reference and its unit, in that panel's own column.
2. **Given** a score that lost, **When** it renders, **Then** the loss is visible in the figure
   and the scorer's words are one disclosure away, unsoftened.
3. **Given** any figure, **When** it renders, **Then** its kind — declared, computed, derived or
   host time — is distinguishable without colour (SRD-v1 FR-07, FR-19).

---

### User Story 5 - The walkthrough returns, as an offer (Priority: P2)

A reader who wants the surface explained can ask for a walkthrough. It is offered, never
imposed, and it explains the *workspace* — what the panes are and how they relate — while
panel-level help continues to explain each panel.

**Why this priority**: the author has asked for it back, and beat 016 retired it on the
reasoning that panel help serves a confused reader better. Both are true: help answers *what is
this*, a walkthrough answers *what am I looking at*.

**Independent Test**: the walkthrough is reachable, is not shown unasked, and every step resolves
to a pane that exists.

**Acceptance Scenarios**:

1. **Given** a first visit, **When** the application loads, **Then** no walkthrough starts by
   itself.
2. **Given** the walkthrough, **When** it runs, **Then** each step names a pane that exists and
   the run underneath stays usable.
3. **Given** beat 016's disposition record, **When** the walkthrough returns, **Then** the steps
   it reclaims are recorded as moving back, rather than silently reappearing.

---

### User Story 6 - It works on the screen a reader actually has (Priority: P1)

A reader on an ordinary browser window — 1920 x 900, 1536 x 864, 2560 x 900 — gets the docked
workspace. Not a fallback, and never a stacked column of every pane scrolled vertically.

**Why this priority**: this is the defect that survived the first pass. The workspace was
measured at 1440 and 1200 pixels tall, which are heights no browser has, and the declared
minimum height of 960 put **every real screen** below the floor and into a 6,584 px scrolling
column -- longer than the 5,757 px page SRD-v2 was written to kill. A requirement measured only
where it passes is not measured.

**Independent Test**: a matrix over real viewport sizes, each asserting the workspace renders
and nothing scrolls but a declared list.

**Acceptance Scenarios**:

1. **Given** any of 1366x768, 1536x864, 1920x900, 1920x1080, 2560x900, 2560x1440, **When** the
   application renders, **Then** it is the docked workspace and not the below-floor answer.
2. **Given** any of those, **When** the row is built and scored, **Then** no element scrolls
   except a declared list, and the document does not scroll.
3. **Given** the below-floor answer, **When** it renders, **Then** it is the workspace with one
   horizon in the centre and the strip -- never a vertical stack of panes with a scrollbar.
4. **Given** the declared minimum, **When** it is stated, **Then** it is a **width** figure:
   six panels at their declared minimum need width. Height is not what makes a row unreadable.

---

### Edge Cases

- **Below the declared minimum.** The author assumes at least 2k. The FR-43 answer stays, because
  a window can still be small; it is the single-panel presentation of FR-49, unchanged.
- **A pane closed by the reader.** A pane may be closed; the surface offers it back by name, and
  nothing that was computed is lost by closing it.
- **A stored layout naming a pane this build has not got.** Reported, and the default restored —
  never a blank pane.
- **`prefers-reduced-motion`.** Pane drag and tab transitions are suppressed.
- **Greyscale.** Pane headers, the active tab and the focused pane must be distinguishable
  without colour.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The surface MUST be a docked pane workspace with pane headers, resizing, re-docking
  and tabbing.
- **FR-002**: No pane MAY scroll a body of explanatory text. A pane MAY scroll a **list** — a
  profile's levels, a manifest — and such panes MUST be declared.
- **FR-003**: Panes MUST take the space available: at the declared reference width the horizon
  panels MUST be wider than at the declared minimum.
- **FR-004**: The workspace arrangement MUST persist between visits, and what is persisted MUST
  contain pane geometry and identity only — no seed, manifest, edit, observation or run quantity.
  A test MUST reject any other key.
- **FR-005**: An unusable stored layout MUST be reported and the default restored; one control
  MUST return the default arrangement.
- **FR-006**: Every control MUST carry an accessible name and, where it takes a value, its unit
  and declared bounds. No control MAY be introduced by an explanatory sentence on the surface.
- **FR-007**: Explanatory text MUST live in panel help (FR-52) or the walkthrough, and MUST NOT
  appear on the surface outside them, except the not-operational statement (FR-58).
- **FR-008**: Every figure MUST remain provenance-typed and distinguishable without colour, and
  the scorer's own statement MUST remain reachable one disclosure away, unsoftened (Principles V
  and VI).
- **FR-009**: A walkthrough MUST be offered, MUST NOT start unasked, and every step MUST resolve
  to a pane that exists.
- **FR-010**: No computed quantity, data source or numeric MAY change (SRD-v2 FR-40); G-07 MUST
  be green.
- **FR-011**: The declared reference viewport MUST be raised to the author's stated floor of at
  least 2k, measured from the built workspace.
- **FR-012**: The workspace MUST render, without scrolling anything but a declared list, at every
  viewport in a declared matrix of **real** browser sizes -- at minimum 1366x768, 1536x864,
  1920x900, 1920x1080, 2560x900 and 2560x1440. A viewport height an ordinary browser has MUST NOT
  put a reader below the floor.
- **FR-013**: The below-floor answer MUST be the workspace with one horizon and the strip. It MUST
  NOT be a vertical stack of panes, and it MUST NOT scroll a page.

### Key Entities

- **Pane**: an identified region of the workspace, its title, its content and whether it may
  scroll a list.
- **WorkspaceState**: the persisted arrangement — geometry and pane identity, and nothing else.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At the declared reference viewport, no pane scrolls prose and the document does not
  scroll (replaces beat 013's SC-001, which a scrolling pane satisfied).
- **SC-002**: A horizon panel is measurably wider at 2560 than at the declared minimum.
- **SC-003**: The persisted workspace state contains only geometry and pane identity; a planted
  run key fails by name.
- **SC-004**: A rearranged workspace survives a reload; an unusable stored layout is reported and
  the default restored.
- **SC-005**: Zero explanatory sentences on the surface outside help, the walkthrough and the
  not-operational statement.
- **SC-006**: Every figure's kind survives a greyscale rendering, measured on rendered pixels.
- **SC-007**: G-07's digests are unchanged but for declared presentation figures.
- **SC-008**: At every viewport in the declared matrix the workspace renders and nothing scrolls
  but a declared list. The tallest scroll of any element, at any of them, is reported as a figure.
- **SC-009**: The declared minimum height is smaller than the shortest viewport in the matrix.

## Assumptions

- **dockview** is the layout manager, chosen over golden-layout because it is React-first and
  golden-layout's imperative DOM API would have to be wrapped into React 19.
- The reference viewport becomes 2560 wide, measured rather than chosen, and the FR-43
  below-the-floor answer of beat 013 survives unchanged for windows below the minimum.
- Beat 016's `panels.json` and G-08 are the declaration this beat's panes are held to; a pane is
  a panel for the gate's purposes, so the one list stays one list.
