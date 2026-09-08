# Tasks: An Addressable, Operable Surface

**Feature**: `017-addressable-surface` | **Plan**: [`plan.md`](./plan.md)

## The grammar, and the line it may not cross (US3, FR-004)

- [x] **T010** The address grammar: panel, cell (with the grid it was written against), and
      observation. Nothing else. One module that parses and serialises, so both directions are
      one fact.
- [x] **T011** A test rejecting any other key, watched failing on a planted `seed=` — because
      addressability is one step from a second persistence mechanism with none of the
      manifest's checks (SC-003).
- [x] **T012** An address carrying an unknown key is ignored, and the surface says the link
      carried something it does not honour.

## Opening on the thing being discussed (US1, FR-001, FR-005)

- [x] **T020** A panel address enlarges that panel in the centre (feature 015's enlargement).
- [x] **T021** A cell address fills the detail region with that cell's breakdown; an
      observation address fills it with that profile and its ghost.
- [x] **T022** An undeclared horizon, a cell outside the grid, a cell written against different
      grid dimensions, or an observation this run has not got: each is **reported by name**, and
      the surface shows the unselected state rather than a near match.
- [x] **T023** A panel address before the row is built says what building it costs and honours
      the selection once built, having computed nothing on mount (FR-48).
- [x] **T024** Opening from a link does not move focus to the detail region: a reader arriving
      by link has not asked for it.

## Selecting writes, mounting does not (US2, FR-002, FR-003)

- [x] **T030** Selection writes the address once, replacing rather than pushing.
- [x] **T031** Mounting writes nothing, asserted by comparing the **whole address string**
      before and after a remount — a reordered query string is still a rewritten URL (SC-002).
- [x] **T032** Clearing a selection returns the address to its unselected form.
- [x] **T033** What the back button does, stated in the plan and asserted, rather than left
      emergent.

## Operable and legible (US4, FR-006 to FR-008)

- [x] **T040** A keyboard pass reaching every control, panel, strip entry and help control with
      a visible focus ring, in an order that follows the four regions. The test **names what it
      could not reach** rather than counting what it could.
- [x] **T041** Greyscale: the attribution field's structure survives a saturation filter,
      measured on rendered pixels as beats 007 and 015 measured theirs (SC-005).
- [x] **T042** `prefers-reduced-motion`: nothing animates anywhere, held by one test rather than
      three scattered ones (SC-006).
- [x] **T043** The detail region filling from a keyboard selection is announced to assistive
      technology without stealing the reader's place.

## The disclaimer (US5, FR-009)

- [x] **T050** Visible without interaction at the declared minimum viewport and in the FR-43
      fallback, and no help entry is the only place it appears (SC-007).

## Holding it (SC-001 to SC-007)

- [x] **T060** Shell tests for each success criterion, watched in the browser.
- [x] **T061** G-07 green: addressing computes nothing, and a moved digest would mean opening a
      link caused a computation.
- [x] **T062** Screenshots, the beat's note, the site pages, and SRD-v2 §7 still generated from
      the record.
- [x] **T063** `pnpm check` green, nine gates. The five surface beats complete.
