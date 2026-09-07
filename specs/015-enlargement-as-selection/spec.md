# Feature Specification: Enlargement Is a Selection, Not a Mode

**Feature Branch**: `015-enlargement-as-selection`

**Created**: 2026-09-07

**Status**: Draft

**Input**: User description: "Enlarging a panel replaces the centre region only; the row survives as a strip carrying each panel's score, and selecting another panel swaps the centre directly"

**SRD coverage**: SRD-v2 FR-49, FR-50, FR-51; AT-13. SRD-v1 FR-13, FR-14 carried; §5.4 fidelity.

## Why this beat exists

Enlargement today is a mode: a panel grows, the page reflows, and the other five horizons
leave. That trades the lesson for the detail. Comparison across horizons **is** the lesson —
it is why the row was chosen over a slider — so an enlargement that hides the other five
undoes the reason the row exists.

The answer is that enlargement is a selection like any other: it changes what the centre
region contains and nothing else on the surface. The row survives above the enlarged panel as
a strip, carrying each panel's score with it so the comparison stays quantitative, and
selecting another panel in the strip swaps the centre directly — no close, no reopen, no
intermediate unenlarged state a reader has to pass through.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Enlarging replaces the centre and moves nothing else (Priority: P1)

A reader enlarges the 48-hour panel. The centre region now holds that panel at size. The
controls, the scores and the detail region are exactly where they were.

**Why this priority**: FR-49 and AT-13. The prohibition on rearranging is the same one FR-47
makes about selection, for the same reason: a surface that reshapes on a click teaches
caution, and this instrument is meant to be poked.

**Independent Test**: Capture the bounding rectangle of every region and of the detail
region's contents before enlargement, after enlargement, and after swapping to another panel;
all are identical.

**Acceptance Scenarios**:

1. **Given** the row, **When** a panel is enlarged, **Then** only the centre region's
   contents change and no other region's geometry differs.
2. **Given** an enlarged panel, **When** the reader returns to the row, **Then** again only
   the centre changes.
3. **Given** a selection in the detail region, **When** a panel is enlarged, **Then** the
   detail region keeps its selection and its size.

---

### User Story 2 - The strip keeps the comparison, with figures (Priority: P1)

Above the enlarged panel is a strip of all six horizons, the enlarged one marked, each
carrying its own skill figure.

**Why this priority**: FR-50. A strip of thumbnails alone would reduce the comparison to a
picture; the figures are what make it a measurement.

**Independent Test**: In the enlarged state, all six horizons are present in the strip, each
with its skill figure, and the marked one is the enlarged one.

**Acceptance Scenarios**:

1. **Given** an enlarged panel, **When** the strip renders, **Then** it carries every
   declared horizon, each with the same skill figures shown beneath it in the row (FR-46), in
   horizon order.
2. **Given** a horizon whose score is a refusal or is not yet computed, **When** the strip
   renders, **Then** it says which, rather than showing a blank slot (Principle VI).
3. **Given** the strip, **When** the enlarged panel changes, **Then** the marking moves with
   it and remains distinguishable in greyscale (FR-57).

---

### User Story 3 - Swapping is direct (Priority: P1)

From the enlarged 48-hour panel the reader selects 96 hours in the strip. The centre becomes
96 hours. Nothing closes and nothing reopens.

**Why this priority**: FR-49. The intermediate state is a real cost: it is a frame in which
the reader's comparison is destroyed and rebuilt.

**Independent Test**: Instrument the centre region across a strip selection; the enlarged
panel's identity changes once, and at no point is the unenlarged row rendered.

**Acceptance Scenarios**:

1. **Given** an enlarged panel, **When** another is chosen in the strip, **Then** the centre
   shows the new panel with no unenlarged frame in between.
2. **Given** `prefers-reduced-motion`, **When** the swap happens, **Then** it is instantaneous
   and unanimated (FR-57).
3. **Given** keyboard focus in the strip, **When** the reader moves along it with the arrow
   keys and commits, **Then** the swap happens and focus stays in the strip (FR-57).

