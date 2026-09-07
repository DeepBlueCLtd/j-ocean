# Software Requirements Document
## j-ocean — the application surface, Version 2

**Status:** Draft, 7 September 2026 — written against the built application after it was
used, which is the only condition under which this document could have been written.
**Author:** Doc
**Supplements:** `j-ocean-srd.md` (SRD-v1), whose requirements carry unchanged except
where amended by name below.

---

## 1. Purpose and scope

Version 1 shipped as a long scrolling page: introductory matter, blog, and the
application beneath, occupying some three vertical screens. It works. Its author could
not follow it.

That is a finding about the surface and not about the model, and this document is scoped
accordingly.

- **FR-40 (Scope.)** This beat **changes no numerics, adds no data source, and alters no
  computed quantity**. Everything it draws is already being computed. Where the refactor
  appears to require a logic change, that is a finding to be recorded rather than a task
  to be quietly done: it means the presentation and the computation were entangled, and
  which one they were entangled in is worth knowing. The scope shall be held by test —
  the model, analysis and scoring modules' outputs are unchanged for a fixed seed across
  this change.

### 1.1 What was wrong, stated plainly

Kept because the diagnosis is the reason every requirement below reads as it does.

- **The page was a narrative and the system is not one.** Sections implied steps to be
  completed and left behind. j-ocean has no steps: it is one system with causes on one
  side and consequences on the other, and every control affects everything at once.
- **Scrolling separated cause from effect.** A reader dragged a control and what changed
  was off screen. That is the whole of the reported clumsiness, and no amount of
  restyling a scrolling page fixes it.
- **The six-panel row was specified for a glance (SRD-v1 FR-13) and a scrolling page
  cannot deliver one.** The row was rejected in favour of a slider precisely because a
  reader cannot hold an unseen frame in memory; a page that scrolls reintroduces the
  fault the row exists to prevent.

---

## 2. The application is one view

- **FR-41** The application shall occupy **one viewport and shall not scroll**. Every
  control, every horizon panel, every score and the detail of whatever is selected shall
  be simultaneously visible. A reader who changes anything shall see everything that
  changed without moving.
- **FR-42** The **narrative content leaves the application**. Introductory matter, the
  blog and the system documentation belong to the site's welcome page and are reached by
  link. Nothing is deleted and §7 lists where each part went. The application opens on the
  forecast diagrams and the controls that drive them, and on nothing that competes with
  them for the reader's vertical space.
- **FR-43** Where the viewport is too small to carry the layout at the declared minimum,
  the application shall **say so and name the size it needs**, and shall offer the
  enlarged single-panel presentation of FR-49 as the fallback rather than a shrunken row
  no one can read. This is stated rather than deferred because a no-scroll requirement
  without a smallest-case answer is an unfinished requirement, and the honest answer here
  is that this instrument wants width.

---

## 3. The four regions

The layout is divided by **what changes when**, not by subject matter.

- **FR-44 (Controls, left.)** Every control a reader drives shall live in one column:
  issue time and lead time (SRD-v1 FR-25), observation toggles (FR-31), quality control
  (FR-32), domain choice (FR-11), and the track and profile editors' entry points. All
  the causes in one place, so that the thing just changed is never hunted for. A control
  that acts on one panel alone does not belong here; it belongs at that panel.
- **FR-45 (The horizon row, centre.)** The six panels of SRD-v1 FR-13 take the dominant
  region and the full width available to it. This is the payload and is given the space
  accordingly; nothing shares the centre region with it.
- **FR-46 (Scores, beneath the row.)** Each panel's skill figures shall be drawn
  **directly beneath that panel, in its column**, and not collected as a table elsewhere.
  A score beneath its own picture is read as one object with it; a table asks the reader
  to match a row label against a panel heading, which is a small tax paid at every glance.
  Aligned columns also draw the decay for free: six figures read left to right show skill
  falling away without a curve being plotted. SRD-v1 FR-20 to FR-22 are unchanged — two
  references, and the words *not earning its compute* where they apply.
- **FR-47 (Detail, right.)** One region shall carry **whatever was last selected** — a
  cell's attribution breakdown (SRD-v1 FR-18), or an XBT's profile with its ghost
  (FR-28). Selecting shall fill this region and shall **never rearrange the layout**: a
  surface whose shape changes on a click makes a reader cautious about clicking, which is
  fatal to an instrument meant to be poked.
- **FR-48** A region with nothing in it shall **say what would appear there**, rather than
  render empty. An empty region is a claim the surface is not entitled to make.

