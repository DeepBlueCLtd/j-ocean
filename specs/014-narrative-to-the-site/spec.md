# Feature Specification: The Narrative Leaves the Application

**Feature Branch**: `014-narrative-to-the-site`

**Created**: 2026-09-07

**Status**: Draft

**Input**: User description: "Introductory matter, the blog and the system documentation belong to the welcome page; the application opens on the diagrams and the controls that drive them"

**SRD coverage**: SRD-v2 FR-42 and §7 (the record of where each part went); FR-45 and FR-48 depended upon; SRD-v1 FR-02 preserved.

## Why this beat exists

The application's vertical space is spent on prose. Every panel carries an aside explaining
why it is there, and the asides are good — they are the reason the surface can be trusted —
but they are read once and occupy the screen forever, and they are the reason a control and
its consequence cannot share a viewport.

Prose that explains a panel is not deleted and is not thrown into a tour. It goes to one of
two places: the welcome site, where a reader arrives before the instrument; or that panel's
own help (feature 016), where a reader asks for it at the moment of confusion. This beat does
the first half and is the beat that frees the space feature 013 needs.

Nothing is dropped, and the disposition below is the record §7 asks for.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The application opens on the instrument (Priority: P1)

A reader opens the application. What is on screen is the forecast diagrams and the controls
that drive them, the statement that this is not an operational forecast system, and links to
the welcome site. No paragraph of explanation competes for vertical space.

**Why this priority**: FR-42; without it FR-41 cannot be met at any viewport worth having.

**Independent Test**: In a browser, the count of prose blocks outside the not-operational
statement and outside a help disclosure is zero, and every remaining text node either labels
a control, names a figure or states what an empty region would hold.

**Acceptance Scenarios**:

1. **Given** the loaded application, **When** it renders, **Then** no explanatory aside is
   present outside a help disclosure.
2. **Given** the loaded application, **When** it renders, **Then** the not-operational
   statement is present, without interaction (FR-58).
3. **Given** a reader wanting the background, **When** they look, **Then** a named link to
   the welcome site is present and reaches the page carrying the moved matter.

---

### User Story 2 - Every moved paragraph has a destination, and it is checked (Priority: P1)

Each piece of narrative that was on the application page is now at a named place, and a test
holds the mapping so that a paragraph cannot be lost in a later edit.

**Why this priority**: §7 exists because "we tidied the page" is otherwise indistinguishable
from "we deleted the explanation".

**Independent Test**: A disposition record lists each former panel's prose and its
destination; the test asserts each destination exists and contains it.

**Acceptance Scenarios**:

1. **Given** the disposition record, **When** the test runs, **Then** every entry resolves to
   an existing site page section or an existing panel help entry.
2. **Given** an entry whose destination is missing, **When** the test runs, **Then** it fails
   naming the entry and the destination it expected.

---

### User Story 3 - The site is the welcome page it now has to be (Priority: P2)

The welcome site carries the introductory matter, the blog as its own section, and the system
documentation, with the application one click away and a return link from the application.

**Why this priority**: FR-42. The site already exists and already links to the application;
this beat makes it the reader's first stop rather than a companion.

**Independent Test**: The built site contains sections for the introduction, the blog and the
documentation, and the application links to it.

**Acceptance Scenarios**:

1. **Given** the built site, **When** it renders, **Then** the introductory matter and the
   system documentation moved from the application are present and attributed to their beat.
2. **Given** the site index, **When** it renders, **Then** the blog is its own section and the
   call to run the application is present.
3. **Given** the application, **When** a reader follows its link out and comes back, **Then**
   nothing about the run persists across the trip (constitution Principle I) and the surface
   says so rather than appearing to have forgotten something.

---

### Edge Cases

- **A figure inside prose.** Several asides carry live figures mid-sentence. A figure may not
  be deleted with its paragraph: it moves to the region that owns it, keeping its provenance
  typography (Principle V). The disposition record marks these separately.
- **The blog.** It is already a section of the site, not of the application. The §7 row is
  satisfied on arrival; the beat records that rather than performing a move that is not there
  to perform.
- **Deferrals.** `docs/site/deferred.md` already carries them; the application's deferrals
  panel becomes a link, and the assessed triggers stay measured by their existing test.
- **The manifest.** Replay is something a reader *drives*, not narrative. It stays in the
  application as a controls-region entry point opening into the detail region, and only its
  explanation moves.
- **Provenance panels.** The truth record and climatology provenance are derived-artefact
  facts that do not change while a reader works. They move to the site's data-model page; the
  scores keep their own provenance beside them, as they always did.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST NOT carry introductory matter, blog content or system
  documentation (FR-42).
- **FR-002**: Every paragraph removed MUST have a recorded destination — a site page section
  or a panel help entry — and a test MUST hold the record against both (§7).
- **FR-003**: The not-operational statement MUST remain in the application, visible without
  interaction (FR-58, SRD-v1 FR-02).
- **FR-004**: A live figure inside removed prose MUST be relocated to the region that owns it,
  keeping its declared/computed/derived/host-time typography (Principle V).
- **FR-005**: The application MUST link to the welcome site by name, and the site MUST link to
  the application.
- **FR-006**: No computed quantity MUST change (SRD-v2 FR-40); the invariance gate of feature
  013 MUST be green across this beat.
- **FR-007**: The disposition of each existing panel MUST be one of: **stays** (an instrument
  the reader drives or reads a live figure from), **moves to the site** (states no live
  figure), or **moves to help** (explains a panel that stays).

### Key Entities

- **DispositionRecord**: former location, the matter, its destination, and its kind (stays,
  site, help).
- **SitePage**: an existing page under `docs/site/` gaining a section.

### Panel disposition, as proposed

| Panel today | Disposition | Where it goes |
|---|---|---|
| Not operational | Stays | Its own line, always visible (FR-58) |
| The run (seed, domain, steps, step time) | Stays, compacted | Controls region; its explanation to help |
| What has been declared | Site | Data model page; declared figures stay inline where used |
| The ocean as the model has it | Stays | Centre region's pre-row content (FR-48) |
| The horizon row | Stays | Centre region (FR-45) |
| What the forecast was worth | Stays, split | Per-column scores beneath each panel (FR-46) |
| Where the answer came from | Stays, split | Layer of the enlarged panel (FR-51); breakdown to the detail region (FR-47) |
| What the instruments measured | Stays, split | Toggles to controls; footprint figures to the detail region |
| The record this run is scored against | Site | Data model page; scores keep their own provenance |
| The manifest | Stays, compacted | Controls entry point opening into the detail region |
| What this does not do | Site | The existing deferred page, linked from the application |
| Footer aside | Site | Overview page |

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The application's rendered prose outside help and outside the not-operational
  statement is zero blocks.
- **SC-002**: Every disposition entry resolves; a planted entry with a missing destination
  fails the test by name.
- **SC-003**: The vertical extent of the application at the declared minimum viewport is
  within the viewport (feeds AT-11).
- **SC-004**: The invariance digests of feature 013 are unchanged (AT-10).
- **SC-005**: The site build contains the moved matter and the application link, and the
  application contains the site link.

## Assumptions

- The site's existing pages (`index`, `architecture`, `data-model`, `glossary`, `deferred`,
  blog) are the destinations; this beat adds sections rather than a new site structure.
- Help entries referenced as destinations are specified in feature 016; where 016 has not
  landed, the disposition record may name a help entry that does not yet exist and the test
  reports it as *owed*, which is a known hole with a beat number on it rather than a pass.
- Feature 013 and this beat land together in a browser-watched pass: the space freed here is
  the space 013 needs, and neither is demonstrable alone.
