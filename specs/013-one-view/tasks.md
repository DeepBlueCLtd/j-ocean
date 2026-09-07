# Tasks: One View, Four Regions

**Feature**: `013-one-view` | **Plan**: [`plan.md`](./plan.md)

Ordered. T010 to T014 land and are watched failing before any file under `src/harness/`
changes, because FR-001 says so and because the rest of this list is otherwise unverifiable.

## The gate, first (US1, FR-001, AT-10)

- [X] **T010** `scripts/gates/surface-invariance.ts`: the producer. Walks the recorded case
      from the declared seed and returns one named digest per computed quantity — the nine
      producers listed in the plan — with the sentence naming what produced each.
- [X] **T011** `scripts/gates/records/surface-invariance.json`: the committed record, written
      by `scripts/gates/record-surface-invariance.ts`, never by hand.
- [X] **T012** `scripts/gates/check-surface-invariance.ts` (G-07): compares each quantity
      against the record and fails naming the quantity, its recorded digest and its current
      one. Registered in `run-all.ts`.
- [X] **T013** `scripts/gates/fixtures/surface-invariance/`: a declared configuration with one
      analysis coefficient changed, and the fixtures README row that says what is planted.
- [X] **T014** `tests/gates/gates.test.ts` gains G-07: red on the fixture, green on the tree,
      and the failure names the quantity. Watched failing in the commit that introduces it.

## The regions (US2, US3, FR-002 to FR-006, FR-012)

- [X] **T020** `src/harness/scoring-run.ts`: `scoreAll` lifted out of `HorizonRow` into a
      module the gate and the shell both call. G-07 proves the lift moved nothing.
- [X] **T021** `footprintFor` memoised once per view instead of constructed three times per
      render. Same gate, same proof.
- [X] **T022** `src/harness/Regions.tsx` and the grid in `index.css`: four named areas, the
      centre's column count from `horizons.leadHours.length` as a custom property.
- [X] **T023** Controls to the left region: issue time and lead time (FR-25), observation
      toggles (FR-31), quality control (FR-32), domain choice (FR-11), and the track and
      profile editors' entry points. Panel-local controls stay at their panel.
- [X] **T024** The domain picker, which did not exist: `config.domains` offered, artefacts
      reloaded, the run rebuilt. The recorded case is the default domain and is unmoved.
- [X] **T025** Scores into their panels' columns; `score-panel` deleted rather than hidden.
- [X] **T026** The narrative sections out of the vertical stack and behind the controls
      region's disclosures, pending 014.
- [X] **T027** `Walkthrough.tsx` anchors updated for the new regions.

## The detail region and the empty ones (US5, US6, FR-007, FR-008)

- [X] **T030** The detail region: a cell's breakdown (FR-18) or an XBT's profile with its
      ghost (FR-28), filled by selection, with no geometry change.
- [X] **T031** Every region's empty statement: what would appear there and how to put it
      there. The centre's says what the row costs and what it will show.

## The floor (US7, FR-009, FR-010)

- [ ] **T040** `tests/shell/viewport-floor.spec.ts`: measures the smallest viewport at which
      the layout still holds and prints both figures.
- [ ] **T041** `presentation.minimumViewportWidthPx` and `minimumViewportHeightPx` declared,
      schema-refined against the declared horizons, handed to CSS as custom properties.
- [ ] **T042** Below the floor: the statement with the required size as a `Declared` figure,
      and the single-panel fallback, operable, with the strip present.

## Holding it (SC-001 to SC-006)

- [X] **T050** `tests/shell/one-view.spec.ts`: no page scroll on either axis in each of
      loaded, row-unbuilt, row-built, scored, cell-selected, over-budget and
      configuration-failure; every declared scrolling region declared as one.
- [ ] **T051** A control is changed and every panel and every score is inside the viewport
      rectangle before and after (AT-12).
- [ ] **T052** Selecting a cell changes no region's bounding rectangle (FR-047).
- [ ] **T053** Screenshots recaptured at the declared reference width and at the floor.

## The record (FR-011, FR-040)

- [X] **T060** `docs/questions-for-the-author.md`: the three findings the spec names —
      whether the drawn attribution is the analysis's own gain, every computation that happens
      because something is drawn, and any figure with no producer in the model.
- [ ] **T061** ADR-0012: one view, four regions, and why the division is by rate of change.
- [ ] **T062** The beat's blog entry and the site's pages updated.
- [ ] **T063** `pnpm check` green, eight gates, and the browser pass watched rather than
      inferred.
