# Tasks: The Operational Surface

**Feature**: `018-operational-layout` | **Plan**: [`plan.md`](./plan.md)

## The workspace (US1, US2, FR-001 to FR-005)

- [x] **T010** dockview as the layout manager; the five panes of the plan, with headers,
      resizing, re-docking and tabbing. ADR-0014 for the dependency and the choice over
      golden-layout.
- [x] **T011** Panes take the space: the horizon panels are measurably wider at 2560 than at the
      declared minimum (SC-002).
- [x] **T012** The provenance panes are **tabs**, not stacked disclosures. The scrolling controls
      column is gone.
- [x] **T013** Workspace persistence: geometry and pane identity only, with a key-set test and a
      planted `seed` that fails by name — the same shape as beat 017's address grammar (SC-003).
- [x] **T014** An unusable stored layout is reported and the default restored; one control
      returns the default arrangement (SC-004).
- [x] **T015** The list/prose distinction: a pane may scroll a list and may never scroll a body
      of text. The test names the pane and what kind of content it held (SC-001).

## The controls (US3, FR-006, FR-007)

- [x] **T020** The control pane rebuilt as a control surface: grouped by what each acts on, every
      input carrying its unit and declared bounds, every control with an accessible name.
- [x] **T021** Every explanatory sentence off the surface and into panel help or the walkthrough,
      recorded in `docs/narrative-disposition.json` as it moves (FR-007).
- [x] **T022** The prose test strengthened: zero explanatory sentences outside help, the
      walkthrough and the not-operational statement (SC-005).

## The figures (US4, FR-008)

- [x] **T030** Scores move inside their horizon panel — the alignment is the panel, not two
      containers agreeing about geometry.
- [x] **T031** Each score a figure with its reference and unit; the scorer's own statement one
      disclosure away, byte-identical and unsoftened.
- [x] **T032** Figure kinds distinguishable without colour, re-measured on rendered pixels
      (SC-006).

## The walkthrough (US5, FR-009)

- [x] **T040** A walkthrough offered and never imposed, explaining the workspace rather than any
      one panel; every step resolves to a pane that exists.
- [x] **T041** The steps reclaimed from beat 016's disposition record, recorded as moving back.

## Holding it (SC-001 to SC-007)

- [x] **T050** The reference viewport raised to the author's 2k floor, measured from the built
      workspace and declared (FR-011). Beat 013's below-the-floor answer survives unchanged.
- [x] **T051** Every shell test repointed; each one that loses its subject recorded against the
      claim it made.
- [x] **T052** G-07 green, with only declared presentation figures moved (SC-007).
- [x] **T053** G-08 still green: a pane is a panel for the gate's purposes, so the one list stays
      one list.
- [x] **T054** Screenshots at 2560, the beat's note, the site pages.
- [x] **T055** `pnpm check` green, nine gates.

## The second pass

The first attempt at this beat was interrupted with the tree uncommitted. What it had built
stood; five things were unfinished, and each is a task rather than a tidy-up because each was a
requirement the tree did not yet meet.

- [x] **T060** G-05 repaired rather than relaxed. It reported `FAIL ... (0 files scanned)` with
      the message *the rendered horizons are not the declared ones* while the row agreed with
      configuration exactly: a preview server left holding the port meant Playwright never
      started, and every non-zero exit was read as that one finding. The exit is classified now,
      and a run that executes none of the gate's own tests is a failure rather than a pass over
      an empty scan. Nothing it asserts was changed.
- [x] **T061** FR-008 finished. The scorer's statement was still drawn *above* the very figures
      that say the same thing; it is the first line inside *Where this figure came from* now,
      byte for byte, and Principle VI is asserted on the figure — the skill against climatology
      read as a number, with nothing opened, and required to be negative.
- [x] **T062** FR-007 finished at the legend. `.legend` was exempt from the prose test as a
      whole block, and two twenty-word explanations were living inside it. Every legend entry
      is counted on its own now; five clauses moved, each recorded in
      `docs/narrative-disposition.json`; FR-051's own requirement is met by a label of eight
      words.