---

### User Story 4 - Enlargement changes what is shown, never what is computed (Priority: P1)

The enlarged panel draws the attribution layer and the observation marks at full fidelity.
The row draws the field alone and says so. No field, analysis or score is recomputed by the
act of enlarging.

**Why this priority**: FR-51 and SRD-v1 FR-14 carried; this is the property beat 007
established by identity and this beat must not lose.

**Independent Test**: The same `Float64Array` instance backs the panel before and after
enlargement; the invariance digests of feature 013 are unchanged.

**Acceptance Scenarios**:

1. **Given** a panel, **When** it is enlarged, **Then** the field, analysis and score objects
   are identical by reference to those held before.
2. **Given** the row, **When** it renders, **Then** it states that it is showing the field
   alone and that attribution and observation marks are drawn in the enlarged panel.
3. **Given** the enlarged panel, **When** it renders, **Then** the attribution layer and the
   observation marks of SRD-v1 §5.4 are drawn at full fidelity, legibly in greyscale (FR-57).

---

### Edge Cases

- **A reissue while enlarged.** New forecasts arrive for every horizon; the enlarged panel
  stays the same horizon and updates in place. The centre does not fall back to the row.
- **Domain change while enlarged.** The same rule: same horizon, new domain, centre unmoved.
- **A horizon disappearing.** If configuration is reloaded with fewer horizons, the enlarged
  panel's horizon may no longer be declared; the centre says so and returns to the row rather
  than drawing an undeclared horizon (G-05).
- **Scores not yet computed.** Scoring costs about a second and happens when asked; the strip
  shows the unmeasured state in words, and the enlargement does not trigger it — that would be
  display causing computation (FR-40).
- **The FR-43 fallback.** Below the minimum viewport the single-panel presentation is exactly
  this enlarged state, so this beat's strip is what makes FR-43 answerable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Enlargement MUST replace the contents of the centre region only; the controls,
  scores and detail regions MUST NOT move (FR-49, AT-13).
- **FR-002**: The row MUST persist as a strip along the top of the centre region, with the
  enlarged panel marked (FR-49).
- **FR-003**: The strip MUST carry each horizon's skill figures (FR-50).
- **FR-004**: Selecting another panel in the strip MUST swap the centre directly, with no
  unenlarged intermediate state (FR-49).
- **FR-005**: Enlargement MUST NOT recompute anything; field, analysis and score objects MUST
  be identical by reference (FR-51, SRD-v1 FR-14).
- **FR-006**: The attribution layer and observation marks MUST be drawn at full fidelity only
  in the enlarged panel, and the row MUST state that it shows the field alone (FR-51).
- **FR-007**: The strip MUST be keyboard operable and legible in greyscale, and the swap MUST
  respect `prefers-reduced-motion` (FR-57).
- **FR-008**: A horizon with no score MUST say so in the strip rather than render blank
  (Principle VI, FR-48).

### Key Entities

- **Strip**: the ordered declared horizons, each with its thumbnail, skill figures and marked
  state.
- **CentreContent**: either the row or exactly one enlarged panel; never both, never neither.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Enlarging, then swapping to a second panel, leaves every region's bounding
  rectangle unchanged throughout (AT-13).
- **SC-002**: In the enlarged state all declared horizons appear in the strip with their skill
  figures (FR-50).
- **SC-003**: No unenlarged row frame is rendered during a strip swap (FR-49).
- **SC-004**: Field identity holds across enlargement, and the feature 013 digests are
  unchanged (FR-51, AT-10).
- **SC-005**: The strip is fully operable from the keyboard, and its marking survives a
  greyscale rendering (FR-57).

## Assumptions

- The strip's thumbnails are the same fields at reduced size, not separately computed
  reductions; a reduction computed for the strip would be a display-caused computation.
- "No intermediate state" is asserted by instrumenting renders rather than by timing.
- The enlarged panel's own controls (attribution on, difference on) live at the panel, not in
  the controls region — they act on one panel (FR-44).
