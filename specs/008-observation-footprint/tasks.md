# Tasks: The Observation Footprint

**Feature**: `008-observation-footprint` | **Plan**: [`plan.md`](./plan.md)

- [X] **T010** `src/harness/footprint.ts`: the run's observations as drawable marks, and
      nothing else. One producer for every panel.
- [X] **T011** `markersFrom` and `trackValueRange`: the overlay's marks, and the range the
      surface intensities were scaled against, printed in the legend.
- [X] **T020** The track as a line whose segments after the initialisation instant are drawn
      distinctly, with each measurement encoded on the line by size and fill (FR-001, FR-002).
- [X] **T021** Depth-coded glyphs at row width: a drop is never an undifferentiated dot
      (FR-004).
- [X] **T022** `src/harness/NeedleElevation.tsx`: the enlarged panel's depth axis, needles at
      the depths actually reached, level ticks, and the barb for a probe that continues below
      the displayed volume (FR-003).
- [X] **T023** `src/harness/ObservationHover.tsx`: value, instant, instrument, flags, margin,
      whether it informed the forecast, and whether it was assimilated (FR-006, FR-008).
- [X] **T024** The measured profile beside the model's derived one, matched by depth, every
      level's kind on it (FR-005). `profileFromInterfaceDepth` split out of `diagnoseProfile`
      so the model still produces it.
- [X] **T030** The profile that measured nothing: flagged in the instruments, marked in the
      footprint, drawn as a cross. See finding 1.
- [X] **T031** The accessible mark list, which is also how the counts are asserted.
- [X] **T032** A click pins a mark; the panel survives the pointer leaving.
- [X] **T040** `presentation.footprint` in configuration: co-location tolerance, needle offset,
      elevation height, level-tick limit. Schema version 4.
- [X] **T050** `tests/harness/footprint.test.ts`: counts, extents, the barb, before and after
      initialisation, co-location, the intensity range, the quality-control state, the
      measured-nothing case, and the import check that is FR-009.
- [X] **T051** Shell tests: one mark per observation on every panel, the flagged-versus-plain
      luminance margin, needle extents and the continues-below indicator, the profile
      comparison with its level kinds, and the assimilation statement.
- [X] **T052** Screenshots: the footprint row, the needles, the profile comparison.
- [X] **T060** ADR-0009 updated with what beat 008 observed; docs site and engineering note.
- [X] **T061** `pnpm check` green: 217 tests, seven gates.

---

## What landed, against what the plan said

- **Five Argo profiles measure nothing**, and until this beat the flag saying so lived only on
  the derived observation the analysis consumed, never on the profile the surface draws.
- **The derived profile and the XBT disagree by about 290 m of interface depth**, visibly, at
  every drop. ADR-0009 records that this is *not* its trigger and why.
- **The elevation loses latitude**, and says so in its caption rather than implying a
  perspective the harness cannot support.