- [x] **T063** FR-045 enforced. The skill curve had grown to 694 px in a 1 359 px pane —
      taller than the row it annotates — because it was given whatever the row left. The share
      it may take is `presentation.workspace.skillCurveFraction`, and
      `tests/shell/viewport-floor.spec.ts` asserts that a horizon panel is taller than the
      curve beneath it.
- [x] **T064** The record made true: `## Measured` filled in from measurements taken on this
      tree, the ADR and the beat's note corrected to them, and the persistence amendment cited
      against Principle **IX**, which is where the prohibition it bounds is written.

## The screen a reader actually has (US6, FR-012, FR-013)

- [x] **T070** `tests/shell/viewport-matrix.spec.ts`: 1366x768, 1536x864, 1920x900, 1920x1080,
      2560x900, 2560x1440 — the workspace renders at each, the row builds and scores, and nothing
      scrolls but a declared list. The tallest scroll of any element is printed as a figure.
- [x] **T071** The declared minimum height comes down below the shortest viewport in the matrix,
      measured from the built workspace rather than chosen: **1 658 × 740**, against a shortest
      viewport of 768. What forced 960 was not any figure the layout declares. It was the
      controls pane's own content at the 220 px it is narrowest — **823 px** of a control surface
      set at a paragraph's line height with its groups separated twice over — and a status strip
      that wrapped to two rows because a 64-character digest had 22 rem of it. Set as furniture
      they are 648 px and one row of 66, with no control, label, unit or declared bound lost.
- [x] **T072** The below-floor answer becomes the workspace with one horizon and the strip. The
      stacked `.below-floor-body` column is deleted, not shortened, and the query that decides
      what the centre holds asks the **width** alone: six panels need width, and forcing one
      horizon because the window is short was measured to be the wrong medicine — at 1 658 × 735
      it overflowed the horizons pane by 970 px where the row fitted.
- [x] **T073** The list/prose test runs at **every** viewport in the matrix, not only the
      reference — the hole through which a 6,584 px scrolling column reached the author.

## The walkthrough masks (US5, FR-014, SC-010)

The author's second direction: *"the walkthrough should move around the UI, masking out the
unrelated elements/panels."* It reverses this beat's own decision that nothing would be covered
by a scrim, and the old rationale is replaced rather than left standing beside its contradiction.

- [x] **T080** The mask itself. One fixed element with the hole cut out of it by `clip-path`, so
      what is dimmed and what is lit are the same fact and cannot drift apart; the four lengths
      come from the named pane's own `getBoundingClientRect`. `clip-path` clips hit-testing as
      well as paint, so the dimmed area takes the reader's clicks and the lit pane goes on
      working.
- [x] **T081** The hole follows the pane. Re-measured on a `ResizeObserver` over the pane and the
      dock, a `MutationObserver` over the workspace's subtree, and the window's own resize and
      scroll — coalesced to one measurement a frame, and taken in a **layout** effect so a step's
      first frame is not the previous step's rectangle under the new step's name.
- [x] **T082** The card is placed beside the lit pane, from the space around it and never from
      its own measured height — beat 011's defect, written down there and not repeated.
- [x] **T083** The mask's four figures declared in `presentation.workspace` and handed to the
      stylesheet: the dim is a share of the ink at a declared opacity, and the card's width is the
      figure its placement is worked out from (Principle X).
- [x] **T084** `tests/shell/walkthrough.spec.ts`: the hole is the named pane's own rectangle at
      every step to two pixels — beat 016's deleted claim, back with its subject; it follows a
      sash drag, a tab move and a window resize; opening and advancing move no region by a pixel;
      the lit pane is operable and the dimmed surface is not; the greyscale margin is measured
      with `tests/shell/greyscale.ts` and printed; nothing scrolls at two viewports from the
      matrix; and nothing animates in either media state.
- [x] **T085** The offer holds its width in both states. Its label shrank by nine characters when
      pressed, which reflowed the status strip and moved **every pane in the dock by 11 px** at the
      declared floor — on the click that opens a walkthrough whose whole claim is that it moves
      nothing. Found by T084's own no-reflow test on its first run.
- [x] **T086** `018-walkthrough-mask.png`, captured from the running application: the whole
      viewport, because what this beat added is what happened to the other six rectangles.
