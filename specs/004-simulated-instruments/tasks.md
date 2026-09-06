# Tasks: Simulated Instruments

**Feature**: `004-simulated-instruments` | **Plan**: [`plan.md`](./plan.md)

- [X] **T000** ADR-0005 (the observation operator) and ADR-0007 (Argo, behind a toggle).
- [X] **T001** Move `initialiseFromTruth` out of `src/model/` into `src/run/`. Principle II
      forbids the model holding the truth port; FR-013 requires initialisation to go through
      it; the run doing the wiring satisfies both.

## Configuration (FR-002, FR-003, FR-004, Principle X)

- [X] **T010** `config.instruments`: the track and its sample interval, the drops, the two
      instruments with their three-part error, the checks and their thresholds, the Argo toggle.
- [X] **T011** Schema refusals: the track goes forwards in time; XBT depths increase; no
      waypoint or drop lies outside the domain; no instrument samples after the record ends;
      and the inversion tolerance exceeds twice the XBT's own error.

## The instruments module (FR-001 to FR-009)

- [X] **T020** `observation.ts`: the branded opaque type and the single construction site.
- [X] **T021** `quality-control.ts`: gross range, climatology departure measured in the
      artefact's own standard deviations, vertical inversion, and the Argo flag mapping. Every
      check produces a flag and none drops anything.
- [X] **T022** `observation-operator.ts`: profile to interface depth, inverse-variance
      weighted, with `|dh/dT|` propagated so a level far from the thermocline weighs nothing.
- [X] **T023** The bound: a profile that never crosses the thermocline reports *below 150 m*
      rather than a depth it cannot know.
- [X] **T024** `instruments.ts`: the track, the surface instrument, the XBT with its
      fall-rate depth error, and Argo with `external: true`.
- [X] **T025** The out-of-record level: flagged, valueless, and the noise draw still taken so
      an overshoot does not shift the stream.

## Gate G-02 (FR-010, PR-04)

- [X] **T030** `check-truth-boundary.ts`: the import boundary and the single construction site.
- [X] **T031** Three planted violations, each watched failing: the analysis importing the
      port, the model importing it, and a second place naming the brand.
- [X] **T032** The behavioural half is named as *not yet landed, beat 005* on every run, and a
      test asserts that it says so.

## The surface and the tests

- [X] **T040** Instruments panel: counts, the three-part error, what each drop told us and to
      what precision, the Argo caveat, and the flag summary.
- [X] **T041** The field overlay: the track, the drops, the Argo profiles, and the flagged ones
      drawn as flagged.
- [X] **T042** `tests/instruments/instruments.test.ts`, shell tests, screenshots.
- [X] **T043** `pnpm check` green: 176 tests, five gates.

---

## What landed, against what the plan said

- **The vertical-inversion check is exercised directly** rather than by contriving an
  inversion in the truth record. The real ocean here is stably stratified; contriving one
  would be contriving the answer. What the real profiles are asserted to do is *not* trip it,
  which is the assertion that caught finding 1 above.
- **The climatology-departure check is likewise exercised against a stub**, because the
  interesting property is the *scale* — a departure in standard deviations the artefact can
  answer for — and not whether this particular ocean happens to produce one.
- **Argo's flagged levels number six, not the 3 976 counted in beat 002.** The difference is
  that a level flagged bad usually has no temperature at all; beat 002 counted levels with a
  flag, this beat counts levels with a flag *and* a value, because only those can become
  observations. Both counts are right and they answer different questions.
