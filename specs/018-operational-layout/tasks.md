# Tasks: The Operational Surface

**Feature**: `018-operational-layout` | **Plan**: [`plan.md`](./plan.md)

## The workspace (US1, US2, FR-001 to FR-005)

- [ ] **T010** dockview as the layout manager; the five panes of the plan, with headers,
      resizing, re-docking and tabbing. ADR-0014 for the dependency and the choice over
      golden-layout.
- [ ] **T011** Panes take the space: the horizon panels are measurably wider at 2560 than at the
      declared minimum (SC-002).
- [ ] **T012** The provenance panes are **tabs**, not stacked disclosures. The scrolling controls
      column is gone.
- [ ] **T013** Workspace persistence: geometry and pane identity only, with a key-set test and a
      planted `seed` that fails by name — the same shape as beat 017's address grammar (SC-003).
- [ ] **T014** An unusable stored layout is reported and the default restored; one control
      returns the default arrangement (SC-004).
- [ ] **T015** The list/prose distinction: a pane may scroll a list and may never scroll a body
      of text. The test names the pane and what kind of content it held (SC-001).

## The controls (US3, FR-006, FR-007)

- [ ] **T020** The control pane rebuilt as a control surface: grouped by what each acts on, every
      input carrying its unit and declared bounds, every control with an accessible name.
- [ ] **T021** Every explanatory sentence off the surface and into panel help or the walkthrough,
      recorded in `docs/narrative-disposition.json` as it moves (FR-007).
- [ ] **T022** The prose test strengthened: zero explanatory sentences outside help, the
      walkthrough and the not-operational statement (SC-005).

## The figures (US4, FR-008)

- [ ] **T030** Scores move inside their horizon panel — the alignment is the panel, not two
      containers agreeing about geometry.
- [ ] **T031** Each score a figure with its reference and unit; the scorer's own statement one
      disclosure away, byte-identical and unsoftened.
- [ ] **T032** Figure kinds distinguishable without colour, re-measured on rendered pixels
      (SC-006).

## The walkthrough (US5, FR-009)

- [ ] **T040** A walkthrough offered and never imposed, explaining the workspace rather than any
      one panel; every step resolves to a pane that exists.
- [ ] **T041** The steps reclaimed from beat 016's disposition record, recorded as moving back.

## Holding it (SC-001 to SC-007)

- [ ] **T050** The reference viewport raised to the author's 2k floor, measured from the built
      workspace and declared (FR-011). Beat 013's below-the-floor answer survives unchanged.
- [ ] **T051** Every shell test repointed; each one that loses its subject recorded against the
      claim it made.
- [ ] **T052** G-07 green, with only declared presentation figures moved (SC-007).
- [ ] **T053** G-08 still green: a pane is a panel for the gate's purposes, so the one list stays
      one list.
- [ ] **T054** Screenshots at 2560, the beat's note, the site pages.
- [ ] **T055** `pnpm check` green, nine gates.
