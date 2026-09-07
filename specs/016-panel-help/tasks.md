# Tasks: Help, Where the Reader Asks for It

**Feature**: `016-panel-help` | **Plan**: [`plan.md`](./plan.md)

## The declaration, and the gate that holds it (US3, FR-004, AT-14)

- [ ] **T010** Each panel declares the regions or layers it has, beside the component, from the
      same source feature 013's layout reads for its regions. One list, not two.
- [ ] **T011** Gate **G-08 help coverage** (`scripts/gates/check-help-coverage.ts`): every
      declared feature has an entry, every entry names an existing panel, and every panel the
      layout renders appears in the declarations — so declaring nothing is a failure rather than
      a trivial pass. Registered in `run-all.ts` and in the constitution's schedule.
- [ ] **T012** Planted violations, watched failing: a panel declaring a region with no entry,
      and an entry naming a panel that does not exist. Both name the panel and the region.
- [ ] **T013** An entry whose content is empty fails the build: a stub is worse than absence
      (FR-003, US2 scenario 2).

## Help at the panel (US1, US2, FR-001 to FR-003, FR-008)

- [ ] **T020** The help control at each declaring panel's top right; nothing at all on a panel
      without help.
- [ ] **T021** Opening in place, closing on the control or Escape, focus returned. No next, no
      previous, no step count.
- [ ] **T022** No region's bounding rectangle changes when help opens (SC-005); help longer than
      its panel scrolls within itself and never grows the page.
- [ ] **T023** Help follows its panel through enlargement, and closes on a strip swap rather
      than surviving orphaned over a panel that is no longer there.

## The eight entries beat 014 owes, and the rest

- [ ] **T030** The eight `help:` destinations in `docs/narrative-disposition.json` written as
      real entries; the disposition test goes from reporting them owed to resolving them.
- [ ] **T031** The four §7 rows held by name — attribution, lead and issue time, the references
      and skill, the observation footprint — so the SRD table is a test and not a promise
      (SC-006).

## Teaching, not reporting (US4, FR-005, FR-006)

- [ ] **T040** A test over the help sources rejecting any interpolation of run state, any
      provenance-typed figure component, and any bare numeric not read from configuration.
- [ ] **T041** Watched failing on a planted entry quoting a live skill score, named (SC-003).
- [ ] **T042** Numbers used to teach read from configuration and named as declared.

## The tour retires (US5, FR-007)

- [ ] **T050** Every walkthrough step given a destination in `docs/narrative-disposition.json`
      — a help entry, a site section, or `dropped` with a reason.
- [ ] **T051** `Walkthrough.tsx` and its tests removed; the removal of each test recorded
      against the claim it made.
- [ ] **T052** The figure-typography legend to the site, reachable from the application.

## Holding it (SC-001 to SC-006)

- [ ] **T060** Shell tests for each success criterion, watched in the browser.
- [ ] **T061** G-07 green and the feature 013 record untouched but for a declared figure.
- [ ] **T062** Screenshots, the beat's note, the site pages.
- [ ] **T063** `pnpm check` green, nine gates.
