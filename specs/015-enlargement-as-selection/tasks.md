# Tasks: Enlargement Is a Selection, Not a Mode

**Feature**: `015-enlargement-as-selection` | **Plan**: [`plan.md`](./plan.md)

## One centre, one union (US1, FR-001, FR-004)

- [x] **T010** `CentreContent` as a discriminated union — the row, or exactly one enlarged
      horizon — and the only decider of what the centre holds.
- [x] **T011** Enlargement replaces the centre's contents and nothing else; the controls,
      scores and detail regions keep their geometry to the pixel, and a selection already in the
      detail region survives it.
- [x] **T012** The render ledger: the centre records each content kind it renders, so a swap can
      be asserted to show no unenlarged frame between two enlarged ones (SC-003).

## The strip, once (US2, FR-002, FR-003, FR-008)

- [x] **T020** One strip component: every declared horizon in order, the enlarged one marked,
      each carrying the same skill figures the scores region shows beneath the row.
- [x] **T021** An unscored or refused horizon says which, in the scorer's words, rather than
      rendering a blank slot.
- [x] **T022** Beat 013's below-floor presentation is rebuilt on it: the fallback selects an
      enlargement rather than laying out its own single panel. The second implementation is
      deleted, and `viewport-floor.spec.ts` keeps passing unrelaxed.
- [x] **T023** The strip's geometry declared in `presentation`, beside the row's.

## Operable, and legible without colour (FR-007)

- [x] **T030** Roving tabindex: arrow keys move along the strip, commit swaps the centre, focus
      stays in the strip.
- [x] **T031** The marking is a border weight and a label, held to a measured greyscale
      luminance margin as beat 007 held the hatch.
- [x] **T032** `prefers-reduced-motion`: the swap is instantaneous and unanimated.

## Shown, not computed (US4, FR-005, FR-006)

- [x] **T040** Field, analysis and score objects identical by reference across enlargement and
      across a strip swap — asserted by identity, as beat 007 did.
- [x] **T041** The attribution layer and the observation marks at full fidelity in the enlarged
      panel only; the row states that it shows the field alone.
- [x] **T042** Enlarging does not trigger scoring. Scoring costs about a second and happens when
      asked; display causing computation is the entanglement FR-40 exists to catch.
- [x] **T043** The strip's thumbnails draw the same field arrays at a smaller size. Nothing is
      resampled or reduced for the strip.

## Edges (spec's Edge Cases)

- [x] **T050** A reissue while enlarged: same horizon, updated in place, centre does not fall
      back to the row. Same for a domain change.
- [x] **T051** A configuration with fewer horizons: the centre says the enlarged horizon is no
      longer declared and returns to the row rather than drawing an undeclared one (G-05).

## Holding it (SC-001 to SC-005)

- [x] **T060** Shell tests for each success criterion, watched in the browser.
- [x] **T061** G-07 green and the feature 013 record untouched (SC-004).
- [x] **T062** Screenshots, the beat's note, and the site pages updated.
- [x] **T063** `pnpm check` green, eight gates.