---

## 4. Enlargement is a selection, not a mode

- **FR-49** Enlarging a panel shall **replace the contents of the centre region only**.
  The controls, the scores and the detail region shall not move. The row shall remain
  present as a **strip** along the top of the centre region with the enlarged panel marked
  in it, and selecting another panel in the strip shall swap the centre directly — no
  closing, no reopening, no return to an unenlarged state as an intermediate step.
- **FR-50** The reason the strip survives is the reason the row exists: **comparison
  across horizons is the lesson**, and an enlargement that hid the other five would trade
  the lesson for the detail. The strip shall carry each panel's score with it, so the
  comparison is not reduced to a picture.
- **FR-51** Enlargement shall change **what is shown and never what is computed**
  (SRD-v1 FR-14 carried). The attribution layer and the observation marks of SRD-v1 §5.4
  are drawn at their full fidelity only in the enlarged panel, and the row states that it
  is showing the field alone.

---

## 5. Help, where the reader asks for it

- **FR-52** Narrative that explains a panel shall be carried **by that panel**, behind a
  help control at the panel's top right, opening in place and closing again. It is
  **panel-level and not a tour**: no sequence, no next control, no wizard. A reader
  confused by attribution wants attribution explained, not a walkthrough that begins three
  panels away.
- **FR-53** A panel with no help shall show **no control**, and the absence is
  information rather than an oversight to be papered over with a stub.
- **FR-54** Each panel's help shall be **held to something on disk** — the regions or
  layers that panel declares — so that a panel gaining a feature and not a help entry is
  **reported by name** rather than passing unnoticed. This is the discipline the component
  tour already answers to and it is applied here for the same reason: help kept separately
  from the thing it explains goes stale silently.
- **FR-55** Help shall **teach and not report**: no help text may state any live figure or
  any component's current state, and a test shall hold it to that. A help panel that
  reported would be a second source for a fact the surface already shows.

---

## 6. Carried disciplines

- **FR-56** The selected panel, the selected cell and the selected observation shall be
  **addressable**, so a link opens the application at the thing being discussed.
  **Selecting writes the address; mounting does not** — a surface that wrote its own
  default on mount would rewrite a reader's URL on any remount.
- **FR-57** Every surface shall be legible in greyscale, operable by keyboard, and shall
  respect `prefers-reduced-motion`. The attribution field shall not rely on colour blend
  alone (SRD-v1 FR-19 carried).
- **FR-58** The statement that the application is not an operational forecast system
  (SRD-v1 FR-02) shall be **visible without interaction** and shall not be the thing moved
  behind a help control.

---

## 7. Where the narrative went

Nothing is dropped; this table is the record.

| Was on the application page | Now |
|---|---|
| Introductory matter | Site welcome page |
| Blog entries | Site welcome page, as its own section |
| System documentation | Site welcome page |
| Explanation of attribution | Attribution panel's help (FR-52) |
| Explanation of lead time and issue time | Horizon row's help, and the controls' help |
| Explanation of the references and skill | Scores region's help |
| Explanation of the observation footprint | Enlarged panel's help |

---

## 8. Acceptance

| ID | Test |
|---|---|
| AT-10 | For a fixed seed, every computed field, score and derived quantity is byte-identical before and after this change (FR-40) |
| AT-11 | At the declared minimum viewport the application renders complete with no scrollbar |
| AT-12 | A control is changed and the resulting change in every horizon panel and every score is visible without the reader moving |
| AT-13 | A panel is enlarged, a second panel selected from the strip, and the controls, scores and detail regions are unmoved throughout |
| AT-14 | Every panel declaring help offers it, every panel without help offers no control, and a planted panel with an undeclared region is reported by name |
| AT-15 | A link to a selected cell opens the application on that cell; remounting the surface leaves the address unchanged |

Acceptance is **watched in the browser, not inferred from green tests** — this whole beat
exists because a suite of passing tests said nothing about whether the page could be
followed.

---

## 9. Open questions

- Whether the controls column stays fixed or gains its own disclosure as it grows. It is
  small today and the requirement above assumes it stays small.
- Whether attribution is genuinely derived from the analysis's own weights (SRD-v1 FR-17)
  in the code as built. The refactor will make this visible; if it is computed separately
  for display, that is a finding under FR-40 and belongs in the record before it is fixed.
- What the smallest viewport actually is. FR-43 requires a number; the number comes from
  measuring the built layout rather than from choosing one now.
