# Tasks: The Narrative Leaves the Application

**Feature**: `014-narrative-to-the-site` | **Plan**: [`plan.md`](./plan.md)

## The record, and the test that holds it (US2, FR-002)

- [x] **T010** `docs/narrative-disposition.json`: one entry per piece of matter now on the
      application — where it was, the matter itself, its kind (`stays`, `site`, `help`) and its
      destination. It carries the text, so nothing bound for a help entry that does not exist
      yet is lost to a diff.
- [x] **T011** `tests/docs/disposition.test.ts`: every `site` entry resolves to an existing
      heading under `docs/site/` whose section contains the matter; every `help` entry is
      reported as owed to beat 016 and the count asserted; every `stays` entry names one of the
      four regions.
- [x] **T012** Watched failing on a planted entry whose destination does not exist, naming the
      entry and the destination it expected (SC-002).

## The move (US1, US3, FR-001, FR-003 to FR-005)

- [x] **T020** The site gains the moved matter: the introductory matter and the system
      documentation on the overview and architecture pages, the derived-artefact provenance on
      the data-model page, each attributed to the beat it came from.
- [x] **T021** The application loses it. Every disclosure whose content is an explanation goes;
      what a reader drives or reads a live figure from stays, compacted, in the region that owns
      it.
- [x] **T022** Figures inside removed prose relocate to the region that owns them, keeping their
      declared, computed, derived or host-time typography (FR-004).
- [x] **T023** The deferrals panel becomes a link to `docs/site/deferred.md`; the record marks
      the row as arrived rather than moved.
- [x] **T024** The application links to the welcome site by name, and the site links back
      (FR-005).
- [x] **T025** §7 of `j-ocean-ui-srd.md` and a disposition page on the site are generated from
      the record rather than written twice.

## Holding it (SC-001 to SC-005)

- [x] **T030** A shell test counts prose blocks outside the not-operational statement and
      outside a help disclosure, and asserts zero (SC-001).
- [x] **T031** The not-operational statement is still present without interaction (FR-003).
- [x] **T032** G-07 green, and the record of feature 013 untouched (SC-004, FR-006).
- [x] **T033** The vertical extent at the declared minimum viewport is still within it
      (SC-003), and the floor is re-measured: this beat removes content, so the floor may fall.
- [x] **T034** Screenshots recaptured; the beat's note and the site pages updated.
- [x] **T035** `pnpm check` green, eight gates, and the browser pass watched rather than
      inferred.
